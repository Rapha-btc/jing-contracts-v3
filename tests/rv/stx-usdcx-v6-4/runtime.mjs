import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initSimnet} from '@stacks/clarinet-sdk';
import {Cl,cvToString} from '@stacks/transactions';

// All campaigns use the same public initialization and post-call checks.
// No source replacement, storage injection, or fabricated core errors.
export async function createRuntime(label) {
 const raw=await initSimnet('tests/rv/stx-usdcx-v6-4/Clarinet.toml');
 const meta=JSON.parse(fs.readFileSync('tests/rv/.build/stx-usdcx-v6-4/source.json'));
 const owner=raw.deployer,market=`${owner}.market`;
 const traits={x:Cl.contractPrincipal(owner,'mock-ft'),y:Cl.contractPrincipal(owner,'mock-stx')};
 const asset=Cl.stringAscii('mock-ft');
 const setup=(contract,fn,args)=>assert.equal(raw.callPublicFn(contract,fn,args,owner).result.type,'ok',`setup ${fn}`);
 setup('jing-core-v6','set-verified-contract',[Cl.principal(market)]);
 setup('market','initialize',[Cl.principal(market),traits.x,traits.y,Cl.uint(100),Cl.uint(10000),Cl.uint(45),Cl.uint(7)]);
 setup('market','set-treasury',[Cl.contractPrincipal(owner,'mock-jing-ladder')]);
 setup('market','sync-seat-count',[]);setup('market','set-distance-slots',[Cl.uint(0)]);
 for(const who of meta.accounts){raw.mintSTX(who,100000000000000n);setup('mock-stx','mint',[Cl.uint(100000000000000n),Cl.principal(who)]);}
 assert.equal(cvToString(raw.callReadOnlyFn('jing-core-v6','is-registered',[Cl.principal(market)],owner).result),'true');
 const stats={publicCalls:0,invariantChecks:0,getterCrossChecks:0,pendingRefunds:{},refundEvents:{x:0,y:0}};
 const trace=[];let failure;
 const supply=()=>Object.fromEntries([...raw.getAssetsMap()].map(([asset,balances])=>[asset,[...balances.values()].reduce((a,b)=>a+b,0n)]));
 const initialSupply=supply();
 const admin=new Set(['set-operator','set-treasury','set-paused','set-min-token-x-deposit','set-min-token-y-deposit','set-distance-slots','set-max-staleness','set-settle-max-staleness']);
 const balance=(side,who)=>BigInt(raw.callReadOnlyFn('market',`rv-balance-${side}`,[Cl.principal(who)],owner).result.value);
 const owned=(side,who)=>BigInt(raw.callReadOnlyFn('market',`rv-owned-${side}`,[Cl.principal(who)],owner).result.value);

 const keys=Object.fromEntries(['x','y'].map(side=>[side,meta.accounts.map(who=>Cl.tuple({token:traits[side],owner:Cl.principal(who)}))]));
 const coreUint=(map,key)=>{
  try{
   let v=raw.getMapEntry('jing-core-v6',map,key);
   if(v.type==='none')return 0n;
   if(v.type==='some')v=v.value;
   assert.equal(v.type,'uint');return BigInt(v.value);
  }catch(e){if(String(e)==='value not found')return 0n;throw e;}
 };

 const check=()=>{
  try{
  stats.invariantChecks++;
  assert.deepEqual(supply(),initialSupply,'no native/FT tokens created or lost');
  const snapshot=raw.callReadOnlyFn('market','rv-accounting-snapshot',[],owner).result.value;
  const mismatches=[];
  for(const side of ['x','y']){
   const expected=snapshot[side].value.map(v=>BigInt(v.value));
   for(let i=0;i<meta.accounts.length;i++){
    const actual=coreUint('token-equity',keys[side][i]);
    if(actual!==expected[i])mismatches.push({side,owner:meta.accounts[i],actual:String(actual),expected:String(expected[i])});
   }
   const actual=coreUint('total-token-equity',traits[side]),total=expected.reduce((a,b)=>a+b,0n);
   if(actual!==total)mismatches.push({side,owner:'TOTAL',actual:String(actual),expected:String(total)});
  }
  const redeployFlags=Object.fromEntries(['staleness','list-x','list-y'].map(name=>[name,cvToString(raw.callReadOnlyFn('market',`invariant-${name}`,[],owner).result)]));
  if(snapshot.structural.type!=='true'||mismatches.length||Object.values(redeployFlags).some(v=>v!=='true')){
   const flags={...redeployFlags,...Object.fromEntries(['properties','solvent-x','solvent-y','totals-x','totals-y','pending-positive-x','pending-positive-y','core-equity-x','core-equity-y']
    .map(name=>[name,cvToString(raw.callReadOnlyFn('market',`invariant-${name}`,[],owner).result)]))};
   failure??={label,flags,mismatches,trace:[...trace]};
   fs.writeFileSync(`tests/rv/stx-usdcx-v6-4/${label}-counterexample.json`,JSON.stringify(failure,null,2)+'\n');
   throw Error(`RV post-call invariant failed: ${JSON.stringify(flags)}`);
  }
  }catch(error){
   failure??={label,message:String(error),trace:[...trace]};
   fs.writeFileSync(`tests/rv/stx-usdcx-v6-4/${label}-counterexample.json`,JSON.stringify(failure,null,2)+'\n');
   throw error;
  }
 };
 const sim=new Proxy(raw,{get(target,key){
  if(key==='callPublicFn')return (contract,fn,args,who)=>{
   if(failure)throw Error(`RV stopped after invariant failure; see ${label}-counterexample.json`);
   trace.push({contract,fn,args:args.map(cvToString),sender:who,blockHeight:raw.blockHeight,burnBlockHeight:raw.burnBlockHeight});stats.publicCalls++;
   const operator=raw.getDataVar('market','operator').value;
   const side=/^(?:withdraw-token-|(?:rv|test)-withdraw-)([xy])$/.exec(fn)?.[1]??null;
   const before=side?{cash:balance(side,who),claim:owned(side,who)}:null;
   try{
    const receipt=target.callPublicFn(contract,fn,args,who);
    if(admin.has(fn)&&who!==operator)assert.deepEqual(receipt.result,Cl.error(Cl.uint(1008)),'operator-only setter');
    if(['set-max-staleness','set-settle-max-staleness'].includes(fn)&&who===operator){
     const n=BigInt(args[0].value),lo=fn==='set-max-staleness'?40n:20n,hi=fn==='set-max-staleness'?80n:40n;
     if(n<lo||n>hi)assert.deepEqual(receipt.result,Cl.error(Cl.uint(1034)),'staleness setter bounds');
    }
    if(side&&receipt.result.type==='ok')assert.ok(balance(side,who)-before.cash<=before.claim,'withdraw exceeds position');
    trace.at(-1).result=cvToString(receipt.result);
    for(const e of receipt.events??[])if(e.event==='print_event'&&e.data.contract_identifier===`${owner}.jing-core-v6`){
     const v=e.data.value.value,event=v?.event?.value;
     if(event==='pending-refund-x'||event==='pending-refund-y'){
      const reason=v.reason.value;stats.pendingRefunds[reason]=(stats.pendingRefunds[reason]??0)+1;
      console.log(`RV-REFUND ${JSON.stringify({event,reason})}`);
     }
     if(event==='refund-x'||event==='refund-y')stats.refundEvents[event.slice(-1)]++;
    }
    return receipt;
   }catch(error){
    if(error?.code==='ERR_ASSERTION'){failure??={label,message:String(error),trace:[...trace]};fs.writeFileSync(`tests/rv/stx-usdcx-v6-4/${label}-counterexample.json`,JSON.stringify(failure,null,2)+'\n');}
    throw error;
   }finally{check();} // Includes rejected calls and native VM exceptions.
  };
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 check();
 return {sim,traits,asset,stats,check,assertHealthy(){
  if(failure)throw Error(`RV post-call invariant failed; see ${label}-counterexample.json`);
  stats.getterCrossChecks++;
  assert.equal(cvToString(raw.callReadOnlyFn('market','invariant-all',[],owner).result),'true','getter-based invariants independently agree');
 }};
}
