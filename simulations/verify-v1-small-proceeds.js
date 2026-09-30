// Fork only: real market fills, exact working-tree contract bytes, no storage writes.
// node simulations/verify-v1-small-proceeds.js
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ClarityVersion,Cl,deserializeCV,getAddressFromPrivateKey,makeUnsignedContractDeploy,
 makeUnsignedSTXTokenTransfer,PostConditionMode} from '@stacks/transactions';
import {SimulationBuilder,getSimulationResult,submitSimulationSteps,callContract,getNonce,setSender} from 'stxer';
import {fetchLazerUpdateAny,lazerFeedTimes} from './_lazer.js';

const DEP='SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE=`${DEP}.jing-core-v6`,MARKET=`${DEP}.markets-sbtc-stx-jing-v6-3`,LADDER=`${DEP}.jing-ladder-v1`;
const RUNG=`${DEP}.jing-sell-stx-spread-10`;
const SBTC='SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX='SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE_X='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2',WHALE_Y='SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR';
const mk=n=>getAddressFromPrivateKey(String(n).repeat(64).slice(0,64)+'01','mainnet');
const alice=mk(781),bob=mk(782),taker=mk(783);
const files=['jing-core-v6','jing-ladder-v1','markets-sbtc-stx-jing-v6-3','jing-sell-stx-core-spread-v1'];
const sources=Object.fromEntries(files.map(f=>[f,fs.readFileSync(new URL(`../contracts/${f}.clar`,import.meta.url),'utf8')]));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
let sid,checks=0;
function check(label,condition,detail=''){
 checks++;console.log(`${condition?'ok':'FAIL'} ${checks}. ${label}${detail?`: ${detail}`:''}`);
 if(!condition)throw new Error(label);
}
function plain(c){
 if(c.type==='uint'||c.type==='int')return BigInt(c.value);
 if(c.type==='true'||c.type==='false')return c.type==='true';
 if(c.type==='tuple')return Object.fromEntries(Object.entries(c.value).map(([k,v])=>[k,plain(v)]));
 if(c.type==='ok')return {ok:plain(c.value)};
 if(c.type==='err')return {err:plain(c.value)};
 if(c.type==='none')return null;
 if(c.type==='some')return plain(c.value);
 return c.value;
}
const show=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
async function retry(fn){
 for(let i=0;;i++)try{return await fn();}catch(e){
  if(i>=4||!/fetch failed|ECONNRESET|50[0234]|429|timed? ?out|ETIMEDOUT/i.test(String(e)))throw e;
  await new Promise(r=>setTimeout(r,3000*(i+1)));
 }
}
async function evaluate(cid,code){
 const out=await retry(()=>submitSimulationSteps(sid,{steps:[{TenureExtend:{cause:'Extended'}},{Eval:[DEP,'',cid,code]}]}));
 const result=out.steps[1]?.Eval;
 if(!result?.Ok)throw new Error(`eval: ${show(result)}`);
 return plain(deserializeCV(result.Ok));
}
async function send(label,sender,cid,fn,args=[]){
 await retry(()=>submitSimulationSteps(sid,{steps:[{TenureExtend:{cause:'Extended'}}]}));
 const r=await retry(()=>callContract(sid,{sender,contract:cid,functionName:fn,functionArgs:args,fee:0}));
 check(label,!r.vmError&&!r.pcAborted,show({vm:r.vmError,pc:r.pcAborted}));
 const v=plain(deserializeCV(r.resultHex));
 check(`${label}: ok`,v.ok!==undefined,show(v));
 if(cid===RUNG || cid===MARKET && fn==='swap')await ledger(label);
 return v.ok;
}
async function raw(label,tx,sender){
 setSender(tx,sender);
 const out=await retry(()=>submitSimulationSteps(sid,{steps:[{Transaction:tx.serialize()}]}));
 const r=out.steps[0]?.Transaction?.Ok;
 check(label,!!r&&!r.vm_error&&!r.post_condition_aborted&&plain(deserializeCV(r.result)).ok!==undefined,show(r?.vm_error));
}
async function deploy(name,file){
 await raw(`deploy ${name}`,await makeUnsignedContractDeploy({contractName:name,codeBody:sources[file],clarityVersion:ClarityVersion.Clarity5,
  nonce:await getNonce(sid,DEP),network:'mainnet',publicKey:'',fee:0,postConditionMode:PostConditionMode.Allow}),DEP);
}
async function fundSTX(to,amount,from=WHALE_Y){
 await raw(`fund ${amount} micro-STX`,await makeUnsignedSTXTokenTransfer({recipient:to,amount,nonce:await getNonce(sid,from),network:'mainnet',publicKey:'',fee:0}),from);
}
const sbtc=who=>evaluate(MARKET,`(unwrap-panic (contract-call? '${SBTC} get-balance '${who}))`);
const state=()=>evaluate(RUNG,'(get-state)');
const position=who=>evaluate(RUNG,`(get-position '${who})`);
async function ledger(label){
 const s=await evaluate(RUNG,`{
  cp: (var-get current-proceeds), acc: (var-get sats-accounted), carry: (var-get proceeds-carry),
  shares: (var-get total-shares), members: (var-get members), epoch: (var-get epoch),
  balance: (unwrap-panic (contract-call? '${SBTC} get-balance current-contract)),
  claims: (+ (get sbtc (get-position '${alice})) (get sbtc (get-position '${bob})) (get sbtc (get-position '${taker})))
 }`);
 // This scenario closes through last-member exits, so there are no old
 // reserves. Before sync, balance - acc is the still-unprocessed receipt.
 check(`${label}: exact unpaid proceeds and bounded carry`,
  s.acc===s.cp && s.balance>=s.acc && s.claims<=s.cp &&
  (s.shares===0n?s.carry===0n:s.carry<s.shares),show(s));
 if(s.members===0n && s.epoch>0n)check(`${label}: closed epoch leaves no proceeds`,s.balance===0n);
}
async function main(){
 console.log('Source hashes:',show(Object.fromEntries(files.map(f=>[f,hash(sources[f])]))));
 const b=SimulationBuilder.new({stacksNodeAPI:'http://77.42.3.101/stacks-api'});
 b.withSender(DEP).addContractDeploy({contract_name:'jing-core-v6',source_code:sources['jing-core-v6'],clarity_version:ClarityVersion.Clarity5});
 sid=await retry(()=>b.run());console.log(`https://stxer.xyz/simulations/mainnet/${sid}`);
 const first=(await getSimulationResult(sid)).steps.find(s=>s.Result?.Transaction);
 check('core deployed',!!first);
 await deploy('jing-ladder-v1','jing-ladder-v1');
 await deploy('markets-sbtc-stx-jing-v6-3','markets-sbtc-stx-jing-v6-3');
 await send('verify market',DEP,CORE,'set-verified-contract',[Cl.principal(MARKET)]);
 await send('initialize market',DEP,MARKET,'initialize',[Cl.principal(MARKET),Cl.principal(SBTC),Cl.principal(WSTX),Cl.uint(1000),Cl.uint(1000000),Cl.uint(1),Cl.uint(45)]);
 await deploy('jing-sell-stx-spread-10','jing-sell-stx-core-spread-v1');
 await send('set canonical',DEP,LADDER,'set-canonical',[Cl.stringAscii('sel-band'),Cl.principal(RUNG)]);
 await send('initialize seated 10-bps rung',DEP,RUNG,'initialize',[Cl.uint(10),Cl.bool(true)]);
 const clock=await evaluate(MARKET,'stacks-block-time');let update;
 for(let i=0;i<30;i++){
  const u=await fetchLazerUpdateAny();if((await lazerFeedTimes(u.hex)).at>Number(clock)){update=u;break;}
  await new Promise(r=>setTimeout(r,2000));
 }
 if(!update)throw new Error('No signed Lazer update newer than fork time');
 const mid=update.px*100000000n/update.py,feed=Cl.bufferFromHex(update.hex.replace(/^0x/,''));
 const limit=mid*9990n/10000n;
 // Choose the starting deposit so the first fill leaves exactly 100,100
 // micro-STX despite the oracle's whole-sat trade rounding.
 const net=(100_000_000_000n-100100n)*10000000000n/limit;
 const initial=net*limit/10000000000n+100100n;
 await fundSTX(alice,initial);await fundSTX(taker,2_000_000n);
 await send('fund taker sBTC',WHALE_X,SBTC,'transfer',[Cl.uint(100_000_000n),Cl.principal(WHALE_X),Cl.principal(taker),Cl.none()]);
 await send('initial deposit',alice,RUNG,'deposit',[Cl.uint(initial)]);
 check('rung price accepts the signed mid',await evaluate(MARKET,`(token-y-limit-at '${RUNG} u${mid})`)===limit);
 const swap=amount=>send('real market swap',taker,MARKET,'swap',[Cl.uint(amount),Cl.uint(limit-limit/100n),feed,Cl.principal(SBTC),Cl.stringAscii('sbtc-token'),Cl.principal(WSTX),Cl.stringAscii('wstx'),Cl.bool(true)]);
 const firstSwap=await swap((net*10020n+9999n)/10000n);
 // Recycle the taker's real STX proceeds into the top-up funding pool.
 await fundSTX(WHALE_Y,firstSwap['token-y-received'],taker);
 await send('sync first fill',taker,RUNG,'sync');
 const scaled=await state();check('real fill rescales to scale 1',scaled.scale===1n,show(scaled));
 // Just over 1,001 * 1e12 shares triggers the old zero-increment bug.
 const topup=(1_001_100_000_000_000n*scaled['unfilled-index']+999999999999n)/1000000000000n;
 await fundSTX(bob,topup);await send('large top-up',bob,RUNG,'deposit',[Cl.uint(topup)]);
 const before=await state(),beforeBalance=await sbtc(RUNG);
 await swap(1002n);
 const gain=(await sbtc(RUNG))-beforeBalance;
 check('small fill pays 1,001 sats',gain===1001n,`${gain}`);
 check('old precision would record zero',gain*1000000000000n/before['total-shares']===0n,`${before['total-shares']} shares`);
 await send('sync small fill',taker,RUNG,'sync');
 check('fixed proceeds index advances',(await state())['proceeds-index']>before['proceeds-index']);
 check('large member can claim 1,000 sats',(await position(bob)).sbtc===1000n);
 await send('late member joins',taker,RUNG,'deposit',[Cl.uint(1000000)]);
 check('late member gets no old indexed rewards',(await position(taker)).sbtc===0n);
 let paid=0n;
 for(const [who,amount] of [[alice,initial],[bob,topup],[taker,1000000n]]){
  const result=await send('member exits',who,RUNG,'withdraw',[Cl.uint(amount),Cl.none()]);paid+=result.sbtc;
 }
 const remaining=await sbtc(RUNG);
 check('all members exit',(await state()).members===0n);
 check('all receipts conserved',paid+remaining===beforeBalance+gain,`${paid} paid + ${remaining} remaining`);
 check('zero ownerless proceeds',remaining===0n,`${remaining} sats`);
 check('zero ownerless input',await evaluate(RUNG,'(stx-get-balance current-contract)')===0n);
 await send('next epoch deposit',taker,RUNG,'deposit',[Cl.uint(1000000)]);
 check('next epoch cannot claim prior indexed earnings',(await send('next epoch claim',taker,RUNG,'claim')).sbtc===0n);
 await send('next epoch exit',taker,RUNG,'withdraw',[Cl.uint(1000000),Cl.none()]);
 check('both tokens zero after next epoch',await sbtc(RUNG)===0n && await evaluate(RUNG,'(stx-get-balance current-contract)')===0n);
 for(const f of files)check(`${f} source unchanged`,hash(sources[f])===hash(fs.readFileSync(new URL(`../contracts/${f}.clar`,import.meta.url),'utf8')));
 console.log(`${checks}/${checks} checks green\nhttps://stxer.xyz/simulations/mainnet/${sid}`);
}
main().catch(e=>{console.error(e);console.error(`Failed after ${checks} checks; https://stxer.xyz/simulations/mainnet/${sid}`);process.exitCode=1;});
