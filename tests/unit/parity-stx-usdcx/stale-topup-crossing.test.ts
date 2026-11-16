import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';
const {U,P,alice,bob,N,ro,ok,value,init,amount,deposit,settleDeposit,setLimit,settleLimit,mid,live,pending,balance}=h;
const finalMid=P*1.25;
const offer=P*1.2;
const account=(who:string)=>Cl.principal(who);

function restBook(s:h.Side){
 if(s==='y'){
  ok(deposit('y',amount('y'),P*0.9,alice));
  ok(deposit('x',amount('x'),offer,bob));mid(P);ok(settleDeposit('x',bob));
 }else{
  ok(deposit('y',amount('y'),P*1.3,bob));
  ok(deposit('x',amount('x'),P*1.4,alice));mid(P);ok(settleDeposit('x',alice));
  expect(live('y',bob)).toBe(BigInt(amount('y')));
  expect(ro('get-token-y-depositors',[U(0)])).toEqual(Cl.list([account(bob)]));
  expect(value(ro('get-token-y-order',[account(bob)])).limit).toBe(BigInt(P*1.3));
 }
 expect(live(s,alice)).toBe(BigInt(amount(s)));
}

function submitTopup(s:h.Side,limit:number){
 const before=balance(s,alice);
 ok(deposit(s,amount(s),limit,alice),U(amount(s)));
 const escrow=value(pending(s,'deposit',alice));
 expect(escrow.amount).toBe(BigInt(amount(s)));
 expect(escrow.limit).toBe(BigInt(limit));
 expect(balance(s,alice)).toBe(before-BigInt(amount(s)));
 return escrow['submitted-at'] as bigint;
}

function setNewerLimit(s:h.Side,limit:number,submittedAt:bigint){
 simnet.mineEmptyBurnBlocks(1);mid(P);
 expect(setLimit(s,limit,alice).result).toEqual(Cl.ok(Cl.bool(false)));
 simnet.mineEmptyBurnBlocks(1);mid(P);
 ok(settleLimit(s,alice),Cl.bool(true));
 const order=value(ro(`get-token-${s}-order`,[account(alice)]));
 expect(order.limit).toBe(BigInt(limit));
 expect(order['set-at']).toBeGreaterThan(submittedAt);
}

function settleAfterMove(s:h.Side,reason:string|null,limit:number){
 simnet.mineEmptyBurnBlocks(1);mid(finalMid);
 expect(ro('get-mid',[],'oracle')).toEqual(U(finalMid));
 expect(ro(`would-take-as-${s}`,[U(finalMid),U(limit)])).toEqual(Cl.bool(reason!==null));
 const receipt=settleDeposit(s,alice);ok(receipt,U(amount(s)));
 const events=receipt.events.filter(e=>e.event==='print_event').map(e=>value(e.data.value));
 if(reason){
  expect(events).toContainEqual(expect.objectContaining({event:`pending-refund-${s}`,reason}));
  expect(live(s,alice)).toBe(BigInt(amount(s)));
 }else{
  expect(events.some(e=>e?.event===`pending-refund-${s}`)).toBe(false);
  expect(live(s,alice)).toBe(BigInt(amount(s)*2));
 }
 expect(pending(s,'deposit',alice)).toEqual(N);
 return receipt;
}

for(const s of ['x','y'] as const)describe(`${s} deposit top-up uses the latest stored limit at settlement`,()=>{
 it('refunds as crossing when a newer stored limit crosses but the pending quote does not',()=>{
  init();
  restBook(s);
  const L1=s==='y'?P*1.1:P*1.3,L2=s==='y'?P*1.3:P*1.1;
  const submittedAt=submitTopup(s,L1);
  setNewerLimit(s,L2,submittedAt);
  const before=balance(s,alice);
  settleAfterMove(s,'crossing',L2);
  expect(balance(s,alice)).toBe(before+BigInt(amount(s)));
  expect(ro(`get-token-${s}-limit`,[account(alice)])).toEqual(U(L2));
 });

 it('rests when the pending quote crosses but a newer far limit does not',()=>{
  init();
  restBook(s);
  const L1=s==='y'?P*1.3:P*1.1,L2=s==='y'?P*1.1:P*1.5;
  const submittedAt=submitTopup(s,L1);
  setNewerLimit(s,L2,submittedAt);
  settleAfterMove(s,null,L2);
  expect(ro(`get-token-${s}-limit`,[account(alice)])).toEqual(U(L2));
 });

 it('keeps the pending quote behavior when no newer limit was stored',()=>{
  init();
  restBook(s);
  const L1=s==='y'?P*1.3:P*1.1;
  const submittedAt=submitTopup(s,L1);
  const stored=value(ro(`get-token-${s}-order`,[account(alice)]));
  expect(stored['set-at']).toBeLessThan(submittedAt);
  settleAfterMove(s,'crossing',L1);
  expect(ro(`get-token-${s}-limit`,[account(alice)])).toEqual(U(stored.limit));
 });
});
