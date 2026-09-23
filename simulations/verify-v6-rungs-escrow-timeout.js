// Six-rung 24-hour recovery test. Actual contract source; fork only.
// All miner-band deposits happen before synthetic time advances; exits read no miner oracle.
import fs from 'node:fs';
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
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
async function main() {
 let b=SimulationBuilder.new({stacksNodeAPI:'http://77.42.3.101/stacks-api'});
 b.withSender(DEP).addContractDeploy({contract_name:'jing-core-v6',source_code:source('jing-core-v6'),clarity_version:ClarityVersion.Clarity5});
 sid=await b.run();console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
 const result=await getSimulationResult(sid);check('deploy core',decode(result.steps.find(s=>s.Result?.Transaction)),ok);
 await deploy('jing-ladder-v1');await deploy('markets-sbtc-stx-jing-v6-3');
 await tx('sync seats',DEP,MARKET,'sync-seat-count',[],'(ok u10)');
 await tx('verify market',DEP,CORE,'set-verified-contract',[principal(MARKET)],'(ok true)');
 await tx('initialize market',DEP,MARKET,'initialize',[principal(MARKET),traits.x,traits.y,uintCV(1000),uintCV(1000000),uintCV(1),uintCV(45)],'(ok true)');
 // On a real fork the SDK tip timestamp can be the burn time; read Clarity's clock.
 const clock=await submitSimulationSteps(sid,{steps:[{Eval:[DEP,'',MARKET,'stacks-block-time']}]});
 const stamp=Number(decode({Result:clock.steps[0]}).slice(1));
 const first=await freshAfter(stamp),mid=first.px*100000000n/first.py;
 const centsName=c=>`${c/100n}-${String(c%100n).padStart(2,'0')}`;
 // Noncrossing opposite liquidity makes both sides submit pending deposits.
 for(const side of ['x','y']) {
  const who=mk(side==='x'?601:602),amount=side==='x'?6000:12000000;
  await fund(side,who,amount);
  await tx('seed opposite book',who,MARKET,`deposit-token-${side}`,depArgs(side,amount,side==='x'?mid*2n:mid/2n),`(ok u${amount})`);
  if(side==='y')await tx('admit seed',keeper,MARKET,`settle-token-${side}-deposit`,settleArgs(side,who,first),`(ok u${amount})`);
 }
 const fixtures=[];let serial=610;
 for(const mode of ['no-update','market-paused','core-paused'])for(const side of ['x','y'])for(const kind of ['fixed','peg','band']) {
  const dir=side==='x'?'buy':'sell',scale=side==='x'?1:2000;
  const a=mk(serial++),memberB=mk(serial++),initial=3000*scale,escrow=6000*scale,held=500*scale;
  const n=['no-update','market-paused','core-paused'].indexOf(mode),bps=20+10*n;
  const cents=1000000000000000000n/(side==='x'?mid*2n:mid/2n)+BigInt(n);
  const file=`jing-${dir}-stx${kind==='fixed'?'':kind==='peg'?'-market-spread':'-core-spread'}`;
  const name=kind==='fixed'?`jing-${dir}-stx-${centsName(cents)}`:kind==='peg'?`jing-${dir}-stx-spread-${bps}-${side==='x'?'floor':'cap'}-${centsName(cents)}`:`jing-${dir}-stx-spread-${bps}`;
  const rung=`${DEP}.${name}`,ladderSide=kind==='fixed'?`${dir}-stx`:kind==='peg'?`${dir}-peg`:side==='x'?'buy-band':'sel-band';
  const label=`${file}/${mode}`,positionField=side==='x'?'sbtc':'stx',heldField=side==='x'?'held-sats':'held-ustx';
  await deploy(name,file);
  await tx(`${label}: canonical`,DEP,LADDER,'set-canonical',[stringAsciiCV(ladderSide),principal(rung)],'(ok true)');
  await tx(`${label}: init`,DEP,rung,'initialize',kind==='fixed'?[uintCV(cents)]:kind==='peg'?[uintCV(bps),uintCV(cents)]:[uintCV(bps),boolCV(false)],'(ok true)');
  await fund(side,a,initial+held);await fund(side,memberB,escrow);
  await tx(`${label}: A deposits`,a,rung,'deposit',[uintCV(initial)],ok);
  let toSettle=initial;
  if(mode==='no-update') {
   // Successful young escrow placement + member exit must keep its old behavior.
   const part=1000*scale;
   await tx(`${label}: normal young exit settles then pays exactly`,a,rung,'withdraw',
    [uintCV(part),someCV(update(await freshAfter(stamp)))],
    side==='x'?`(ok (tuple (sbtc u${part}) (stx u0)))`:`(ok (tuple (sbtc u0) (stx u${part})))`);
   await ev(`${label}: normal exit clears pending and keeps live remainder`,MARKET,
    `(and (is-none ${pending(side,rung)}) (is-eq ${live(side,rung)} u${initial-part}))`,'true');
   await ev(`${label}: normal exit wallet exact`,MARKET,balance(side,a),`u${held+part}`);
   await tx(`${label}: restore initial position`,a,rung,'deposit',[uintCV(part)],ok);
   toSettle=part;
  }
  await tx(`${label}: normal young placement`,keeper,MARKET,`settle-token-${side}-deposit`,settleArgs(side,rung,await freshAfter(stamp)),`(ok u${toSettle})`);
  await ev(`${label}: live before top-up`,MARKET,live(side,rung),`u${initial}`);
  await tx(`${label}: B submits pending top-up`,memberB,rung,'deposit',[uintCV(escrow)],ok);
  await tx(`${label}: A's second deposit remains locally held`,a,rung,'deposit',[uintCV(held)],ok);
  await ev(`${label}: live + pending + held exact`,MARKET,`(and
   (is-eq ${live(side,rung)} u${initial})
   (is-eq (get amount (unwrap-panic ${pending(side,rung)})) u${escrow})
   (is-eq (get submitted-at (unwrap-panic ${pending(side,rung)})) u${stamp})
   (is-eq ${balance(side,rung)} u${held})
   (is-eq (get ${heldField} (contract-call? '${rung} get-state)) u${held}))`,'true');
  await ev(`${label}: B starts with exact shares`,rung,`(get shares (get-position '${memberB}))`,`u${escrow}`);
  fixtures.push({label,side,rung,a,memberB,initial,escrow,held,positionField,heldField,mode,scale});
  finishPhase();
 }
 const youngUpdate=await freshAfter(stamp);
 await tx('pause market while escrow young',DEP,MARKET,'set-paused',[boolCV(true)],'(ok true)');
 for(const f of fixtures.filter(f=>f.mode==='market-paused')) {
  await tx(`${f.label}: young paused exit refused`,f.a,f.rung,'withdraw',[uintCV(f.initial+f.held),someCV(update(youngUpdate))],'(err u1007)');
  await ev(`${f.label}: refusal preserves pending`,MARKET,`(get amount (unwrap-panic ${pending(f.side,f.rung)}))`,`u${f.escrow}`);
 }
 await tx('unpause market',DEP,MARKET,'set-paused',[boolCV(false)],'(ok true)');
 async function age(seconds) {
  const tip=await getSimulationTip(sid),target=stamp+seconds;
  await submitSimulationSteps(sid,{steps:[{AdvanceBlocks:{bitcoin_blocks:1,stacks_blocks_per_bitcoin:1,bitcoin_interval_secs:target-Number(tip.burn_block_time)}}]});
  await ev(`exact escrow age ${seconds}`,MARKET,`(- stacks-block-time u${stamp})`,`u${seconds}`);
 }
 await age(86399);
 for(const f of fixtures.filter(f=>f.mode==='no-update')) {
  await tx(`${f.label}: one second before timeout still needs update`,f.a,f.rung,'withdraw',[uintCV(f.initial+f.held),noneCV()],'(err u7012)');
 }
 await age(86400);
 async function exit(f,providedUpdate) {
  const {label,side,rung,a,memberB,initial,escrow,held,positionField,heldField,scale}=f,take=initial+held;
  const receipt=value=>side==='x'?`(ok (tuple (sbtc u${value}) (stx u0)))`:`(ok (tuple (sbtc u0) (stx u${value})))`;
  // A nonmember cannot trigger cancellation, even once the timeout elapsed.
  await tx(`${label}: stranger cannot trigger recovery`,keeper,rung,'withdraw',[uintCV(1),noneCV()],'(err u7006)');
  const out=await tx(`${label}: timed-out exit returns exact A claim`,a,rung,'withdraw',[uintCV(take),providedUpdate],receipt(take));
  event(`${label}: pending escrow logged as cancel`,out.receipt,side,'pending-refund',{reason:'"cancel"',amount:`u${escrow}`,price:'u0'});
  event(`${label}: live amount also refunded`,out.receipt,side,'refund',{amount:`u${initial}`});
  await ev(`${label}: market position and pending cleared`,MARKET,`(and
   (is-eq ${live(side,rung)} u0) (is-eq ${parked(side,rung)} u0) (is-none ${pending(side,rung)}))`,'true');
  await ev(`${label}: A wallet exact`,MARKET,balance(side,a),`u${take}`);
  await ev(`${label}: B wallet untouched`,MARKET,balance(side,memberB),'u0');
  await ev(`${label}: B shares and claim unchanged`,rung,`(and
   (is-eq (get shares (get-position '${memberB})) u${escrow})
   (is-eq (get ${positionField} (get-position '${memberB})) u${escrow})
   (is-eq (get total-shares (get-state)) u${escrow})
   (is-eq (get ${heldField} (get-state)) u${escrow})
   (is-eq (get unfilled-index (get-state)) u1000000000000)
   (is-eq (get resting (get-state)) u0))`,'true');
  await ev(`${label}: remaining funds held exactly`,MARKET,balance(side,rung),`u${escrow}`);
  const part=1000*scale;
  await tx(`${label}: B partial withdrawal remains exact`,memberB,rung,'withdraw',[uintCV(part),noneCV()],receipt(part));
  await ev(`${label}: B remaining shares exact`,rung,`(get shares (get-position '${memberB}))`,`u${escrow-part}`);
  await tx(`${label}: B withdraws remaining claim`,memberB,rung,'withdraw',[uintCV(escrow-part),noneCV()],receipt(escrow-part));
  await ev(`${label}: B final wallet exact`,MARKET,balance(side,memberB),`u${escrow}`);
  await ev(`${label}: pool fully empty`,rung,`(and (is-eq (get total-shares (get-state)) u0) (is-eq (get ${heldField} (get-state)) u0))`,'true');
  await ev(`${label}: no funds left at rung`,MARKET,balance(side,rung),'u0');
  finishPhase();
 }
 for(const f of fixtures.filter(f=>f.mode==='no-update'))await exit(f,noneCV());
 await age(86401);
 await tx('pause market after timeout',DEP,MARKET,'set-paused',[boolCV(true)],'(ok true)');
 for(const f of fixtures.filter(f=>f.mode==='market-paused'))await exit(f,noneCV());
 await ev('recovery leaves market paused',MARKET,'(var-get paused)','true');
 await tx('unpause market for core-only pause',DEP,MARKET,'set-paused',[boolCV(false)],'(ok true)');
 await tx('pause core',DEP,CORE,'pause',[],'(ok true)');
 // Deliberately invalid update: old escrow must not try to read it.
 for(const f of fixtures.filter(f=>f.mode==='core-paused'))await exit(f,someCV(bufferCV(Buffer.from('00','hex'))));
 await ev('recovery leaves core paused',CORE,'(var-get paused)','true');
 finishPhase();console.log(`${passed}/${checks} checks green`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
