// State-aware seeded extension of the RV properties. Uses RV's fast-check
// dependency for operation ordering/arguments and the same Clarity assertions.
// All positions are created by public calls; no market storage is patched.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRuntime} from './runtime.mjs';
import {Cl,cvToString,getAddressFromPrivateKey} from '@stacks/transactions';
import fc from 'fast-check';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {hashInputs, assertInputsUnchanged, assertProductionPrefix, sharedInputs} from './source-integrity.mjs';
const require=createRequire(import.meta.url);
const {checkProperties}=require('../../../node_modules/@stacks/rendezvous/dist/property.js');
const {getSimnetDeployerContractsInterfaces,getFunctionsFromContractInterfaces}=require('../../../node_modules/@stacks/rendezvous/dist/shared.js');
const randomRuns=Number(process.env.RV_RANDOM_RUNS??1000);

const count=Number(process.env.RV_EPISODES??40);
const seeds=(process.env.RV_SEEDS??'230930,230931,230932').split(',').map(Number);
const generated=Array.from({length:64},(_,i)=>getAddressFromPrivateKey(BigInt(8000+i).toString(16).padStart(64,'0')+'01','testnet'));
const prior=fs.readFileSync('tests/rv/v6-3/properties.clar','utf8').match(/\(define-constant RV-ACCOUNTS \(list([\s\S]*?)\)\)/)[1].match(/ST[A-Z0-9]+/g);
fs.writeFileSync('tests/rv/v6-3/full-book-accounts.json',JSON.stringify([...new Set([...prior,...generated])],null,2)+'\n');
execFileSync('python3',['tests/rv/v6-3/build.py','--full-book'],{stdio:'inherit'});
// Read-only inspection is appended to the generated test copy, never production.
fs.appendFileSync('tests/rv/.build/v6-3/market.clar',`
(define-read-only (rv-full-snapshot)
 {x:(map rv-row-x RV-ACCOUNTS),y:(map rv-row-y RV-ACCOUNTS)})
`);
const results=[];
assertProductionPrefix(true);
const hashes=hashInputs([...sharedInputs,'tests/rv/v6-3/run-full-book.mjs','tests/rv/v6-3/full-book-accounts.json']);
for(const seed of seeds){
 assertInputsUnchanged(hashes);
 const runtime=await createRuntime(`full-book-${seed}`),sim=runtime.sim;
 for(const who of generated)sim.mintSTX(who,100000000000000n);
 const {traits,asset}=runtime;
 const stats={},trace=[];let serial=0;
 const record=name=>stats[name]=(stats[name]??0)+1;
 const read=(fn,args=[])=>sim.callReadOnlyFn('market',fn,args,sim.deployer).result;
 const call=(who,fn,args=[],required=true)=>{
  trace.push({sender:who,fn,args:args.map(cvToString)});
  const r=sim.callPublicFn('market',fn,args,who),s=cvToString(r.result);
  if(required)assert.ok(s.startsWith('(ok')&&(!fn.startsWith('test-')||s!=='(ok false)'),`${fn}: ${s}`);
  return {r,s};
 };
 const mid=n=>{sim.callPublicFn('mock-lazer-oracle','set-mid',[Cl.uint(n)],sim.deployer);};
 const scalar=(fn,who)=>BigInt(cvToString(read(fn,[Cl.principal(who)])).slice(1));
 const pending=(side,who)=>cvToString(read(`get-token-${side}-pending-deposit`,[Cl.principal(who)]))!=='none';
 const rows=side=>read('rv-full-snapshot').value[side].value.map(v=>({who:cvToString(v.value.who),live:BigInt(v.value.live.value),parked:BigInt(v.value.parked.value)}));
 const owned=(s,w)=>scalar(`rv-owned-${s}`,w);
 const cancel=(s,w,pause=false)=>{const n=owned(s,w);call(w,`test-cancel-${s}`,[Cl.bool(pause)]);if(n>0n)record(`cancel-${s}`);if(pause)call(sim.deployer,'test-config',[Cl.bool(false),Cl.uint(99),Cl.uint(0)]);};
 const settle=(s,w)=>{if(pending(s,w)){sim.mineEmptyBlocks(1);call(sim.deployer,`test-settle-${s}`,[Cl.principal(w)]);assert.equal(pending(s,w),false);record(`settle-deposit-${s}`);}};
 const deposit=(s,w,n,limit=39001000000000n)=>{
  const before=owned(s,w),minimum=s==='x'?100n:109000n;
  assert.ok(before+BigInt(n)>=minimum);
  call(w,`deposit-token-${s}`,[Cl.uint(n),Cl.uint(limit),Cl.none(),traits[s],asset]);record(`deposit-${s}`);settle(s,w);
 };
 const cfg=()=>call(sim.deployer,'test-config',[Cl.bool(false),Cl.uint(99),Cl.uint(0)]);
 const readmit=(s,w)=>{
  const before=owned(s,w);let p=cvToString(read(`get-token-${s}-pending-readmit`,[Cl.principal(w)]));
  if(p==='none'){call(sim.deployer,`readmit-token-${s}`,[Cl.principal(w)]);record(`readmit-${s}`);}
  sim.mineEmptyBlocks(1);
  const {s:result}=call(sim.deployer,`settle-token-${s}-readmit`,[Cl.principal(w),Cl.bufferFromHex('')]);
  assert.notEqual(result,'(ok u0)','readmission must place into freed seat');
  record(`settle-readmit-${s}`);
  assert.equal(scalar(`get-token-${s}-parked`,w),0n);assert.equal(owned(s,w),before);
  assert.equal(cvToString(read(`get-token-${s}-pending-readmit`,[Cl.principal(w)])),'none');
 };
 const rng=fc.sample(fc.record({pick:fc.nat(),amount:fc.integer({min:1000,max:9000}),pause:fc.boolean()}),{seed,numRuns:count*12+100});let ri=0;
 const choose=xs=>{assert.ok(xs.length,'eligible state-aware choice');return xs[rng[ri++%rng.length].pick%xs.length];};
 try{
  cfg();mid(32000000000000n);
  // Fifty live depositors per side, then three replacements produce parked
  // owners while preserving full lists. No reduced MAX_DEPOSITORS or seats.
  for(const side of ['x','y']){
   const scale=side==='x'?1:1000;
   for(let i=0;i<50;i++)deposit(side,generated[i],(1000+i)*scale);
   for(let i=50;i<53;i++)deposit(side,generated[i],(5000+i)*scale);
   assert.equal(rows(side).filter(r=>r.live>0n).length,50);
   assert.equal(rows(side).filter(r=>r.parked>0n).length,3);
   const live=rows(side).find(r=>r.live>0n).who,parked=rows(side).find(r=>r.parked>0n).who;
   call(generated[53],`deposit-token-${side}`,[Cl.uint(300*scale),Cl.uint(39001000000000n),Cl.none(),traits[side],asset]);record(`deposit-${side}`);
   call(live,`set-token-${side}-limit`,[Cl.uint(39001000000000n),Cl.none()]);record(`set-limit-${side}`);
   call(sim.deployer,`readmit-token-${side}`,[Cl.principal(parked)]);record(`readmit-${side}`);
  }
  for(const side of ['x','y']){
   const who=rows(side).find(r=>r.live>0n).who;
   call(who,`set-token-${side}-limit`,[Cl.uint(39001000000000n),Cl.none()]);
   assert.notEqual(cvToString(read(`get-token-${side}-pending-limit`,[Cl.principal(who)])),'none');
  }
  console.log(`PRELUDE seed=${seed}: 50 live + 3 parked + pending deposit/limit/readmit per side; crossing at mid 39001000000000.`);
  // Readmission-biased random sequences preserve the full-book pressure.
  const sides=fc.sample(fc.shuffledSubarray([...Array(count).fill('x'),...Array(count).fill('y')],{minLength:count*2,maxLength:count*2}),{seed:seed+1,numRuns:1})[0];
  for(const side of sides){
   cfg();mid(32000000000000n);const scale=side==='x'?1:1000;
   settle(side,generated[53]);
   const open=choose(rows(side).filter(r=>r.live===0n&&r.parked===0n&&r.who!==generated[53]&&generated.includes(r.who)));
   if(pending(side,open.who))settle(side,open.who);
   deposit(side,open.who,(10000+serial++)*scale);
   const candidate=choose(rows(side).filter(r=>r.parked>0n));
   const victim=choose(rows(side).filter(r=>r.live>0n&&r.who!==open.who));
   cancel(side,victim.who,rng[ri++%rng.length].pause);
   readmit(side,candidate.who);
   assert.equal(rows(side).filter(r=>r.live>0n).length,50);
   if(serial%7===0){const w=choose(rows(side).filter(r=>r.live>500n*BigInt(scale))).who;
    call(w,`withdraw-token-${side}`,[Cl.uint(100*scale),traits[side],asset]);record(`withdraw-${side}`);}
   console.log(`READMIT seed=${seed} iteration=${serial}`);
  }
  // The prelude's actual full crossing book clears before smaller randomized
  // replenishments. These subsequent episodes retain remaining rolls/parks.
  mid(39001000000000n);call(sim.deployer,'test-batch');record('settle-with-refresh');
  // Randomize batch vs taker episodes, quantities, senders and cancellation.
  const modes=fc.sample(fc.shuffledSubarray([...Array(count).fill('batch'),...Array(count).fill('swap-x'),...Array(count).fill('swap-y')],{minLength:count*3,maxLength:count*3}),{seed:seed+2,numRuns:1})[0];
  for(const mode of modes){
   cfg();mid(32000000000000n);
   const a=generated[60],b=generated[61],taker=generated[62];
   for(const side of ['x','y'])for(const who of [a,b,taker])if(owned(side,who)>0n)cancel(side,who);
   const n=1000+rng[ri++%rng.length].amount;
   // Keep replenishment greater than every existing live amount so the
   // full-side fixture can admit it if earlier rolls retained fifty owners.
   if(mode==='batch'){
    deposit('x',a,100000+n);deposit('y',b,(100000+n)*4000);
    mid(39001000000000n);
    call(sim.deployer,'test-batch');record('settle-with-refresh');
   }else{
    const side=mode==='swap-x'?'x':'y',opp=side==='x'?'y':'x';
    // Expose resting liquidity at the oracle mid. Placement occurs with the
    // opposite mid first, so it is a maker before the taker arrives.
    mid(opp==='x'?30000000000000n:42000000000000n);
    deposit(opp,a,opp==='x'?200000+n:(200000+n)*4000,32000000000000n);
    mid(32000000000000n);
    const amount=side==='x'?2000+n:(2000+n)*3000;
    const r=call(taker,'swap',[Cl.uint(amount),Cl.uint(side==='x'?16000000000000n:64000000000000n),Cl.bufferFromHex(''),traits.x,asset,traits.y,asset,Cl.bool(side==='x')]);
    assert.ok(new RegExp(`token-${opp}-received u[1-9]`).test(r.s),'swap must fill');record(`swap-${side}`);
   }
   for(const side of ['x','y'])for(const who of [a,b,taker])if(owned(side,who)>0n)cancel(side,who,rng[ri++%rng.length].pause);
  }
  // Rendezvous's native property runner continues from this funded state.
  // A proxy checks ALL invariants after every public call, including discards.
  const radio=new EventEmitter(),rv={runs:randomRuns,passed:0,discarded:0,failed:0};
  for(const name of ['logMessage','logInfo','logFailure'])radio.on(name,message=>{
   const text=String(message).replace(/\x1b\[[0-9;]*m/g,'');
   rv.passed+=(text.match(/\[PASS\]/g)||[]).length;
   rv.discarded+=(text.match(/\[WARN\]/g)||[]).length;
   rv.failed+=(text.match(/\[FAIL\]|Runtime error|Error:/g)||[]).length;
   console.log(text);
  });
  const target=`${sim.deployer}.market`,all=getSimnetDeployerContractsInterfaces(sim);
  const functions=getFunctionsFromContractInterfaces(new Map([...all].filter(([id])=>id===target)));
  const eligible=new Map(generated.map((address,i)=>[`maker-${i}`,address]));
  await checkProperties(sim,async()=>{throw Error('Unexpected RV regression reset');},[target],functions,seed+100,randomRuns,true,false,radio,eligible,generated);
  assert.equal(rv.failed,0,'native RV property failure');assert.equal(rv.passed+rv.discarded,randomRuns,'complete native RV run');
  // Recovery is a real public cancellation, including after arbitrary minimum,
  // pause and quote changes. Every funded owner must recover exactly its claim.
  assert.equal(cvToString(sim.callPublicFn('jing-core-v6','pause',[],sim.deployer).result),'(ok true)');
  const recovery={x:{owners:0,amount:0n},y:{owners:0,amount:0n}};
  for(const side of ['x','y'])for(const row of rows(side)){
   const claim=owned(side,row.who);
   if(claim>0n){
    cancel(side,row.who,true);
    assert.equal(owned(side,row.who),0n,'cancel must clear all owned funds');
    recovery[side].owners++;recovery[side].amount+=claim;
   }
  }
  for(const side of ['x','y']){
   assert.equal(scalar(`rv-balance-${side}`,`${sim.deployer}.market`),0n,'no residual custody after all owners cancel');
   recovery[side].amount=recovery[side].amount.toString();
   const total=sim.callReadOnlyFn('jing-core-v6','get-total-token-equity',[traits[side]],sim.deployer).result;
   assert.equal(cvToString(total),'u0','no residual core equity after recovery');
   recovery[side].coreEquity='0';
  }
  runtime.check();assertInputsUnchanged(hashes);
  runtime.assertHealthy();
  results.push({monitor:runtime.stats,seed,episodesPerPath:count,successfulCalls:stats,invariantChecks:runtime.stats.invariantChecks,calls:trace.length,nativeRV:{seed:seed+100,...rv},recovery});
  console.log(`GREEN seed=${seed} ${JSON.stringify(results.at(-1))}`);
 }catch(e){
  fs.writeFileSync('tests/rv/v6-3/full-book-counterexample.json',JSON.stringify({seed,error:String(e),trace},null,2)+'\n');
  throw e;
 }
}
assertInputsUnchanged(hashes);
assertProductionPrefix(true);
fs.writeFileSync('tests/rv/v6-3/full-book-results.json',JSON.stringify({generatedAt:new Date().toISOString(),realCore:true,results,hashes},null,2)+'\n');
fs.rmSync('tests/rv/v6-3/full-book-counterexample.json',{force:true});
console.log('All seeded full-book checks green.');
