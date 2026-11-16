import { expect, it as baseIt } from 'vitest';
import { Cl, type ClarityValue } from '@stacks/transactions';
import fs from 'node:fs';
const receipts = new WeakMap<object, object>();
function remember(receipt: any, fn: string, kind: string) {
  receipts.set(receipt, {fn, kind, trace: receipt.result.type === 'err' ? simnet.getLastContractCallTrace() ?? '' : ''});
  return receipt;
}
function witness(receipt: any, outcome: string) {
  const data = receipts.get(receipt);
  if (data) fs.appendFileSync('tests/unit/parity-sbtc-usdcx/.build/path-evidence.jsonl', JSON.stringify({
    ...data, test: expect.getState().currentTestName, outcome,
  }) + '\n');
}
export type Side = 'x' | 'y';
export const C = 'market';
export const P = 1_000_000_000_000;
export const U = Cl.uint;
export const N = Cl.none();
export const UPDATE = Cl.bufferFromHex('00'.repeat(72));
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
export const yToken=Cl.contractPrincipal(owner,'usdcx');
export const traits = [token, name, yToken, name];
export const amount = (s: Side) => s === 'x' ? 10_000 : 1_000_000;
export const off = (s: Side) => s === 'x' ? P * 2 : P / 2;
export const other = (s: Side): Side => s === 'x' ? 'y' : 'x';
export function call(fn: string, args: ClarityValue[] = [], sender = owner, contract = C) {
  const r = simnet.callPublicFn(contract, fn, adaptTraits(fn,args), sender);
  return contract === C ? remember(r, fn, 'public') : r;
}
export function privateCall(fn: string, args: ClarityValue[], sender = owner) {
  return remember(simnet.callPrivateFn(C, fn, adaptTraits(fn,args), sender), fn, 'private');
}
// A rejected transaction still mines a simnet block. Compare contract storage
// and ledgers, not the advancing chain clock. Read every market data variable,
// all relevant map keys for the supplied/known owners, and current/next history.
export function auditState(extra: string[] = []) {
  const entry = (map: string, key: ClarityValue) => {
    try { return simnet.getMapEntry(C, map, key); }
    catch (error) { if (String(error) === 'value not found') return Cl.none(); throw error; }
  };
  const source = fs.readFileSync('contracts/sbtc-usdcx/markets-sbtc-usdcx-jing-v6-5.clar', 'utf8');
  const variables = Object.fromEntries([...source.matchAll(/\(define-data-var\s+([^\s]+)/g)].map(m => [m[1], simnet.getDataVar(C, m[1])]));
  const current = Number(value(variables['current-cycle']));
  const people = new Set([...accounts.values(), market, ...extra]);
  const maps: Record<string, unknown> = {};
  for (let c = 0; c <= current + 1; c++) {
    for (const m of ['cycle-totals', 'settlements', 'token-x-depositor-list', 'token-y-depositor-list']) {
      const record = entry(m, U(c)); maps[`${m}:${c}`] = record;
      if (m.endsWith('depositor-list')) for (const p of value(record) ?? []) people.add(p);
    }
  }
  for (const who of people) for (const s of ['x', 'y']) {
    for (const m of ['deposit-limits', 'pending-deposits', 'pending-limits', 'pending-readmits', 'parked']) maps[`${s}:${m}:${who}`] = entry(`token-${s}-${m}`, Cl.principal(who));
    for (let c = 0; c <= current + 1; c++) maps[`${s}:deposit:${who}:${c}`] = entry(`token-${s}-deposits`, Cl.tuple({cycle: U(c), depositor: Cl.principal(who)}));
  }
  const assets = [...simnet.getAssetsMap()].map(([asset, balances]) => [asset, [...balances].sort()]).sort();
  const coreSource = fs.readFileSync('contracts/jing-core-v6.clar','utf8');
  const coreVariables = Object.fromEntries([...coreSource.matchAll(/\(define-data-var\s+([^\s]+)/g)].map(m => [m[1], simnet.getDataVar('jing-core-v6',m[1])]));
  const identities = [variables['token-x'],variables['token-y']];
  const coreEquity = identities.map(asset => [...people].map(who => [who, ro('get-token-equity',[asset,Cl.principal(who)],'jing-core-v6')]));
  const coreTotal = identities.map(asset => ro('get-total-token-equity',[asset],'jing-core-v6'));
  return JSON.stringify({variables, maps, assets, coreVariables, coreEquity, coreTotal}, (_, v) => typeof v === 'bigint' ? v.toString() : v);
}
export function rejectUnchanged(action: () => ReturnType<typeof call>, code: number, extra: string[] = [], reviewedSites: number[] = []) {
  const before = auditState(extra), receipt = action();
  const trace = simnet.getLastContractCallTrace(), after = auditState(extra);
  if (before !== after) fs.appendFileSync('tests/unit/parity-sbtc-usdcx/.build/rejected-state-changes.jsonl', JSON.stringify({
    test: expect.getState().currentTestName, expectedError: code, result: receipt.result,
    trace, before: JSON.parse(before), after: JSON.parse(after),
  }) + '\n');
  const data = receipts.get(receipt);
  if (data) receipts.set(receipt, {...data, rollback: 'all market variables, known-owner maps/history, and asset ledgers', reviewedSites});
  err(receipt, code);
  expect(after).toBe(before);
}
export function ro(fn: string, args: ClarityValue[] = [], contract = C) {
  return simnet.callReadOnlyFn(contract, fn, args, owner).result;
}
export function ok(receipt: ReturnType<typeof call>, expected?: ClarityValue) {
  if (expected) expect(receipt.result).toEqual(Cl.ok(expected));
  else expect(receipt.result.type).toBe('ok');
  witness(receipt, 'ok');
  return (receipt.result as any).value;
}
export function err(receipt: ReturnType<typeof call>, code: number) {
  expect(receipt.result).toEqual(Cl.error(U(code)));
  expect(receipt.events).toEqual([]);
  witness(receipt, `err ${code}`);
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
export function verifyMarket() {
  ok(call('set-verified-contract', [Cl.principal(market)], owner, 'jing-core-v6'));
}
export function init() { initFeeds(1,7); }
export function initFeeds(feedX: number, feedY: number) {
  verifyMarket();
  ok(call('configure-feed-ids',[U(feedX),U(feedY)],owner,'oracle'));
  ok(call('initialize', [Cl.principal(market), token, yToken, U(100), U(10_000), U(feedX), U(feedY)]), Cl.bool(true));
  for (const who of [owner, alice, bob, keeper, carol]) for(const asset of ['token','usdcx'])ok(call('mint', [U(asset==='usdcx'?100000000000000n:1000000000n), Cl.principal(who)], owner, asset));
}
export function balance(s: Side, who: string) {
  return value(ro('get-balance', [Cl.principal(who)], s==='x'?'token':'usdcx'));
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

// The old STX fixture used the x trait as a placeholder for native y calls.
// Route that placeholder to the real y identity; explicit wrong traits remain wrong.
function adaptTraits(fn:string,args:ClarityValue[]){
 const a=[...args];
 const set=(i:number)=>{if(JSON.stringify(a[i])===JSON.stringify(token))a[i]=yToken;};
 if(fn==='initialize')set(2);
 else if(fn==='deposit-token-y')set(3);
 else if(fn==='settle-token-y-deposit')set(2);
 else if(fn==='cancel-token-y-deposit')set(0);
 else if(fn==='withdraw-token-y')set(1);
 else if(['swap','reprice-or-swap-token-x','reprice-or-swap-token-y'].includes(fn))set(5);
 else if(fn==='settle-with-refresh')set(3);
 else if(fn==='execute-settlement')set(5);
 return a;
}
export const fundY=(who:string,n:bigint)=>call('mint',[U(n),Cl.principal(who)],owner,'usdcx');
export const transferY=(n:bigint,who:string,sender:string)=>call('transfer',[U(n),Cl.principal(sender),Cl.principal(who),N],sender,'usdcx');

export const arranged=(setup:()=>void):any=>Object.assign(
 (name:string,fn:(...a:any[])=>any)=>baseIt(name,(...a)=>{setup();return fn(...a);}),
 {each:(rows:any)=> (name:string,fn:(...a:any[])=>any)=>baseIt.each(rows)(name,(...a)=>{setup();return fn(...a);})}
);

export const isTransfer=(side:Side,e:any)=>false&&side==='x'?e.event==='stx_transfer_event':e.event==='ft_transfer_event'&&e.data.asset_identifier===`${owner}.${side==='x'?'token':'usdcx'}::token`;
