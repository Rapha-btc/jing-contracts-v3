import {beforeEach, describe, expect, it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

const update = Cl.some(h.UPDATE);
const quote = (side: h.Side, u = update) => h.value(h.ro('get-taker-capacity', [
  h.U(h.P), h.U(h.off(h.other(side))), Cl.bool(side === 'x'), Cl.principal(h.bob), u,
]));
const bpsFor = (age: number) => BigInt(Math.min(70, 20 + Math.max(0, age - 30)));

describe('market owns the age-aware capacity quote', () => {
  beforeEach(h.init);
  for (const side of ['x', 'y'] as const) for (const age of [0, 30, 31, 55, 79])
    for (const older of ['x', 'y'] as const)
      it(`${side}: exact gross capacity fills with ${older} age ${age}`, () => {
        const makerSide = h.other(side), limit = h.off(makerSide);
        h.ok(h.deposit(makerSide, h.amount(makerSide), limit));
        h.oracle(0, older === 'x' ? age : 0, older === 'y' ? age : 0);
        const q = quote(side), bps = bpsFor(age), gross = q['gross-cap'];
        expect(q['rebate-bps']).toBe(bps);
        expect(gross).toBe(((q['net-cap'] + 1n) * (10000n + bps) - 1n) / 10000n);
        expect(gross * 10000n / (10000n + bps)).toBe(q['net-cap']);
        expect((gross + 1n) * 10000n / (10000n + bps)).toBeGreaterThan(q['net-cap']);
        const before = h.balance(side, h.bob);
        const r = h.value(h.ok(h.swap(side, Number(gross), limit)));
        expect(r[`token-${side}-rolled`]).toBe(0n);
        expect(h.live(makerSide)).toBe(0n);
        expect(before - h.balance(side, h.bob)).toBe(gross - r['rebate-refunded']);
        h.custody('x'); h.custody('y');
      });

  for (const age of [80, 100]) it(`age ${age} quotes 70 bps but swap rejects stale data`, () => {
    h.ok(h.deposit('y'));
    h.oracle(0, age, 0);
    const q = quote('x');
    expect(q['rebate-bps']).toBe(70n);
    h.err(h.swap('x', Number(q['gross-cap']), h.off('y')), 1003);
    expect(h.live('y')).toBe(BigInt(h.amount('y')));
  });
  it('none retains the 20-bps quote', () => {
    h.oracle(0, 79, 79);
    expect(quote('x', Cl.none())['rebate-bps']).toBe(20n);
  });
  it('short envelope falls back without throwing', () => {
    expect(quote('x', Cl.some(Cl.bufferFromHex('00')))['rebate-bps']).toBe(20n);
  });
  for (const mode of [4, 6, 7, 13, 15]) it(`missing/undecodable hint mode ${mode} falls back`, () => {
    h.oracle(mode, 55, 0);
    expect(quote('x')['rebate-bps']).toBe(20n);
  });
  it('future timestamps use zero age', () => {
    h.oracle(8, 0, 0);
    expect(quote('x')['rebate-bps']).toBe(20n);
  });
  it('last matching feed wins and unrelated old feeds are ignored', () => {
    h.oracle(16, 55, 0);
    expect(quote('x')['rebate-bps']).toBe(45n);
  });
  it('empty capacity stays zero at the maximum rate', () => {
    h.oracle(0, 79, 0);
    const q = quote('x');
    expect(q['rebate-bps']).toBe(69n);
    expect(q['net-cap']).toBe(0n);
    expect(q['gross-cap']).toBe(0n);
  });
});

describe('capacity uses configured feed IDs', () => {
  beforeEach(() => {
    h.initFeeds(7, 8);
    h.ok(h.call('configure-feed-ids', [h.U(7), h.U(8)], h.owner, 'oracle'));
  });
  it('quote and swap agree for a non-BTC/STX feed pair', () => {
    h.ok(h.deposit('y'));
    h.oracle(0, 0, 55);
    const q = quote('x');
    expect(q['rebate-bps']).toBe(45n);
    h.ok(h.swap('x', Number(q['gross-cap']), h.off('y')));
    expect(h.live('y')).toBe(0n);
    h.custody('x'); h.custody('y');
  });
});
