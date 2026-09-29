// Mainnet fork only: no broadcast, no contract substitutions or state injection.
// node simulations/verify-v6-3-refund-costs.js
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ClarityVersion,Cl,getAddressFromPrivateKey,deserializeCV,cvToString} from '@stacks/transactions';
import {SimulationBuilder,getSimulationResult,getSimulationTip,submitSimulationSteps,callContract} from 'stxer';
import {fetchLazerUpdateAny,lazerFeedTimes} from './_lazer.js';
import {installChunkedSubmit} from './_chunked-submit.js';
import {classify} from './_sim-source.mjs';
installChunkedSubmit(40);
const NODE='http://77.42.3.101/stacks-api',DEP='SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE=`${DEP}.jing-core-v6`,LADDER=`${DEP}.jing-ladder-v1`;
const SBTC='SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WSTX='SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALE={x:'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2',y:'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51'};
const MARKET={x:`${DEP}.refundcost-x`,y:`${DEP}.refundcost-y`};
const asset={x:Cl.principal(SBTC),y:Cl.principal(WSTX)},name={x:Cl.stringAscii('sbtc-token'),y:Cl.stringAscii('wstx')};
const amount={x:10000n,y:1000000n},other=s=>s==='x'?'y':'x';
const people=s=>Array.from({length:51},(_,i)=>getAddressFromPrivateKey(`${(i+(s==='x'?11000:12000)).toString(16).padStart(64,'0')}01`,'mainnet'));
const source=n=>fs.readFileSync(new URL(`../contracts/${n}.clar`,import.meta.url),'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const sources=Object.fromEntries(['jing-core-v6','jing-ladder-v1','markets-sbtc-stx-jing-v6-3'].map(n=>[n,source(n)]));
const hashes=Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,sha(s)]));
const outDir='simulations/results/v6-3-refund-costs';fs.mkdirSync(outDir,{recursive:true});
let sid,checks=0;
function check(label,actual,want){checks++;if(actual!==want)throw Error(`${label}: ${actual}; expected ${want}`);console.log(`ok ${checks}: ${label}`);}
const cv=hex=>cvToString(deserializeCV(hex));
function decode(step){const r=step?.Result??step;if(r?.Eval){if('Ok' in r.Eval)return cv(r.Eval.Ok);throw Error(JSON.stringify(r));}const t=r?.Transaction?.Ok;if(!t||t.vm_error||t.post_condition_aborted)throw Error(JSON.stringify(r));return cv(t.result);}
async function json(path){const r=await fetch(NODE+path);if(!r.ok)throw Error(`${path}: ${r.status}`);return r.json();}
async function read(cid,code){const r=await submitSimulationSteps(sid,{steps:[{TenureExtend:{cause:'Extended'}},{Eval:[DEP,'',cid,code]}]});return decode(r.steps[1]);}
async function tx(label,sender,cid,fn,args,want){const r=await callContract(sid,{sender,contract:cid,functionName:fn,functionArgs:args,fee:0});check(`${label}: VM error`,r.vmError,null);check(`${label}: postconditions`,r.pcAborted,false);check(label,r.result,want);return r;}
const balance=(s,p)=>s==='x'?`(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`:`(stx-get-balance '${p})`;
const uint=s=>BigInt(s.replace(/^u/,''));
const reports=[];
async function main(){
 const [info,pox,update,sbtcSource]=await Promise.all([json('/v2/info'),json('/v2/pox'),fetchLazerUpdateAny(),json(`/v2/contracts/source/${SBTC.replace('.','/')}?proof=0`)]);
 const resume=process.argv.includes('--resume-setup')?JSON.parse(fs.readFileSync(`${outDir}/session.json`,'utf8')):null;
 if(resume){check('resume source hashes',JSON.stringify(resume.hashes),JSON.stringify(hashes));info.stacks_tip_height=resume.forkHeight;}
 const epoch=pox.epochs.find(e=>info.burn_block_height>=e.start_height&&info.burn_block_height<e.end_height);if(!epoch)throw Error('Missing epoch limits');
 const mid=update.px*100000000n/update.py,limit={x:mid*2n,y:mid/2n};
 const args=(s,n)=>[Cl.uint(n),Cl.uint(limit[s]),Cl.none(),asset[s],name[s]];
 const plan=[];let b=SimulationBuilder.new({stacksNodeAPI:NODE}).useBlockHeight(info.stacks_tip_height);
 const add=(label,fn,want)=>{fn();plan.push({label,want});if(plan.length%20===0)b.addTenureExtend();};
 const call=(label,sender,cid,fn,args,want='(ok true)')=>add(label,()=>b.withSender(sender).addContractCall({contract_id:cid,function_name:fn,function_args:args,fee:0}),want);
 const deploy=(n,s)=>add(`deploy ${n}`,()=>b.withSender(DEP).addContractDeploy({contract_name:n,source_code:s,clarity_version:ClarityVersion.Clarity5,fee:0}),'(ok true)');
 const fund=(s,p,n)=>s==='x'?call(`fund ${s} ${p}`,WHALE.x,SBTC,'transfer',[Cl.uint(n),Cl.principal(WHALE.x),Cl.principal(p),Cl.none()]):add(`fund ${s} ${p}`,()=>b.withSender(WHALE.y).addSTXTransfer({recipient:p,amount:Number(n),fee:0}),'(ok true)');
 for(const n of ['jing-core-v6','jing-ladder-v1'])deploy(n,sources[n]);
 for(const s of ['x','y'])deploy(MARKET[s].split('.')[1],sources['markets-sbtc-stx-jing-v6-3']);
 call('reserve zero seats',DEP,LADDER,'set-max-band-per-side',[Cl.uint(0)]);
 for(const s of ['x','y']){
  const m=MARKET[s],ps=people(s),o=other(s);
  call(`verify ${s}`,DEP,CORE,'set-verified-contract',[Cl.principal(m)]);
  call(`initialize ${s}`,DEP,m,'initialize',[Cl.principal(m),asset.x,asset.y,Cl.uint(100),Cl.uint(10000),Cl.uint(1),Cl.uint(45)]);
  call(`sync zero seats ${s}`,DEP,m,'sync-seat-count',[],'(ok u0)');
  for(const [i,p] of ps.slice(0,50).entries()){
   fund(s,p,amount[s]*(i===0?2n:1n));
   call(`${s} maker ${i}`,p,m,`deposit-token-${s}`,args(s,amount[s]),`(ok u${amount[s]})`);
  }
  fund(o,ps[50],amount[o]);call(`${s} opposite pending`,ps[50],m,`deposit-token-${o}`,args(o,amount[o]),`(ok u${amount[o]})`);
 }
 sid=resume?resume.sid:await b.run();console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);fs.writeFileSync(`${outDir}/session.json`,JSON.stringify({sid,hashes,forkHeight:info.stacks_tip_height},null,2)+'\n');
 const initial=await getSimulationResult(sid);
 if(resume){const saved=JSON.parse(fs.readFileSync(`${outDir}/setup.json`,'utf8'));check('resume has no steps beyond saved setup',initial.steps.length,saved.steps.length);}
 fs.writeFileSync(`${outDir}/setup.json`,JSON.stringify(initial,null,2)+'\n');
 const steps=initial.steps.filter(s=>s.Result?.Transaction);check('setup receipt count',steps.length,plan.length);
 for(const [i,p] of plan.entries())check(p.label,decode(steps[i]),p.want);
 const marketMatches=classify(initial,hashes['markets-sbtc-stx-jing-v6-3']).match;
 for(const m of Object.values(MARKET))check(`${m}: byte-identical market`,marketMatches.has(m.split('.')[1]),true);
 check('byte-identical core',classify(initial,hashes['jing-core-v6']).match.has('jing-core-v6'),true);
 const tip=await getSimulationTip(sid);check('fork epoch matches budget',tip.epoch.replaceAll('.',''),epoch.epoch_id.replace('Epoch','').replaceAll('_',''));
 check('fork burn height inside budget epoch',tip.burn_height>=epoch.start_height&&tip.burn_height<epoch.end_height,true);
 const stamp=Number((await read(MARKET.x,'stacks-block-time')).slice(1));
 let fresh;
 for(let i=0;i<30;i++){const u=await fetchLazerUpdateAny();if((await lazerFeedTimes(u.hex)).at>stamp){fresh=u;break;}await new Promise(r=>setTimeout(r,2000));}
 if(!fresh)throw Error('No signed oracle update newer than pending submissions');
 const vaa=Cl.bufferFromHex(fresh.hex.replace(/^0x/,''));
 for(const s of ['x','y']){
  const m=MARKET[s],ps=people(s),o=other(s),who=ps[0];
  check(`${s}: full book before admission`,await read(m,`(len (get-token-${s}-depositors u0))`),'u50');
  await tx(`${s}: admit opposite maker`,DEP,m,`settle-token-${o}-deposit`,[Cl.principal(ps[50]),vaa,asset[o],name[o]],`(ok u${amount[o]})`);
  check(`${s}: opposite maker live`,await read(m,`(get-token-${o}-deposit u0 '${ps[50]})`),`u${amount[o]}`);
  await tx(`${s}: pending top-up`,who,m,`deposit-token-${s}`,args(s,amount[s]),`(ok u${amount[s]})`);
  check(`${s}: pending amount`,await read(m,`(get amount (get-token-${s}-pending-deposit '${who}))`),`(some u${amount[s]})`);
  await tx(`${s}: pause market`,DEP,m,'set-paused',[Cl.bool(true)],'(ok true)');
 }
 await tx('pause core',DEP,CORE,'pause',[],'(ok true)');
 for(const s of ['x','y']){
  const m=MARKET[s],ps=people(s),who=ps[0],o=other(s);
  const before=uint(await read(m,balance(s,who)));
  check(`${s}: custody before`,await read(m,balance(s,m)),`u${amount[s]*51n}`);
  // Give the measured transaction a fresh tenure budget. Do not split the
  // cancellation, disable metering, alter storage or patch any contract.
  await submitSimulationSteps(sid,{steps:[{TenureExtend:{cause:'Extended'}}]});
  const r=await tx(`${s}: full-book live + pending cancellation`,who,m,`cancel-token-${s}-deposit`,[asset[s],name[s]],`(ok u${amount[s]*2n})`);
  const cost=r.receipt.execution_cost;if(!cost)throw Error('Missing transaction execution cost');
  for(const [key,n] of Object.entries(cost))check(`${s}: ${key} below epoch budget`,BigInt(n)<BigInt(epoch.block_limit[key]),true);
  check(`${s}: exact wallet refund`,uint(await read(m,balance(s,who)))-before,amount[s]*2n);
  check(`${s}: remaining custody`,await read(m,balance(s,m)),`u${amount[s]*49n}`);
  check(`${s}: opposite custody untouched`,await read(m,balance(o,m)),`u${amount[o]}`);
  check(`${s}: exact remaining book`,await read(m,`(get-token-${s}-depositors u0)`),`(list ${ps.slice(1,50).join(' ')})`);
  check(`${s}: caller live cleared`,await read(m,`(get-token-${s}-deposit u0 '${who})`),'u0');
  check(`${s}: pending cleared`,await read(m,`(get-token-${s}-pending-deposit '${who})`),'none');
  check(`${s}: totals match remaining book`,await read(m,`(get total-token-${s} (get-cycle-totals u0))`),`u${amount[s]*49n}`);
  check(`${s}: core owner equity cleared`,await read(CORE,`(get-token-equity '${s==='x'?SBTC:WSTX} '${who})`),'u0');
  const prints=r.receipt.events.map(e=>typeof e==='string'?JSON.parse(e):e).filter(e=>e.contract_event?.contract_identifier===CORE&&e.committed!==false).map(e=>cv(e.contract_event.raw_value));
  for(const event of [`refund-${s}`,`pending-refund-${s}`])check(`${s}: actual core ${event} print`,prints.some(p=>p.includes(`(event "${event}")`)),true);
  reports.push({side:s,result:r.result,executionCost:cost,percentOfEpochBudget:Object.fromEntries(Object.entries(cost).map(([k,n])=>[k,Number(n)/Number(epoch.block_limit[k])*100])),walletRefund:String(amount[s]*2n),remainingCustody:String(amount[s]*49n)});
 }
 for(const [n,hash] of Object.entries(hashes))check(`${n}: source unchanged during run`,sha(source(n)),hash);
 const final=await getSimulationResult(sid);fs.writeFileSync(`${outDir}/simulation.json`,JSON.stringify(final,null,2)+'\n');
 const report={generatedAt:new Date().toISOString(),sid,url:`https://stxer.xyz/simulations/mainnet/${sid}`,checks,failures:0,sourceHashes:hashes,forkHeight:info.stacks_tip_height,tip,epoch,sbtc:{principal:SBTC,sourceSha256:sha(sbtcSource.source)},reports};
 fs.writeFileSync('simulations/fixtures/v6-3-refund-costs.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);if(sid)console.error(`Fork: https://stxer.xyz/simulations/mainnet/${sid}`);process.exitCode=1;});
