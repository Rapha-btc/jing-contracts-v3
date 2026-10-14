// Audit regression: real market fills drive the two deploy-set rungs
// (core-spread-v1, buy + sell) into the rescale band and then the tail roll.
// Fork only. No source substitutions, storage writes, or mock prices.
// Optional SIDE=x|y KIND=fixed|peg|band restrict a diagnostic run.
import fs from 'node:fs';
import {
  ClarityVersion, listCV, tupleCV, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
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
const WHALES = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
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
const SCALE = 1000000000000n, FLOOR = 1000000000n;
const number = (s) => BigInt(s.slice(1));
const field = (s, name) => BigInt(s.match(new RegExp(`\\(${name} u(\\d+)\\)`))[1]);
const opposite = side => side === 'x' ? 'y' : 'x';
const coin = side => side === 'x' ? 'sbtc' : 'stx';
const centsName = c => `${c/100n}-${String(c%100n).padStart(2,'0')}`;
const links = [];
async function read(cid, expression) {
 const r=await submitSimulationSteps(sid,{steps:[{Eval:[DEP,'',cid,expression]}]});
 const v=decode({Result:r.steps[0]});
 if(v.startsWith('ENGINE-ERR'))throw new Error(v);
 return v;
}
async function get(cid, expression) { return number(await read(cid,expression)); }
async function wallet(side,who) { return get(MARKET,balance(side,who)); }
async function main() {
 for(const side of (process.env.SIDE?[process.env.SIDE]:['x','y']))await scenario(side);
 console.log(`\n${passed}/${checks} checks green`);
 console.log(links.join('\n'));
}
// The deploy-set rungs only: jing-buy-stx-core-spread-v1 (x) and
// jing-sell-stx-core-spread-v1 (y), as of d8b01e4. Tail rule (f015382 lossless
// close, 741de17 rescale):
//  - a fill that leaves the index in [MINT_FLOOR/RESCALE, MINT_FLOOR) RESCALES:
//    index x1000, total-shares /1000, scale +1, same epoch, still open, so a
//    newcomer deposits normally (no u7013 any more);
//  - a fill that leaves the index under MINT_FLOOR/RESCALE (or actual under
//    SOLD_OUT_DUST) makes sync ROLL THE TAIL: order cancelled off the market,
//    the unsold rest reserved for the closing epoch's members, epoch +1,
//    index = SCALE, total-shares 0, members 0. The next deposit opens the
//    fresh epoch at shares = amount; old members take reserve + proceeds.
async function scenario(side) {
 const dir=side==='x'?'buy':'sell',file=`jing-${dir}-stx-core-spread-v1`;
 console.log(`\n=== ${file} ===`);
 let b=SimulationBuilder.new({stacksNodeAPI:'http://77.42.3.101/stacks-api'});
 b.withSender(DEP).addContractDeploy({contract_name:'jing-core-v6',source_code:source('jing-core-v6'),clarity_version:ClarityVersion.Clarity5});
 sid=await b.run();const link=`${file}: https://stxer.xyz/simulations/mainnet/${sid}`;links.push(link);console.log(link);
 const initialResult=await getSimulationResult(sid);check('deploy core',decode(initialResult.steps.find(s=>s.Result?.Transaction)),ok);
 await deploy('jing-ladder-v1');await deploy('markets-sbtc-stx-jing-v6-3');
 await tx('sync seats',DEP,MARKET,'sync-seat-count',[],'(ok u10)');
 await tx('verify market',DEP,CORE,'set-verified-contract',[principal(MARKET)],'(ok true)');
 await tx('initialize market',DEP,MARKET,'initialize',[principal(MARKET),traits.x,traits.y,uintCV(1000),uintCV(1000000),uintCV(1),uintCV(45)],'(ok true)');
 const stamp=Number(await get(MARKET,'stacks-block-time')),signed=await freshAfter(stamp),mid=signed.px*100000000n/signed.py;
 const name=`jing-${dir}-stx-spread-100`,rung=`${DEP}.${name}`,ladderSide=side==='x'?'buy-band':'sel-band';
 await deploy(name,file);
 await tx('canonical rung',DEP,LADDER,'set-canonical',[stringAsciiCV(ladderSide),principal(rung)],'(ok true)');
 await tx('initialize rung',DEP,rung,'initialize',[uintCV(100),boolCV(true)],'(ok true)');
 const alice=mk(881),bob=mk(882),carol=mk(883),taker=mk(884),big=side==='x'?100000000n:100000000000n,small=side==='x'?1000n:1000000n;
 // alice needs 2 x big + the live-rung deposit; 3 x 4 x 100k STX overdrew the STX whale
 for(const who of [alice,bob,carol])await fund(side,who,big*2n+small*20n);
 // STX whale WHALES.y holds ~970k STX at the 10-14 tip; 1M STX failed (InsufficientBalance).
 // The x-side taker buys ~2 BTC (~0.4M STX at ~194k STX/BTC), so 800k STX keeps headroom.
 await fund(opposite(side),taker,side==='x'?800000000000n:1000000000n);
 const state=()=>read(rung,'(get-state)');
 const actual=()=>get(rung,`(+ (market-size) ${side==='x'?`(unwrap-panic (contract-call? '${SBTC} get-balance current-contract))`:'(stx-get-balance current-contract)'})`);
 const sync=()=>tx('sync rung',keeper,rung,'sync',[],'(ok true)');
 const deposit=(who,amount)=>tx('member deposit',who,rung,'deposit',[uintCV(amount)],ok);
 const exit=(who,amount=big*100n)=>tx('member exit',who,rung,'withdraw',[uintCV(amount),someCV(update(signed))],ok);
 // All fills use public swap against the rung's real pegged limit.
 async function sellTo(target) {
  const start=await actual();
  for(let i=0;i<8;i++) {
   const rest=await actual();if(rest<=target+target/100n)break;
   const price=await get(MARKET,`(token-${side}-limit-at '${rung} u${mid})`);
   // the market refunds a maker remainder under its minimum to the rung and
   // drops the order: nothing left to fill, the rest sits on the rung
   if(price===0n&&await get(MARKET,live(side,rung))===0n)break;
   check('rung quote is executable outside mid',price,p=>side==='x'?p>mid&&p<mid*4n:p>mid/4n&&p<mid);
   const want=rest-target;
   const net=side==='x'?want*price/10000000000n:want*10000000000n/price;
   if(net<(side==='x'?1000000n:1000n))break;
   const gross=net*10000n/9980n;
   const r=await tx(`real fill toward ${target}`,taker,MARKET,'swap',[uintCV(gross),uintCV(side==='x'?price*101n/100n:price*99n/100n),update(signed),traits.x,assets.x,traits.y,assets.y,boolCV(side==='y')],ok);
   check('fill returns output',field(r.result,`token-${side}-received`),v=>v>0n);
   // A sub-minimum taker remainder is refunded by swap; no leftover book leg.
   await ev('taker leaves no resting position',MARKET,live(opposite(side),taker),'u0');
  }
  const rest=await actual();check('real fills reduced rung inventory',rest,v=>v<start);
  console.log(`inventory ${start} -> ${rest}, target ${target}`);
 }
 const within1=(v,want)=>v<=want&&v+1n>=want;

 // --- A. Drift under MINT_FLOOR (not under MINT_FLOOR/RESCALE): rescale, stay open.
 await deposit(alice,big);
 const pre=await state(),preShares=field(pre,'total-shares'),epochA=field(pre,'epoch'),scaleA=field(pre,'scale');
 await sellTo(big/2000n);
 const restA=await actual();
 check('fills leave index in rescale band [1e6, MINT_FLOOR)',restA*SCALE/big,v=>v>=1000000n&&v<FLOOR);
 await sync();
 const resc=await state();
 check('rescale keeps the epoch open',field(resc,'epoch'),epochA);
 check('rescale steps scale +1',field(resc,'scale'),scaleA+1n);
 check('rescaled index back at or above MINT_FLOOR',field(resc,'unfilled-index'),v=>v>=FLOOR&&v<SCALE);
 check('rescale divides total shares by 1000',field(resc,'total-shares'),preShares/1000n);
 check('rescale keeps the member',field(resc,'members'),1n);
 check('sole member still owns all unsold',field(await read(rung,`(get-position '${alice})`),coin(side)),restA);
 const bobBefore=await wallet(side,bob);
 const joinA=await deposit(bob,big);
 check('newcomer after rescale is admitted (no u7013)',field(joinA.result,'shares'),v=>v>0n);
 check('newcomer deposit moves exactly the amount',bobBefore-await wallet(side,bob),big);
 const afterJoin=await state();
 check('newcomer joins the same epoch',field(afterJoin,'epoch'),epochA);check('two members',field(afterJoin,'members'),2n);
 check('newcomer position worth its deposit (<=1 unit rounding)',field(await read(rung,`(get-position '${bob})`),coin(side)),v=>within1(v,big));
 check('incumbent position unchanged by the join (<=1 unit)',field(await read(rung,`(get-position '${alice})`),coin(side)),v=>within1(v,restA));
 const bobMid=await wallet(side,bob);await exit(bob);
 check('newcomer exits with its deposit (<=1 unit)',await wallet(side,bob)-bobMid,v=>within1(v,big));
 const aPos=await read(rung,`(get-position '${alice})`),aWallet=await wallet(side,alice);
 await exit(alice);
 check('last member receives exact unsold position',await wallet(side,alice)-aWallet,field(aPos,coin(side)));
 const emptyA=await state();
 check('last exit closes epoch',field(emptyA,'epoch'),epochA+1n);check('last exit resets index',field(emptyA,'unfilled-index'),SCALE);check('last exit burns every share',field(emptyA,'total-shares'),0n);
 check('pool input fully paid out',await actual(),0n);

 // --- B. One fill over 99.9% (index under MINT_FLOOR/RESCALE), residual above
 // SOLD_OUT_DUST: sync rolls the tail and closes the epoch losslessly.
 await deposit(alice,big);await deposit(carol,big);
 const epochB=field(await state(),'epoch'),sharesB=field(await state(),'total-shares');
 // Two legs, no sync between them, so sync sees one >99.9% drop. One 2-BTC
 // swap overshoots by ~800 sats and the taker keeps >= 1 STX (market u1017).
 await sellTo(big*2n/1000n);await sellTo(big*2n/2000000n);
 const residual=await actual();
 check('nonzero residual avoids absolute-dust close',residual,v=>v>=10n);
 check('residual crosses the roll threshold (index < MINT_FLOOR/RESCALE)',residual*SCALE/sharesB,v=>v<1000000n);
 await sync();
 const rolled=await state();
 check('tail roll closes the epoch',field(rolled,'epoch'),epochB+1n);
 check('fresh epoch index = SCALE',field(rolled,'unfilled-index'),SCALE);
 check('fresh epoch has no shares',field(rolled,'total-shares'),0n);
 check('fresh epoch has no members',field(rolled,'members'),0n);
 check('tail roll takes the order off the market',field(rolled,'resting'),0n);
 check('tail roll reserves the rest (nothing held for the pool)',field(rolled,side==='x'?'held-sats':'held-ustx'),0n);
 const aliceB=await read(rung,`(get-position '${alice})`);
 const aliceBack=field(aliceB,coin(side)),aliceOwed=field(aliceB,coin(opposite(side)));
 check('closed member has positive proceeds claim',aliceOwed,v=>v>0n);
 // Newcomer after the roll: a fresh epoch, shares minted 1:1, reserve untouched.
 const nBefore=await wallet(side,bob);
 const joinB=await deposit(bob,big);
 check('newcomer after roll mints fresh shares 1:1',field(joinB.result,'shares'),big);
 check('newcomer after roll moves exactly the amount',nBefore-await wallet(side,bob),big);
 const fresh=await state();
 check('newcomer opens the fresh epoch',field(fresh,'epoch'),epochB+1n);check('fresh epoch one member',field(fresh,'members'),1n);
 check('newcomer owns exactly its deposit',field(await read(rung,`(get-position '${bob})`),coin(side)),big);
 check('closed members claims untouched by the newcomer',await read(rung,`(get-position '${alice})`),aliceB);
 // Alice: closed rung + a second live rung in one real dispatch withdrawal.
 await deploy('jing-rung-deposit-trait');await deploy('jing-ladder-dispatch');
 const secondName=`jing-${dir}-stx-spread-101`,second=`${DEP}.${secondName}`;
 await deploy(secondName,file);await tx('initialize second band rung',DEP,second,'initialize',[uintCV(101),boolCV(true)],'(ok true)');
 await tx('same member funds live rung',alice,second,'deposit',[uintCV(small*10n)],ok);
 const payoutBefore=await wallet(opposite(side),alice),inputBefore=await wallet(side,alice);
 const out=await tx('dispatch closed + live rung exits atomically',alice,`${DEP}.jing-ladder-dispatch`,`withdraw-${dir}`,[listCV([rung,second].map(r=>tupleCV({rung:principal(r),amount:uintCV(big*100n)}))),someCV(update(signed))],ok);
 const result=deserializeCV(out.resultHex).value.value;
 check('dispatch includes both withdrawals',BigInt(result.withdrawn.value),2n);
 check('dispatch closed proceeds paid exactly',BigInt(result[coin(opposite(side))].value),aliceOwed);
 check('dispatch input = closed reserve share + live deposit',BigInt(result[coin(side)].value),aliceBack+small*10n);
 check('proceeds wallet exact',await wallet(opposite(side),alice)-payoutBefore,aliceOwed);
 check('input wallet exact',await wallet(side,alice)-inputBefore,aliceBack+small*10n);
 await tx('second old-epoch withdraw has no position',alice,rung,'withdraw',[uintCV(1),noneCV()],'(err u7006)');
 // Carol, the last closed member, takes the rest of the reserve via claim.
 const carolLast=await read(rung,`(get-position '${carol})`),carolBack=field(carolLast,coin(side)),carolOwed=field(carolLast,coin(opposite(side)));
 check('last closed member gets the whole remaining reserve',aliceBack+carolBack,residual);
 const cOut=await wallet(opposite(side),carol),cIn=await wallet(side,carol);
 await tx('last closed member claims',carol,rung,'claim',[],ok);
 check('claim pays proceeds exactly',await wallet(opposite(side),carol)-cOut,carolOwed);
 check('claim pays reserve share exactly',await wallet(side,carol)-cIn,carolBack);
 await ev('claim deletes old member position',rung,`(get shares (get-position '${carol}))`,'u0');
 // Newcomer exits the fresh epoch whole; nothing is left behind.
 const bMid=await wallet(side,bob);await exit(bob);
 check('newcomer exits fresh epoch with exactly its deposit',await wallet(side,bob)-bMid,big);
 check('no input left in the rung after every exit',await actual(),0n);
 console.log(`${passed}/${checks} checks green so far; ${link}`);
}
main().catch(e=>{console.error(e);console.log(`${passed}/${checks} checks green`);process.exit(1);});
