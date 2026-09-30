import {expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,P,alice,bob,taker,token,stx,name,update,call,ok,balance,specs,setup} from './helpers';

// Regression: fractional old shares used to overstate these claims by 9 uSTX.
// Preserve the original custody and solvency assertions below.
it('keeps both inactive members solvent after a rescale and a proceeds receipt',()=>{
 const r=setup(specs[0]);
 for(const who of [alice,bob]){
  ok(call('token','mint',[U(1000001),Cl.principal(who)]));
  r.deposit(who,1000001n);
 }
 const net=(2000002n-1001n)*100n;
 ok(call('market','swap',[U((net*10020n+9999n)/10000n),U(P),update,token,name,stx,name,Cl.bool(false)],taker));
 ok(call(r.rung,'sync',[],taker));
 expect(r.state().scale).toBe(1n);
 expect(r.state()['total-shares']).toBe(2000n);
 ok(simnet.transferSTX(10000000n,r.principal,taker));
 ok(call(r.rung,'sync',[],taker));
 const funds=balance(false,r.principal),claims=r.position(alice).stx+r.position(bob).stx;
 expect(funds).toBe(210100001n);
 expect(claims,'aggregate claims must not exceed the exact proceeds balance').toBeLessThanOrEqual(funds);
 let paid=0n,returned=0n;
 for(const who of [alice,bob])paid+=ok(call(r.rung,'claim',[],who)).stx;
 expect(paid).toBeLessThanOrEqual(funds);
 for(const who of [alice,bob]){
  const result=r.withdraw(who,1000001n);paid+=result.stx;returned+=result.sbtc;
  expect(paid).toBeLessThanOrEqual(funds);
  expect(returned).toBeLessThanOrEqual(1001n);
 }
 expect(paid).toBe(funds);expect(returned).toBe(1001n);
 expect(balance(true,r.principal)).toBe(0n);expect(balance(false,r.principal)).toBe(0n);
 expect(r.state().resting).toBe(0n);
});

it('keeps the sell mirror solvent and pays both remainders to its final member',()=>{
 const r=setup(specs[1]),amount=100000001n;
 for(const who of [alice,bob])r.deposit(who,amount);
 ok(call('token','mint',[U(2000000000n),Cl.principal(taker)]));
 const net=(2n*amount-20001n)/100n;
 ok(call('market','swap',[U((net*10020n+9999n)/10000n),U(P),update,token,name,stx,name,Cl.bool(true)],taker));
 ok(call(r.rung,'sync',[],taker));
 expect(r.state().scale).toBe(1n);expect(r.state()['total-shares']).toBe(200000n);
 const unfilled=r.state().resting+balance(false,r.principal);
 ok(call('token','transfer',[U(1000000000n),Cl.principal(taker),Cl.principal(r.principal),Cl.none()],taker));
 ok(call(r.rung,'sync',[],taker));
 const funds=balance(true,r.principal);
 expect(r.position(alice).sbtc+r.position(bob).sbtc).toBeLessThanOrEqual(funds);
 let paid=0n,returned=0n;
 for(const who of [bob,alice])paid+=ok(call(r.rung,'claim',[],who)).sbtc;
 for(const who of [bob,alice]){
  const result=r.withdraw(who,amount);paid+=result.sbtc;returned+=result.stx;
  expect(paid).toBeLessThanOrEqual(funds);expect(returned).toBeLessThanOrEqual(unfilled);
 }
 expect(paid).toBe(funds);expect(returned).toBe(unfilled);
 expect(balance(true,r.principal)).toBe(0n);expect(balance(false,r.principal)).toBe(0n);
 expect(r.state().resting).toBe(0n);
});
