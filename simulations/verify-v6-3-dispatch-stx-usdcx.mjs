// Fork only. Run: node simulations/verify-v6-3-dispatch-stx-usdcx.mjs
//           RELAY=1 node simulations/verify-v6-3-dispatch-stx-usdcx.mjs
// STX/USDCx port of verify-v6-3-dispatch.js: dispatcher integration on the
// working-tree contracts/stx-usdcx/ sources (stripped), no storage patches.
//   default : jing-ladder-dispatch-stx-usdcx
//   RELAY=1 : jing-ladder-dispatch-stx-usdcx-relay (same logic minus the
//             u7106 tx-sender == contract-caller gate). Every flow below is
//             a direct user call, so it runs unchanged; the one gate-specific
//             check at the end (a proxy contract dispatching the signer's
//             funds) expects u7106 on the gated dispatcher and ok on the relay.
//
// Mapping by ROLE (sBTC/STX x = buy-band jing-buy-stx-spread-*, deposit-buy):
//   x (rests STX)   = "sel-band" jing-sell-stx-usdc-<bps>, deposit/withdraw/claim-sell
//   y (rests USDCx) = "buy-band" jing-buy-stx-usdc-<bps>,  deposit/withdraw/claim-buy
//   rung receipt keys stay positional: sbtc = x (uSTX), stx = y (uUSDCx).
// N/A: fixed-price (jing-*-stx-<price>) and market-spread/peg rungs do not exist
//   on the STX/USDCx set. Their role in the original (a registered rung that is
//   NOT a seated band of the dispatch side: deposit -> u7104, claim -> u7108)
//   is played by (a) an UNSEATED band rung of the same side (initialize seat
//   false: deposit u7104) and (b) the opposite side's seated band rung
//   (deposit u7104, claim batch u7108).
// Fork: tip; jing-core-v6 + jing-rung-deposit-trait are the LIVE ones; verify
//   + initialize by CORE_OWNER (operator handed to it and back to DEP).
// Units: both 6 dp, mins 1 STX / 1 USDCx. Original amounts were sats x1 on x
//   and uSTX x2000 on y (mins 1000 sats / 1 STX); here both sides use x2000
//   micro-units: under-min leg 0.5 (rung MIN_DEPOSIT 0.1 STX / 0.1 USDCx),
//   others 6 / 8 / 10 ... units. Seeds 12 STX ask at mid*2, 12 USDCx bid at
//   mid/2 (outside every rung limit: rungs rest at mid +/- bps, guarded by
//   DIA STX/USD +/-20%).
import fs from 'node:fs';
import {
  ClarityVersion, listCV, tupleCV as rawTupleCV, uintCV, stringAsciiCV,
  noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import {
  SimulationBuilder, getSimulationResult, getSimulationTip,
  submitSimulationSteps, callContract, getNonce, setSender,
} from 'stxer';
import { installChunkedSubmit } from './_chunked-submit.js';
import { installRetrySubmit } from './_retry-submit.js';
import {
  NODE, DEP, CORE, CORE_OWNER, USDCX, STX_WHALES, USDCX_WHALES, N, C, RUNG, LADDER_SIDE, DISPATCH_DIR,
  P_ as principal, traits, assets, mk, src, balanceExpr as balance, freshAfter as freshAfterC, updCV as update, MIN,
} from './_stx-usdcx-v6-common.mjs';
installChunkedSubmit(4);
installRetrySubmit();

const RELAY = process.env.RELAY === '1';
const tupleCV = fields => rawTupleCV(Object.fromEntries(Object.entries(fields).sort(([a],[b])=>a.localeCompare(b))));
const WHALES = { x: STX_WHALES[0], y: USDCX_WHALES[1] };
const keeper = mk(871);
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
const pending = (side, p) => `(get-token-${side}-pending-deposit '${p})`;
const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
const depArgs = (side, amount, limit) => [uintCV(amount), uintCV(limit), noneCV(), traits[side], assets[side]];
const settleArgs = (side, who, u) => [principal(who), update(u), traits[side], assets[side]];
const parked = (side, p) => `(get-token-${side}-parked '${p})`;
const freshAfter = (stamp) => freshAfterC(stamp);
function event(label, receipt, side, name, fields = {}) {
  const prints = receipt.events.map((e) => typeof e === 'string' ? JSON.parse(e) : e)
    .filter((e) => e.committed && e.contract_event?.contract_identifier === CORE)
    .map((e) => cv(e.contract_event.raw_value));
  check(label, prints.join(' | '), () => prints.some((value) => value.includes(`(event "${name}${side ? `-${side}` : ''}")`) &&
    Object.entries(fields).every(([key, val]) => value.includes(`(${key} ${val})`))));
}
async function fund(side, who, amount) {
  if (side === 'y') {
    await tx('fund fresh USDCx', WHALES.y, USDCX, 'transfer', [uintCV(amount), principal(WHALES.y), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, WHALES.x), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, WHALES.x);
    const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check('fund fresh STX', decode({ Result: out.steps[0] }), '(ok true)');
  }
  finishPhase();
}
const MARKET = C.market, LADDER = C.ladder;
async function deploy(name, code) {
 const raw=await makeUnsignedContractDeploy({contractName:name,codeBody:code,clarityVersion:ClarityVersion.Clarity5,nonce:await getNonce(sid,DEP),network:'mainnet',publicKey:'',fee:0,postConditionMode:PostConditionMode.Allow});
 setSender(raw,DEP); const out=await submitSimulationSteps(sid,{steps:[{Transaction:raw.serialize()}]});
 check(`deploy ${name}`,decode({Result:out.steps[0]}),ok); finishPhase();
}
const DNAME=RELAY?N.relay:N.dispatch, DISPATCH=`${DEP}.${DNAME}`;
const entries=(rungs,amounts)=>listCV(rungs.map((rung,i)=>tupleCV({rung:principal(rung),amount:uintCV(amounts[i])})));
const sum=xs=>xs.reduce((a,b)=>a+b,0);
async function main() {
 console.log(`dispatcher under test: ${DNAME}`);
 const b=SimulationBuilder.new({stacksNodeAPI:NODE});
 b.withSender(DEP).addEvalCode(CORE,'(get-contract-owner)');
 sid=await b.run();console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
 check('live core owner = CORE_OWNER',decode((await getSimulationResult(sid)).steps.find(s=>s.Result?.Eval)),CORE_OWNER);
 for(const name of [N.ladder,N.market])await deploy(name,src(name));
 await tx('sync seats',DEP,MARKET,'sync-seat-count',[],'(ok u10)');
 await tx('verify market (core owner)',CORE_OWNER,CORE,'set-verified-contract',[principal(MARKET)],'(ok true)');
 await tx('operator -> core owner',DEP,MARKET,'set-operator',[principal(CORE_OWNER)],'(ok true)');
 await tx('initialize market',CORE_OWNER,MARKET,'initialize',[principal(MARKET),traits.x,traits.y,uintCV(MIN.x),uintCV(MIN.y),uintCV(45),uintCV(7)],'(ok true)');
 await tx('operator -> DEP',CORE_OWNER,MARKET,'set-operator',[principal(DEP)],'(ok true)');
 const stamp=Number((await ev('fork clock',MARKET,'stacks-block-time',v=>/^u[0-9]+$/.test(v))).slice(1));
 const first=await freshAfter(stamp),mid=first.mid;
 console.log(`Lazer [45,7] mid ${mid} ($${Number(mid)/1e8}/STX)`);
 const fixtures=[];
 for(const side of ['x','y']) {
  const dir=DISPATCH_DIR[side],rungs=[],nonseated=[],scale=2000;
  const tpl=side==='x'?N.sellTpl:N.buyTpl;
  for(const [bps,seat] of [[20,true],[30,true],[40,true],[50,false]]) {
   const name=RUNG[side](bps),rung=`${DEP}.${name}`;
   await deploy(name,src(tpl));
   await tx('canonical '+name,DEP,LADDER,'set-canonical',[stringAsciiCV(LADDER_SIDE[side]),principal(rung)],'(ok true)');
   await tx(`initialize ${name} (seat ${seat})`,DEP,rung,'initialize',[uintCV(bps),boolCV(seat)],'(ok true)');
   await ev('registration '+name,LADDER,`(is-some (get-registered '${rung}))`,'true');
   if(seat) {rungs.push(rung);await ev('seat '+name,LADDER,`(is-band-${side} '${rung})`,'true');}
   else {nonseated.push(rung);await ev('unseated '+name,LADDER,`(is-band-${side} '${rung})`,'false');}
  }
  const a=mk(side==='x'?721:722),memberB=mk(side==='x'?723:724);
  await fund(side,a,100000*scale);await fund(side,memberB,100000*scale);
  fixtures.push({side,dir,rungs,nonseated,scale,a,memberB});
 }
 // opposite side's seated band rung: registered, but not a band of this side
 fixtures[0].nonseated.push(fixtures[1].rungs[0]);fixtures[1].nonseated.push(fixtures[0].rungs[0]);
 await deploy(DNAME,src(DNAME));
 // Opposite liquidity is deliberately outside all rung limits, so both
 // sides escrow and subsequent settlement places rather than fills them.
 for(const side of ['x','y']) {
  const who=mk(side==='x'?725:726),amount=12000000;
  await fund(side,who,amount);
  await tx('noncrossing seed '+side,who,MARKET,`deposit-token-${side}`,depArgs(side,amount,side==='x'?mid*2n:mid/2n),`(ok u${amount})`);
  if(side==='y')await tx('settle seed',keeper,MARKET,'settle-token-y-deposit',settleArgs(side,who,await freshAfter(stamp)),`(ok u${amount})`);
 }
 async function dispatch(f,who,amounts) {
  const before=BigInt((await ev('wallet before dispatch',MARKET,balance(f.side,who),v=>/^u[0-9]+$/.test(v))).slice(1));
  const epochs=[];
  for(let i=0;i<3;i++)epochs.push(BigInt((await ev('epoch before dispatch '+i,f.rungs[i],'(get epoch (get-state))',v=>/^u[0-9]+$/.test(v))).slice(1)));
  const result=await tx(`${f.dir} weighted dispatch`,who,DISPATCH,`deposit-${f.dir}`,[uintCV(sum(amounts)),entries(f.rungs,amounts)],ok);
  const expected=cvToString({ ...tupleCV({amount:uintCV(sum(amounts)),rungs:uintCV(3),'stx-paid':uintCV(0),'sbtc-paid':uintCV(0),positions:listCV(f.rungs.map((rung,i)=>tupleCV({rung:principal(rung),amount:uintCV(amounts[i]),shares:uintCV(amounts[i]),epoch:uintCV(epochs[i]),'stx-paid':uintCV(0),'sbtc-paid':uintCV(0)})))}) });
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
  for(const rung of f.nonseated)await tx('unseated / opposite-side rung not eligible for dispatch',f.a,DISPATCH,`deposit-${f.dir}`,[uintCV(1000*f.scale),entries([rung],[1000*f.scale])],'(err u7104)');
  const amounts=[250,3000,4000].map(n=>n*f.scale);
  await dispatch(f,f.a,amounts);
  for(let i=0;i<3;i++)await ev('under-min holds; other legs escrow '+i,MARKET,`(and
   (is-eq ${balance(f.side,f.rungs[i])} u${i===0?amounts[i]:0})
   (is-eq (default-to u0 (get amount ${pending(f.side,f.rungs[i])})) u${i===0?0:amounts[i]}))`,'true');
  await withdraw(f,f.a,amounts,someCV(update(await freshAfter(stamp))));
  f.initial=[3000,4000,5000].map(n=>n*f.scale);f.second=f.initial.map(n=>2*n);
  await dispatch(f,f.a,f.initial);
  for(let i=1;i<3;i++)await tx('place other rung before top-up',keeper,MARKET,`settle-token-${f.side}-deposit`,settleArgs(f.side,f.rungs[i],await freshAfter(stamp)),`(ok u${f.initial[i]})`);
  await dispatch(f,f.memberB,f.second);
  for(let i=0;i<3;i++)await ev('already-pending isolated; other legs go through '+i,MARKET,`(and
    (is-eq ${balance(f.side,f.rungs[i])} u${i===0?f.second[i]:0})
    (is-eq (get amount (unwrap-panic ${pending(f.side,f.rungs[i])})) u${i===0?f.initial[i]:f.second[i]}))`,'true');
  for(const who of [f.a,f.memberB]) {
   const wallet=await ev('wallet before claim',MARKET,balance(f.side,who),v=>/^u[0-9]+$/.test(v));
   const claimed=await tx(`${f.dir} claim batch, nothing filled`,who,DISPATCH,`claim-${f.dir}`,[listCV(f.rungs.map(principal))],ok);
   check('exact claim receipt',claimed.result,`(ok ${cvToString(tupleCV({rungs:uintCV(3),claimed:uintCV(3),stx:uintCV(0),sbtc:uintCV(0),positions:listCV(f.rungs.map(rung=>tupleCV({rung:principal(rung),stx:uintCV(0),sbtc:uintCV(0)})))}))})`);
   await ev('claim moved nothing',MARKET,balance(f.side,who),wallet);
   const mine=who===f.a?f.initial:f.second;
   for(let i=0;i<3;i++)await ev('position kept after claim '+i,f.rungs[i],`(get shares (get-position '${who}))`,`u${mine[i]}`);
  }
  await ev('escrow kept after claims',MARKET,`(get amount (unwrap-panic ${pending(f.side,f.rungs[0])}))`,`u${f.initial[0]}`);
  await tx('claim batch by a member with no position',keeper,DISPATCH,`claim-${f.dir}`,[listCV(f.rungs.map(principal))],'(err u7006)');
  await tx('claim batch naming an opposite-side rung',f.a,DISPATCH,`claim-${f.dir}`,[listCV([principal(f.rungs[0]),principal(f.nonseated[1])])],'(err u7108)');
 }
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
   await ev('rung 0 escrow stays pending, others withdraw live exact',MARKET,i===0
    ? `(and (is-eq (get amount (unwrap-panic ${pending(f.side,rung)})) u${f.initial[0]}) (is-eq ${live(f.side,rung)} u0) (is-eq ${parked(f.side,rung)} u0))`
    : `(and (is-none ${pending(f.side,rung)}) (is-eq ${live(f.side,rung)} u${f.second[i]}) (is-eq ${parked(f.side,rung)} u0))`,'true');
   await ev('other member exact shares and claim',rung,`(and (is-eq (get shares (get-position '${f.memberB})) u${f.second[i]}) (is-eq (get ${f.side==='x'?'sbtc':'stx'} (get-position '${f.memberB})) u${f.second[i]}))`,'true');
  }
  const outB=await withdraw(f,f.memberB,f.second,noneCV());
  event('timeout cancel logged',outB.receipt,f.side,'pending-refund',{reason:'"cancel"'});
  await ev('dispatcher has no custody',MARKET,balance(f.side,DISPATCH),'u0');
 }
 // u7106 gate (the only dispatch/relay difference): an intermediary contract
 // dispatching the signer's own STX. Gated -> u7106; relay -> accepted.
 const PROXY=`dispatch-proxy-stx-usdcx${RELAY?'-relay':''}`;
 await deploy(PROXY,`(use-trait rung '${DEP}.jing-rung-deposit-trait.rung-trait)
(define-public (go (r <rung>) (amount uint))
  (contract-call? '${DISPATCH} deposit-sell amount (list { rung: r, amount: amount })))`);
 const fx=fixtures[0],gw=BigInt((await ev('proxy caller wallet before',MARKET,balance('x',fx.a),v=>/^u[0-9]+$/.test(v))).slice(1));
 await tx(RELAY?'relay: intermediary dispatch accepted':'dispatch: intermediary dispatch refused u7106',fx.a,`${DEP}.${PROXY}`,'go',[principal(fx.rungs[1]),uintCV(MIN.x)],RELAY?ok:'(err u7106)');
 await ev('proxy caller wallet delta',MARKET,balance('x',fx.a),`u${RELAY?gw-MIN.x:gw}`);
 await ev('proxy holds nothing',MARKET,balance('x',`${DEP}.${PROXY}`),'u0');
 console.log(`${passed}/${checks} checks green`);
 console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
 fs.writeFileSync(`simulations/fixtures/dispatch-v6-3-result-stx-usdcx${RELAY?'-relay':''}.json`,JSON.stringify({dispatcher:DNAME,simulation:`https://stxer.xyz/simulations/mainnet/${sid}`,passed,checks},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
