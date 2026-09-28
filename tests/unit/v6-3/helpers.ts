import { expect } from 'vitest';
import { Cl, type ClarityValue } from '@stacks/transactions';
export type Side = 'x' | 'y';
export const C = 'market';
export const P = 1_000_000_000_000;
export const U = Cl.uint;
export const N = Cl.none();
export const UPDATE = Cl.bufferFromHex('00');
export const accounts = simnet.getAccounts();
export const owner = accounts.get('deployer')!;
export const alice = accounts.get('wallet_1')!;
export const bob = accounts.get('wallet_2')!;
export const keeper = accounts.get('wallet_3')!;
export const carol = accounts.get('wallet_4')!;
export const market = `${owner}.${C}`;
export const token = Cl.contractPrincipal(owner, 'token');
export const wrong = Cl.contractPrincipal(owner, 'wrong-token');
export const name = Cl.stringAscii('token');
export const traits = [token, name, token, name];
export const amount = (s: Side) => s === 'x' ? 10_000 : 1_000_000;
export const off = (s: Side) => s === 'x' ? P * 2 : P / 2;
export const other = (s: Side): Side => s === 'x' ? 'y' : 'x';
export function call(fn: string, args: ClarityValue[] = [], sender = owner, contract = C) {
  return simnet.callPublicFn(contract, fn, args, sender);
}
export function ro(fn: string, args: ClarityValue[] = [], contract = C) {
  return simnet.callReadOnlyFn(contract, fn, args, owner).result;
}
export function ok(receipt: ReturnType<typeof call>, expected?: ClarityValue) {
  if (expected) expect(receipt.result).toEqual(Cl.ok(expected));
  else expect(receipt.result.type).toBe('ok');
  return (receipt.result as any).value;
}
export function err(receipt: ReturnType<typeof call>, code: number) {
  expect(receipt.result).toEqual(Cl.error(U(code)));
  expect(receipt.events).toEqual([]);
}
export const value = (cv: any): any => {
  if (cv.type === 'uint' || cv.type === 'int') return BigInt(cv.value);
  if (cv.type === 'tuple') return Object.fromEntries(Object.entries(cv.value).map(([k, v]) => [k, value(v)]));
  if (cv.type === 'list') return cv.value.map(value);
  if (cv.type === 'some' || cv.type === 'ok') return value(cv.value);
  if (cv.type === 'none') return null;
  if (cv.type === 'true' || cv.type === 'false') return cv.type === 'true';
  return cv.value;
};
export function init() {
  ok(call('initialize', [Cl.principal(market), token, token, U(100), U(10_000), U(1), U(45)]), Cl.bool(true));
  for (const who of [alice, bob, keeper, carol]) ok(call('mint', [U(1_000_000_000), Cl.principal(who)], owner, 'token'));
}
export function balance(s: Side, who: string) {
  return s === 'x' ? value(ro('get-balance', [Cl.principal(who)], 'token')) : simnet.getAssetsMap().get('STX')?.get(who) ?? 0n;
}
export const cycle = () => value(ro('get-current-cycle'));
export const live = (s: Side, who = alice) => value(ro(`get-token-${s}-deposit`, [U(cycle()), Cl.principal(who)]));
export const parked = (s: Side, who = alice) => value(ro(`get-token-${s}-parked`, [Cl.principal(who)]));
export const pending = (s: Side, kind = 'deposit', who = alice) => ro(`get-token-${s}-pending-${kind}`, [Cl.principal(who)]);
export const deposit = (s: Side, n = amount(s), limit = off(s), who = alice, spread = N) => call(`deposit-token-${s}`, [U(n), U(limit), spread, token, name], who);
export const settleDeposit = (s: Side, who = alice) => call(`settle-token-${s}-deposit`, [Cl.principal(who), UPDATE, token, name], keeper);
export const cancel = (s: Side, who = alice) => call(`cancel-token-${s}-deposit`, [token, name], who);
export const withdraw = (s: Side, n: number, who = alice) => call(`withdraw-token-${s}`, [U(n), token, name], who);
export const setLimit = (s: Side, limit: number, who = alice, spread = N) => call(`set-token-${s}-limit`, [U(limit), spread], who);
export const settleLimit = (s: Side, who = alice) => call(`settle-token-${s}-limit`, [Cl.principal(who), UPDATE], keeper);
export const readmit = (s: Side, who = alice) => call(`readmit-token-${s}`, [Cl.principal(who)], keeper);
export const settleReadmit = (s: Side, who = alice) => call(`settle-token-${s}-readmit`, [Cl.principal(who), UPDATE], keeper);
export const mid = (n: number) => ok(call('set-mid', [U(n)], owner, 'oracle'));
export const oracle = (mode = 0, ageX = 0, ageY = 0) => ok(call('configure', [U(mode), U(ageX), U(ageY)], owner, 'oracle'));
export const batch = (who = keeper) => call('settle-with-refresh', [UPDATE, ...traits], who);
export const swap = (s: Side, n = amount(s), limit = P, who = bob) => call('swap', [U(n), U(limit), UPDATE, ...traits, Cl.bool(s === 'x')], who);
export const reprice = (s: Side, limit: number, who = alice, spread = N) => call(`reprice-or-swap-token-${s}`, [U(limit), spread, UPDATE, ...traits], who);
export function queue(slots = 1, distance = 0) {
  ok(call('set-max-band', [U(50 - slots)], owner, 'jing-ladder-v1'));
  ok(call('sync-seat-count'), U(50 - slots));
  ok(call('set-distance-slots', [U(distance)]));
}
// Create crossing quotes by moving the oracle after legitimate admission.
export function book(x = 10_000, y = 1_000_000, xLimit = P, yLimit = P) {
  ok(deposit('x', x, xLimit, alice));
  ok(deposit('y', y, yLimit, bob));
  mid(Math.floor(xLimit / 2));
  ok(settleDeposit('y', bob));
  expect(live('y', bob)).toBe(BigInt(y));
  mid(P);
}
export function custody(s: Side, people = [alice, bob, keeper, carol]) {
  const total = people.reduce((sum, who) => sum + live(s, who) + parked(s, who) + (value(pending(s, 'deposit', who))?.amount ?? 0n), 0n);
  expect(balance(s, market)).toBe(total);
}
export function snapshot(s: Side, who = alice) {
  return { wallet: balance(s, who), custody: balance(s, market), live: live(s, who), parked: parked(s, who), pending: pending(s, 'deposit', who), order: ro(`get-token-${s}-order`, [Cl.principal(who)]), totals: ro('get-cycle-totals', [U(cycle())]) };
}
