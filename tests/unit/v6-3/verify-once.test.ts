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
