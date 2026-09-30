import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,P,alice,bob,taker,token,stx,name,update,value,call,ok,balance,specs,setup} from './helpers';

const Q=10n**18n;
for(const spec of specs)describe(`${spec.label}: exact epoch conservation`,()=>{
 const input=spec.x?'sbtc':'stx',output=spec.x?'stx':'sbtc';
 function ledger(r:ReturnType<typeof setup>,people=[alice,bob,taker]){
  const v=(n:string)=>value(simnet.getDataVar(r.rung,n));
  const s=r.state(),cp=v('current-proceeds'),carry=v('proceeds-carry');
  let reserves=0n,proceeds=0n,claims=0n;
  for(let e=0n;e<s.epoch;e++){
   let row;
   try{row=value(simnet.getMapEntry(r.rung,'epoch-reserve',U(e)));}
   catch(error){if(String(error)!=='value not found')throw error;}
   if(row){reserves+=row.reserve;proceeds+=row.proceeds;}
  }
  for(const who of people)claims+=r.position(who)[output];
  expect(v(spec.x?'reserved-sats':'reserved-ustx')).toBe(reserves);
  expect(v(spec.x?'stx-accounted':'sats-accounted')).toBe(cp+proceeds);
  expect(balance(!spec.x,r.principal)).toBe(cp+proceeds);
  expect(claims).toBeLessThanOrEqual(cp+proceeds);
  expect(carry).toBeLessThan(s['total-shares']||1n);
  // All integer rounding is backed by the exact epoch balances. It is
  // payable to their final member, not an additional liability on top.
  const rounding=cp+proceeds-claims;
  expect(balance(!spec.x,r.principal)).toBe(claims+rounding);
  return {cp,carry};
 }
 function drained(r:ReturnType<typeof setup>){
  ledger(r);
  expect(r.state().members).toBe(0n);expect(r.state().resting).toBe(0n);
  expect(balance(true,r.principal)).toBe(0n);expect(balance(false,r.principal)).toBe(0n);
 }
 function donate(r:ReturnType<typeof setup>,amount:bigint){
  ok(spec.x?simnet.transferSTX(amount,r.principal,taker):call('token','transfer',[U(amount),Cl.principal(taker),Cl.principal(r.principal),Cl.none()],taker));
  ok(call(r.rung,'sync',[],taker));
 }

 it('carries fractions across receipts; preserves backing across joins, partial exits and repeated claims',()=>{
  const r=setup(spec);
  r.deposit(alice,spec.amount+1n);r.deposit(bob,spec.amount+3n);
  let previous=ledger(r);
  for(const n of [1n,2n,7n,1n]){
   const shares=r.state()['total-shares'],index=r.state()['proceeds-index'];
   donate(r,n);const after=ledger(r);
   expect(after.carry).toBe((n*Q+previous.carry)%shares);
   expect(r.state()['proceeds-index']-index).toBe((n*Q+previous.carry)/shares);
   for(let i=0;i<3;i++){ok(call(r.rung,'sync',[],taker));expect(ledger(r)).toEqual(after);}
   previous=after;
  }
  expect(previous.carry).toBeGreaterThan(0n);
  r.deposit(taker,spec.amount);
  expect(ledger(r).carry).toBe(0n);expect(r.position(taker)[output]).toBe(0n);
  donate(r,1n);expect(ledger(r).carry).toBeGreaterThan(0n);
  r.withdraw(alice,1n);expect(ledger(r).carry).toBe(0n);
  for(let i=0;i<7;i++){donate(r,1n);ok(call(r.rung,'claim',[],bob));ledger(r);}
  for(const who of [alice,taker,bob]){r.withdraw(who,spec.amount*10n);ledger(r);}
  drained(r);
 });

 it('pays every unit from repeated real small fills after members claim at different times',()=>{
  const r=setup(spec);r.deposit(alice,spec.amount*10n+1n);r.deposit(bob,spec.amount*10n+3n);
  let received=0n,paid=0n;
  for(let i=0;i<15;i++){
   const before=balance(!spec.x,r.principal);
   ok(call('market','swap',[U(spec.x?10020n:102n),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
   received+=balance(!spec.x,r.principal)-before;
   ok(call(r.rung,'sync',[],taker));ledger(r);
   if(i%3===0){paid+=ok(call(r.rung,'claim',[],alice))[output];ledger(r);}
  }
  for(const who of [alice,bob]){paid+=r.withdraw(who,spec.amount*100n)[output];ledger(r);}
  expect(received).toBeGreaterThan(0n);expect(paid).toBe(received);drained(r);
 });

 it('isolates two tail-rolled epochs from a newer active epoch, including both final reserve remainders',()=>{
  const r=setup(spec),amount=spec.x?1000n:1000000n;
  for(let e=0;e<2;e++){
   const members=e===0?[alice,bob]:[taker];
   for(const who of members)r.deposit(who,amount+BigInt(e));
   const total=r.state().resting;
   ok(call('market','swap',[U(spec.x?total*100n:total/100n),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
   ok(call(r.rung,'sync',[],taker));expect(r.state().epoch).toBe(BigInt(e+1));ledger(r);
  }
  // Claiming Alice's epoch-0 position is part of her new deposit. Bob still
  // owns the complete epoch-0 remainder; taker still owns epoch 1.
  r.deposit(alice,amount*10n);ledger(r);
  donate(r,7n);const active=r.position(alice);
  for(const who of [taker,bob]){
   const owed=r.position(who),beforeInput=balance(spec.x,who),beforeOutput=balance(!spec.x,who);
   ok(call(r.rung,'claim',[],who));
   expect(balance(spec.x,who)-beforeInput).toBe(owed[input]);
   expect(balance(!spec.x,who)-beforeOutput).toBe(owed[output]);
   expect(r.position(alice)).toEqual(active);ledger(r);
  }
  r.withdraw(alice,amount*100n);drained(r);
 });
});
