import {describe, it, expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

const ladder = 'jing-ladder-v1';
const P = Cl.principal, S = Cl.stringAscii;

describe('jing-ladder-v1 owner controls', () => {
  it('starts with the deployer, no canonicals, ten band seats per side', () => {
    expect(h.ro(ladder, 'get-owner')).toBe(h.owner);
    expect(h.ro(ladder, 'get-pending-owner')).toEqual({pending: null, 'eligible-at': 144n});
    expect(h.ro(ladder, 'get-max-band-per-side')).toBe(10n);
    for (const side of h.sides) expect(h.ro(ladder, 'get-canonical', [S(side)])).toBe(null);
    expect(h.bandCount(h.BUY_BAND)).toBe(0n);
    expect(h.ro(ladder, 'get-registered', [P(h.probe)])).toBe(null);
  });
  it('sets a canonical for each of the six sides, owner only', () => {
    h.err(h.call(ladder, 'set-canonical', [S('buy-stx'), P(h.probe)], h.alice), 6001);
    h.err(h.call(ladder, 'set-canonical', [S('buy-xyz'), P(h.probe)]), 6007);
    for (const side of h.sides) {
      const r = h.ok(h.call(ladder, 'set-canonical', [S(side), P(h.probe)]));
      expect(h.printed(r, ladder)).toEqual({event: 'canonical-set', side, contract: h.probe});
      expect(h.ro(ladder, 'get-canonical', [S(side)])).toBe(h.probe);
    }
  });
  it('hands ownership over after the 144-block timelock', () => {
    h.err(h.call(ladder, 'propose-owner', [Cl.some(P(h.alice))], h.alice), 6001);
    h.err(h.call(ladder, 'accept-owner', [], h.alice), 6008);
    const at = BigInt(simnet.burnBlockHeight);
    const r = h.ok(h.call(ladder, 'propose-owner', [Cl.some(P(h.alice))]));
    expect(h.printed(r, ladder)['eligible-at']).toBe(at + 144n);
    expect(h.ro(ladder, 'get-pending-owner')).toEqual({pending: h.alice, 'eligible-at': at + 144n});
    h.err(h.call(ladder, 'accept-owner', [], h.bob), 6001);
    h.err(h.call(ladder, 'accept-owner', [], h.alice), 6009);
    simnet.mineEmptyBurnBlocks(Number(at + 144n) - simnet.burnBlockHeight);
    h.ok(h.call(ladder, 'accept-owner', [], h.alice));
    expect(h.ro(ladder, 'get-owner')).toBe(h.alice);
    h.err(h.call(ladder, 'set-canonical', [S('buy-stx'), P(h.probe)]), 6001);
    h.ok(h.call(ladder, 'propose-owner', [Cl.none()], h.alice));
    h.err(h.call(ladder, 'accept-owner', [], h.alice), 6008);
  });
  it('band seats per side stay strictly under the market cap of 50 and over the seats held', () => {
    h.err(h.call(ladder, 'set-max-band-per-side', [h.U(5)], h.alice), 6001);
    h.err(h.call(ladder, 'set-max-band-per-side', [h.U(50)]), 6011);
    const r = h.ok(h.call(ladder, 'set-max-band-per-side', [h.U(49)]));
    expect(r.result).toEqual(Cl.ok(Cl.bool(true)));
    expect(h.printed(r, ladder)).toEqual({event: 'max-band-per-side-set', max: 49n});
    expect(h.ro(ladder, 'get-max-band-per-side')).toBe(49n);
    h.canonical(h.BUY_BAND);h.canonical(h.SELL_BAND);
    h.ok(h.register(h.probe, h.BUY_BAND, 0));
    // under the buy count (1 buy, 0 sell)
    h.err(h.call(ladder, 'set-max-band-per-side', [h.U(0)]), 6011);
    h.ok(h.register(h.deployProbe('probe-s1'), h.SELL_BAND, 0));
    h.ok(h.register(h.deployProbe('probe-s2'), h.SELL_BAND, 10));
    // under the sell count only (1 buy, 2 sell)
    h.err(h.call(ladder, 'set-max-band-per-side', [h.U(1)]), 6011);
    h.ok(h.call(ladder, 'set-max-band-per-side', [h.U(2)]));
  });
});

describe('jing-ladder-v1 register', () => {
  it('refuses a standard principal, a side with no canonical, a non-contract canonical and other bytes', () => {
    h.err(h.call(ladder, 'register', [S('buy-stx'), h.U(1), h.U(1)], h.alice), 6002);
    h.err(h.register(h.probe, 'buy-stx', 1), 6003);
    h.canonical('buy-stx', h.alice);
    h.err(h.register(h.probe, 'buy-stx', 1), 6002);
    h.canonical('buy-stx');
    h.err(h.register(h.probeAlt, 'buy-stx', 1), 6004);
  });
  it('fixed and pegged sides: one rung per price, no replacement', () => {
    for (const side of ['buy-stx', 'sell-stx', 'buy-peg', 'sell-peg']) h.canonical(side);
    const r = h.ok(h.register(h.probe, 'buy-stx', 33150));
    expect(h.printed(r, ladder)).toMatchObject({event: 'rung-registered', side: 'buy-stx', price: 33150n,
      'market-price': 7n, contract: h.probe, seated: false, replaced: null});
    expect(h.rung('buy-stx', 33150)).toBe(h.probe);
    expect(h.ro(ladder, 'get-registered', [P(h.probe)])).toEqual({side: 'buy-stx', price: 33150n});
    expect(h.ro(ladder, 'is-registered', [P(h.probe)])).toBe(true);
    expect(h.isCurrent(h.probe)).toBe(true);
    h.err(h.register(h.probe, 'sell-stx', 1), 6005);
    const twin = h.deployProbe('probe-twin', h.bob);
    h.err(h.register(twin, 'buy-stx', 33150), 6006);
    h.ok(h.register(twin, 'buy-stx', 33151));
    // a fixed rung is never a band seat and has no band count
    expect(h.ro(ladder, 'is-band-x', [P(h.probe)])).toBe(false);
    expect(h.bandCount('buy-stx')).toBe(0n);
  });
  for (const side of [h.BUY_BAND, h.SELL_BAND]) it(`${side}: ten seats, the eleventh spread refused, a taken spread replaced`, () => {
    h.canonical(side);
    const band = side === h.BUY_BAND ? 'is-band-x' : 'is-band-y', other = side === h.BUY_BAND ? 'is-band-y' : 'is-band-x';
    const seated: string[] = [];
    for (let i = 0; i < 10; i++) {
      const who = h.deployProbe(`probe-${i}`);
      const r = h.ok(h.register(who, side, i * 10));
      expect(h.printed(r, ladder)).toMatchObject({seated: true, replaced: null});
      seated.push(who);
    }
    expect(h.bandCount(side)).toBe(10n);
    expect(h.ro(ladder, band, [P(seated[3])])).toBe(true);
    expect(h.ro(ladder, other, [P(seated[3])])).toBe(false);
    h.err(h.register(h.probe, side, 100), 6011);
    // replace at a taken spread: the count stays, the old rung keeps its row
    const r = h.ok(h.register(h.probe, side, 30));
    expect(h.printed(r, ladder)).toMatchObject({seated: true, replaced: seated[3]});
    expect(h.bandCount(side)).toBe(10n);
    expect(h.rung(side, 30)).toBe(h.probe);
    expect(h.ro(ladder, band, [P(seated[3])])).toBe(false);
    expect(h.ro(ladder, band, [P(h.probe)])).toBe(true);
    expect(h.isCurrent(seated[3])).toBe(false);
    expect(h.ro(ladder, 'get-registered', [P(seated[3])])).toEqual({side, price: 30n});
  });
  it('register-unseated: band sides only, the same gates, no seat', () => {
    h.err(h.register(h.probe, 'buy-stx', 0, true), 6003);
    h.canonical('buy-stx');
    h.err(h.register(h.probe, 'buy-stx', 0, true), 6007);
    h.err(h.call(ladder, 'register-unseated', [S(h.BUY_BAND), h.U(0), h.U(0)], h.alice), 6002);
    h.err(h.register(h.probe, h.BUY_BAND, 0, true), 6003);
    h.canonical(h.BUY_BAND, h.alice);
    h.err(h.register(h.probe, h.BUY_BAND, 0, true), 6002);
    h.canonical(h.BUY_BAND);
    h.err(h.register(h.probeAlt, h.BUY_BAND, 0, true), 6004);
    const r = h.ok(h.register(h.probe, h.BUY_BAND, 20, true));
    expect(h.printed(r, ladder)).toMatchObject({seated: false, replaced: null, price: 20n});
    h.err(h.register(h.probe, h.BUY_BAND, 20, true), 6005);
    // any number of unseated rungs may share a spread
    h.ok(h.register(h.deployProbe('probe-u2'), h.BUY_BAND, 20, true));
    expect(h.bandCount(h.BUY_BAND)).toBe(0n);
    expect(h.rung(h.BUY_BAND, 20)).toBe(null);
    expect(h.isCurrent(h.probe)).toBe(false);
    expect(h.ro(ladder, 'is-band-x', [P(h.probe)])).toBe(false);
  });
});

describe('jing-ladder-v1 seats', () => {
  it('seat-band: registered band rungs only, owner only, not already seated', () => {
    h.canonical(h.BUY_BAND);h.canonical('buy-stx');
    h.err(h.call(ladder, 'seat-band', [P(h.probe)]), 6010);
    const fixed = h.deployProbe('probe-fixed');
    h.ok(h.register(fixed, 'buy-stx', 1));
    h.err(h.call(ladder, 'seat-band', [P(fixed)]), 6007);
    h.ok(h.register(h.probe, h.BUY_BAND, 40, true));
    h.err(h.call(ladder, 'seat-band', [P(h.probe)], h.alice), 6001);
    const r = h.ok(h.call(ladder, 'seat-band', [P(h.probe)]));
    expect(h.printed(r, ladder)).toEqual({event: 'band-seated', side: h.BUY_BAND, spread: 40n, contract: h.probe, replaced: null});
    expect(h.bandCount(h.BUY_BAND)).toBe(1n);
    h.err(h.call(ladder, 'seat-band', [P(h.probe)]), 6012);
    // seating an unseated rung at a taken spread replaces the holder
    const next = h.deployProbe('probe-next');
    h.ok(h.register(next, h.BUY_BAND, 40, true));
    expect(h.printed(h.ok(h.call(ladder, 'seat-band', [P(next)])), ladder).replaced).toBe(h.probe);
    expect(h.bandCount(h.BUY_BAND)).toBe(1n);
    expect(h.isCurrent(h.probe)).toBe(false);
  });
  it('seat-band at a free spread is refused when the side is full', () => {
    h.canonical(h.SELL_BAND);
    h.ok(h.call(ladder, 'set-max-band-per-side', [h.U(1)]));
    h.ok(h.register(h.probe, h.SELL_BAND, 0));
    const spare = h.deployProbe('probe-spare');
    h.ok(h.register(spare, h.SELL_BAND, 10, true));
    h.err(h.call(ladder, 'seat-band', [P(spare)]), 6011);
  });
  it('retire-band frees the spread and keeps the rung registered; it can be seated again', () => {
    h.canonical(h.SELL_BAND);h.canonical('sell-stx');
    h.err(h.call(ladder, 'retire-band', [S(h.SELL_BAND), h.U(0)]), 6010);
    h.ok(h.register(h.probe, h.SELL_BAND, 0));
    h.err(h.call(ladder, 'retire-band', [S(h.SELL_BAND), h.U(0)], h.alice), 6001);
    const fixed = h.deployProbe('probe-fixed');
    h.ok(h.register(fixed, 'sell-stx', 5));
    h.err(h.call(ladder, 'retire-band', [S('sell-stx'), h.U(5)]), 6007);
    const r = h.ok(h.call(ladder, 'retire-band', [S(h.SELL_BAND), h.U(0)]));
    expect(h.printed(r, ladder)).toEqual({event: 'band-retired', side: h.SELL_BAND, spread: 0n, contract: h.probe});
    expect(h.bandCount(h.SELL_BAND)).toBe(0n);
    expect(h.rung(h.SELL_BAND, 0)).toBe(null);
    expect(h.ro(ladder, 'is-band-y', [P(h.probe)])).toBe(false);
    expect(h.ro(ladder, 'is-registered', [P(h.probe)])).toBe(true);
    h.ok(h.call(ladder, 'seat-band', [P(h.probe)]));
    expect(h.ro(ladder, 'is-band-y', [P(h.probe)])).toBe(true);
  });
});

describe('jing-ladder-v1 rung event log', () => {
  for (const e of h.ladderLogs) it(`${e.name}: registered rungs only, current flag follows the seat`, () => {
    h.err(h.ladderLog(e.name), 6010);
    h.canonical(h.BUY_BAND);
    h.ok(h.register(h.probe, h.BUY_BAND, 50));
    const a = h.printed(h.ok(h.ladderLog(e.name)), ladder);
    expect(a).toMatchObject({rung: h.probe, current: true, side: h.BUY_BAND, price: 50n});
    h.ok(h.call(ladder, 'retire-band', [S(h.BUY_BAND), h.U(50)]));
    expect(h.printed(h.ok(h.ladderLog(e.name)), ladder).current).toBe(false);
  });
  it('is-current-rung is false for an unknown principal', () => {
    expect(h.isCurrent(h.alice)).toBe(false);
    expect(h.ro(ladder, 'is-band-x', [P(h.alice)])).toBe(false);
  });
});
