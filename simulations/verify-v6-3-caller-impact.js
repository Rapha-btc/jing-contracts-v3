// Current six-rung queue-refund / exit audit, real source and real Lazer. Fork only.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
 let b=SimulationBuilder.new({stacksNodeAPI:'http://77.42.3.101/stacks-api'});
 b.withSender(DEP).addContractDeploy({contract_name:'jing-core-v6',source_code:source('jing-core-v6'),clarity_version:ClarityVersion.Clarity5});
 sid=await b.run(); console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
 const r=await getSimulationResult(sid);check('deploy core',decode(r.steps.find(s=>s.Result?.Transaction)),ok);
 await deploy('jing-ladder-v1');await deploy('markets-sbtc-stx-jing-v6-3');
 await tx('reserve 49 seats',DEP,LADDER,'set-max-band-per-side',[uintCV(49)],'(ok true)');
 await tx('sync seats',DEP,MARKET,'sync-seat-count',[],'(ok u49)');
 await tx('verify market',DEP,CORE,'set-verified-contract',[principal(MARKET)],'(ok true)');
 await tx('initialize market',DEP,MARKET,'initialize',[principal(MARKET),traits.x,traits.y,uintCV(1000),uintCV(1000000),uintCV(1),uintCV(45)],'(ok true)');
 await tx('size queue',DEP,MARKET,'set-distance-slots',[uintCV(0)],'(ok true)');
 const initial=await fetchLazerUpdateAny(),t=await lazerFeedTimes(initial.hex),tip=await getSimulationTip(sid);
 // Keep the real fork burn height: the miner-band RFQ reads burn headers.
 const stamp=Number(tip.block_time);
 const mid=initial.px*100000000n/initial.py;
 const centsName=c=>`${c/100n}-${String(c%100n).padStart(2,'0')}`;
 let i=0; const fixed=[];
 for (const side of ['x','y']) {
  const dir=side==='x'?'buy':'sell',amount=side==='x'?3000:6000000,big=amount*2;
  const incumbent=mk(981+i++), limit=side==='x'?mid*2n:mid/2n;
  await fund(side,incumbent,big);
  await tx(`${side}: incumbent rests`,incumbent,MARKET,`deposit-token-${side}`,depArgs(side,big,limit),`(ok u${big})`);
  for (const kind of ['fixed','peg','band']) {
   const who=mk(981+i++),cents=1000000000000000000n/limit;
   const file=`jing-${dir}-stx${kind==='fixed'?'':kind==='peg'?'-market-spread':'-core-spread'}`;
   const name=kind==='fixed'?`jing-${dir}-stx-${centsName(cents)}`:kind==='peg'?`jing-${dir}-stx-spread-20-${side==='x'?'floor':'cap'}-${centsName(cents)}`:`jing-${dir}-stx-spread-20`;
   const rung=`${DEP}.${name}`,ladderSide=kind==='fixed'?`${dir}-stx`:kind==='peg'?`${dir}-peg`:side==='x'?'buy-band':'sel-band';
   await deploy(name,file);
   if(kind==='fixed') fixed.push({side,rung,who,amount,limit});
   await tx(`${file}: canonical`,DEP,LADDER,'set-canonical',[stringAsciiCV(ladderSide),principal(rung)],'(ok true)');
   await tx(`${file}: initialize unseated`,DEP,rung,'initialize',kind==='fixed'?[uintCV(cents)]:kind==='peg'?[uintCV(20),uintCV(cents)]:[uintCV(20),boolCV(false)],'(ok true)');
   await fund(side,who,amount);
   await tx(`${file}: member submit`,who,rung,'deposit',[uintCV(amount)],ok);
   await ev(`${file}: pending escrow exact`,MARKET,`(get amount (unwrap-panic ${pending(side,rung)}))`,`u${amount}`);
   await ev(`${file}: pooled counts escrow`,rung,`(get pooled (get-state))`,`u${amount}`);
   await ev(`${file}: resting label includes UNSETTLED escrow`,rung,`(get resting (get-state))`,`u${amount}`);
   await tx(`${file}: exit still requires update despite cancel capability`,who,rung,'withdraw',[uintCV(amount),noneCV()],'(err u7012)');
   const fresh=await freshAfter(stamp);
   await tx('pause market',DEP,MARKET,'set-paused',[boolCV(true)],'(ok true)');
   await tx(`${file}: pending exit blocked by market pause`,who,rung,'withdraw',[uintCV(amount),someCV(update(fresh))],'(err u1007)');
   await tx('unpause market',DEP,MARKET,'set-paused',[boolCV(false)],'(ok true)');
   const settled=await tx(`${file}: keeper settle refunds queue-full`,keeper,MARKET,`settle-token-${side}-deposit`,settleArgs(side,rung,fresh),`(ok u${amount})`);
   event(`${file}: refund reason`,settled.receipt,side,'pending-refund',{reason:'"queue-full"',amount:`u${amount}`});
   await ev(`${file}: no live order after refund`,MARKET,live(side,rung),'u0');
   await ev(`${file}: refunded tokens held in rung wallet`,MARKET,balance(side,rung),`u${amount}`);
   await ev(`${file}: held field stale until sync`,rung,`(get ${side==='x'?'held-sats':'held-ustx'} (get-state))`,'u0');
   await tx(`${file}: reconcile refund`,keeper,rung,'sync',[],'(ok true)');
   await ev(`${file}: shares preserved, no false fill`,rung,`(and (is-eq (get pooled (get-state)) u${amount}) (is-eq (get ${side==='x'?'held-sats':'held-ustx'} (get-state)) u${amount}) (is-eq (get unfilled-index (get-state)) u1000000000000) (is-eq (get resting (get-state)) u0))`,'true');
   await ev(`${file}: incumbent untouched`,MARKET,live(side,incumbent),`u${big}`);
   await tx(`${file}: exit refunded wallet without oracle`,who,rung,'withdraw',[uintCV(amount),noneCV()],side==='x'?`(ok (tuple (sbtc u${amount}) (stx u0)))`:`(ok (tuple (sbtc u0) (stx u${amount})))`);
   await ev(`${file}: member exact returned amount`,MARKET,balance(side,who),`u${amount}`);
   await ev(`${file}: empty pool`,rung,'(get total-shares (get-state))','u0');
   // Repeat through the rung's OWN settle-before-withdraw helper.
   await tx(`${file}: resubmit refunded principal`,who,rung,'deposit',[uintCV(amount)],ok);
   const ownExit=await tx(`${file}: own exit settles refund then pays member`,who,rung,'withdraw',[uintCV(amount),someCV(update(fresh))],side==='x'?`(ok (tuple (sbtc u${amount}) (stx u0)))`:`(ok (tuple (sbtc u0) (stx u${amount})))`);
   event(`${file}: own exit refund reason`,ownExit.receipt,side,'pending-refund',{reason:'"queue-full"',amount:`u${amount}`});
   await ev(`${file}: own exit leaves no pending or shares`,MARKET,`(and (is-none ${pending(side,rung)}) (is-eq (get total-shares (contract-call? '${rung} get-state)) u0))`,'true');
   await ev(`${file}: own exit exact member refund`,MARKET,balance(side,who),`u${amount}`);finishPhase();
  }
  await tx(`${side}: remove incumbent`,incumbent,MARKET,`cancel-token-${side}-deposit`,[traits[side],assets[side]],`(ok u${big})`);
 }
 // A core pause prevents placement, even though the market's cancel is open.
 await tx('reserve 48 for placement-pending exits',DEP,LADDER,'set-max-band-per-side',[uintCV(48)],'(ok true)');
 await tx('sync 48 seats',DEP,MARKET,'sync-seat-count',[],'(ok u48)');
 for(const side of ['x','y']) {
  const owner=mk(side==='x'?997:998),a=side==='x'?6000:12000000,l=side==='x'?mid*2n:mid/2n;
  await fund(side,owner,a);await tx('prepare noncrossing book',owner,MARKET,`deposit-token-${side}`,depArgs(side,a,l),`(ok u${a})`);
  if(side==='y') await tx('admit opposite',keeper,MARKET,'settle-token-y-deposit',settleArgs(side,owner,await freshAfter(stamp)),`(ok u${a})`);
 }
 for(const {side,rung,who,amount} of fixed) {
  await tx('prepare pending rung placement',who,rung,'deposit',[uintCV(amount)],ok);
  await ev('placement waits in pending',MARKET,`(get amount (unwrap-panic ${pending(side,rung)}))`,`u${amount}`);
 }
 await tx('pause core',DEP,CORE,'pause',[],'(ok true)');
 for(const {side,rung,who,amount} of fixed) {
  await tx(`${side}: core pause blocks rung pending exit`,who,rung,'withdraw',[uintCV(amount),someCV(update(await freshAfter(stamp)))],'(err u5016)');
  await ev(`${side}: exit refusal retains exact escrow`,MARKET,`(get amount (unwrap-panic ${pending(side,rung)}))`,`u${amount}`);
 }
 finishPhase();
 console.log(`${passed}/${checks} checks green`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
