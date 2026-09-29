import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import fs from 'node:fs';
import * as h from './helpers';
const {U,owner,alice,bob,keeper,P,token,wrong,name,value,ok}=h;

for(const side of ['x','y'] as const)describe(`${side} refund accounting boundaries`,()=>{
 for(const remaining of [0,100])it(`cancels with only ${remaining} recorded equity without underflow or debiting another owner`,()=>{
  h.init();ok(h.deposit(side));if(value(h.pending(side))!==null)ok(h.settleDeposit(side));
  ok(h.deposit(side,h.amount(side),h.off(side),bob));if(value(h.pending(side,'deposit',bob))!==null)ok(h.settleDeposit(side,bob));
  // Isolate the real clamping helper: reduce this owner's recorded equity while
  // leaving its funded market claim intact. This is an explicit accounting
  // fault setup, not a normal lifecycle or a replacement core implementation.
  expect(simnet.callPrivateFn('jing-core-v6','debit',[token,Cl.principal(alice),U(h.amount(side)-remaining)],owner).result).toEqual(Cl.bool(true));
  const other=value(h.ro('get-token-equity',[token,Cl.principal(bob)],'jing-core-v6'));
  const before=h.balance(side,alice);
  ok(h.cancel(side),U(h.amount(side)));
  expect(h.balance(side,alice)-before).toBe(BigInt(h.amount(side)));
  expect(h.live(side)).toBe(0n);
  expect(value(h.ro('get-token-equity',[token,Cl.principal(alice)],'jing-core-v6'))).toBe(0n);
  expect(value(h.ro('get-token-equity',[token,Cl.principal(bob)],'jing-core-v6'))).toBe(other);
  expect(value(h.ro('get-total-token-equity',[token],'jing-core-v6'))).toBe(other);
  ok(h.cancel(side,bob));expect(h.balance(side,h.market)).toBe(0n);
 });
 for(const funded of [true,false])it(`pending crossing refund ${funded?'ignores a returned logger error':'preserves the claim when transfer fails'}`,()=>{
  const contract='refund-fault-market',principal=`${owner}.${contract}`,opposite=h.other(side),amount=h.amount(side),maker=h.amount(opposite);
  // Keep every production function intact. An explicit constructor snapshot
  // makes the real core reject this separate unregistered caller. This proves
  // returned-error handling ONLY; it cannot establish arithmetic-abort safety.
  const source=fs.readFileSync('tests/unit/v6-3/.build/market.clar','utf8');
  const snapshot=`
(var-set token-x .token)
(var-set token-y .wrong-token)
(var-set initialized true)
(var-set paused false)
(var-set feed-id-x u1)
(var-set feed-id-y u45)
(map-set token-${side}-pending-deposits '${alice} {amount:u${amount},limit:u${P},spread-bps:none,submitted-at:u1})
(map-set token-${opposite}-deposits {cycle:u0,depositor:'${bob}} u${maker})
(map-set token-${opposite}-depositor-list u0 (list '${bob}))
(map-set token-${opposite}-deposit-limits '${bob} {limit:u${P},spread-bps:none,set-at:u1})
(map-set cycle-totals u0 {total-token-x:u${opposite==='x'?maker:0},total-token-y:u${opposite==='y'?maker:0}})
`;
  expect(simnet.deployContract(contract,source+'\n'+snapshot,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
  for(const s of ['x','y'] as const){
   const n=s===opposite?maker:funded?amount:0;
   if(n){if(s==='x')ok(h.call('mint',[U(n),Cl.principal(principal)],owner,'token'));
   else expect(simnet.transferSTX(n,principal,owner).result).toEqual(Cl.ok(Cl.bool(true)));}
  }
  const pending=()=>h.ro(`get-token-${side}-pending-deposit`,[Cl.principal(alice)],contract);
  const claim=pending(),before=h.balance(side,alice);
  const receipt=h.call(`settle-token-${side}-deposit`,[Cl.principal(alice),h.UPDATE,side==='x'?token:wrong,name],keeper,contract);
  const trace=simnet.getLastContractCallTrace()??'';
  if(funded){
   expect(receipt.result).toEqual(Cl.ok(U(amount)));
   expect(trace).toContain(`log-pending-refund-${side}`);expect(trace).toContain('(err u5001)');
   expect(pending()).toEqual(Cl.none());expect(h.balance(side,alice)-before).toBe(BigInt(amount));
   expect(h.balance(side,principal)).toBe(0n);
  }else{
   expect(receipt.result).toEqual(Cl.error(U(1)));expect(receipt.events).toEqual([]);
   expect(pending()).toEqual(claim);expect(h.balance(side,alice)).toBe(before);
  }
  expect(h.balance(opposite,principal)).toBe(BigInt(maker));
  expect(value(h.ro(`get-token-${opposite}-deposit`,[U(0),Cl.principal(bob)],contract))).toBe(BigInt(maker));
 });
});
