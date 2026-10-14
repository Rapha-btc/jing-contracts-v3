// RV counterexample (tests/rv/router-v5-3, invariant seed 241025, property
// u9620): a smart swap whose whole amount goes to the Jing book can net LESS
// than the caller's `limit-price`. The router's net-limit rule
// (swap-router-sbtc-stx-jing-v5-3.clar `book-limit`, used by `jing-size`)
// assumes the taker's rebate is `bps` of net. The market computes
// net = floor(amount * 10000 / (10000 + bps)) (markets-sbtc-stx-jing-v6-3.clar
// `swap`), so the rebate is the ceiling: on a 207-sat swap it is 1 whole sat
// (48 bps, not 20). Shortfall is at most 1 base unit of the sold asset per
// swap: 12 bps at 207 sats, under 0.1 bps at 100k sats. RV found it with
// 207 sats at a Lazer mid of 3121.2 uSTX/sat and a limit 46 bps under it.
import {describe,it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './unit/router-v5-3/helpers';

describe('RV repro: smart swap net price vs limit-price at dust sizes', () => {
  it('a 207-sat smart sell crossing at the mid nets under its limit-price', () => {
    h.init();
    // a y bid resting above the mid (placed with an empty x side, or the mid
    // moved down since): the taker's x crosses it at the mid in the batch the
    // swap settles, and the rebate pot goes to the y makers (no refund)
    h.ok(h.call('market', 'deposit-token-y', [h.U(1_000_000n), h.U(h.P * 101n / 100n), h.N, h.stx, Cl.stringAscii('wstx')], h.maker));
    const fill = h.P, limit = h.netLimit('x', fill);   // caller's limit, net-limit rule
    expect(h.bookLimit('x', limit)).toBeLessThanOrEqual(fill);
    const n = 207n, before = h.wallet('x');
    const r = h.ok(h.smart('x', n, limit));
    expect(r['jing-ok']).toBe(true);
    expect(r['jing-in']).toBe(n);           // the whole amount, rebate sat included
    expect(r.unsold).toBe(0n);
    h.conservation('x', before, r, n);     // the accounting itself is exact
    const required = n * limit / h.SCALE;  // what limit-price promises in uSTX
    console.log({ out: r.out, required, shortfall: required - r.out, limit, net: h.net(n) });
    expect(h.net(n)).toBe(206n);           // floor(207 * 10000 / 10020): 1 sat rebate, 48 bps
    expect(r.out).toBeLessThan(required);  // THE COUNTEREXAMPLE: net price < limit-price
    // bounded by one sat of input at the fill price
    expect(required - r.out).toBeLessThanOrEqual(fill / h.SCALE);
  });
});
