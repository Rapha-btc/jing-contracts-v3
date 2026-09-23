// Exact f6a6d3a/current market comparison with the current router, same block/update.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  ClarityVersion, tupleCV, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, getAddressFromPrivateKey, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip,
  submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEP}.jing-core-v6`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const STX = 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2';
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51' };
const principal = (s) => s.includes('.') ? contractPrincipalCV(...s.split('.')) : standardPrincipalCV(s);
const traits = { x: principal(SBTC), y: principal(STX) };
const assets = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('wstx') };
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + '01', 'mainnet');
const keeper = mk(871);
const source = (name) => fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result;
  if (r?.Eval?.Ok) return cv(r.Eval.Ok);
  if (r?.Transaction?.Ok) {
    const tx = r.Transaction.Ok;
    if (tx.vm_error || tx.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(tx)}`;
    return cv(tx.result);
  }
  return `ENGINE-ERR ${JSON.stringify(r)}`;
};
const ok = (v) => v.startsWith('(ok');
const update = (u) => bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${want}`}`);
  if (!good) finishPhase();
  return good;
}
function finishPhase() {
  if (failures) {
    console.log(`${passed}/${checks} checks green`);
    throw new Error(`Stopped on failed checks. Fork: https://stxer.xyz/simulations/mainnet/${sid}`);
  }
}
async function ev(label, cid, code, want) {
  const out = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] });
  const actual = decode({ Result: out.steps[0] });
  check(label, actual, want);
  return actual;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 });
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return r;
}
const balance = (side, p) => side === 'y' ? `(stx-get-balance '${p})` : `(unwrap-panic (contract-call? '${SBTC} get-balance '${p}))`;
const pending = (side, p) => `(get-token-${side}-pending-deposit '${p})`;
const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), traits[side], assets[side]];
const settleArgs = (side, who, u) => [principal(who), update(u), traits[side], assets[side]];

const other = (side) => side === 'x' ? 'y' : 'x';
const parked = (side, p) => `(get-token-${side}-parked '${p})`;
const pendingKind = (side, kind, p) => `(get-token-${side}-pending-${kind} '${p})`;
const order = (side, p) => `(get-token-${side}-order '${p})`;
const pairArgs = () => [traits.x, assets.x, traits.y, assets.y];
const zeroSwap = '(ok (tuple (rebate-refunded u0) (token-x-received u0) (token-x-rolled u0) (token-y-received u0) (token-y-rolled u0)))';
async function freshAfter(stamp) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const u = await fetchLazerUpdateAny();
    const times = await lazerFeedTimes(u.hex);
    if (times.at > stamp) return u;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`No newer signed feed after ${stamp}`);
}
function event(label, receipt, side, name, fields = {}) {
  const prints = receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
    .map((e) => cv(e.contract_event.raw_value));
  check(label, prints.join(' | '), () => prints.some((value) => value.includes(`(event "${name}${side ? `-${side}` : ''}")`) &&
    Object.entries(fields).every(([key, val]) => value.includes(`(${key} ${val})`))));
}
async function fund(side, who, amount) {
  if (side === 'x') {
    await tx('fund fresh sBTC', WHALES.x, SBTC, 'transfer', [uintCV(amount), principal(WHALES.x), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, WHALES.y), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALES.y);
    const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check('fund fresh STX', decode({ Result: out.steps[0] }), '(ok true)');
  }
  finishPhase();
}
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`, LADDER = `${DEP}.jing-ladder-v1`;
async function deploy(name, file) {
 const raw=await makeUnsignedContractDeploy({contractName:name,codeBody:source(file??name),clarityVersion:ClarityVersion.Clarity5,nonce:await getNonce(sid,DEP),network:'mainnet',publicKey:'',fee:0,postConditionMode:PostConditionMode.Allow});
 setSender(raw,DEP); const out=await submitSimulationSteps(sid,{steps:[{Transaction:raw.serialize()}]});
 check(`deploy ${name}`,decode({Result:out.steps[0]}),ok); finishPhase();
}
async function main() {
 const baseline=execFileSync('git',['show','f6a6d3a:contracts/markets-sbtc-stx-jing-v6-3.clar'],{encoding:'utf8'});
 const router=`${DEP}.swap-router-sbtc-stx-jing-v5-3`,zero=tupleCV({dlmm:uintCV(0),xyk:uintCV(0),velar:uintCV(0)});
 let height,u,mid;const snapshots={},links={},differences=[];
 for(const side of ['x','y'])for(const version of ['baseline','current']) {
  const b=SimulationBuilder.new({stacksNodeAPI:'http://77.42.3.101/stacks-api'});if(height)b.useBlockHeight(height);
  for(const name of ['jing-core-v6','jing-ladder-v1','markets-sbtc-stx-jing-v6-3','swap-router-sbtc-stx-jing-v5-3'])
   b.withSender(DEP).addContractDeploy({contract_name:name,source_code:name==='markets-sbtc-stx-jing-v6-3'&&version==='baseline'?baseline:source(name),clarity_version:ClarityVersion.Clarity5});
  sid=await b.run();links[`${side}/${version}`]=`https://stxer.xyz/simulations/mainnet/${sid}`;console.log(`${side}/${version}: ${links[`${side}/${version}`]}`);
  const result=await getSimulationResult(sid);height=Number(result.metadata.block_height);
  for(const st of result.steps.filter(s=>s.Result?.Transaction))check('deploy exact source',decode(st),ok);
  const stamp=Number((await ev('fork clock',MARKET,'stacks-block-time',v=>/^u[0-9]+$/.test(v))).slice(1));
  if(!u){u=await freshAfter(stamp);mid=u.px*100000000n/u.py;}
  const core=version==='baseline'?`${DEP}.jing-core-v5`:CORE;
  await tx('verify',DEP,core,'set-verified-contract',[principal(MARKET)],'(ok true)');
  await tx('initialize',DEP,MARKET,'initialize',[principal(MARKET),traits.x,traits.y,uintCV(1000),uintCV(1000000),uintCV(1),uintCV(45)],'(ok true)');
  await tx('sync seats',DEP,MARKET,'sync-seat-count',[],'(ok u10)');
  const maker=mk(993),taker=mk(994),anchor=mk(995),opp=other(side),normal=side==='x'?3000n:6000000n;
  const limit=side==='x'?mid/2n:mid*2n,makerLimit=opp==='x'?mid/2n:mid*2n;
  const ample=opp==='x'?12000n:30000000n,small=side==='x'?1500n*mid/10000000000n:3500000n*10000000000n/mid;
  await fund(opp,maker,1000000000n);await fund(side,taker,1000000000n);
  const wallet=`{tx:${balance('x',taker)},ty:${balance('y',taker)},mx:${balance('x',maker)},my:${balance('y',maker)},cx:${balance('x',MARKET)},cy:${balance('y',MARKET)}}`;
  const state=()=>ev('wallet snapshot',MARKET,wallet,v=>v.startsWith('(tuple'));
  async function deposit(s,who,amount,l){return tx('maker admission',who,MARKET,`deposit-token-${s}`,
   [uintCV(amount),uintCV(l),noneCV(),...(version==='baseline'?[update(u)]:[]),traits[s],assets[s]],`(ok u${amount})`);}
  async function clear(s,who){const n=await ev('remaining live',MARKET,live(s,who),v=>/^u[0-9]+$/.test(v));if(n!=='u0')await tx('clear fixture',who,MARKET,`cancel-token-${s}-deposit`,[traits[s],assets[s]],ok);}
  async function invoke(kind,amount,l,want){return kind==='market'?
   tx(`${side}/${version} direct swap`,taker,MARKET,'swap',[uintCV(amount),uintCV(l),update(u),...pairArgs(),boolCV(side==='x')],want):
   tx(`${side}/${version} router swap`,taker,router,side==='x'?'swap-sbtc-for-stx':'swap-stx-for-sbtc',[uintCV(amount),uintCV(amount),uintCV(l),someCV(update(u)),noneCV(),zero,zero,uintCV(1)],want);}
  const results=[];
  for(const [label,liquidity,amount,l] of [
   ['full fill',ample,normal,limit],['partial fill',small,side==='x'?2000n:4000000n,limit],
   ['zero limit',ample,normal,0n],['below minimum',ample,side==='x'?500n:500000n,limit],['empty book',0n,normal,limit]]) {
   for(const kind of ['market','router']) {
    await clear(opp,maker);await clear(side,taker);
    if(liquidity>0n)await deposit(opp,maker,liquidity,makerLimit);
    const before=await state();
    const want=label==='zero limit'?(kind==='market'?'(err u1011)':'(err u3002)'):label==='below minimum'?(kind==='market'?'(err u1001)':'(err u3002)'):label==='empty book'?v=>v.startsWith('(err'):ok;
    const r=await invoke(kind,amount,l,want),after=await state();
    if(label==='full fill')check('full fill has no remainder',r.result,v=>kind==='market'?v.includes(`(token-${side}-rolled u0)`):v.includes('(unsold u0)')&&v.includes('(jing-ok true)'));
    if(label==='partial fill')check('partial fill returns remainder',r.result,v=>new RegExp(kind==='market'?`token-${side}-rolled u[1-9]`:'unsold u[1-9]').test(v));
    if(['zero limit','below minimum','empty book'].includes(label))check('rejected swap changes no wallet',after,before);
    results.push({label,kind,result:r.result,before,after});
   }
  }
  snapshots[`${side}/${version}`]=results;
  if(version==='current') {
   for(let i=0;i<results.length;i++) {
    const old=snapshots[`${side}/baseline`][i],now=results[i];
    if(JSON.stringify(old)!==JSON.stringify(now))differences.push({side,baseline:old,current:now});
    check(`${side} ${now.label}/${now.kind}: tuple and all wallets match baseline`,JSON.stringify(now),JSON.stringify(old));
   }
   // The pre-submit/settle baseline has no pending map. Compare current
   // pending-only opposite liquidity against its own empty-book result.
   await clear(opp,maker);await clear(side,taker);await fund(side,anchor,normal);
   await deposit(side,anchor,normal,side==='x'?mid*2n:mid/2n);
   await deposit(opp,maker,ample,makerLimit);
   const pendingBefore=await ev('opposite liquidity is pending only',MARKET,`(and (is-eq ${live(opp,maker)} u0) (is-eq (get amount (unwrap-panic ${pending(opp,maker)})) u${ample}))`,'true');
   for(const kind of ['market','router']) {
    const before=await state();const r=await invoke(kind,normal,limit,results.find(x=>x.label==='empty book'&&x.kind===kind).result);
    await ev('pending escrow remains intact',MARKET,`(get amount (unwrap-panic ${pending(opp,maker)}))`,`u${ample}`);
    check('pending cannot fund swap; balances unchanged',await state(),before);
   }
   await clear(side,anchor);
   await tx('settle formerly pending liquidity',keeper,MARKET,`settle-token-${opp}-deposit`,settleArgs(opp,maker,u),`(ok u${ample})`);
   await ev('pending cleared',MARKET,pending(opp,maker),'none');
   await invoke('router',normal,limit,v=>ok(v)&&v.includes('(jing-ok true)'));
  }
 }
 console.log(`${passed}/${checks} checks green`);
 fs.writeFileSync('simulations/fixtures/router-v6-3-baseline-result.json',JSON.stringify({baseline:'f6a6d3a',head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),block:height,update:u.hex,links,passed,checks,differences,snapshots},(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
