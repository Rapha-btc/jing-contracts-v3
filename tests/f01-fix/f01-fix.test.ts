// F-01 fix regression: privileged burn/lock of a rung's credited proceeds must not block exits.
// Covers jing-sell-sbtc-bps (USDCx burn) and jing-buy-sbtc-bps (sBTC burn, sBTC protocol-lock).
import {describe, it, expect} from 'vitest';
import {boot, Cl, DEP, X, Y, wallet, pp} from './lab';

type Side = 'sell' | 'buy';
type Mode = 'burn' | 'lock';
const variants: [Side, Mode][] = [['sell', 'burn'], ['buy', 'burn']]; // sBTC lock out of scope (only peg-outs lock; Rapha 2026-11-15)

const cfg = (side: Side) => ({
  name: `jing-${side}-sbtc-10-v2`,
  rung: DEP + `.jing-${side}-sbtc-10-v2`,
  proceeds: side === 'sell' ? Y : X,
  input: side === 'sell' ? X : Y,
  proceedsKey: side === 'sell' ? 'stx' : 'sbtc',
  inputKey: side === 'sell' ? 'sbtc' : 'stx',
  accountedVar: side === 'sell' ? 'usdcx-accounted' : 'sats-accounted',
  deposit: side === 'sell' ? 100000n : 100000000n,
});

async function setup(side: Side, nMembers: number) {
  const b = await boot();
  const c = cfg(side);
  const members = Array.from({length: nMembers}, (_, i) => wallet(1 + i));
  const taker = wallet(20), newcomer = wallet(21);
  for (const w of [...members, taker, newcomer]) b.fund(w);
  for (const m of members) b.ok(b.call(c.name, 'deposit', [Cl.uint(c.deposit)], m));
  b.ok(b.swap(side, taker));
  b.ok(b.call(c.name, 'sync'));
  const cash = (): bigint => b.read(c.name, 'proceeds-cash').result.value;
  const deficit = (): bigint => b.read(c.name, 'get-deficit').result.value;
  const debt = (w: string): bigint => b.read(c.name, 'get-debt', [Cl.principal(w)]).result.value;
  const pos = (w: string) => b.read(c.name, 'get-position', [Cl.principal(w)]).result.value;
  const owed = (w: string): bigint => pos(w)[c.proceedsKey].value;
  const inputOf = (w: string): bigint => pos(w)[c.inputKey].value;
  const accounted = () => b.dataVar(c.name, c.accountedVar);
  // seize proceeds: burn (proceeds token) or protocol-lock (sBTC only)
  const seize = (mode: Mode, amt: bigint) => b.ok(b.call(c.proceeds, mode === 'burn' ? 'protocol-burn' : 'protocol-lock', b.tokenArgs(c.proceeds, amt, c.rung)));
  const restore = (mode: Mode, amt: bigint) => b.ok(b.call(c.proceeds, mode === 'burn' ? 'protocol-mint' : 'protocol-unlock', b.tokenArgs(c.proceeds, amt, c.rung)));
  return {b, c, members, newcomer, cash, deficit, debt, pos, owed, inputOf, accounted, seize, restore};
}

describe('F-01 fix, single member (cases a-g)', () => {
  for (const [side, mode] of variants) {
    it(`${side} rung, ${mode} half of credited proceeds`, async () => {
      const t = await setup(side, 1);
      const {b, c} = t;
      const [m] = t.members;
      // (a) deposit, partial fill, sync credited proceeds
      const credited = t.owed(m);
      const unfilled = t.inputOf(m);
      expect(credited).toBeGreaterThan(0n);
      expect(unfilled).toBeGreaterThan(0n);
      expect(unfilled).toBeLessThan(c.deposit);
      expect(t.accounted()).toBe(credited);
      expect(t.cash()).toBe(credited);
      expect(t.deficit()).toBe(0n);
      // (b) privileged burn / lock of half
      const seized = credited / 2n;
      t.seize(mode, seized);
      if (mode === 'lock') {
        expect(b.read('sbtc-token', 'get-balance', [Cl.principal(c.rung)]).result.value.value).toBe(credited);
        expect(b.read('sbtc-token', 'get-balance-locked', [Cl.principal(c.rung)]).result.value.value).toBe(seized);
      }
      b.ok(b.call(c.name, 'sync'));
      // (c) deficit equals the shortfall
      expect(t.deficit()).toBe(seized);
      expect(b.read(c.name, 'get-state').result.value.deficit.value).toBe(seized);
      // (d) claim pays available cash, records debt
      const p0 = b.balance(c.proceeds, m);
      const claim = b.ok(b.call(c.name, 'claim', [], m));
      expect(claim.result.value.value[c.proceedsKey].value).toBe(credited - seized);
      expect(b.balance(c.proceeds, m) - p0).toBe(credited - seized);
      expect(t.debt(m)).toBe(seized);
      expect(t.deficit()).toBe(seized);
      expect(t.cash()).toBe(0n);
      // (e) F-01 regression: 1-unit withdraw then full withdraw return unfilled input
      const i0 = b.balance(c.input, m);
      const w1 = b.call(c.name, 'withdraw', [Cl.uint(1), Cl.none()], m);
      expect(w1.result.type, pp(w1.result)).toBe('ok');
      expect(b.balance(c.input, m) - i0).toBe(1n);
      const wAll = b.call(c.name, 'withdraw', [Cl.uint(c.deposit * 10n), Cl.none()], m);
      expect(wAll.result.type, pp(wAll.result)).toBe('ok');
      const back = b.balance(c.input, m) - i0;
      expect(back).toBe(unfilled);
      expect(b.read(c.name, 'get-position', [Cl.principal(m)]).result.value.shares.value).toBe(0n);
      expect(t.debt(m)).toBe(seized);
      // (f) newcomer deposit refused while deficit > 0
      expect(b.call(c.name, 'deposit', [Cl.uint(c.deposit)], t.newcomer).result).toStrictEqual(Cl.error(Cl.uint(7017)));
      // (g) refill / unlock, ex-member claims debt with no position
      t.restore(mode, seized);
      expect(t.deficit()).toBe(0n);
      const p1 = b.balance(c.proceeds, m);
      const c2 = b.ok(b.call(c.name, 'claim', [], m));
      expect(c2.result.value.value[c.proceedsKey].value).toBe(seized);
      expect(b.balance(c.proceeds, m) - p1).toBe(seized);
      expect(t.debt(m)).toBe(0n);
      expect(t.deficit()).toBe(0n);
      expect(t.accounted()).toBe(0n);
      // claim again: no position, no debt
      expect(b.call(c.name, 'claim', [], m).result).toStrictEqual(Cl.error(Cl.uint(7006)));
      // rung reopens
      b.ok(b.call(c.name, 'deposit', [Cl.uint(c.deposit)], t.newcomer));
    });
  }
});

describe('F-01 fix, three equal members, 50% loss (case h)', () => {
  for (const [side, mode] of variants) {
    it(`${side} rung, ${mode}: first-come paid, all inputs returned`, async () => {
      const t = await setup(side, 3);
      const {b, c, members} = t;
      const owedBefore = members.map(t.owed);
      const inputBefore = members.map(t.inputOf);
      const total = t.cash();
      expect(t.accounted()).toBe(total);
      const seized = total / 2n;
      t.seize(mode, seized);
      expect(t.deficit()).toBe(seized);
      const got: bigint[] = [], back: bigint[] = [], debts: bigint[] = [];
      let cashLeft = total - seized;
      for (const [i, m] of members.entries()) {
        const p0 = b.balance(c.proceeds, m), i0 = b.balance(c.input, m);
        const r = b.call(c.name, 'withdraw', [Cl.uint(c.deposit * 10n), Cl.none()], m);
        expect(r.result.type, `member ${i}: ${pp(r.result)}`).toBe('ok');
        got.push(b.balance(c.proceeds, m) - p0);
        back.push(b.balance(c.input, m) - i0);
        const expectPaid = owedBefore[i] < cashLeft ? owedBefore[i] : cashLeft;
        expect(got[i]).toBe(expectPaid);
        // settle-time owed can exceed the pre-burn get-position preview by 1 unit (index rounding)
        const d = t.debt(m) - (owedBefore[i] - expectPaid);
        expect(d >= 0n && d <= 1n, `member ${i} debt ${t.debt(m)}`).toBe(true);
        debts.push(t.debt(m));
        cashLeft -= expectPaid;
      }
      expect(got[0]).toBe(owedBefore[0]);       // first-come fully paid
      expect(got[2]).toBe(0n);                  // last gets nothing now
      for (const i of [0, 1, 2]) expect(back[i] - inputBefore[i], `input back member ${i}`).toBeGreaterThanOrEqual(0n);
      for (const i of [0, 1, 2]) expect(back[i] - inputBefore[i], `input back member ${i}`).toBeLessThanOrEqual(2n);
      expect(t.cash()).toBe(0n);
      expect(t.deficit()).toBe(seized);
      const deficitAfterExits = t.deficit();
      // restore and let the unpaid ex-members claim
      t.restore(mode, seized);
      for (const m of members) if (t.debt(m) > 0n) b.ok(b.call(c.name, 'claim', [], m));
      expect(members.map(t.debt)).toStrictEqual([0n, 0n, 0n]);
      expect(t.deficit()).toBe(0n);
      console.log(JSON.stringify({side, mode, owedBefore, paidFirstPass: got, debts, deficitAfterExits, inputBefore, inputBack: back}, (_, v) => typeof v === 'bigint' ? v.toString() : v));
    });
  }
});
