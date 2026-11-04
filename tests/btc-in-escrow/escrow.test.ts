// jing-btc-in-escrow-v2.clar (deploys as jing-btc-in-escrow-v4): arm by
// deposit (txid, vout) read from the REAL sbtc-registry, one order per
// deposit with status open / executed / cancelled.
//
// Deposits are created the way the bridge does it: the signer principal
// calls the real sbtc-deposit complete-deposit-wrapper, which mints and
// writes completed-deposits. Routers / markets / USDCx are local mocks (see
// tests/btc-in-escrow/build.mjs for the exact five rewrites).
//
// Run: node tests/btc-in-escrow/build.mjs && npx vitest run -c vitest.btc-in-escrow.config.ts
import { describe, it, expect } from 'vitest';
import { Cl, ClarityType, cvToValue, ClarityValue } from '@stacks/transactions';
import { randomPrivateKey, getAddressFromPrivateKey } from '@stacks/transactions';

const SIGNER = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4';
const SBTC_DEPOSIT = `${SIGNER}.sbtc-deposit`;
const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const alice = accounts.get('wallet_1')!;
const bob = accounts.get('wallet_2')!;
const keeper = accounts.get('wallet_3')!;
const stranger = accounts.get('wallet_4')!;
const ESCROW = `${deployer}.jing-btc-in-escrow`;
const ROUTER_STX = `${deployer}.mock-router-stx`;
const ROUTER_USDCX = `${deployer}.mock-router-usdcx`;

const STATUS_OPEN = 0n;
const STATUS_EXECUTED = 1n;
const STATUS_CANCELLED = 2n;
const UPDATE = Cl.buffer(new Uint8Array([1, 2, 3, 4]));
const STALE = Cl.buffer(new Uint8Array([0xde, 0xad]));
const FAR = 1_000_000;

// --- helpers ---

function txid(n: number): Uint8Array {
  const b = new Uint8Array(32);
  b[0] = 0xab;
  b[28] = (n >> 24) & 0xff;
  b[29] = (n >> 16) & 0xff;
  b[30] = (n >> 8) & 0xff;
  b[31] = n & 0xff;
  return b;
}

function deposit(recipient: string, amount: number, id: number, vout = 0) {
  if (simnet.burnBlockHeight < 2) simnet.mineEmptyBurnBlocks(2);
  const h = simnet.burnBlockHeight - 1;
  const hdr = simnet.callReadOnlyFn(SBTC_DEPOSIT, 'get-burn-header', [Cl.uint(h)], recipient).result;
  expect(hdr.type).toBe(ClarityType.OptionalSome);
  const r = simnet.callPublicFn(
    SBTC_DEPOSIT,
    'complete-deposit-wrapper',
    [Cl.buffer(txid(id)), Cl.uint(vout), Cl.uint(amount), Cl.principal(recipient), (hdr as any).value, Cl.uint(h), Cl.buffer(txid(9_999_999))],
    SIGNER,
  );
  expect(r.result).toBeOk(Cl.bool(true));
  return txid(id);
}

type Route = 'stx' | 'usdcx';
function arm(route: Route, sender: string, tx: Uint8Array, vout: number, fee: number, slip = 100, minOut = 0, armBy = FAR) {
  return simnet.callPublicFn(
    'jing-btc-in-escrow',
    route === 'stx' ? 'arm-swap-sbtc-for-stx' : 'arm-swap-sbtc-for-usdcx',
    [Cl.buffer(tx), Cl.uint(vout), Cl.uint(fee), Cl.uint(slip), Cl.uint(minOut), Cl.uint(armBy)],
    sender,
  );
}

function execute(tx: Uint8Array, vout: number, update: ClarityValue = UPDATE, sender = keeper) {
  return simnet.callPublicFn('jing-btc-in-escrow', 'execute', [Cl.buffer(tx), Cl.uint(vout), update], sender);
}

function cancel(tx: Uint8Array, vout: number, sender = stranger) {
  return simnet.callPublicFn('jing-btc-in-escrow', 'cancel', [Cl.buffer(tx), Cl.uint(vout)], sender);
}

function owner(fn: string, args: ClarityValue[], sender = deployer) {
  return simnet.callPublicFn('jing-btc-in-escrow', fn, args, sender);
}

function setKeeper() {
  expect(owner('set-keeper', [Cl.principal(keeper), Cl.bool(true)]).result).toBeOk(Cl.bool(true));
}

// mode, unsold, rate (out per 1000 sats), extra, charge-ustx
function routerMode(route: Route, mode: number, unsold = 0, rate = 1000, extra = 0, charge = 0) {
  const r = simnet.callPublicFn(route === 'stx' ? 'mock-router-stx' : 'mock-router-usdcx', 'configure',
    [Cl.uint(mode), Cl.uint(unsold), Cl.uint(rate), Cl.uint(extra), Cl.uint(charge)], deployer);
  expect(r.result).toBeOk(Cl.bool(true));
}

function fundRouters() {
  // the usdcx router pays mock-usdcx, the stx router pays STX
  expect(simnet.callPublicFn('mock-router-usdcx', 'set-stx-out', [Cl.bool(false)], deployer).result).toBeOk(Cl.bool(true));
  expect(simnet.transferSTX(50_000_000_000n, ROUTER_STX, deployer).result).toBeOk(Cl.bool(true));
  expect(simnet.callPublicFn('mock-usdcx', 'mint', [Cl.uint(50_000_000_000n), Cl.principal(ROUTER_USDCX)], deployer).result).toBeOk(Cl.bool(true));
}

function setMid(route: Route, mid: number) {
  const r = simnet.callPublicFn(route === 'stx' ? 'mock-market-stx' : 'mock-market-usdcx', 'set-mid', [Cl.uint(mid)], deployer);
  expect(r.result).toBeOk(Cl.bool(true));
}

function sbtc(who: string): bigint {
  return simnet.getAssetsMap().get('.sbtc-token.sbtc-token')?.get(who) ?? 0n;
}
function stx(who: string): bigint {
  return simnet.getAssetsMap().get('STX')?.get(who) ?? 0n;
}
function usdcx(who: string): bigint {
  return simnet.getAssetsMap().get('.mock-usdcx.usdcx-token')?.get(who) ?? 0n;
}

function parked(): bigint {
  return cvToValue(simnet.callReadOnlyFn('jing-btc-in-escrow', 'get-parked', [], deployer).result) as bigint;
}

function getOrder(tx: Uint8Array, vout: number): any | null {
  const r = simnet.callReadOnlyFn('jing-btc-in-escrow', 'get-order', [Cl.buffer(tx), Cl.uint(vout)], deployer).result;
  if (r.type === ClarityType.OptionalNone) return null;
  const v = cvToValue(r) as any;
  const o: any = {};
  for (const [k, x] of Object.entries(v.value)) o[k] = (x as any).value;
  return o;
}

function status(tx: Uint8Array, vout: number): bigint | null {
  const o = getOrder(tx, vout);
  return o === null ? null : BigInt(o.status);
}

// parked == sum of open orders' net, over every key this test touched
function expectParkedMatches(keys: Array<[Uint8Array, number]>) {
  let sum = 0n;
  for (const [t, v] of keys) {
    const o = getOrder(t, v);
    if (o && BigInt(o.status) === STATUS_OPEN) sum += BigInt(o.net);
  }
  expect(parked()).toBe(sum);
  expect(sbtc(ESCROW) >= parked()).toBe(true);
}

// a public call in simnet executes at stacks-block-height = blockHeight + 1
function nextTxHeight(): number {
  return simnet.blockHeight + 1;
}

// mine until the NEXT public call runs at height `target`
function mineUntilNextTxAt(target: number) {
  const n = target - nextTxHeight();
  expect(n >= 0).toBe(true);
  if (n > 0) simnet.mineEmptyBlocks(n);
  expect(nextTxHeight()).toBe(target);
}

function freshAddress(): string {
  return getAddressFromPrivateKey(randomPrivateKey(), 'testnet');
}

// ===================================================================

describe('arm: amount comes from the real sbtc-registry', () => {
  it('arm-swap-sbtc-for-stx parks exactly minted - fee and records an open order', () => {
    // arrange
    const tx = deposit(alice, 123_456, 1);
    const a0 = sbtc(alice);
    const f0 = sbtc(deployer);
    // act
    const r = arm('stx', alice, tx, 0, 1_000, 50, 7);
    // assert
    expect(r.result).toBeOk(Cl.uint(122_456));
    expect(sbtc(alice)).toBe(a0 - 123_456n);
    expect(sbtc(deployer)).toBe(f0 + 1_000n);
    expect(sbtc(ESCROW)).toBe(122_456n);
    expect(parked()).toBe(122_456n);
    const o = getOrder(tx, 0);
    expect(BigInt(o.status)).toBe(STATUS_OPEN);
    expect(o.user).toBe(alice);
    expect(o.router).toBe(ROUTER_STX);
    expect(BigInt(o.net)).toBe(122_456n);
    expect(BigInt(o['slippage-bps'])).toBe(50n);
    expect(BigInt(o['min-out'])).toBe(7n);
    const ev = r.events.find((e: any) => e.event === 'print_event');
    const p = cvToValue(ev!.data.value as ClarityValue) as any;
    expect(p.event.value).toBe('btc-in-armed');
    expect(BigInt(p.amount.value)).toBe(123_456n);
    expect(BigInt(p['fee-sats'].value)).toBe(1_000n);
  });

  it('arm-swap-sbtc-for-usdcx records the usdcx router', () => {
    // arrange
    const tx = deposit(alice, 50_000, 2);
    // act
    const r = arm('usdcx', alice, tx, 0, 0);
    // assert
    expect(r.result).toBeOk(Cl.uint(50_000));
    expect(getOrder(tx, 0).router).toBe(ROUTER_USDCX);
    expect(parked()).toBe(50_000n);
  });

  it('the user cannot inflate the amount: it is what the bridge minted, not a signed arg', () => {
    // arrange: alice holds lots of genesis sBTC but the deposit is 1,000 sats
    const tx = deposit(alice, 1_000, 3);
    // act
    const r = arm('stx', alice, tx, 0, 0);
    // assert
    expect(r.result).toBeOk(Cl.uint(1_000));
    expect(sbtc(ESCROW)).toBe(1_000n);
  });

  it('same txid, different vout = different deposits, both armable', () => {
    // arrange
    const tx = deposit(alice, 10_000, 4, 0);
    deposit(alice, 20_000, 4, 1);
    // act
    const r0 = arm('stx', alice, tx, 0, 0);
    const r1 = arm('usdcx', alice, tx, 1, 0);
    // assert
    expect(r0.result).toBeOk(Cl.uint(10_000));
    expect(r1.result).toBeOk(Cl.uint(20_000));
    expect(parked()).toBe(30_000n);
  });
});

describe('arm: one arm per deposit, across both routes, forever', () => {
  it('stx then stx again: u4217, nothing moves', () => {
    // arrange
    const tx = deposit(alice, 10_000, 10);
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(10_000));
    const a0 = sbtc(alice);
    // act
    const r = arm('stx', alice, tx, 0, 0);
    // assert
    expect(r.result).toBeErr(Cl.uint(4217));
    expect(sbtc(alice)).toBe(a0);
    expect(parked()).toBe(10_000n);
  });

  it('stx then usdcx (and usdcx then stx): u4217', () => {
    // arrange
    const t1 = deposit(alice, 10_000, 11);
    const t2 = deposit(alice, 10_000, 12);
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(10_000));
    expect(arm('usdcx', alice, t2, 0, 0).result).toBeOk(Cl.uint(10_000));
    // act
    const r1 = arm('usdcx', alice, t1, 0, 0);
    const r2 = arm('stx', alice, t2, 0, 0);
    // assert
    expect(r1.result).toBeErr(Cl.uint(4217));
    expect(r2.result).toBeErr(Cl.uint(4217));
    expect(getOrder(t1, 0).router).toBe(ROUTER_STX);
    expect(getOrder(t2, 0).router).toBe(ROUTER_USDCX);
  });

  it('second arm with a fee also fails u4217 and the fee does not move', () => {
    // arrange
    const tx = deposit(alice, 10_000, 13);
    expect(arm('stx', alice, tx, 0, 500).result).toBeOk(Cl.uint(9_500));
    const a0 = sbtc(alice);
    const f0 = sbtc(deployer);
    // act
    const r = arm('usdcx', alice, tx, 0, 500);
    // assert
    expect(r.result).toBeErr(Cl.uint(4217));
    expect(sbtc(alice)).toBe(a0);
    expect(sbtc(deployer)).toBe(f0);
  });

  it('after the order is executed or cancelled the deposit still cannot be re-armed', () => {
    // arrange
    setKeeper();
    fundRouters();
    const t1 = deposit(alice, 10_000, 14);
    const t2 = deposit(alice, 10_000, 15);
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(10_000));
    expect(arm('stx', alice, t2, 0, 0).result).toBeOk(Cl.uint(10_000));
    expect(execute(t1, 0).result.type).toBe(ClarityType.ResponseOk);
    simnet.mineEmptyBlocks(40);
    expect(cancel(t2, 0).result).toBeOk(Cl.uint(10_000));
    // act
    const r1 = arm('stx', alice, t1, 0, 0);
    const r2 = arm('usdcx', alice, t2, 0, 0);
    // assert
    expect(r1.result).toBeErr(Cl.uint(4217));
    expect(r2.result).toBeErr(Cl.uint(4217));
    expect(status(t1, 0)).toBe(STATUS_EXECUTED);
    expect(status(t2, 0)).toBe(STATUS_CANCELLED);
    expect(parked()).toBe(0n);
  });

  it('a user with no other sBTC re-arming with fee > 0 fails on the fee transfer (u1) before u4217', () => {
    // arrange: a fresh address holds only its deposit
    const user = freshAddress();
    simnet.transferSTX(1_000_000n, user, deployer);
    const tx = deposit(user, 10_000, 16);
    expect(arm('stx', user, tx, 0, 0).result).toBeOk(Cl.uint(10_000));
    expect(sbtc(user)).toBe(0n);
    // act
    const r = arm('stx', user, tx, 0, 1);
    // assert: still rejected, nothing moves; the error code is the token's
    expect(r.result).toBeErr(Cl.uint(1));
    expect(parked()).toBe(10_000n);
  });
});

describe('arm: recipient, unknown deposit, arm-by, fee cap, guards', () => {
  it('only the deposit recipient can arm: u4216, nothing moves', () => {
    // arrange
    const tx = deposit(alice, 10_000, 20);
    const b0 = sbtc(bob);
    // act
    const r1 = arm('stx', bob, tx, 0, 0);
    const r2 = arm('usdcx', deployer, tx, 0, 0);
    // assert
    expect(r1.result).toBeErr(Cl.uint(4216));
    expect(r2.result).toBeErr(Cl.uint(4216));
    expect(sbtc(bob)).toBe(b0);
    expect(getOrder(tx, 0)).toBeNull();
    // and the real recipient still can
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(10_000));
  });

  it('unknown txid, wrong vout, short txid: u4215', () => {
    // arrange
    const tx = deposit(alice, 10_000, 21, 0);
    // act
    const unknown = arm('stx', alice, txid(22), 0, 0);
    const wrongVout = arm('usdcx', alice, tx, 1, 0);
    const shortTx = simnet.callPublicFn('jing-btc-in-escrow', 'arm-swap-sbtc-for-stx',
      [Cl.buffer(tx.slice(0, 31)), Cl.uint(0), Cl.uint(0), Cl.uint(0), Cl.uint(0), Cl.uint(FAR)], alice);
    // assert
    expect(unknown.result).toBeErr(Cl.uint(4215));
    expect(wrongVout.result).toBeErr(Cl.uint(4215));
    expect(shortTx.result).toBeErr(Cl.uint(4215));
    expect(parked()).toBe(0n);
  });

  it('a deposit that is not yet completed cannot be armed, and can once the bridge mints it', () => {
    // arrange
    const pending = txid(23);
    // act
    const before = arm('stx', alice, pending, 0, 0);
    deposit(alice, 7_777, 23);
    const after = arm('stx', alice, pending, 0, 0);
    // assert
    expect(before.result).toBeErr(Cl.uint(4215));
    expect(after.result).toBeOk(Cl.uint(7_777));
  });

  it('arm-by: must land strictly before arm-by on both routes', () => {
    // arrange
    const t1 = deposit(alice, 10_000, 24);
    const t2 = deposit(alice, 10_000, 25);
    // act
    const atStx = arm('stx', alice, t1, 0, 0, 0, 0, nextTxHeight());
    const pastUsdcx = arm('usdcx', alice, t2, 0, 0, 0, 0, nextTxHeight() - 1);
    const okStx = arm('stx', alice, t1, 0, 0, 0, 0, nextTxHeight() + 1);
    const okUsdcx = arm('usdcx', alice, t2, 0, 0, 0, 0, nextTxHeight() + 1);
    // assert
    expect(atStx.result).toBeErr(Cl.uint(4213));
    expect(pastUsdcx.result).toBeErr(Cl.uint(4213));
    expect(okStx.result).toBeOk(Cl.uint(10_000));
    expect(okUsdcx.result).toBeOk(Cl.uint(10_000));
  });

  it('fee-sats cap: = max ok, max + 1 u4201; owner cap ceiling 10000', () => {
    // arrange
    const t1 = deposit(alice, 100_000, 30);
    const t2 = deposit(alice, 100_000, 31);
    const t3 = deposit(alice, 100_000, 32);
    // act / assert
    expect(arm('stx', alice, t1, 0, 5_001).result).toBeErr(Cl.uint(4201));
    expect(arm('stx', alice, t1, 0, 5_000).result).toBeOk(Cl.uint(95_000));
    expect(owner('set-max-fee-sats', [Cl.uint(10_001)]).result).toBeErr(Cl.uint(4201));
    expect(owner('set-max-fee-sats', [Cl.uint(10_000)], alice).result).toBeErr(Cl.uint(4200));
    expect(owner('set-max-fee-sats', [Cl.uint(10_000)]).result).toBeOk(Cl.bool(true));
    expect(arm('usdcx', alice, t2, 0, 10_001).result).toBeErr(Cl.uint(4201));
    expect(arm('usdcx', alice, t2, 0, 10_000).result).toBeOk(Cl.uint(90_000));
    expect(owner('set-max-fee-sats', [Cl.uint(0)]).result).toBeOk(Cl.bool(true));
    expect(arm('stx', alice, t3, 0, 1).result).toBeErr(Cl.uint(4201));
    expect(arm('stx', alice, t3, 0, 0).result).toBeOk(Cl.uint(100_000));
  });

  it('fee >= amount u4202; fee = amount - 1 leaves a 1-sat order', () => {
    // arrange: dust limit is 546, so the smallest deposit is 546
    const t1 = deposit(alice, 546, 33);
    // act / assert
    expect(arm('stx', alice, t1, 0, 546).result).toBeErr(Cl.uint(4202));
    expect(arm('stx', alice, t1, 0, 545).result).toBeOk(Cl.uint(1));
    expect(parked()).toBe(1n);
  });

  it('paused u4203, slippage 10000 u4207 (9999 ok)', () => {
    // arrange
    const t1 = deposit(alice, 10_000, 34);
    // act / assert
    expect(owner('set-paused', [Cl.bool(true)]).result).toBeOk(Cl.bool(true));
    expect(arm('stx', alice, t1, 0, 0).result).toBeErr(Cl.uint(4203));
    expect(owner('set-paused', [Cl.bool(false)]).result).toBeOk(Cl.bool(true));
    expect(arm('stx', alice, t1, 0, 0, 10_000).result).toBeErr(Cl.uint(4207));
    expect(arm('stx', alice, t1, 0, 0, 9_999).result).toBeOk(Cl.uint(10_000));
  });

  it('cancel-height is snapshotted at arm; a later timeout change does not move it', () => {
    // arrange
    const t1 = deposit(alice, 10_000, 35);
    const h = nextTxHeight();
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(10_000));
    // act
    expect(owner('set-cancel-after-blocks', [Cl.uint(360)]).result).toBeOk(Cl.bool(true));
    // assert
    expect(BigInt(getOrder(t1, 0)['cancel-height'])).toBe(BigInt(h + 30));
    // and a new order picks up the new value
    const t2 = deposit(alice, 10_000, 36);
    const h2 = nextTxHeight();
    expect(arm('stx', alice, t2, 0, 0).result).toBeOk(Cl.uint(10_000));
    expect(BigInt(getOrder(t2, 0)['cancel-height'])).toBe(BigInt(h2 + 360));
    expect(owner('set-cancel-after-blocks', [Cl.uint(361)]).result).toBeErr(Cl.uint(4208));
    expect(owner('set-cancel-after-blocks', [Cl.uint(0)]).result).toBeErr(Cl.uint(4208));
  });
});

describe('execute', () => {
  it('stx fill: limit from the verified mid, user gets out + unsold, status executed', () => {
    // arrange
    setKeeper();
    fundRouters();
    setMid('stx', 300_000);
    routerMode('stx', 0, 1_234, 2_500);
    const tx = deposit(alice, 100_000, 40);
    expect(arm('stx', alice, tx, 0, 1_000, 250, 10).result).toBeOk(Cl.uint(99_000));
    const s0 = stx(alice);
    const b0 = sbtc(alice);
    // act
    const r = execute(tx, 0);
    // assert
    const spent = 99_000n - 1_234n;
    const out = (spent * 2_500n) / 1_000n;
    expect(r.result).toBeOk(Cl.tuple({
      ok: Cl.bool(true), code: Cl.uint(0), spent: Cl.uint(spent), out: Cl.uint(out), refund: Cl.uint(1_234),
    }));
    expect(stx(alice)).toBe(s0 + out);
    expect(sbtc(alice)).toBe(b0 + 1_234n);
    expect(sbtc(ESCROW)).toBe(0n);
    expect(stx(ESCROW)).toBe(0n);
    expect(parked()).toBe(0n);
    expect(status(tx, 0)).toBe(STATUS_EXECUTED);
    const last = cvToValue(simnet.callReadOnlyFn('mock-router-stx', 'get-last-call', [], deployer).result) as any;
    expect(BigInt(last.value.mid.value)).toBe(300_000n);
    expect(BigInt(last.value['limit-price'].value)).toBe((300_000n * (10_000n - 250n)) / 10_000n);
    expect(BigInt(last.value['min-out'].value)).toBe(10n);
    expect(last.value['has-update'].value).toBe(true);
  });

  it('usdcx fill pays mock-usdcx to the user', () => {
    // arrange
    setKeeper();
    fundRouters();
    routerMode('usdcx', 0, 0, 900);
    const tx = deposit(alice, 50_000, 41);
    expect(arm('usdcx', alice, tx, 0, 0).result).toBeOk(Cl.uint(50_000));
    // act
    const r = execute(tx, 0);
    // assert
    expect(r.result.type).toBe(ClarityType.ResponseOk);
    expect(usdcx(alice)).toBe(45_000n);
    expect(usdcx(ESCROW)).toBe(0n);
    expect(sbtc(ESCROW)).toBe(0n);
    expect(status(tx, 0)).toBe(STATUS_EXECUTED);
  });

  it('router err: swap rolled back, full net refunded, status executed (ok false)', () => {
    // arrange
    setKeeper();
    fundRouters();
    routerMode('stx', 1);
    const tx = deposit(alice, 20_000, 42);
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(20_000));
    const b0 = sbtc(alice);
    // act
    const r = execute(tx, 0);
    // assert
    expect(r.result).toBeOk(Cl.tuple({
      ok: Cl.bool(false), code: Cl.uint(3002), spent: Cl.uint(0), out: Cl.uint(0), refund: Cl.uint(20_000),
    }));
    expect(sbtc(alice)).toBe(b0 + 20_000n);
    expect(sbtc(ESCROW)).toBe(0n);
    expect(status(tx, 0)).toBe(STATUS_EXECUTED);
  });

  it('stale / fake update: refresh-mid errs, the order stays open, a fresh one executes later', () => {
    // arrange
    setKeeper();
    fundRouters();
    const tx = deposit(alice, 20_000, 43);
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(20_000));
    // act
    const r = execute(tx, 0, STALE);
    // assert
    expect(r.result).toBeErr(Cl.uint(1002));
    expect(status(tx, 0)).toBe(STATUS_OPEN);
    expect(parked()).toBe(20_000n);
    expect(execute(tx, 0).result.type).toBe(ClarityType.ResponseOk);
  });

  it('execute twice u4205; cancel after execute u4205; unknown key u4205', () => {
    // arrange
    setKeeper();
    fundRouters();
    const tx = deposit(alice, 20_000, 44);
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(20_000));
    expect(execute(tx, 0).result.type).toBe(ClarityType.ResponseOk);
    simnet.mineEmptyBlocks(40);
    // act / assert
    expect(execute(tx, 0).result).toBeErr(Cl.uint(4205));
    expect(cancel(tx, 0).result).toBeErr(Cl.uint(4205));
    expect(execute(txid(45), 0).result).toBeErr(Cl.uint(4205));
    expect(status(tx, 0)).toBe(STATUS_EXECUTED);
    expect(parked()).toBe(0n);
  });

  it('non-keeper u4204, revoked keeper u4204, paused u4203, at cancel-height u4211', () => {
    // arrange
    setKeeper();
    fundRouters();
    const tx = deposit(alice, 20_000, 46);
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(20_000));
    const ch = Number(getOrder(tx, 0)['cancel-height']);
    // act / assert
    expect(execute(tx, 0, UPDATE, stranger).result).toBeErr(Cl.uint(4204));
    expect(execute(tx, 0, UPDATE, alice).result).toBeErr(Cl.uint(4204));
    expect(owner('set-paused', [Cl.bool(true)]).result).toBeOk(Cl.bool(true));
    expect(execute(tx, 0).result).toBeErr(Cl.uint(4203));
    expect(owner('set-paused', [Cl.bool(false)]).result).toBeOk(Cl.bool(true));
    expect(owner('set-keeper', [Cl.principal(keeper), Cl.bool(false)]).result).toBeOk(Cl.bool(true));
    expect(execute(tx, 0).result).toBeErr(Cl.uint(4204));
    setKeeper();
    mineUntilNextTxAt(ch);
    expect(execute(tx, 0).result).toBeErr(Cl.uint(4211));
    expect(status(tx, 0)).toBe(STATUS_OPEN);
    expect(cancel(tx, 0).result).toBeOk(Cl.uint(20_000));
  });

  it('execute at cancel-height - 1 still fills', () => {
    // arrange
    setKeeper();
    fundRouters();
    const tx = deposit(alice, 20_000, 47);
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(20_000));
    mineUntilNextTxAt(Number(getOrder(tx, 0)['cancel-height']) - 1);
    // act
    const r = execute(tx, 0);
    // assert
    expect(r.result.type).toBe(ClarityType.ResponseOk);
    expect(status(tx, 0)).toBe(STATUS_EXECUTED);
  });

  it('overspend: a router that takes more than net aborts u4210, other orders untouched', () => {
    // arrange
    setKeeper();
    fundRouters();
    const t1 = deposit(alice, 20_000, 48);
    const t2 = deposit(bob, 30_000, 49);
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(20_000));
    expect(arm('stx', bob, t2, 0, 0).result).toBeOk(Cl.uint(30_000));
    routerMode('stx', 2, 0, 1000, 1);
    // act
    const r = execute(t1, 0);
    // assert
    expect(r.result).toBeErr(Cl.uint(4210));
    expect(sbtc(ESCROW)).toBe(50_000n);
    expect(parked()).toBe(50_000n);
    expect(status(t1, 0)).toBe(STATUS_OPEN);
    expect(status(t2, 0)).toBe(STATUS_OPEN);
  });

  it('gross outflow above net (book refund re-sold) is allowed up to 2 * net; above aborts', () => {
    // arrange
    setKeeper();
    fundRouters();
    const t1 = deposit(alice, 20_000, 50);
    const t2 = deposit(alice, 20_000, 51);
    const t3 = deposit(bob, 100_000, 52);
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(20_000));
    expect(arm('stx', alice, t2, 0, 0).result).toBeOk(Cl.uint(20_000));
    expect(arm('stx', bob, t3, 0, 0).result).toBeOk(Cl.uint(100_000));
    // act: gross = 2 * net
    routerMode('stx', 3, 0, 1000, 20_000);
    const ok = execute(t1, 0);
    // act: gross = 2 * net + 1
    routerMode('stx', 3, 0, 1000, 20_001);
    const over = execute(t2, 0);
    // assert
    expect(ok.result.type).toBe(ClarityType.ResponseOk);
    expect(status(t1, 0)).toBe(STATUS_EXECUTED);
    expect(over.result.type).toBe(ClarityType.ResponseErr);
    expect(status(t2, 0)).toBe(STATUS_OPEN);
    expect(parked()).toBe(120_000n);
    expect(sbtc(ESCROW)).toBe(120_000n);
  });

  it('lazer fee: keeper fronts it, router may pull it, the rest stays sweepable', () => {
    // arrange
    setKeeper();
    fundRouters();
    expect(owner('set-lazer-fee-ustx', [Cl.uint(1_000_001)]).result).toBeErr(Cl.uint(4214));
    expect(owner('set-lazer-fee-ustx', [Cl.uint(1_000)]).result).toBeOk(Cl.bool(true));
    const t1 = deposit(alice, 20_000, 53);
    const t2 = deposit(alice, 20_000, 54);
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(20_000));
    expect(arm('usdcx', alice, t2, 0, 0).result).toBeOk(Cl.uint(20_000));
    routerMode('usdcx', 0, 0, 1000, 0, 1_000);
    const k0 = stx(keeper);
    // act
    const r1 = execute(t1, 0); // stx router charges nothing: fee stays here
    const r2 = execute(t2, 0); // usdcx router pulls the fee
    // router pulling more than the fronted fee aborts
    const t3 = deposit(alice, 20_000, 55);
    expect(arm('usdcx', alice, t3, 0, 0).result).toBeOk(Cl.uint(20_000));
    routerMode('usdcx', 0, 0, 1000, 0, 1_001);
    const r3 = execute(t3, 0);
    // assert
    expect(r1.result.type).toBe(ClarityType.ResponseOk);
    expect(r2.result.type).toBe(ClarityType.ResponseOk);
    expect(r3.result.type).toBe(ClarityType.ResponseErr);
    expect(status(t3, 0)).toBe(STATUS_OPEN);
    expect(stx(keeper)).toBe(k0 - 2_000n);
    expect(stx(ESCROW)).toBe(1_000n);
    expect(owner('sweep-stx', [Cl.uint(1_000), Cl.principal(keeper)], alice).result).toBeErr(Cl.uint(4200));
    expect(owner('sweep-stx', [Cl.uint(1_000), Cl.principal(keeper)]).result).toBeOk(Cl.bool(true));
    expect(stx(ESCROW)).toBe(0n);
  });
});

describe('cancel', () => {
  it('before cancel-height u4206; at it a stranger refunds the user; twice u4205; execute after u4205', () => {
    // arrange
    setKeeper();
    fundRouters();
    const tx = deposit(alice, 20_000, 60);
    expect(arm('usdcx', alice, tx, 0, 100).result).toBeOk(Cl.uint(19_900));
    const ch = Number(getOrder(tx, 0)['cancel-height']);
    // act / assert
    expect(cancel(tx, 0, alice).result).toBeErr(Cl.uint(4206));
    mineUntilNextTxAt(ch - 1);
    expect(cancel(tx, 0).result).toBeErr(Cl.uint(4206));
    expect(nextTxHeight()).toBe(ch);
    const a0 = sbtc(alice);
    const s0 = sbtc(stranger);
    expect(cancel(tx, 0).result).toBeOk(Cl.uint(19_900)); // runs at cancel-height
    expect(sbtc(alice)).toBe(a0 + 19_900n);
    expect(sbtc(stranger)).toBe(s0);
    expect(status(tx, 0)).toBe(STATUS_CANCELLED);
    expect(parked()).toBe(0n);
    expect(cancel(tx, 0).result).toBeErr(Cl.uint(4205));
    expect(cancel(tx, 0, alice).result).toBeErr(Cl.uint(4205));
    expect(execute(tx, 0).result).toBeErr(Cl.uint(4205));
    expect(cancel(txid(61), 0).result).toBeErr(Cl.uint(4205));
  });

  it('cancel works while paused', () => {
    // arrange
    const tx = deposit(alice, 20_000, 62);
    expect(arm('stx', alice, tx, 0, 0).result).toBeOk(Cl.uint(20_000));
    expect(owner('set-paused', [Cl.bool(true)]).result).toBeOk(Cl.bool(true));
    simnet.mineEmptyBlocks(31);
    // act
    const r = cancel(tx, 0);
    // assert
    expect(r.result).toBeOk(Cl.uint(20_000));
    expect(status(tx, 0)).toBe(STATUS_CANCELLED);
  });
});

describe('sweep never touches parked sats', () => {
  it('only the balance above parked leaves; owner-only', () => {
    // arrange
    const t1 = deposit(alice, 40_000, 70);
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(40_000));
    // a donation outside any order
    expect(simnet.callPublicFn(`${SIGNER}.sbtc-token`, 'transfer',
      [Cl.uint(5_000), Cl.principal(bob), Cl.principal(ESCROW), Cl.none()], bob).result).toBeOk(Cl.bool(true));
    // act / assert
    expect(owner('sweep-sbtc', [Cl.uint(1), Cl.principal(stranger)], alice).result).toBeErr(Cl.uint(4200));
    expect(owner('sweep-sbtc', [Cl.uint(5_001), Cl.principal(stranger)]).result).toBeErr(Cl.uint(4212));
    expect(owner('sweep-sbtc', [Cl.uint(40_000), Cl.principal(stranger)]).result).toBeErr(Cl.uint(4212));
    const s0 = sbtc(stranger);
    expect(owner('sweep-sbtc', [Cl.uint(5_000), Cl.principal(stranger)]).result).toBeOk(Cl.bool(true));
    expect(sbtc(stranger)).toBe(s0 + 5_000n);
    expect(owner('sweep-sbtc', [Cl.uint(1), Cl.principal(stranger)]).result).toBeErr(Cl.uint(4212));
    expect(sbtc(ESCROW)).toBe(40_000n);
    expect(parked()).toBe(40_000n);
    // the order still refunds in full
    simnet.mineEmptyBlocks(31);
    expect(cancel(t1, 0).result).toBeOk(Cl.uint(40_000));
    expect(sbtc(ESCROW)).toBe(0n);
  });

  it('sweep 0 with nothing stray is a no-op ok', () => {
    // arrange
    const t1 = deposit(alice, 40_000, 71);
    expect(arm('stx', alice, t1, 0, 0).result).toBeOk(Cl.uint(40_000));
    // act
    const r = owner('sweep-sbtc', [Cl.uint(0), Cl.principal(stranger)]);
    // assert
    expect(r.result).toBeOk(Cl.bool(true));
    expect(sbtc(ESCROW)).toBe(40_000n);
  });
});

describe('parked == sum of open orders net, at every step', () => {
  it('mixed lifecycle across users, routes, router modes and sweeps', () => {
    // arrange
    setKeeper();
    fundRouters();
    const keys: Array<[Uint8Array, number]> = [];
    const users = [alice, bob, stranger];
    let id = 100;
    // act / assert: every step re-derives the sum from the order rows
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < 3; i++) {
        const user = users[(round + i) % 3];
        const amount = 1_000 + round * 7_919 + i * 104_729;
        const t = deposit(user, amount, id++, i % 2);
        keys.push([t, i % 2]);
        arm(i % 2 ? 'usdcx' : 'stx', user, t, i % 2, (round * 131 + i) % 2_000);
        expectParkedMatches(keys);
      }
      const [t0, v0] = keys[keys.length - 3];
      routerMode('stx', round % 2, round * 10);
      routerMode('usdcx', round % 2 ? 0 : 1, round * 3, 1_100);
      execute(t0, v0);
      expectParkedMatches(keys);
      execute(t0, v0); // second time fails
      expectParkedMatches(keys);
      if (round % 2) {
        simnet.mineEmptyBlocks(31);
        const [t1, v1] = keys[keys.length - 2];
        cancel(t1, v1);
        expectParkedMatches(keys);
        cancel(t1, v1);
        expectParkedMatches(keys);
      }
      simnet.callPublicFn(`${SIGNER}.sbtc-token`, 'transfer',
        [Cl.uint(777), Cl.principal(bob), Cl.principal(ESCROW), Cl.none()], bob);
      const stray = sbtc(ESCROW) - parked();
      expect(owner('sweep-sbtc', [Cl.uint(stray + 1n), Cl.principal(deployer)]).result).toBeErr(Cl.uint(4212));
      expect(owner('sweep-sbtc', [Cl.uint(stray), Cl.principal(deployer)]).result).toBeOk(Cl.bool(true));
      expectParkedMatches(keys);
      expect(sbtc(ESCROW)).toBe(parked());
    }
    // drain: everything still open refunds exactly
    simnet.mineEmptyBlocks(31);
    for (const [t, v] of keys) if (status(t, v) === STATUS_OPEN) expect(cancel(t, v).result.type).toBe(ClarityType.ResponseOk);
    expect(parked()).toBe(0n);
    expect(sbtc(ESCROW)).toBe(0n);
    for (const [t, v] of keys) expect([STATUS_EXECUTED, STATUS_CANCELLED]).toContain(status(t, v));
  });
});
