import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,P,owner,alice,bob,taker,token,stx,name,update,call,read,ok,balance,specs,setup} from './helpers';

for(const spec of specs)describe(`${spec.label} v1 controls and held funds`,()=>{
 it('registers and fills a nonzero-spread rung with real name checks and miner guards',()=>{
  const r=setup(spec,{spread:25});r.deposit(alice);r.deposit(bob);
  expect(read(r.rung,'get-spread-bps')).toBe(25n);
  const before=balance(!spec.x,r.principal);
  ok(call('market','swap',[U(spec.x?1000000:10000),U(spec.x?P*2n:P/2n),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
  expect(balance(!spec.x,r.principal)).toBeGreaterThan(before);
  ok(call(r.rung,'sync',[],bob));
  r.paused();
  for(const who of [alice,bob]){r.withdraw(who);expect(r.position(who).shares).toBe(0n);}
  expect(r.equity()).toBe(0n);expect(balance(spec.x,`${owner}.market`)).toBe(0n);
 });
 for(const fn of ['sync','deposit','push','refresh-guard'])it(`${fn} rejects before initialization`,()=>{
  const r=setup(spec,{initialize:false});
  const before=balance(spec.x,alice);
  expect(call(r.rung,fn,fn==='deposit'?[U(spec.amount)]:[],alice).result).toEqual(Cl.error(U(7003)));
  expect(balance(spec.x,alice)).toBe(before);expect(r.state()['total-shares']).toBe(0n);
 });
 it('enforces initialization spread, name, ownership and one-time guards',()=>{
  const r=setup(spec,{initialize:false});
  for(const [bps,who,code] of [[0,alice,7001],[10000,owner,7010],[1,owner,7009]] as const){
   expect(call(r.rung,'initialize',[U(bps),Cl.bool(true)],who).result).toEqual(Cl.error(U(code)));
   expect(read('jing-ladder-v1','is-registered',[Cl.principal(r.principal)])).toBe(false);
  }
  ok(call(r.rung,'initialize',[U(0),Cl.bool(false)]));
  expect(call(r.rung,'initialize',[U(0),Cl.bool(true)]).result).toEqual(Cl.error(U(7002)));
  expect(read('jing-ladder-v1','is-current-rung',[Cl.principal(r.principal)])).toBe(false);
  ok(call('jing-ladder-v1','seat-band',[Cl.principal(r.principal)]));
  ok(call('market','sync-seat',[Cl.principal(r.principal)]));
  expect(read('jing-ladder-v1','is-current-rung',[Cl.principal(r.principal)])).toBe(true);
 });
 it('rejects missing positions, zero withdrawals and below-minimum deposits without moving funds',()=>{
  const r=setup(spec),before=balance(spec.x,alice),min=spec.x?100:100000;
  expect(call(r.rung,'claim',[],alice).result).toEqual(Cl.error(U(7006)));
  expect(call(r.rung,'withdraw',[U(1),Cl.none()],alice).result).toEqual(Cl.error(U(7006)));
  for(const n of [0,min-1])expect(call(r.rung,'deposit',[U(n)],alice).result).toEqual(Cl.error(U(7005)));
  expect(balance(spec.x,alice)).toBe(before);
  r.deposit(alice);const state=r.state();
  expect(call(r.rung,'withdraw',[U(0),Cl.none()],alice).result).toEqual(Cl.error(U(7004)));
  expect(r.state()).toEqual(state);r.withdraw(alice);
  expect(balance(spec.x,alice)).toBe(before);
 });
 it('holds a below-market-minimum pool, then a permissionless push admits it after a minimum reduction',()=>{
  const r=setup(spec),amount=BigInt(spec.x?100:100000);
  ok(call('market',`set-min-token-${spec.side}-deposit`,[U(spec.amount)]));
  ok(call(r.rung,'deposit',[U(amount)],alice));
  expect(r.held()).toBe(amount);expect(r.state().resting).toBe(0n);
  expect(ok(call(r.rung,'push',[],bob))).toBe(false);
  ok(call('market',`set-min-token-${spec.side}-deposit`,[U(amount)]));
  expect(ok(call(r.rung,'push',[],bob))).toBe(true);
  expect(r.held()).toBe(0n);expect(r.state().resting).toBe(amount);
  expect(ok(call(r.rung,'push',[],bob))).toBe(false);
  r.withdraw(alice,amount);expect(r.equity()).toBe(0n);
 });
 it('only the ladder owner pauses pushes; held funds remain withdrawable and pushes resume',()=>{
  const r=setup(spec),before=balance(spec.x,alice);
  expect(call(r.rung,'set-push-paused',[Cl.bool(true)],alice).result).toEqual(Cl.error(U(7001)));
  ok(call(r.rung,'set-push-paused',[Cl.bool(true)]));
  r.deposit(alice);expect(r.held()).toBe(spec.amount);
  expect(ok(call(r.rung,'push',[],bob))).toBe(false);
  r.withdraw(alice,spec.amount/2n);
  expect(balance(spec.x,alice)).toBe(before-spec.amount/2n);
  ok(call(r.rung,'set-push-paused',[Cl.bool(false)]));
  expect(ok(call(r.rung,'push',[],bob))).toBe(true);
  r.withdraw(alice);expect(balance(spec.x,alice)).toBe(before);
 });
 it('missing miner data holds deposits; a restored native price permits push and guard refresh',()=>{
  const r=setup(spec);
  ok(call('miner-oracle','set-available',[Cl.bool(false)]));
  expect(read(r.rung,'miner-mid')).toBe(0n);
  expect(call(r.rung,'refresh-guard',[],bob).result).toEqual(Cl.error(U(7008)));
  r.deposit(alice);expect(r.held()).toBe(spec.amount);
  ok(call('miner-oracle','set-available',[Cl.bool(true)]));
  expect(ok(call(r.rung,'push',[],bob))).toBe(true);
  ok(call('miner-oracle','set-mid',[U(P*2n)]));
  ok(call(r.rung,'refresh-guard',[],bob));
  expect(read(r.rung,spec.x?'get-floor':'get-cap')).toBe(spec.x?P:P*4n);
  expect(read(r.rung,'get-spread-bps')).toBe(0n);
  expect(read(r.rung,'min-market')).toBe(spec.x?100n:10000n);
  r.withdraw(alice);expect(r.equity()).toBe(0n);
 });
 it('accounts a member top-up once and rejects an unfunded deposit atomically',()=>{
  const r=setup(spec);r.deposit(alice);r.deposit(alice);
  expect(r.state().members).toBe(1n);
  expect(r.position(alice)[spec.x?'sbtc':'stx']).toBe(spec.amount*2n);
  const state=r.state(),before=balance(spec.x,alice);
  const receipt=call(r.rung,'deposit',[U(before+1n)],alice);
  expect(receipt.result.type).toBe('err');expect(receipt.events).toEqual([]);
  expect(r.state()).toEqual(state);expect(balance(spec.x,alice)).toBe(before);
  r.withdraw(alice,spec.amount*2n);
  expect(r.state().members).toBe(0n);
 });
 it('attributes donated input and proceeds to the next member rather than stranding them',()=>{
  const r=setup(spec),input=spec.x?100n:100000n,output=spec.x?1000n:100n;
  const send=(x:boolean,n:bigint)=>x?call('token','transfer',[U(n),Cl.principal(taker),Cl.principal(r.principal),Cl.none()],taker):simnet.transferSTX(n,r.principal,taker);
  ok(send(spec.x,input));ok(send(!spec.x,output));
  ok(call(r.rung,'sync',[],bob));
  r.deposit(alice);
  expect(r.position(alice)[spec.x?'sbtc':'stx']).toBe(spec.amount+input);
  const before=balance(!spec.x,alice);
  ok(call(r.rung,'claim',[],alice));
  expect(balance(!spec.x,alice)-before).toBeGreaterThanOrEqual(output-1n);
  expect(balance(!spec.x,r.principal)).toBeLessThanOrEqual(1n);
  r.withdraw(alice,spec.amount+input);
  expect(r.held()).toBe(0n);expect(r.equity()).toBe(0n);
 });
 it('requires an update only when the exit actually needs young escrow, then settles and pays',()=>{
  const r=setup(spec),before=balance(spec.x,alice);r.addOppositeMaker();
  ok(call(r.rung,'deposit',[U(spec.amount)],alice));
  const pending=r.pending(),position=r.position(alice);
  expect(call(r.rung,'withdraw',[U(spec.amount),Cl.none()],alice).result).toEqual(Cl.error(U(7012)));
  expect(r.pending()).toEqual(pending);expect(r.position(alice)).toEqual(position);
  expect(balance(spec.x,alice)).toBe(before-spec.amount);
  ok(call(r.rung,'withdraw',[U(spec.amount),Cl.some(update)],alice));
  expect(balance(spec.x,alice)).toBe(before);expect(r.pending()).toBe(null);
  expect(r.position(alice).shares).toBe(0n);expect(r.held()).toBe(0n);
 });
 it('private helper boundaries: absent escrow/reserve are no-ops and an unfunded pull is refused',()=>{
  const r=setup(spec),before=r.state();
  // Direct unit calls to unchanged production helpers. Public withdraw guards
  // prevent these contexts; they are not public-path reachability witnesses.
  expect(simnet.callPrivateFn(r.rung,'settle-escrow',[Cl.none()],owner).result).toEqual(Cl.ok(Cl.bool(true)));
  expect(simnet.callPrivateFn(r.rung,'count-reserve-claim',[U(99),U(0)],owner).result).toEqual(Cl.bool(true));
  expect(simnet.callPrivateFn(r.rung,spec.x?'pull-to-held-sats':'pull-to-held-ustx',[U(1)],owner).result).toEqual(Cl.error(U(7007)));
  expect(r.state()).toEqual(before);expect(r.held()).toBe(0n);expect(r.equity()).toBe(0n);
 });
});
