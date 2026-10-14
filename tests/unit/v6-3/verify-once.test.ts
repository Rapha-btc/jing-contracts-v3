import {beforeEach, describe, expect, it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

// Audit bounty muqchqnaa54e769598a4 (Koisto K-02, Nebular Halo): swap verified
// the same Lazer update twice. It now verifies once and settles on those feeds.
const verifications = () => h.value(h.ro('get-verifications', [], 'oracle'));
const takerAmount = (s: h.Side) => h.amount(s);

describe('swap verifies its Lazer update once', () => {
  beforeEach(h.init);
  for (const s of ['x', 'y'] as const) for (const age of [0, 79]) {
    it(`fills with one verification: deposit ${s}, age ${age}`, () => {
      h.ok(h.deposit(h.other(s), h.amount(h.other(s)), h.P, h.alice));
      h.oracle(0, age, 0);
      const before = verifications();
      const result = h.value(h.ok(h.swap(s, takerAmount(s), s === 'x' ? h.P / 2 : h.P * 2)));
      expect(verifications() - before).toBe(1n);
      expect(result[s === 'x' ? 'token-y-received' : 'token-x-received']).toBeGreaterThan(0n);
    });
  }
  it('settle-with-refresh still verifies its own update', () => {
    h.book();
    const before = verifications();
    h.ok(h.batch());
    expect(verifications() - before).toBe(1n);
  });
  for (const s of ['x', 'y'] as const) {
    it(`rejects a wrong opposite-asset trait after deposit and rolls back: deposit ${s}`, () => {
      h.ok(h.deposit(h.other(s), h.amount(h.other(s)), h.P, h.alice));
      const before = verifications();
      h.rejectUnchanged(() => h.call('swap', [
        h.U(takerAmount(s)), h.U(s === 'x' ? h.P / 2 : h.P * 2), h.UPDATE,
        s === 'x' ? h.token : h.wrong, h.name, s === 'x' ? h.wrong : h.token, h.name, Cl.bool(s === 'x'),
      ], h.bob), 1013);
      expect(verifications()).toBe(before);
    });
  }
  it('rejects a stale classification feed before any transfer', () => {
    h.ok(h.deposit('y', h.amount('y'), h.P, h.alice));
    h.oracle(0, 81, 0);
    h.rejectUnchanged(() => h.swap('x', takerAmount('x'), h.P / 2), 1003);
  });
});

// Same bounty: a crossing reprice-or-swap verified one update three times
// (classification, rebate age, settle-with-refresh). It now verifies once.
function crossingBook(s: h.Side) {
  h.ok(h.deposit(s, h.amount(s), h.off(s), h.alice));
  h.ok(h.deposit(h.other(s), h.amount(h.other(s)) * 2, h.P, h.bob));
  h.ok(h.settleDeposit(h.other(s), h.bob));
}

describe('reprice-or-swap verifies its Lazer update once', () => {
  beforeEach(h.init);
  for (const s of ['x', 'y'] as const) for (const age of [0, 79]) {
    it(`a crossing reprice fills with one verification: side ${s}, age ${age}`, () => {
      crossingBook(s);
      h.oracle(0, age, 0);
      const before = verifications(), wallet = h.balance(h.other(s), h.alice);
      const result = h.value(h.ok(h.reprice(s, h.P)));
      expect(verifications() - before).toBe(1n);
      expect(result[`token-${h.other(s)}-received`]).toBeGreaterThan(0n);
      expect(h.balance(h.other(s), h.alice) - wallet).toBe(result[`token-${h.other(s)}-received`]);
      expect(h.live(s)).toBe(0n);
      expect(h.pending(s, 'limit')).toEqual(h.N);
      h.custody('x'); h.custody('y');
    });
  }
  for (const s of ['x', 'y'] as const) {
    it(`a non-crossing reprice verifies once and queues; an empty book verifies none: side ${s}`, () => {
      h.ok(h.deposit(s, h.amount(s), h.off(s), h.alice));
      let before = verifications();
      h.ok(h.reprice(s, h.off(s) + 1), Cl.tuple({
        'token-x-received': h.U(0), 'token-y-rolled': h.U(0), 'token-y-received': h.U(0),
        'token-x-rolled': h.U(0), 'rebate-refunded': h.U(0),
      }));
      expect(verifications()).toBe(before);
      expect(h.ro(`get-token-${s}-limit`, [Cl.principal(h.alice)])).toEqual(h.U(h.off(s) + 1));
      h.ok(h.deposit(h.other(s), h.amount(h.other(s)), h.off(h.other(s)), h.bob));
      h.ok(h.settleDeposit(h.other(s), h.bob));
      before = verifications();
      h.ok(h.reprice(s, h.off(s) + 2));
      expect(verifications() - before).toBe(1n);
      expect(h.value(h.pending(s, 'limit')).limit).toBe(BigInt(h.off(s) + 2));
    });
    it(`a crossing reprice keeps its oracle errors and rolls back: side ${s}`, () => {
      crossingBook(s);
      h.oracle(0, 81, 0);
      h.rejectUnchanged(() => h.reprice(s, h.P), 1003);
      h.oracle(0, 0, 81);
      h.rejectUnchanged(() => h.reprice(s, h.P), 1003);
      h.oracle(1);
      h.rejectUnchanged(() => h.reprice(s, h.P), 1006);
      h.oracle(45);
      h.rejectUnchanged(() => h.reprice(s, h.P), 1006);
      h.oracle(7);
      h.rejectUnchanged(() => h.reprice(s, h.P), 9001);
      h.oracle();
      h.ok(h.reprice(s, h.P));
    });
    it(`a wrong trait is rejected before any verification: side ${s}`, () => {
      crossingBook(s);
      const before = verifications();
      for (const args of [[h.wrong, h.name, h.token, h.name], [h.token, h.name, h.wrong, h.name]]) {
        h.rejectUnchanged(() => h.call(`reprice-or-swap-token-${s}`, [h.U(h.P), h.N, h.UPDATE, ...args], h.alice), 1013);
      }
      expect(verifications()).toBe(before);
    });
  }
});
