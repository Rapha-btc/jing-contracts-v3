import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Cl,cvToString} from '@stacks/transactions';
import {createRuntime} from './runtime.mjs';
import {assertProductionPrefix} from './source-integrity.mjs';

// Replay the real public-call dust regressions through RV's own monitor.
for(const side of ['x','y'])test(`${side} taker refund and paused exit use actual core equity`,async()=>{
 assertProductionPrefix(false);
 const rt=await createRuntime(`refund-regression-${side}`),{sim,traits,asset}=rt;
 const maker=sim.getAccounts().get('wallet_1'),taker=sim.getAccounts().get('wallet_2');
 const opposite=side==='x'?'y':'x',quote=side==='x'?500000000000n:1500000000000n;
 const call=(contract,fn,args,sender=sim.deployer)=>{
  const receipt=sim.callPublicFn(contract,fn,args,sender);
  assert.equal(receipt.result.type,'ok',`${fn}: ${cvToString(receipt.result)}`);return receipt;
 };
 call('mock-lazer-oracle','set-mid',[Cl.uint(1000000000000n)]);
 call('market',`deposit-token-${opposite}`,[Cl.uint(side==='x'?498000:10000),Cl.uint(quote),Cl.none(),traits[opposite],asset],maker);
 const receipt=call('market','swap',[Cl.uint(side==='x'?10000:1000000),Cl.uint(quote),Cl.bufferFromHex(''),traits.x,asset,traits.y,asset,Cl.bool(side==='x')],taker);
 const events=receipt.events.filter(e=>e.event==='print_event'&&e.data.contract_identifier===`${sim.deployer}.jing-core-v6`)
  .map(e=>e.data.value.value).filter(v=>v.event.value===`refund-${side}`&&v.depositor.value===taker);
 assert.equal(events.length,1);assert.equal(BigInt(events[0].amount.value),side==='x'?20n:50n);
 const equity=()=>cvToString(sim.callReadOnlyFn('jing-core-v6','get-token-equity',[traits[side],Cl.principal(taker)],sim.deployer).result);
 assert.equal(equity(),'u0');
 if(cvToString(sim.callReadOnlyFn('market',`rv-owned-${opposite}`,[Cl.principal(maker)],sim.deployer).result)!=='u0')
  call('market',`cancel-token-${opposite}-deposit`,[traits[opposite],asset],maker);
 call('market',`deposit-token-${side}`,[Cl.uint(side==='x'?10000:1000000),Cl.uint(side==='x'?2000000000000n:500000000000n),Cl.none(),traits[side],asset],taker);
 assert.equal(equity(),side==='x'?'u10000':'u1000000');
 rt.assertHealthy(); // Getter and direct-map checks agree on a positive position.
 call('jing-core-v6','pause',[]);
 call('market','set-paused',[Cl.bool(true)]);
 const refused=sim.callPublicFn('market',`deposit-token-${side}`,[Cl.uint(side==='x'?10000:1000000),Cl.uint(quote),Cl.none(),traits[side],asset],taker);
 assert.equal(cvToString(refused.result),'(err u1007)');
 assert.equal(equity(),side==='x'?'u10000':'u1000000');
 call('market',`cancel-token-${side}-deposit`,[traits[side],asset],taker);
 assert.equal(equity(),'u0');
 for(const s of ['x','y'])assert.equal(cvToString(sim.callReadOnlyFn('jing-core-v6','get-total-token-equity',[traits[s]],sim.deployer).result),'u0');
 assert.equal(rt.stats.invariantChecks,rt.stats.publicCalls+1);
 rt.assertHealthy();
});
