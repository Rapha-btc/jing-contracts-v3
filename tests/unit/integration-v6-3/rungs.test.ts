import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,P,owner,alice,bob,taker,token,stx,name,update,call,read,ok,balance,specs,setup} from './helpers';

for(const spec of specs)describe(`real ${spec.label} core-spread v1 rung`,()=>{
 it('registers with the real ladder and returns a funded position while market and core are paused',()=>{
  const r=setup(spec),before=balance(spec.x,alice);
  r.deposit(alice);
  expect(r.state().resting).toBe(spec.amount);
  expect(r.equity()).toBe(spec.amount);
  expect(balance(spec.x,`${owner}.market`)).toBe(spec.amount);
  r.paused();const paid=r.withdraw(alice);
  expect(paid[spec.x?'sbtc':'stx']).toBe(spec.amount);
  expect(balance(spec.x,alice)).toBe(before);
  expect(r.state()['total-shares']).toBe(0n);
  expect(r.position(alice).shares).toBe(0n);
  expect(r.equity()).toBe(0n);
  expect(balance(spec.x,`${owner}.market`)).toBe(0n);
  expect(r.held()).toBe(0n);
 });
 it('preserves the other member through partial withdrawal and fully drains while paused',()=>{
  const r=setup(spec),beforeA=balance(spec.x,alice),beforeB=balance(spec.x,bob);
  r.deposit(alice);r.deposit(bob);r.paused();
  r.withdraw(alice,spec.amount/2n);
  expect(r.position(bob)[spec.x?'sbtc':'stx']).toBe(spec.amount);
  expect(r.equity()).toBe(spec.amount*3n/2n);
  r.withdraw(alice);r.withdraw(bob);
  expect(balance(spec.x,alice)).toBe(beforeA);expect(balance(spec.x,bob)).toBe(beforeB);
  expect(r.equity()).toBe(0n);expect(r.held()).toBe(0n);
  expect(balance(spec.x,`${owner}.market`)).toBe(0n);
 });
 it('holds a deposit locally when the real core refuses admission and lets the member exit',()=>{
  const r=setup(spec),before=balance(spec.x,alice);
  ok(call('jing-core-v6','pause'));
  ok(call(r.rung,'deposit',[U(spec.amount)],alice));
  expect(r.state().resting).toBe(0n);expect(r.held()).toBe(spec.amount);
  expect(r.equity()).toBe(0n);
  r.withdraw(alice);
  expect(balance(spec.x,alice)).toBe(before);expect(r.held()).toBe(0n);
 });
 it('rejects an unauthorized initialization without taking a ladder seat',()=>{
  const r=setup(spec);
  // The owner check runs before the already-initialized check for a band rung.
  expect(call(r.rung,'initialize',[U(0),Cl.bool(true)],alice).result).toEqual(Cl.error(U(7001)));
  expect(read('jing-ladder-v1','get-band-count',[Cl.stringAscii(spec.ladderSide)])).toBe(1n);
 });
 it('accounts a partial maker fill and pays both members their actual proceeds',()=>{
  const r=setup(spec);
  r.deposit(alice);r.deposit(bob);
  const outputBefore=[balance(!spec.x,alice),balance(!spec.x,bob)];
  const receipt=ok(call('market','swap',[U(spec.x?1000000:10000),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
  expect(receipt[spec.x?'token-x-received':'token-y-received']).toBeGreaterThan(0n);
  const received=balance(!spec.x,r.principal);
  expect(received).toBeGreaterThan(0n);
  ok(call(r.rung,'sync',[],taker));
  const inputKey=spec.x?'sbtc':'stx',outputKey=spec.x?'stx':'sbtc';
  const claims=[r.position(alice),r.position(bob)];
  expect(claims[0][inputKey]).toBeGreaterThan(0n);
  expect(claims[0][inputKey]).toBeLessThan(spec.amount);
  expect(claims[0][outputKey]).toBe(claims[1][outputKey]);
  for(const who of [alice,bob])ok(call(r.rung,'claim',[],who));
  const paid=(balance(!spec.x,alice)-outputBefore[0])+(balance(!spec.x,bob)-outputBefore[1]);
  expect(paid).toBe(claims[0][outputKey]+claims[1][outputKey]);
  expect(received-paid).toBeLessThanOrEqual(2n);
  expect(balance(!spec.x,r.principal)).toBe(received-paid);
  r.paused();
  for(const who of [alice,bob]){
   const before=balance(spec.x,who),claim=r.position(who)[inputKey];
   r.withdraw(who,spec.amount);
   expect(balance(spec.x,who)-before).toBe(claim);
   expect(r.position(who).shares).toBe(0n);
  }
  expect(r.equity()).toBe(0n);expect(balance(spec.x,`${owner}.market`)).toBe(0n);
  expect(r.held()).toBe(0n);expect(balance(!spec.x,r.principal)).toBe(0n);
 });
 it('retiring a seat preserves the member claim and paused exit',()=>{
  const r=setup(spec),before=balance(spec.x,alice);r.deposit(alice);
  ok(call('jing-ladder-v1','retire-band',[Cl.stringAscii(spec.ladderSide),U(0)]));
  expect(call('market','sync-seat',[Cl.principal(r.principal)],taker).result).toEqual(Cl.error(U(1028)));
  ok(call('market','prune-seats',[],taker));
  expect(read('jing-ladder-v1','is-current-rung',[Cl.principal(r.principal)])).toBe(false);
  expect(read('jing-ladder-v1','is-registered',[Cl.principal(r.principal)])).toBe(true);
  expect(r.position(alice)[spec.x?'sbtc':'stx']).toBe(spec.amount);
  r.paused();r.withdraw(alice);
  expect(balance(spec.x,alice)).toBe(before);expect(r.equity()).toBe(0n);
 });
 it('returns expired pending escrow without an oracle while market and core are paused',()=>{
  const r=setup(spec),before=balance(spec.x,alice);
  r.addOppositeMaker();
  ok(call(r.rung,'deposit',[U(spec.amount)],alice));
  expect(r.pending()?.amount).toBe(spec.amount);
  expect(r.equity()).toBe(0n);
  simnet.mineEmptyBurnBlocks(145);r.paused();
  r.withdraw(alice);
  expect(balance(spec.x,alice)).toBe(before);
  expect(r.pending()).toBe(null);expect(r.held()).toBe(0n);
  expect(balance(spec.x,`${owner}.market`)).toBe(0n);
 });
 it('does not require an oracle for a funded live exit when another member has a young pending top-up',()=>{
  const r=setup(spec);r.deposit(alice);
  r.addOppositeMaker();
  ok(call(r.rung,'deposit',[U(spec.amount)],bob));
  expect(r.pending()?.amount).toBe(spec.amount);
  r.paused();
  const before=balance(spec.x,alice);
  const snapshot=()=>({state:r.state(),alice:r.position(alice),bob:r.position(bob),pending:r.pending(),equity:r.equity(),wallet:balance(spec.x,alice),market:balance(spec.x,`${owner}.market`),held:r.held()});
  const prior=snapshot();
  const receipt=call(r.rung,'withdraw',[U(spec.amount/2n),Cl.none()],alice);
  if(receipt.result.type==='err'){
   expect(receipt.result).toEqual(Cl.error(U(7012)));
   expect(snapshot()).toEqual(prior);
   // Establish the practical impact: the current sell port delays the exit,
   // but both members can recover after the 24-hour pending timeout.
   simnet.mineEmptyBurnBlocks(145);
   for(const who of [alice,bob]){
    const wallet=balance(spec.x,who);r.withdraw(who);
    expect(balance(spec.x,who)-wallet).toBe(spec.amount);
   }
   expect(r.held()).toBe(0n);expect(r.equity()).toBe(0n);
   expect(balance(spec.x,`${owner}.market`)).toBe(0n);
  }
  // Keep the desired behavior a normal failing regression until the sell
  // rung is ported. Do not turn this into a passing expected-error test.
  expect(receipt.result).toEqual(Cl.ok(Cl.tuple({
   sbtc:U(spec.x?spec.amount/2n:0),stx:U(spec.x?0:spec.amount/2n),
  })));
  expect(balance(spec.x,alice)-before).toBe(spec.amount/2n);
  expect(r.pending()?.amount).toBe(spec.amount);
  expect(r.position(bob)[spec.x?'sbtc':'stx']).toBe(spec.amount);
 });
});
