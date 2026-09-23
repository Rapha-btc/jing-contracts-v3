// Current-source dispatcher integration; fork only, no contract/storage patches.
// All miner-band deposits happen before synthetic time advances; exits read no miner oracle.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  ClarityVersion, listCV, tupleCV as rawTupleCV, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, getAddressFromPrivateKey, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip,
  submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

const tupleCV = fields => rawTupleCV(Object.fromEntries(Object.entries(fields).sort(([a],[b])=>a.localeCompare(b))));
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
const source = (name) => /^jing-(buy|sell)-stx/.test(name)
  ? execFileSync('git',['show',`5735a97:contracts/${name}.clar`],{encoding:'utf8'})
  : fs.readFileSync(new URL(`../contracts/${name}.clar`, import.meta.url), 'utf8');
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
 if(failures) { console.log(`${passed}/${checks} checks green`); throw new Error(`Fork checks failed: https://stxer.xyz/simulations/mainnet/${sid}`); }
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

const parked = (side, p) => `(get-token-${side}-parked '${p})`;
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
const DISPATCH=`${DEP}.jing-ladder-dispatch`;
const entries=(rungs,amounts)=>listCV(rungs.map((rung,i)=>tupleCV({rung:principal(rung),amount:uintCV(amounts[i])})));
const sum=xs=>xs.reduce((a,b)=>a+b,0);
async function main() {
 const b=SimulationBuilder.new({stacksNodeAPI:'http://77.42.3.101/stacks-api'});
 b.withSender(DEP).addContractDeploy({contract_name:'jing-core-v6',source_code:source('jing-core-v6'),clarity_version:ClarityVersion.Clarity5});
 sid=await b.run();console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
 check('deploy core',decode((await getSimulationResult(sid)).steps.find(s=>s.Result?.Transaction)),ok);
 for(const name of ['jing-ladder-v1','markets-sbtc-stx-jing-v6-3','jing-rung-deposit-trait'])await deploy(name);
 await tx('sync seats',DEP,MARKET,'sync-seat-count',[],'(ok u10)');
 await tx('verify market',DEP,CORE,'set-verified-contract',[principal(MARKET)],'(ok true)');
 await tx('initialize market',DEP,MARKET,'initialize',[principal(MARKET),traits.x,traits.y,uintCV(1000),uintCV(1000000),uintCV(1),uintCV(45)],'(ok true)');
 const stamp=Number((await ev('fork clock',MARKET,'stacks-block-time',v=>/^u[0-9]+$/.test(v))).slice(1));
 const first=await freshAfter(stamp),mid=first.px*100000000n/first.py;
 const fixtures=[];
 for(const side of ['x','y']) {
  const dir=side==='x'?'buy':'sell',rungs=[],nonseated=[],scale=side==='x'?1:2000;
  const cents=1000000000000000000n/(side==='x'?mid*2n:mid/2n),priceName=`${cents/100n}-${String(cents%100n).padStart(2,'0')}`;
  for(const kind of ['fixed','peg','band'])for(const bps of kind==='band'?[20,30,40]:[20]) {
   const file=`jing-${dir}-stx${kind==='fixed'?'':kind==='peg'?'-market-spread':'-core-spread'}`;
   const name=kind==='fixed'?`jing-${dir}-stx-${priceName}`:kind==='peg'?`jing-${dir}-stx-spread-${bps}-${side==='x'?'floor':'cap'}-${priceName}`:`jing-${dir}-stx-spread-${bps}`;
   const rung=`${DEP}.${name}`,registeredSide=kind==='fixed'?`${dir}-stx`:kind==='peg'?`${dir}-peg`:side==='x'?'buy-band':'sel-band';
   await deploy(name,file);
   await tx('canonical '+name,DEP,LADDER,'set-canonical',[stringAsciiCV(registeredSide),principal(rung)],'(ok true)');
   await tx('initialize '+name,DEP,rung,'initialize',kind==='fixed'?[uintCV(cents)]:kind==='peg'?[uintCV(bps),uintCV(cents)]:[uintCV(bps),boolCV(true)],'(ok true)');
   await ev('registration '+name,LADDER,`(is-some (get-registered '${rung}))`,'true');
   if(kind==='band') {rungs.push(rung);await ev('seat '+name,LADDER,`(is-band-${side} '${rung})`,'true');}
   else nonseated.push(rung);
  }
  const a=mk(side==='x'?721:722),memberB=mk(side==='x'?723:724);
  await fund(side,a,100000*scale);await fund(side,memberB,100000*scale);
  fixtures.push({side,dir,rungs,nonseated,scale,a,memberB});
 }
 await deploy('jing-ladder-dispatch');
 // Opposite liquidity is deliberately outside all rung limits, so both
 // sides escrow and subsequent settlement places rather than fills them.
 for(const side of ['x','y']) {
  const who=mk(side==='x'?725:726),amount=side==='x'?6000:12000000;
  await fund(side,who,amount);
  await tx('noncrossing seed '+side,who,MARKET,`deposit-token-${side}`,depArgs(side,amount,side==='x'?mid*2n:mid/2n),`(ok u${amount})`);
  if(side==='y')await tx('settle seed',keeper,MARKET,'settle-token-y-deposit',settleArgs(side,who,await freshAfter(stamp)),`(ok u${amount})`);
 }
 async function dispatch(f,who,amounts) {
  const before=BigInt((await ev('wallet before dispatch',MARKET,balance(f.side,who),v=>/^u[0-9]+$/.test(v))).slice(1));
  const result=await tx(`${f.dir} weighted dispatch`,who,DISPATCH,`deposit-${f.dir}`,[uintCV(sum(amounts)),entries(f.rungs,amounts)],ok);
  const expected=cvToString({ ...tupleCV({amount:uintCV(sum(amounts)),rungs:uintCV(3),'stx-paid':uintCV(0),'sbtc-paid':uintCV(0),positions:listCV(f.rungs.map((rung,i)=>tupleCV({rung:principal(rung),amount:uintCV(amounts[i]),shares:uintCV(amounts[i]),epoch:uintCV(0),'stx-paid':uintCV(0),'sbtc-paid':uintCV(0)})))}) });
  check('exact aggregate and per-rung deposit receipts',result.result,`(ok ${expected})`);
  await ev('exact total spent',MARKET,balance(f.side,who),`u${before-BigInt(sum(amounts))}`);
  for(let i=0;i<3;i++)await ev('exact shares '+i,f.rungs[i],`(get shares (get-position '${who}))`,`u${amounts[i]}`);
 }
 async function withdraw(f,who,amounts,u) {
  const before=BigInt((await ev('wallet before exit',MARKET,balance(f.side,who),v=>/^u[0-9]+$/.test(v))).slice(1));
  const result=await tx(`${f.dir} weighted exit`,who,DISPATCH,`withdraw-${f.dir}`,[entries(f.rungs,amounts),u],ok);
  const field=f.side==='x'?'sbtc':'stx',other=f.side==='x'?'stx':'sbtc';
  const expected=tupleCV({rungs:uintCV(3),withdrawn:uintCV(3),[field]:uintCV(sum(amounts)),[other]:uintCV(0),positions:listCV(f.rungs.map((rung,i)=>tupleCV({rung:principal(rung),[field]:uintCV(amounts[i]),[other]:uintCV(0)})))});
  check('exact aggregate and per-rung exit receipts',result.result,`(ok ${cvToString(expected)})`);
  await ev('exact exit wallet delta',MARKET,balance(f.side,who),`u${before+BigInt(sum(amounts))}`);
  return result;
 }
 for(const f of fixtures) {
  for(const rung of f.nonseated)await tx('fixed/peg intentionally not eligible for dispatch',f.a,DISPATCH,`deposit-${f.dir}`,[uintCV(1000*f.scale),entries([rung],[1000*f.scale])],'(err u7104)');
  const amounts=[250,3000,4000].map(n=>n*f.scale);
  await dispatch(f,f.a,amounts);
  for(let i=0;i<3;i++)await ev('under-min holds; other legs escrow '+i,MARKET,`(and
   (is-eq ${balance(f.side,f.rungs[i])} u${i===0?amounts[i]:0})
   (is-eq (default-to u0 (get amount ${pending(f.side,f.rungs[i])})) u${i===0?0:amounts[i]}))`,'true');
  await withdraw(f,f.a,amounts,someCV(update(await freshAfter(stamp))));
  // Epoch remains open after unsold withdrawal, so share amounts stay 1:1.
  f.initial=[3000,4000,5000].map(n=>n*f.scale);f.second=f.initial.map(n=>2*n);
  await dispatch(f,f.a,f.initial);
  for(let i=1;i<3;i++)await tx('place other rung before top-up',keeper,MARKET,`settle-token-${f.side}-deposit`,settleArgs(f.side,f.rungs[i],await freshAfter(stamp)),`(ok u${f.initial[i]})`);
  await dispatch(f,f.memberB,f.second);
  for(let i=0;i<3;i++)await ev('already-pending isolated; other legs go through '+i,MARKET,`(and
    (is-eq ${balance(f.side,f.rungs[i])} u${i===0?f.second[i]:0})
    (is-eq (get amount (unwrap-panic ${pending(f.side,f.rungs[i])})) u${i===0?f.initial[i]:f.second[i]}))`,'true');
 }
 // Only the first rung retains pending escrow for the timeout exit; the
 // other two must withdraw live inventory in the same dispatch transaction.
 for(const f of fixtures)for(let i=1;i<3;i++) {
  await tx('place other rungs before timeout',keeper,MARKET,`settle-token-${f.side}-deposit`,settleArgs(f.side,f.rungs[i],await freshAfter(stamp)),`(ok u${f.second[i]})`);
  await ev('other rung has no pending escrow',MARKET,pending(f.side,f.rungs[i]),'none');
 }
 const tip=await getSimulationTip(sid);
 await submitSimulationSteps(sid,{steps:[{AdvanceBlocks:{bitcoin_blocks:1,stacks_blocks_per_bitcoin:1,bitcoin_interval_secs:stamp+86401-Number(tip.burn_block_time)}}]});
 await ev('pending age greater than 24h',MARKET,`(- stacks-block-time u${stamp})`,'u86401');
 await tx('pause market for oracle-free timeout exits',DEP,MARKET,'set-paused',[boolCV(true)],'(ok true)');
 for(const f of fixtures) {
  const out=await withdraw(f,f.a,f.initial,noneCV());
  for(let i=0;i<3;i++) {
   const rung=f.rungs[i];
   await ev('timeout cancellation or normal live withdrawal exact',MARKET,`(and (is-none ${pending(f.side,rung)}) (is-eq ${live(f.side,rung)} u${i===0?0:f.second[i]}) (is-eq ${parked(f.side,rung)} u0))`,'true');
   await ev('other member exact shares and claim',rung,`(and (is-eq (get shares (get-position '${f.memberB})) u${f.second[i]}) (is-eq (get ${f.side==='x'?'sbtc':'stx'} (get-position '${f.memberB})) u${f.second[i]}))`,'true');
  }
  event('timeout cancel logged',out.receipt,f.side,'pending-refund',{reason:'"cancel"'});
  await withdraw(f,f.memberB,f.second,noneCV());
  await ev('dispatcher has no custody',MARKET,balance(f.side,DISPATCH),'u0');
 }
 console.log(`${passed}/${checks} checks green`);
 fs.writeFileSync('simulations/fixtures/dispatch-v6-3-result.json',JSON.stringify({simulation:`https://stxer.xyz/simulations/mainnet/${sid}`,passed,checks},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
