import {expect} from 'vitest';
import {Cl, type ClarityValue} from '@stacks/transactions';
import fs from 'node:fs';

export const build = 'tests/unit/core-ladder-v1/.build';
const meta = JSON.parse(fs.readFileSync(`${build}/source.json`, 'utf8'));
export type Entry = {name: string, params: {name: string, type: string}[], pauseGated: boolean};
export const coreLogs: Entry[] = meta.entrypoints['jing-core-v6'];
export const ladderLogs: Entry[] = meta.entrypoints['jing-ladder-v1'];
export const probeSource = fs.readFileSync(`${build}/probe.clar`, 'utf8');

export const accounts = simnet.getAccounts();
export const owner = accounts.get('deployer')!;
export const alice = accounts.get('wallet_1')!;
export const bob = accounts.get('wallet_2')!;
export const U = Cl.uint, S = Cl.stringAscii;
export const pc = (name: string) => `${owner}.${name}`;
export const probe = pc('probe'), probeAlt = pc('probe-alt');
export const tokenX = pc('token-x'), tokenY = pc('token-y');
export const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';

export function value(cv: any): any {
  if (cv.type === 'uint' || cv.type === 'int') return BigInt(cv.value);
  if (cv.type === 'ok' || cv.type === 'some') return value(cv.value);
  if (cv.type === 'none') return null;
  if (cv.type === 'true' || cv.type === 'false') return cv.type === 'true';
  if (cv.type === 'tuple') return Object.fromEntries(Object.entries(cv.value).map(([k, v]) => [k, value(v)]));
  if (cv.type === 'list') return cv.value.map(value);
  if (cv.type === 'buffer') return cv.value;
  return cv.value;
}
export function call(contract: string, fn: string, args: ClarityValue[] = [], sender = owner) {
  return simnet.callPublicFn(contract, fn, args, sender);
}
export function ro(contract: string, fn: string, args: ClarityValue[] = []) {
  return value(simnet.callReadOnlyFn(contract, fn, args, owner).result);
}
export function ok(receipt: ReturnType<typeof call>) {
  expect(receipt.result).toEqual(Cl.ok(Cl.bool(true)));
  return receipt;
}
export function err(receipt: ReturnType<typeof call>, code: number) {
  expect(receipt.result).toEqual(Cl.error(U(code)));
  expect(receipt.events).toEqual([]);
}
// The print emitted by `contract` (core or ladder) in a receipt.
export function printed(receipt: ReturnType<typeof call>, contract: string) {
  const events = receipt.events.filter(e => e.event === 'print_event' && e.data.contract_identifier === pc(contract));
  expect(events).toHaveLength(1);
  return value(events[0].data.value);
}
// Another deploy of the probe bytes: same code hash as `probe`.
export function deployProbe(name: string, sender = owner) {
  expect(simnet.deployContract(name, probeSource, {clarityVersion: 5}, sender).result).toEqual(Cl.bool(true));
  return `${sender}.${name}`;
}

// Arguments for a log entrypoint: defaults by type, overridden by name.
export function args(e: Entry, over: Record<string, ClarityValue> = {}) {
  return e.params.map(p => over[p.name] ?? ({
    'principal': Cl.principal(alice),
    'uint': U(1),
    'bool': Cl.bool(true),
    '(buff 32)': Cl.buffer(new Uint8Array(32)),
    '(optional uint)': Cl.none(),
    '(optional principal)': Cl.none(),
    '(string-ascii 8)': S('side'),
    '(string-ascii 12)': S('reason'),
  } as Record<string, ClarityValue>)[p.type]);
}
export const entry = (list: Entry[], name: string) => list.find(e => e.name === name)!;
export function coreLog(name: string, over: Record<string, ClarityValue> = {}, caller = probe) {
  return simnet.callPublicFn(caller, `core-${name}`, args(entry(coreLogs, name), over), owner);
}
export function ladderLog(name: string, over: Record<string, ClarityValue> = {}, caller = probe) {
  return simnet.callPublicFn(caller, `ladder-${name}`, args(entry(ladderLogs, name), over), owner);
}

// Core: verify the probe bytes once, then register each probe deploy.
export function coreRegister(...who: string[]) {
  ok(call('jing-core-v6', 'set-verified-contract', [Cl.principal(probe)]));
  for (const p of who.length ? who : [probe]) ok(simnet.callPublicFn(p, 'core-register', [Cl.principal(probe)], owner));
}
export const equity = (token: string, who: string) => ro('jing-core-v6', 'get-token-equity', [Cl.principal(token), Cl.principal(who)]);
export const total = (token: string) => ro('jing-core-v6', 'get-total-token-equity', [Cl.principal(token)]);

// Ladder sides.
export const BUY_BAND = 'buy-band', SELL_BAND = 'sel-band';
export const sides = ['buy-stx', 'sell-stx', 'buy-peg', 'sell-peg', BUY_BAND, SELL_BAND];
export function canonical(side: string, contract = probe) {
  ok(call('jing-ladder-v1', 'set-canonical', [S(side), Cl.principal(contract)]));
}
export function register(who: string, side: string, price: number | bigint, unseated = false) {
  return simnet.callPublicFn(who, unseated ? 'ladder-register-unseated' : 'ladder-register', [S(side), U(price), U(7)], owner);
}
export const bandCount = (side: string) => ro('jing-ladder-v1', 'get-band-count', [S(side)]);
export const rung = (side: string, price: number | bigint) => ro('jing-ladder-v1', 'get-rung', [S(side), U(price)]);
export const isCurrent = (who: string) => ro('jing-ladder-v1', 'is-current-rung', [Cl.principal(who)]);
