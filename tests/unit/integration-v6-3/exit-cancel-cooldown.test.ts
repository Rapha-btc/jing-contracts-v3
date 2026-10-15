import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,alice,bob,value,call,read,ok,balance,specs,setup} from './helpers';

for(const spec of specs)describe(`${spec.label} core-spread v1 exit cancellation cooldown`,()=>{
 it('timestamps a live-plus-pending cancellation and blocks push until 24 hours',()=>{
  const r=setup(spec),wallet=balance(spec.x,alice);
  r.addOppositeMaker();r.deposit(alice);
  expect(r.state().resting).toBe(spec.amount);
  ok(call(r.rung,'deposit',[U(spec.amount)],alice));
  expect(r.pending()?.amount).toBe(spec.amount);
  expect(r.position(alice)[spec.x?'sbtc':'stx']).toBe(spec.amount*2n);
  const cycle=read('market','get-current-cycle');
  expect(read('market',`get-token-${spec.side}-deposit`,[U(cycle),Cl.principal(r.principal)])).toBe(spec.amount);

  const exited=call(r.rung,'withdraw',[U(spec.amount),Cl.none()],alice);
  expect(exited.result.type).toBe('ok');
  const exitTime=value(simnet.execute('stacks-block-time').result);
  expect(ok(exited)).toMatchObject({sbtc:spec.x?spec.amount:0n,stx:spec.x?0n:spec.amount});
  expect(value(simnet.getDataVar(r.rung,'escrow-cancelled-at'))).toBe(exitTime);
  expect(r.pending()).toBe(null);
  expect(r.position(alice)[spec.x?'sbtc':'stx']).toBe(spec.amount);
  expect(r.held()).toBe(spec.amount);
  expect(balance(spec.x,alice)-wallet).toBe(-spec.amount);

  const blocked=call(r.rung,'push',[],bob);
  expect(blocked.result).toEqual(Cl.ok(Cl.bool(false)));
  expect(simnet.getLastContractCallTrace()).toContain('u7015');
  expect(r.held()).toBe(spec.amount);

  simnet.mineEmptyBurnBlocks(145);
  expect(value(simnet.execute('stacks-block-time').result)).toBeGreaterThanOrEqual(exitTime+86400n);
  expect(ok(call(r.rung,'push',[],bob))).toBe(true);
  expect(r.held()).toBe(0n);
  expect(r.pending()?.amount).toBe(spec.amount);
 });
});
