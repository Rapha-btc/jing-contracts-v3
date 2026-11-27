import {track} from './coverage';
import {initSimnet} from '@stacks/clarinet-sdk';
import {Cl, type ClarityValue} from '@stacks/transactions';
import {expect} from 'vitest';
export {Cl};
export const u=Cl.uint;
export const ok=(r:any)=>{expect(r.result.type,Cl.prettyPrint(r.result)).toBe('ok');return r.result.value;};
export const STX='swap-router-sbtc-stx-jing-v6-1', USDCX='swap-router-sbtc-usdcx-jing-v6';
export const legs=(zest:number)=>Cl.tuple({zest:u(zest),dlmm:u(0),xyk:u(0),velar:u(0)});
export const route=Cl.tuple({ticks:Cl.list([Cl.int(0),Cl.int(1)]),price:u(123456789)});
export async function boot(){
 const sim=await initSimnet('tests/nov27/.build/Clarinet.toml',true,{trackCoverage:true,trackCosts:false});
 track(sim);
 const admin=sim.getAccounts().get('deployer')!;
 const cp=(n:string)=>`${admin}.${n}`;
 const call=(n:string,f:string,a:ClarityValue[]=[])=>sim.callPublicFn(cp(n),f,a,admin);
 const read=(n:string,f:string,a:ClarityValue[]=[])=>sim.callReadOnlyFn(cp(n),f,a,admin).result;
 for(const token of ['sbtc','usdcx']) for(const who of [admin,cp('zest'),cp('dlmm'),cp('cp'),cp('market')]) ok(call(token,'mint',[u(100000),Cl.principal(who)]));
 for(const venue of ['zest','dlmm','cp','market']) ok(sim.transferSTX(100000n,cp(venue),admin));
 return {sim,admin,cp,call,read};
}
