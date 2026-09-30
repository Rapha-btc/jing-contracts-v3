import {beforeEach, describe, expect, it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

const BPS = 10000n;
const netOf = (gross: bigint, bps = 20n) => gross * BPS / (BPS + bps);
const grossFor = (net: bigint, bps: bigint) => (net * (BPS + bps) + BPS - 1n) / BPS;
const sides = ['x', 'y'] as const;

beforeEach(h.init);

describe('net-based swap rebate pot', () => {
  for (const side of sides) for (const age of [0, 30, 31, 79]) {
    it(`${side}: age ${age}, three fills receive their full rebate and refund only rounding`, () => {
      const bps = BigInt(age <= 30 ? 20 : 20 + age - 30);
      const makers = [h.alice, h.carol, h.keeper];
      const makerSide = h.other(side), quote = h.off(makerSide);
      const makerAmount = side === 'x' ? 50050 : 1001;
      const tradedPerFill = side === 'x' ? 1001n : 200200n;
      for (const maker of makers) h.ok(h.deposit(makerSide, makerAmount, quote, maker));
      h.oracle(0, age, age);
      const net = tradedPerFill * BigInt(makers.length), gross = grossFor(net, bps);
      expect(netOf(gross, bps)).toBe(net);
      const pot = gross - net;
      const before = makers.map(maker => h.balance(side, maker));
      const takerBefore = h.balance(side, h.bob);
      const receipt = h.swap(side, Number(gross), quote);
      const result = h.value(h.ok(receipt));
      const fills = receipt.events.filter(e => e.event === 'print_event' && e.data.contract_identifier === `${h.owner}.jing-core-v6`)
        .map(e => h.value(e.data.value)).filter(e => e.event === 'match');
      expect(fills).toHaveLength(makers.length);
      // Compare uncapped per-fill rebates to wallet transfers: a silently
      // exhausted/capped pot must not make this assertion pass.
      const rebatePerFill = tradedPerFill * bps / BPS;
      const paid = rebatePerFill * BigInt(fills.length);
      expect(pot).toBeGreaterThanOrEqual(paid);
      for (let i = 0; i < makers.length; i++) {
        expect(h.balance(side, makers[i]) - before[i]).toBe(tradedPerFill - tradedPerFill / 1000n + rebatePerFill);
      }
      expect(result['rebate-refunded']).toBe(pot - paid);
      expect(result['rebate-refunded']).toBeLessThanOrEqual(BigInt(fills.length + 2));
      expect(result[`token-${side}-rolled`]).toBe(0n);
      expect(takerBefore - h.balance(side, h.bob)).toBe(gross - result['rebate-refunded']);
      h.custody('x'); h.custody('y');
    });
  }

  for (const side of sides) it(`${side}: rebate refund bound with a sub-minimum untraded rest`, () => {
    const net = side === 'x' ? 9980n : 999999n;
    const rest = side === 'x' ? 99n : 9999n;
    const traded = net - rest, gross = grossFor(net, 20n);
    const makerAmount = side === 'x' ? Number(traded * 50n) : Number(traded / 200n);
    const quote = h.off(h.other(side));
    h.ok(h.deposit(h.other(side), makerAmount, quote));
    const before = h.balance(side, h.bob);
    const receipt = h.swap(side, Number(gross), quote);
    const result = h.value(h.ok(receipt));
    const fills = receipt.events.filter(e => e.event === 'print_event' && e.data.contract_identifier === `${h.owner}.jing-core-v6`)
      .map(e => h.value(e.data.value)).filter(e => e.event === 'match');
    expect(fills).toHaveLength(1);
    const pot = gross - net, paid = traded * 20n / BPS;
    expect(pot).toBeGreaterThanOrEqual(paid);
    expect(result['rebate-refunded']).toBe(pot - paid);
    expect(result[`token-${side}-rolled`]).toBe(rest);
    expect(before - h.balance(side, h.bob)).toBe(gross - rest - result['rebate-refunded']);
    h.custody('x'); h.custody('y');
    // The pot also prepaid a rebate on input that never traded. Its return
    // is separate from the per-fill rounding allowance (fills + 2).
    const unusedRebateAllowance = (rest * 20n + BPS - 1n) / BPS;
    expect(result['rebate-refunded'], `net=${net}, traded=${traded}, pot=${pot}, paid=${paid}, fills=${fills.length}`)
      .toBeLessThanOrEqual(unusedRebateAllowance + BigInt(fills.length + 2));
  });
});

describe('gross-cap is the maximum input whose net fits capacity', () => {
  for (const side of sides) for (const extra of [0n, 1n]) {
    it(`${side}: swaps gross-cap${extra ? ' + 1' : ''} against the quoted book`, () => {
      const makerSide = h.other(side), quote = h.off(makerSide);
      h.ok(h.deposit(makerSide, h.amount(makerSide), quote));
      const capacity = h.value(h.ro('get-taker-capacity', [h.U(h.P), h.U(quote), Cl.bool(side === 'x'), Cl.principal(h.bob)]));
      const cap = capacity['net-cap'], grossCap = capacity['gross-cap'];
      expect(cap).toBeGreaterThan(0n);
      expect(grossCap).toBe(((cap + 1n) * 10020n - 1n) / BPS);
      expect(netOf(grossCap)).toBe(cap);
      expect(netOf(grossCap + 1n)).toBe(cap + 1n);
      const gross = grossCap + extra, before = h.balance(side, h.bob);
      const result = h.value(h.ok(h.swap(side, Number(gross), quote)));
      // Exceeding capacity by one produces an allowed sub-minimum refund;
      // it does not imply that swap must reject the whole transaction.
      expect(result[`token-${side}-rolled`]).toBe(extra);
      expect(before - h.balance(side, h.bob)).toBe(gross - extra - result['rebate-refunded']);
      expect(h.live(makerSide, h.alice)).toBe(0n);
      h.custody('x'); h.custody('y');
    });
  }
});
