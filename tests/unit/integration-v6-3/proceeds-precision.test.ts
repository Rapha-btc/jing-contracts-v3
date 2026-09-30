import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,P,alice,bob,taker,token,stx,name,update,value,call,read,ok,balance,specs,setup} from './helpers';

const rewardScale=1_000_000_000_000_000_000n;

describe('core-spread v1 proceeds precision',()=>{
 for(const firstExit of [alice,bob])it(`credits a real 1,001-sat fill after rescale and a large top-up (${firstExit===alice?'old':'new'} member exits first)`,()=>{
  const r=setup(specs[1],{spread:10});
  const initial=100_000_000_000n,targetRest=101_000n,topup=2_000_000_000_000n;
  ok(call('token','mint',[U(10_000_000_000n),Cl.principal(taker)]));
  r.deposit(alice,initial);
  const net=((initial-targetRest)*10n+998n)/999n;
  ok(call('market','swap',[U((net*10020n+9999n)/10000n),U(P/2n),update,token,name,stx,name,Cl.bool(true)],taker));
  ok(call(r.rung,'sync',[],taker));
  expect(r.state().scale).toBe(1n);
  r.deposit(bob,topup);
  const before=r.state(),beforeSbtc=balance(true,r.principal);
  ok(call('market','swap',[U(1002),U(P/2n),update,token,name,stx,name,Cl.bool(true)],taker));
  const gained=balance(true,r.principal)-beforeSbtc;
  expect(gained).toBe(1001n);
  // The old shared 1e12 precision discarded this entire real receipt.
  expect(gained*P/before['total-shares']).toBe(0n);
  ok(call(r.rung,'sync',[],taker));
  expect(r.state()['proceeds-index']).toBeGreaterThan(before['proceeds-index']);
  expect(r.position(bob).sbtc).toBe(1000n);
  // A later depositor receives none of the earlier fill's indexed credit.
  r.deposit(taker,1_000_000n);
  expect(r.position(taker).sbtc).toBe(0n);
  expect(r.position(bob).sbtc).toBe(1000n);
  const secondExit=firstExit===alice?bob:alice;
  let paid=0n;
  for(const who of [firstExit,secondExit])paid+=r.withdraw(who,who===alice?initial:topup).sbtc;
  paid+=r.withdraw(taker,1_000_000n).sbtc;
  expect(paid).toBe(beforeSbtc+gained);
  expect(balance(true,r.principal)).toBe(0n);
  expect(balance(false,r.principal)).toBe(0n);
  expect(paid+balance(true,r.principal)).toBe(beforeSbtc+gained);
  r.deposit(taker,1_000_000n);
  expect(ok(call(r.rung,'claim',[],taker)).sbtc).toBe(0n);
  r.withdraw(taker,1_000_000n);
  expect(balance(true,r.principal)).toBe(0n);expect(balance(false,r.principal)).toBe(0n);
 });

 for(const spec of specs)it(`${spec.label}: records one output unit at the share cap and atomically rejects a top-up beyond it`,()=>{
  const r=setup(spec);
  ok(call(r.rung,'set-push-paused',[Cl.bool(true)]));
  if(spec.x)ok(call('token','mint',[U(rewardScale),Cl.principal(alice)]));
  else simnet.mintSTX(alice,rewardScale);
  r.deposit(alice,rewardScale);
  expect(r.state()['total-shares']).toBe(rewardScale);
  ok(spec.x?simnet.transferSTX(1n,r.principal,bob):call('token','transfer',[U(1),Cl.principal(bob),Cl.principal(r.principal),Cl.none()],bob));
  ok(call(r.rung,'sync',[],taker));
  expect(r.state()['proceeds-index']).toBe(1n);
  const output=spec.x?'stx':'sbtc',input=spec.x?'sbtc':'stx';
  expect(r.position(alice)[output]).toBe(1n);
  const snapshot={state:r.state(),position:r.position(alice),input:balance(true,alice),output:balance(false,alice)};
  expect(call(r.rung,'deposit',[U(spec.amount)],alice).result).toBeErr(U(7016));
  expect(r.state()).toEqual(snapshot.state);
  expect(r.position(alice)).toEqual(snapshot.position);
  expect(balance(true,alice)).toBe(snapshot.input);
  expect(balance(false,alice)).toBe(snapshot.output);
  expect(ok(call(r.rung,'claim',[],alice))[output]).toBe(1n);
  expect(r.withdraw(alice,rewardScale)[input]).toBe(rewardScale);
  expect(balance(false,r.principal)).toBe(0n);
  expect(balance(true,r.principal)).toBe(0n);
 });

 for(const spec of specs)it(`${spec.label}: uses whole carried shares for high-precision entitlements through every supported rescale`,()=>{
  const r=setup(spec);
  for(let step=0n;step<=3n;step++){
   const factor=1000n**step;
   for(const shares of [rewardScale,rewardScale-123n,100_000_001n]){
    const delta=2_000_000_000_000_000n*factor+987n;
    const wholeShares=shares/factor;
    expect(read(r.rung,'carried',[U(shares),U(0),U(step)])).toBe(wholeShares);
    const expected=wholeShares*delta/rewardScale;
    expect(read(r.rung,'earned',[U(shares),U(0),U(step),U(0),U(delta)])).toBe(expected);
   }
  }
 });
});
