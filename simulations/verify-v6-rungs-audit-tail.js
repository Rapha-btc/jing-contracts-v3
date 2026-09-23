// Audit regression: real market fills drive all six rung variants into the tail.
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
 for(const side of (process.env.SIDE?[process.env.SIDE]:['x','y']))
 for(const kind of (process.env.KIND?[process.env.KIND]:['fixed','peg','band']))await scenario(side,kind);
 console.log(`\n${passed}/${checks} checks green`);
 console.log(links.join('\n'));
}
async function scenario(side,kind) {
 const dir=side==='x'?'buy':'sell',file=`jing-${dir}-stx${kind==='fixed'?'':kind==='peg'?'-market-spread':'-core-spread'}`;
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
 const cents=1000000000000000000n/(side==='x'?mid*101n/100n:mid*99n/100n);
 const guardCents=1000000000000000000n/(side==='x'?mid/2n:mid*2n);
 const name=kind==='fixed'?`jing-${dir}-stx-${centsName(cents)}`:kind==='peg'?`jing-${dir}-stx-spread-100-${side==='x'?'floor':'cap'}-${centsName(guardCents)}`:`jing-${dir}-stx-spread-100`;
 const rung=`${DEP}.${name}`,ladderSide=kind==='fixed'?`${dir}-stx`:kind==='peg'?`${dir}-peg`:side==='x'?'buy-band':'sel-band';
 await deploy(name,file);
 await tx('canonical rung',DEP,LADDER,'set-canonical',[stringAsciiCV(ladderSide),principal(rung)],'(ok true)');
 await tx('initialize rung',DEP,rung,'initialize',kind==='fixed'?[uintCV(cents)]:kind==='peg'?[uintCV(100),uintCV(guardCents)]:[uintCV(100),boolCV(true)],'(ok true)');
 const alice=mk(881),bob=mk(882),carol=mk(883),taker=mk(884),big=side==='x'?100000000n:100000000000n,small=side==='x'?1000n:1000000n;
 for(const who of [alice,bob,carol])await fund(side,who,big*4n);
 await fund(opposite(side),taker,side==='x'?1000000000000n:1000000000n);
 const state=()=>read(rung,'(get-state)');
 const actual=()=>get(rung,`(+ (market-size) ${side==='x'?`(unwrap-panic (contract-call? '${SBTC} get-balance current-contract))`:'(stx-get-balance current-contract)'})`);
 const sync=()=>tx('sync rung',keeper,rung,'sync',[],'(ok true)');
 const deposit=(who,amount)=>tx('member deposit',who,rung,'deposit',[uintCV(amount)],ok);
 const exit=(who,amount=big*100n)=>tx('member exit',who,rung,'withdraw',[uintCV(amount),someCV(update(signed))],ok);
 // All fills use public swap against the rung's real fixed/pegged limit.
 async function sellTo(target) {
  const start=await actual();
  for(let i=0;i<8;i++) {
   const rest=await actual();if(rest<=target+target/100n)break;
   const price=await get(MARKET,`(token-${side}-limit-at '${rung} u${mid})`);
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
 // Nilo: incumbent approaches the tail, newcomer must retain all their funds.
 await deposit(alice,big);await sellTo(big/2000n);await sync();
 const tail=await state();check('tail remains open below mint floor',field(tail,'unfilled-index'),v=>v>=1000000n&&v<FLOOR);
 const before=await wallet(side,bob),beforeState=await state();
 await tx('tail newcomer refused',bob,rung,'deposit',[uintCV(big)],'(err u7013)');
 check('refused deposit moves no funds',await wallet(side,bob),before);
 check('refusal preserves rung state',await state(),beforeState);
 // Last incumbent can exit and reopen deposits at exactly SCALE.
 const epoch=field(tail,'epoch');
 const pos=await read(rung,`(get-position '${alice})`),walletBefore=await wallet(side,alice);
 await exit(alice);
 check('last member receives exact unsold position',await wallet(side,alice)-walletBefore,field(pos,coin(side)));
 const empty=await state();check('last exit closes epoch',field(empty,'epoch'),epoch+1n);check('last exit resets index',field(empty,'unfilled-index'),SCALE);check('last exit burns every share',field(empty,'total-shares'),0n);
 const fresh=await deposit(carol,small);check('next deposit mints fresh shares',field(fresh.result,'shares'),small);await exit(carol);
 // Admit just above MINT_FLOOR, then actually cross SOLD_OUT_INDEX with a
 // NONZERO residual above SOLD_OUT_DUST: verify the index-close loss bound.
 await deposit(alice,big);await sellTo(big*1001n/1000000n);await sync();
 const admittedIndex=field(await state(),'unfilled-index');check('boundary index just above floor',admittedIndex,v=>v>=FLOOR&&v<FLOOR*101n/100n);
 const admitted=await deposit(bob,big),bobShares=field(admitted.result,'shares'),closeEpoch=field(await state(),'epoch');
 const shares=field(await state(),'total-shares');
 await sellTo(big/2000n);
 const residual=await actual();
 check('nonzero residual avoids absolute-dust close',residual,v=>v>(side==='x'?10n:10000n));
 check('residual crosses index-close threshold',residual*SCALE/shares,v=>v<1000000n);
 // Conservative ceiling of Bob's pro-rata share of ALL residual inventory.
 const lost=(residual*bobShares+shares-1n)/shares;
 check('new depositor loses strictly less than 0.1%',lost*1000n,v=>v<big);
 console.log(`bound: admitted-index=${admittedIndex}; residual=${residual}; newcomer-loss-ceiling=${lost}/${big}`);
 await sync();check('index close increments epoch',field(await state(),'epoch'),closeEpoch+1n);
 const owed=field(await read(rung,`(get-position '${bob})`),coin(opposite(side)));
 check('closed member has positive claim',owed,v=>v>0n);
 const payoutBefore=await wallet(opposite(side),bob),inputBefore=await wallet(side,bob);
 if(kind==='band') {
  // A second live band rung plus the closed one in one real dispatch withdrawal.
  await deploy('jing-rung-deposit-trait');await deploy('jing-ladder-dispatch');
  const secondName=`jing-${dir}-stx-spread-101`,second=`${DEP}.${secondName}`;
  await deploy(secondName,file);await tx('initialize second band rung',DEP,second,'initialize',[uintCV(101),boolCV(true)],'(ok true)');
  await tx('same member funds live rung',bob,second,'deposit',[uintCV(small*10n)],ok);
  const out=await tx('dispatch closed + live rung exits atomically',bob,`${DEP}.jing-ladder-dispatch`,`withdraw-${dir}`,[listCV([rung,second].map(r=>tupleCV({rung:principal(r),amount:uintCV(big*100n)}))),someCV(update(signed))],ok);
  const result=deserializeCV(out.resultHex).value.value;
  check('dispatch includes both withdrawals',BigInt(result.withdrawn.value),2n);
  check('dispatch closed claim paid exactly',BigInt(result[coin(opposite(side))].value),owed);
  check('dispatch live input paid exactly',BigInt(result[coin(side)].value),small*10n);
  check('dispatch input wallet net unchanged',await wallet(side,bob),inputBefore);
 } else {
  const out=await exit(bob);check('old-epoch withdraw returns exact claim',field(out.result,coin(opposite(side))),owed);check('old-epoch withdraw returns no unsold funds',field(out.result,coin(side)),0n);
  check('old-epoch input wallet unchanged',await wallet(side,bob),inputBefore);
 }
 check('claim payout wallet exact',await wallet(opposite(side),bob)-payoutBefore,owed);
 await tx('second old-epoch withdraw has no position',bob,rung,'withdraw',[uintCV(1),noneCV()],'(err u7006)');
 const aliceOwed=field(await read(rung,`(get-position '${alice})`),coin(opposite(side))),aBefore=await wallet(opposite(side),alice);
 await tx('separate old-epoch claim still works',alice,rung,'claim',[],ok);
 check('claim method pays exactly',await wallet(opposite(side),alice)-aBefore,aliceOwed);
 await ev('claim deletes old member position',rung,`(get shares (get-position '${alice}))`,'u0');
 console.log(`${passed}/${checks} checks green so far; ${link}`);
}
main().catch(e=>{console.error(e);console.log(`${passed}/${checks} checks green`);process.exit(1);});
