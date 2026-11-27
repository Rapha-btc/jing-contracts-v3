import {it,expect} from 'vitest';
import fc from 'fast-check';
import {getContractFunction,strategyFor} from '@stacks/rendezvous';
import {boot,Cl,u,STX,USDCX} from './lab';
const seeds=[20261126,20261127],numRuns=Number(process.env.RV_RUNS??500);
it.each(seeds)('RV partial-fill minimum rounds up for both routers, seed %i',async(seed)=>{
 // Arrange
 const {sim,cp,admin}=await boot();
 const arb=strategyFor(sim,getContractFunction(sim,STX,'scale-min'));
 // Act + Assert
 fc.assert(fc.property(arb,([a,b,c])=>{
  const min=(a as any).value%1000000000000n,planned=(b as any).value%1000000n+1n,actual=(c as any).value%(planned+1n);
  for(const contract of [STX,USDCX]){
   const result=sim.callPrivateFn(cp(contract),'scale-min',[u(min),u(planned),u(actual)],admin).result as any;
   const scaled=result.value as bigint;
   expect(scaled*planned>=min*actual).toBe(true);
   expect(scaled===0n || (scaled-1n)*planned<min*actual).toBe(true);
  }
 }),{seed,numRuns});
});
it.each(seeds)('RV Zest bounds preserve seller/buyer rounding, seed %i',async(seed)=>{
 // Arrange
 const {sim,cp,admin}=await boot();
 const arb=strategyFor(sim,getContractFunction(sim,USDCX,'zest-bound'));
 // Act + Assert
 fc.assert(fc.property(arb,([a,b,c])=>{
  const limit=(a as any).value%10000000000000n+1n,fee=(b as any).value%100000000n,sell=(c as any).type==='true';
  const wad=10n**28n,one=100000000n,keep=one-fee;
  for(const contract of [STX,USDCX]){
   const value=sim.callPrivateFn(cp(contract),'zest-bound',[u(limit),u(fee),Cl.bool(sell)],admin).result as any;
   const bound=value.value as bigint;
   if(sell){expect(bound*limit*one<=wad*keep).toBe(true);expect((bound+2n)*limit*one>wad*keep).toBe(true);}
   else {expect(bound*limit*keep>=wad*one).toBe(true);const p=(wad+limit-1n)/limit;expect(bound===0n||(bound-1n)*keep<p*one).toBe(true);}
  }
 }),{seed,numRuns});
});
