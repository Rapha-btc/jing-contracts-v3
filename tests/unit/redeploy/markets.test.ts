import {boot,simnet,owner,accounts} from './lab';
import {describe,it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
const U=Cl.uint, alice=accounts.get('wallet_1')!;
for(const market of ['market','market-sbtc-usdcx','market-stx-usdcx']) describe(market,()=>{
 for(const [variable,lower,upper] of [['settle-max-staleness',20,40],['max-staleness',40,80]] as const){
  it(`${variable}: default, authorization, inclusive bounds and rejected-state preservation`,async()=>{
   await boot();
   expect(simnet.getDataVar(market,variable)).toEqual(U(upper));
   for(const seconds of [lower-1,lower,upper,upper+1]){
    const before=simnet.getDataVar(market,variable);
    expect(simnet.callPublicFn(market,`set-${variable}`,[U(seconds)],alice).result).toEqual(Cl.error(U(1008)));
    expect(simnet.getDataVar(market,variable)).toEqual(before);
    const valid=seconds>=lower&&seconds<=upper;
    expect(simnet.callPublicFn(market,`set-${variable}`,[U(seconds)],owner).result).toEqual(valid?Cl.ok(Cl.bool(true)):Cl.error(U(1034)));
    expect(simnet.getDataVar(market,variable)).toEqual(valid?U(seconds):before);
   }
  });
 }
 for(const side of ['x','y'])for(const contract of [false,true])for(const which of ['first','middle','last','missing','single']){
  it(`drop-${side}: ${which}, ${contract?'contract':'standard'} principals`,async()=>{
   await boot();
   const addresses=[...simnet.getAccounts().values()].slice(0,4);
   const principals=addresses.map(a=>contract?Cl.contractPrincipal(a,'maker'):Cl.principal(a));
   const input=which==='single'?principals.slice(0,1):principals.slice(0,3);
   const index=which==='middle'?1:which==='last'?2:which==='missing'?3:0;
   const result=simnet.callPrivateFn(market,`drop-${side}`,[Cl.list(input),principals[index]],owner).result;
   expect(result).toEqual(Cl.list(input.filter((_,i)=>i!==index)));
  });
 }
});
