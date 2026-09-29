import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import fs from 'node:fs';
import * as h from './helpers';
const {U,N,owner,alice,name,ok,value}=h;
const contract='unregistered-market',principal=`${owner}.${contract}`;
const assets={x:h.token,y:h.wrong};
const cases={live:[10000,0,0],parked:[0,10000,0],pending:[0,0,10000],
 'live and pending':[10000,0,20000],'parked and pending':[0,10000,20000]} as const;

// An initialized production market cannot unregister itself. To exercise real
// logger rejection, append an explicit constructor snapshot to a separate copy:
// funded claims, configured identities, and deliberately absent registration.
// The entire production prefix and the actual core implementation stay intact.
// This is a fault-state regression, not a claim of public-path reachability.
function setup(s:h.Side,amounts:readonly number[],funded=true){
 const [live,parked,pending]=amounts;
 const original=fs.readFileSync('tests/unit/v6-3/.build/market.clar','utf8');
 const snapshot=`
(var-set token-x .token)
(var-set token-y .wrong-token)
(var-set initialized true)
(var-set paused true)
(map-set token-${s}-deposits {cycle:u0,depositor:'${alice}} u${live})
(map-set token-${s}-parked '${alice} u${parked})
(map-set token-${s}-pending-limits '${alice} {limit:u1000000000000,spread-bps:none,submitted-at:u1})
(map-set token-${s}-pending-readmits '${alice} u1)
${live?`(map-set token-${s}-depositor-list u0 (list '${alice}))`:''}
${pending?`(map-set token-${s}-pending-deposits '${alice} {amount:u${pending},limit:u1000000000000,spread-bps:none,submitted-at:u1})`:''}
(map-set cycle-totals u0 {total-token-x:u${s==='x'?live:0},total-token-y:u${s==='y'?live:0}})
`;
 expect(simnet.deployContract(contract,original+'\n'+snapshot,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
 expect(h.ro('is-registered',[Cl.principal(principal)],'jing-core-v6')).toEqual(Cl.bool(false));
 const total=live+parked+pending;
 if(funded){
  if(s==='x')ok(h.call('mint',[U(total),Cl.principal(principal)],owner,'token'));
  else expect(simnet.transferSTX(total,principal,owner).result).toEqual(Cl.ok(Cl.bool(true)));
 }
 // Both contracts are paused; refund loggers fail for actual registration,
 // not for pause. No core variables/maps or logger bodies are altered.
 ok(h.call('pause',[],owner,'jing-core-v6'));
 return total;
}
const claim=(s:h.Side,kind:string)=>h.ro(`get-token-${s}-${kind}`,[Cl.principal(alice)],contract);
for(const s of ['x','y'] as const)describe(`${s} cancellation tolerates real returned logger errors`,()=>{
 for(const [kind,amounts] of Object.entries(cases))it(`returns ${kind} funds even though core logging returns u5001`,()=>{
  const total=setup(s,amounts),before=h.balance(s,alice);
  const receipt=h.call(`cancel-token-${s}-deposit`,[assets[s],name],alice,contract);
  const trace=simnet.getLastContractCallTrace()??'';
  expect(receipt.result).toEqual(Cl.ok(U(total)));
  expect(trace).toContain('(err u5001)');
  if(amounts[0]||amounts[1])expect(trace).toContain(`log-refund-${s}`);
  if(amounts[2])expect(trace).toContain(`log-pending-refund-${s}`);
  expect(receipt.events.filter(e=>e.event==='print_event'&&e.data.contract_identifier===`${owner}.jing-core-v6`)).toEqual([]);
  expect(h.balance(s,alice)-before).toBe(BigInt(total));expect(h.balance(s,principal)).toBe(0n);
  expect(value(h.ro(`get-token-${s}-deposit`,[U(0),Cl.principal(alice)],contract))).toBe(0n);
  expect(value(claim(s,'parked'))).toBe(0n);
  for(const k of ['pending-deposit','pending-limit','pending-readmit'])expect(claim(s,k)).toEqual(N);
  expect(h.ro(`get-token-${s}-depositors`,[U(0)],contract)).toEqual(Cl.list([]));
  expect(value(h.ro('get-cycle-totals',[U(0)],contract))).toEqual({'total-token-x':0n,'total-token-y':0n});
  expect(h.call(`cancel-token-${s}-deposit`,[assets[s],name],alice,contract).result).toEqual(Cl.error(U(1005)));
 });
 it('still rejects a failed token transfer and preserves the unpaid claim',()=>{
  setup(s,cases.live,false);const before=h.balance(s,alice);
  const receipt=h.call(`cancel-token-${s}-deposit`,[assets[s],name],alice,contract);
  expect(receipt.result).toEqual(Cl.error(U(1)));expect(receipt.events).toEqual([]);
  expect(h.balance(s,alice)).toBe(before);
  expect(value(h.ro(`get-token-${s}-deposit`,[U(0),Cl.principal(alice)],contract))).toBe(10000n);
  expect(value(h.ro('get-cycle-totals',[U(0)],contract))[`total-token-${s}`]).toBe(10000n);
  expect(claim(s,'pending-limit')).not.toEqual(N);expect(claim(s,'pending-readmit')).not.toEqual(N);
 });
});
