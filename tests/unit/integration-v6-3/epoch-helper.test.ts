import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,owner,alice,bob,call,read,ok,balance,value,specs,setup} from './helpers';

for(const spec of specs)describe(`${spec.label} v1 epoch helper units`,()=>{
 it('close-epoch transfers all recognized proceeds once and snapshots the closing epoch',()=>{
  const r=setup(spec);
  ok(call(r.rung,'set-push-paused',[Cl.bool(true)]));
  r.deposit(alice,spec.amount+3n);
  const received=1001n;
  ok(spec.x?simnet.transferSTX(received,r.principal,bob):call('token','transfer',[U(received),Cl.principal(bob),Cl.principal(r.principal),Cl.none()],bob));
  ok(call(r.rung,'sync',[],bob));
  const data=(key:string)=>value(simnet.getDataVar(r.rung,key));
  const before=r.state(),wallet=balance(!spec.x,alice),input=balance(spec.x,r.principal);
  const accounted=spec.x?'stx-accounted':'sats-accounted';
  expect(data('current-proceeds')).toBe(received);
  expect(data('proceeds-carry')).toBeGreaterThan(0n);
  // Isolated helper unit: funds and recognition come from public calls, then
  // invoke the close component directly. This does not assert that public
  // withdraw reaches this positive-owed context, or simulate an entire exit.
  const result=simnet.callPrivateFn(r.rung,'close-epoch',[Cl.principal(alice)],owner);
  expect(result.result).toBeOk(U(received));
  expect(balance(!spec.x,alice)-wallet).toBe(received);
  expect(balance(!spec.x,r.principal)).toBe(0n);
  expect(balance(spec.x,r.principal)).toBe(input);
  for(const key of [accounted,'current-proceeds','proceeds-carry'])expect(data(key)).toBe(0n);
  expect(value(simnet.getMapEntry(r.rung,'epoch-final-proceeds',U(before.epoch)))).toBe(before['proceeds-index']);
  expect(value(simnet.getMapEntry(r.rung,'epoch-final-scale',U(before.epoch)))).toBe(before.scale);
  expect(r.state().epoch).toBe(before.epoch+1n);
  expect(r.state()['total-shares']).toBe(0n);
  expect(result.events.filter(e=>e.event==='stx_transfer_event'||e.event==='ft_transfer_event')).toHaveLength(1);
  expect(simnet.callPrivateFn(r.rung,'close-epoch',[Cl.principal(alice)],owner).result).toBeOk(U(0));
  expect(balance(!spec.x,alice)-wallet).toBe(received);
 });

 it('epoch-payout preserves supplied entitlements when an old reserve is absent',()=>{
  const r=setup(spec);
  expect(read(r.rung,'epoch-payout',[U(99),U(17),U(23)])).toEqual({input:17n,proceeds:23n});
  expect(balance(true,r.principal)).toBe(0n);
  expect(balance(false,r.principal)).toBe(0n);
 });
});
