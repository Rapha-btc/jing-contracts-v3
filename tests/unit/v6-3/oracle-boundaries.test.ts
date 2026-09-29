import {beforeEach, describe, expect, it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {P, U, N, owner, alice, bob, call, ok, init, book, batch, oracle,
  rejectUnchanged, cycle, balance, custody} from './helpers';

// Exercise the production market's validation of decoded price data. The real
// core runs unchanged; these cases do not claim to verify signed Lazer updates.
describe('independent oracle boundaries with funded settlement and recovery', () => {
  beforeEach(() => { init(); book(); });

  function settleAndCheckPayouts() {
    const x = balance('x', bob), y = balance('y', alice);
    ok(batch());
    expect(cycle()).toBe(1n);
    expect(balance('x', bob) - x).toBe(9990n);
    expect(balance('y', alice) - y).toBe(999000n);
    custody('x'); custody('y');
  }

  for (const side of ['x', 'y'] as const) {
    it.each([-1, 0, 1])(`${side} confidence at 2%% price plus %i: exact rejection and recovery`, delta => {
      const confidence = Cl.some(U((side === 'x' ? P : 100000000) / 50 + delta));
      ok(call('configure-confidence', side === 'x' ? [confidence, N] : [N, confidence], owner, 'oracle'));
      if (delta >= 0) {
        rejectUnchanged(() => batch(), 1004);
        expect(cycle()).toBe(0n);
        ok(call('configure-confidence', [N, N], owner, 'oracle'));
      }
      settleAndCheckPayouts();
    });

    it.each([79, 80, 81])(`${side} feed aged %i seconds: exact settlement cutoff and recovery`, age => {
      oracle(0, side === 'x' ? age : 0, side === 'y' ? age : 0);
      if (age >= 80) {
        rejectUnchanged(() => batch(), 1003);
        expect(cycle()).toBe(0n);
        oracle();
      }
      settleAndCheckPayouts();
    });
  }
});
