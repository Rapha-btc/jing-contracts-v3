import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Cl, getAddressFromPrivateKey } from '@stacks/transactions';

const DEPLOYER = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CORE = `${DEPLOYER}.jing-core-v6`;
const MARKET = `${DEPLOYER}.markets-sbtc-usdcx-jing-v6-4`;
const LADDER = `${DEPLOYER}.jing-ladder-sbtc-usdcx-v1`;
const DISPATCH = `${DEPLOYER}.jing-ladder-dispatch-sbtc-usdcx`;
const BATCH = `${DEPLOYER}.jing-settle-batch-sbtc-usdcx`;
const ROUTER = `${DEPLOYER}.swap-router-sbtc-usdcx-jing-v5-5`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDCX_V1 = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx-v1';
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const DIA = 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const CORE_OWNER_EXPECTED = 'SM1N7VX04M1TT23KD7YHVD6H6413QV2ZNJFTWVF9P';
const TAKER = getAddressFromPrivateKey('5'.repeat(64) + '01', 'mainnet');
const BANDS = [10, 20, 50];
const BPS = 10_000n;
const BUY_PER_RUNG = 200_000_000n; // 200 USDCx, six decimals
const SELL_PER_RUNG = 200_000n; // 0.002 sBTC, eight decimals
const SOURCE_DIR = 'contracts/sbtc-usdcx';
const FIXTURE_PATH = 'tests/unit/sbtc-usdcx/fixtures/pyth-lazer-sbtc-usdcx.json';

type LazerFixture = {
  pair: string;
  forkHeight: number;
  forkBlockTime: number;
  forkBlockHash: string;
  feedIds: number[];
  timestampUs: string;
  exponent: number;
  priceX: string;
  priceY: string;
  hex: string;
  hexSha256: string;
};

function readFixture(): LazerFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as LazerFixture;
}

function contractSource(name: string): string {
  return readFileSync(`${SOURCE_DIR}/${name}.clar`, 'utf8');
}

function contractId(name: string): string {
  return `${DEPLOYER}.${name}`;
}

function deployFrom(name: string, file: string): void {
  const receipt = simnet.deployContract(name, contractSource(file), { clarityVersion: 5 }, DEPLOYER);
  expect(receipt.result, `deploy ${contractId(name)} from ${file}.clar`).toEqual(Cl.bool(true));
}

function deployBuyRungWithBurnProbe(): string {
  const id = rung('buy', 10);
  // Contract principals cannot be transaction senders in Clarinet's SDK. This
  // test-only entry point uses the rung's own as-contract context to exercise
  // the live USDCx protocol-burn path against its balance. The production
  // rung source and all of its functions remain byte-identical.
  const source = `${contractSource('jing-buy-sbtc-bps')}

(define-public (test-protocol-burn-usdcx (amount uint))
  (begin
    (try! (as-contract? ((with-ft USDCX USDCX_NAME amount))
      (try! (contract-call? '${USDCX_V1} burn amount u0 0x0000000000000000000000000000000000000000000000000000000000000000))
    ))
    (ok true)
  )
)
`;
  const receipt = simnet.deployContract('jing-buy-sbtc-10', source, { clarityVersion: 5 }, DEPLOYER);
  expect(receipt.result, `deploy ${id} with test-only USDCx burn probe`).toEqual(Cl.bool(true));
  expect(call(LADDER, 'set-canonical', [Cl.stringAscii('buy-band'), Cl.principal(id)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
  expect(call(id, 'initialize', [Cl.uint(10), Cl.bool(false)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
  return id;
}

function call(contract: string, method: string, args: any[], sender: string): any {
  return simnet.callPublicFn(contract, method, args, sender).result;
}

function read(contract: string, method: string, args: any[] = [], sender = DEPLOYER): any {
  return simnet.callReadOnlyFn(contract, method, args, sender).result;
}

function rawUint(value: any): bigint {
  if (value?.type === 'uint') return value.value;
  if (value?.type === 'ok' && value.value?.type === 'uint') return value.value.value;
  throw new Error(`expected uint/ok uint, received ${JSON.stringify(value)}`);
}

function principalValue(value: any): string {
  if (value?.type !== 'address' && value?.type !== 'principal') throw new Error(`expected principal, received ${JSON.stringify(value)}`);
  return value.value;
}

function fieldUint(value: any, field: string): bigint {
  const tuple = value?.type === 'ok' ? value.value : value;
  const result = tuple?.value?.[field];
  if (result?.type !== 'uint') throw new Error(`expected uint field ${field}`);
  return result.value;
}

function fieldInt(value: any, field: string): bigint {
  const tuple = value?.type === 'ok' ? value.value : value;
  const result = tuple?.value?.[field];
  if (result?.type !== 'int') throw new Error(`expected int field ${field}`);
  return result.value;
}

function maybeUint(value: any): bigint {
  if (value?.type === 'uint') return value.value;
  if (value?.type === 'some' && value.value?.type === 'uint') return value.value.value;
  if (value?.type === 'ok' && value.value?.type === 'uint') return value.value.value;
  if (value?.type === 'ok' && value.value?.type === 'some' && value.value.value?.type === 'uint') return value.value.value.value;
  throw new Error(`expected uint or optional uint, received ${JSON.stringify(value)}`);
}

function dlmmThreshold(limit: bigint, sellSbtc: boolean, fee: bigint): bigint {
  if (sellSbtc) {
    return (limit * 100_000_000n * BPS + 10_000_000_000n * (BPS - fee) - 1n) / (10_000_000_000n * (BPS - fee));
  }
  return (limit * 100_000_000n * (BPS - fee)) / (10_000_000_000n * BPS);
}

function limitForThreshold(target: bigint, sellSbtc: boolean, fee: bigint): bigint {
  if (sellSbtc) {
    return ((target - 1n) * 10_000_000_000n * (BPS - fee)) / (100_000_000n * BPS);
  }
  return (target * 10_000_000_000n * BPS) / (100_000_000n * (BPS - fee));
}

function setupBase(minTokenY = 1_000_000n): string {
  deployFrom('jing-ladder-sbtc-usdcx-v1', 'jing-ladder-sbtc-usdcx-v1');
  deployFrom('markets-sbtc-usdcx-jing-v6-4', 'markets-sbtc-usdcx-jing-v6-4');
  const coreOwner = principalValue(read(CORE, 'get-contract-owner'));
  expect(coreOwner).toBe(CORE_OWNER_EXPECTED);
  expect(call(CORE, 'set-verified-contract', [Cl.principal(MARKET)], coreOwner)).toEqual(Cl.ok(Cl.bool(true)));
  expect(call(MARKET, 'set-operator', [Cl.principal(coreOwner)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
  expect(call(MARKET, 'initialize', [
    Cl.principal(MARKET), Cl.principal(SBTC), Cl.principal(SBTC),
    Cl.uint(1_000), Cl.uint(minTokenY), Cl.uint(1), Cl.uint(7),
  ], coreOwner)).toEqual(Cl.error(Cl.uint(1013)));
  expect(call(MARKET, 'initialize', [
    Cl.principal(MARKET), Cl.principal(SBTC), Cl.principal(USDCX),
    Cl.uint(1_000), Cl.uint(minTokenY), Cl.uint(1), Cl.uint(7),
  ], coreOwner)).toEqual(Cl.ok(Cl.bool(true)));
  expect(call(MARKET, 'set-operator', [Cl.principal(DEPLOYER)], coreOwner)).toEqual(Cl.ok(Cl.bool(true)));
  return coreOwner;
}

function setupBuyRung(): string {
  const id = rung('buy', 10);
  deployFrom('jing-buy-sbtc-10', 'jing-buy-sbtc-bps');
  expect(call(LADDER, 'set-canonical', [Cl.stringAscii('buy-band'), Cl.principal(id)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
  expect(call(id, 'initialize', [Cl.uint(10), Cl.bool(false)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
  return id;
}

function balance(token: string, who: string): bigint {
  return rawUint(read(token, 'get-balance', [Cl.principal(who)]));
}

function rung(side: 'buy' | 'sell', bps: number): string {
  return contractId(`jing-${side}-sbtc-${bps}`);
}

function updateBuffer(fixture: LazerFixture): any {
  return Cl.buffer(Buffer.from(fixture.hex, 'hex'));
}

function allocations(entries: Array<{ rung: string; amount: bigint }>): any {
  return Cl.list(entries.map(function (entry) {
    return Cl.tuple({ rung: Cl.principal(entry.rung), amount: Cl.uint(entry.amount) });
  }));
}

function pendingFor(side: 'x' | 'y', who: string): boolean {
  return read(MARKET, `get-token-${side}-pending-deposit`, [Cl.principal(who)]).type === 'some';
}

function settleRequest(side: 'x' | 'y', who: string): any {
  return Cl.tuple({ who: Cl.principal(who), x: Cl.bool(side === 'x'), kind: Cl.uint(0) });
}

function liveAmount(side: 'x' | 'y', cycle: bigint, who: string): bigint {
  return rawUint(read(MARKET, `get-token-${side}-deposit`, [Cl.uint(cycle), Cl.principal(who)]));
}

function rungList(side: 'buy' | 'sell'): string[] {
  return BANDS.map(function (bps) { return rung(side, bps); });
}

function plainTupleField(value: any, field: string): bigint {
  return fieldUint(value, field);
}

describe('sbtc-usdcx deploy set on a pinned mainnet fork', function () {
  it('deploys, settles, routes both directions, pays rung shares, and returns no router balances', function () {
    const fixture = readFixture();
    const update = updateBuffer(fixture);
    const updateHash = createHash('sha256').update(Buffer.from(fixture.hex, 'hex')).digest('hex');
    expect(fixture.pair).toBe('sbtc-usdcx');
    expect(fixture.forkHeight).toBe(9318170);
    expect(fixture.feedIds).toEqual([1, 7]);
    expect(fixture.exponent).toBe(-8);
    expect(updateHash).toBe(fixture.hexSha256);

    // The market statically links its issuer-local ladder. The live core owner
    // is the Juice multisig, so market verification and initialization follow
    // the owner/operator handoff used by the mainnet-fork stxer harness.
    setupBase();

    for (const bps of BANDS) {
      deployFrom(`jing-buy-sbtc-${bps}`, 'jing-buy-sbtc-bps');
      deployFrom(`jing-sell-sbtc-${bps}`, 'jing-sell-sbtc-bps');
    }
    expect(call(LADDER, 'set-canonical', [Cl.stringAscii('buy-band'), Cl.principal(rung('buy', 10))], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
    expect(call(LADDER, 'set-canonical', [Cl.stringAscii('sel-band'), Cl.principal(rung('sell', 10))], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
    for (const bps of BANDS) {
      expect(call(rung('buy', bps), 'initialize', [Cl.uint(bps), Cl.bool(true)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
      expect(call(rung('sell', bps), 'initialize', [Cl.uint(bps), Cl.bool(true)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
    }
    deployFrom('jing-ladder-dispatch-sbtc-usdcx', 'jing-ladder-dispatch-sbtc-usdcx');
    deployFrom('jing-settle-batch-sbtc-usdcx', 'jing-settle-batch-sbtc-usdcx');
    deployFrom('swap-router-sbtc-usdcx-jing-v5-5', 'swap-router-sbtc-usdcx-jing-v5-5');

    // Confirm token precision and the exact initialize min-deposit units.
    expect(read(USDCX, 'get-decimals')).toEqual(Cl.ok(Cl.uint(6)));
    expect(read(SBTC, 'get-decimals')).toEqual(Cl.ok(Cl.uint(8)));
    const minDeposits = read(MARKET, 'get-min-deposits');
    expect(fieldUint(minDeposits, 'min-token-x')).toBe(1_000n);
    expect(fieldUint(minDeposits, 'min-token-y')).toBe(1_000_000n);

    // Fund a fixed mainnet-format taker from the live token whales.
    expect(call(SBTC, 'transfer', [Cl.uint(1_000_000), Cl.principal(SBTC_WHALE), Cl.principal(TAKER), Cl.none()], SBTC_WHALE)).toEqual(Cl.ok(Cl.bool(true)));
    expect(call(USDCX, 'transfer', [Cl.uint(1_000_000_000), Cl.principal(USDC_WHALE), Cl.principal(TAKER), Cl.none()], USDC_WHALE)).toEqual(Cl.ok(Cl.bool(true)));

    const mid = BigInt(fixture.priceX) * 100_000_000n / BigInt(fixture.priceY);
    expect(mid).toBeGreaterThan(0n);
    const pool = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-10';
    const routerBalance = function (): { sbtc: bigint; usdcx: bigint } {
      return { sbtc: balance(SBTC, ROUTER), usdcx: balance(USDCX, ROUTER) };
    };

    // USDCx's one-micro unit is below one sat at this quote and must be dust,
    // with the minimum-output guard rolling back the attempted route.
    const dustBalance = balance(USDCX, TAKER);
    expect(call(ROUTER, 'smart-swap-usdcx-for-sbtc', [
      Cl.uint(1), Cl.uint(mid * 10_300n / BPS), Cl.some(update), Cl.uint(mid), Cl.uint(1),
    ], TAKER)).toEqual(Cl.error(Cl.uint(3002)));
    expect(balance(USDCX, TAKER)).toBe(dustBalance);

    // DLMM-only fills in both directions, before any Jing orders are placed.
    const poolSbtc0 = balance(SBTC, pool);
    const poolUsdcx0 = balance(USDCX, pool);
    const takerSbtc0 = balance(SBTC, TAKER);
    const takerUsdcx0 = balance(USDCX, TAKER);
    const dlmmSell = call(ROUTER, 'smart-swap-sbtc-for-usdcx', [
      Cl.uint(100_000), Cl.uint(mid * 9_700n / BPS), Cl.some(update), Cl.uint(mid), Cl.uint(1),
    ], TAKER);
    expect(dlmmSell.type).toBe('ok');
    expect(plainTupleField(dlmmSell, 'jing-in')).toBe(0n);
    expect(plainTupleField(dlmmSell, 'dlmm-in')).toBe(100_000n);
    const dlmmSellOut = plainTupleField(dlmmSell, 'out');
    expect(balance(SBTC, TAKER)).toBe(takerSbtc0 - 100_000n);
    expect(balance(USDCX, TAKER)).toBe(takerUsdcx0 + dlmmSellOut);
    expect(balance(SBTC, pool)).toBe(poolSbtc0 + 100_000n);
    expect(balance(USDCX, pool)).toBe(poolUsdcx0 - dlmmSellOut);

    const poolSbtc1 = balance(SBTC, pool);
    const poolUsdcx1 = balance(USDCX, pool);
    const takerSbtc1 = balance(SBTC, TAKER);
    const takerUsdcx1 = balance(USDCX, TAKER);
    const dlmmBuy = call(ROUTER, 'smart-swap-usdcx-for-sbtc', [
      Cl.uint(80_000_000), Cl.uint(mid * 10_300n / BPS), Cl.some(update), Cl.uint(mid), Cl.uint(1),
    ], TAKER);
    expect(dlmmBuy.type).toBe('ok');
    expect(plainTupleField(dlmmBuy, 'jing-in')).toBe(0n);
    expect(plainTupleField(dlmmBuy, 'dlmm-in')).toBe(80_000_000n);
    const dlmmBuyOut = plainTupleField(dlmmBuy, 'out');
    expect(balance(USDCX, TAKER)).toBe(takerUsdcx1 - 80_000_000n);
    expect(balance(SBTC, TAKER)).toBe(takerSbtc1 + dlmmBuyOut);
    expect(balance(USDCX, pool)).toBe(poolUsdcx1 + 80_000_000n);
    expect(balance(SBTC, pool)).toBe(poolSbtc1 - dlmmBuyOut);

    // Rest live market orders and prove the router splits each direction
    // between the verified market and the live Bitflow pool.
    const ask = mid * (BPS + 10n) / BPS;
    const bid = mid * (BPS - 10n) / BPS;
    expect(call(MARKET, 'deposit-token-x', [Cl.uint(100_000), Cl.uint(ask), Cl.none(), Cl.principal(SBTC), Cl.stringAscii('sbtc-token')], SBTC_WHALE).type).toBe('ok');
    expect(call(MARKET, 'deposit-token-y', [Cl.uint(100_000_000), Cl.uint(bid), Cl.none(), Cl.principal(USDCX), Cl.stringAscii('usdcx-token')], USDC_WHALE).type).toBe('ok');
    if (pendingFor('x', SBTC_WHALE)) {
      expect(call(MARKET, 'settle-token-x-deposit', [Cl.principal(SBTC_WHALE), update, Cl.principal(SBTC), Cl.stringAscii('sbtc-token')], DEPLOYER).type).toBe('ok');
    }
    if (pendingFor('y', USDC_WHALE)) {
      expect(call(MARKET, 'settle-token-y-deposit', [Cl.principal(USDC_WHALE), update, Cl.principal(USDCX), Cl.stringAscii('usdcx-token')], DEPLOYER).type).toBe('ok');
    }
    const cycle = rawUint(read(MARKET, 'get-current-cycle'));
    expect(liveAmount('x', cycle, SBTC_WHALE)).toBe(100_000n);
    expect(liveAmount('y', cycle, USDC_WHALE)).toBe(100_000_000n);

    const makerXUsdc0 = balance(USDCX, SBTC_WHALE);
    const mixedBuy = call(ROUTER, 'smart-swap-usdcx-for-sbtc', [
      Cl.uint(300_000_000), Cl.uint(mid * 10_300n / BPS), Cl.some(update), Cl.uint(mid), Cl.uint(1),
    ], TAKER);
    expect(mixedBuy.type).toBe('ok');
    const mixedBuyJing = plainTupleField(mixedBuy, 'jing-in');
    const mixedBuyDlmm = plainTupleField(mixedBuy, 'dlmm-in');
    expect(mixedBuyJing).toBeGreaterThan(0n);
    expect(mixedBuyDlmm).toBeGreaterThan(0n);
    expect(mixedBuyJing + mixedBuyDlmm + plainTupleField(mixedBuy, 'unsold')).toBe(300_000_000n);
    expect(plainTupleField(mixedBuy, 'out')).toBe(plainTupleField(mixedBuy, 'jing-out') + plainTupleField(mixedBuy, 'dlmm-out'));
    expect(balance(USDCX, SBTC_WHALE)).toBeGreaterThan(makerXUsdc0);

    const makerYSbtc0 = balance(SBTC, USDC_WHALE);
    const mixedSell = call(ROUTER, 'smart-swap-sbtc-for-usdcx', [
      Cl.uint(300_000), Cl.uint(mid * 9_700n / BPS), Cl.some(update), Cl.uint(mid), Cl.uint(1),
    ], TAKER);
    expect(mixedSell.type).toBe('ok');
    const mixedSellJing = plainTupleField(mixedSell, 'jing-in');
    const mixedSellDlmm = plainTupleField(mixedSell, 'dlmm-in');
    expect(mixedSellJing).toBeGreaterThan(0n);
    expect(mixedSellDlmm).toBeGreaterThan(0n);
    expect(mixedSellJing + mixedSellDlmm + plainTupleField(mixedSell, 'unsold')).toBe(300_000n);
    expect(plainTupleField(mixedSell, 'out')).toBe(plainTupleField(mixedSell, 'jing-out') + plainTupleField(mixedSell, 'dlmm-out'));
    expect(balance(SBTC, USDC_WHALE)).toBeGreaterThan(makerYSbtc0);

    // Dispatch member liquidity into the 10/20/50 bps ladders, settle any
    // pending deposits in one batch, and verify the six-decimal/8-decimal
    // amount accounting on-chain.
    expect(call(DISPATCH, 'deposit-buy', [Cl.uint(BUY_PER_RUNG * 3n), allocations(BANDS.map(function (bps) {
      return { rung: rung('buy', bps), amount: BUY_PER_RUNG };
    }))], USDC_WHALE).type).toBe('ok');
    expect(call(DISPATCH, 'deposit-sell', [Cl.uint(SELL_PER_RUNG * 3n), allocations(BANDS.map(function (bps) {
      return { rung: rung('sell', bps), amount: SELL_PER_RUNG };
    }))], SBTC_WHALE).type).toBe('ok');

    const requests: any[] = [];
    for (const bps of BANDS) {
      if (pendingFor('y', rung('buy', bps))) requests.push(settleRequest('y', rung('buy', bps)));
      if (pendingFor('x', rung('sell', bps))) requests.push(settleRequest('x', rung('sell', bps)));
    }
    if (requests.length > 0) {
      const settled = call(BATCH, 'settle-many', [update, Cl.list(requests)], DEPLOYER);
      expect(settled.type).toBe('ok');
      expect(fieldUint(settled, 'settled')).toBe(BigInt(requests.length));
      const codes = settled.value.value.codes.value.map(function (code: any) { return code.value; });
      expect(codes).toEqual(requests.map(function () { return 0n; }));
    }
    const rungCycle = rawUint(read(MARKET, 'get-current-cycle'));
    for (const bps of BANDS) {
      expect(liveAmount('y', rungCycle, rung('buy', bps))).toBe(BUY_PER_RUNG);
      expect(liveAmount('x', rungCycle, rung('sell', bps))).toBe(SELL_PER_RUNG);
    }

    // Fill one bid and one ask so maker claim payouts use the correct token
    // units; then withdraw untouched shares from the wider rung.
    const buyMakerUsdc0 = balance(USDCX, USDC_WHALE);
    const buyMakerSbtc0 = balance(SBTC, USDC_WHALE);
    const takeBid = call(ROUTER, 'smart-swap-sbtc-for-usdcx', [
      Cl.uint(100_000), Cl.uint(mid * 9_700n / BPS), Cl.some(update), Cl.uint(mid), Cl.uint(1),
    ], TAKER);
    expect(takeBid.type).toBe('ok');
    expect(plainTupleField(takeBid, 'jing-in')).toBeGreaterThan(0n);
    const buyMakerUsdc1 = balance(USDCX, USDC_WHALE);
    const buyMakerSbtc1 = balance(SBTC, USDC_WHALE);
    expect(call(DISPATCH, 'claim-buy', [Cl.list(rungList('buy').map(function (id) { return Cl.principal(id); }))], USDC_WHALE).type).toBe('ok');
    expect(balance(SBTC, USDC_WHALE)).toBeGreaterThan(buyMakerSbtc1);
    expect(balance(USDCX, USDC_WHALE)).toBe(buyMakerUsdc1);
    expect(buyMakerUsdc1).toBeGreaterThanOrEqual(buyMakerUsdc0);
    expect(buyMakerSbtc0).toBeGreaterThan(0n);

    const sellMakerUsdc0 = balance(USDCX, SBTC_WHALE);
    const sellMakerSbtc0 = balance(SBTC, SBTC_WHALE);
    const takeAsk = call(ROUTER, 'smart-swap-usdcx-for-sbtc', [
      Cl.uint(100_000_000), Cl.uint(mid * 10_300n / BPS), Cl.some(update), Cl.uint(mid), Cl.uint(1),
    ], TAKER);
    expect(takeAsk.type).toBe('ok');
    expect(plainTupleField(takeAsk, 'jing-in')).toBeGreaterThan(0n);
    const sellMakerUsdc1 = balance(USDCX, SBTC_WHALE);
    const sellMakerSbtc1 = balance(SBTC, SBTC_WHALE);
    expect(call(DISPATCH, 'claim-sell', [Cl.list(rungList('sell').map(function (id) { return Cl.principal(id); }))], SBTC_WHALE).type).toBe('ok');
    expect(balance(USDCX, SBTC_WHALE)).toBeGreaterThan(sellMakerUsdc1);
    expect(balance(SBTC, SBTC_WHALE)).toBe(sellMakerSbtc1);
    expect(sellMakerSbtc1).toBeLessThanOrEqual(sellMakerSbtc0);
    expect(sellMakerUsdc0).toBeGreaterThan(0n);

    const buyWithdrawBefore = balance(USDCX, USDC_WHALE);
    expect(call(DISPATCH, 'withdraw-buy', [allocations([{ rung: rung('buy', 50), amount: 50_000_000n }]), Cl.some(update)], USDC_WHALE).type).toBe('ok');
    expect(balance(USDCX, USDC_WHALE) - buyWithdrawBefore).toBe(50_000_000n);
    const sellWithdrawBefore = balance(SBTC, SBTC_WHALE);
    expect(call(DISPATCH, 'withdraw-sell', [allocations([{ rung: rung('sell', 50), amount: 50_000n }]), Cl.some(update)], SBTC_WHALE).type).toBe('ok');
    expect(balance(SBTC, SBTC_WHALE) - sellWithdrawBefore).toBe(50_000n);

    // The router must forward/refund all input dust and output tokens; it may
    // never custody either asset after completed route and ladder operations.
    expect(routerBalance()).toEqual({ sbtc: 0n, usdcx: 0n });

  });

  it('selects DLMM pool 2 when its own bin-step-1 quote is best', function () {
    setupBase();
    deployFrom('swap-router-sbtc-usdcx-jing-v5-5', 'swap-router-sbtc-usdcx-jing-v5-5');
    const pool1 = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-10';
    const pool2 = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-1';
    const pool3 = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-2-bps-10';
    const info1 = read(pool1, 'get-pool');
    const info2 = read(pool2, 'get-pool');
    expect(fieldUint(info2, 'bin-step')).toBe(1n);

    const active1 = fieldInt(info1, 'active-bin-id');
    const active2 = fieldInt(info2, 'active-bin-id');
    const price1 = maybeUint(read(DLMM_CORE, 'get-bin-price', [
      Cl.uint(fieldUint(info1, 'initial-price')), Cl.uint(fieldUint(info1, 'bin-step')), Cl.int(active1),
    ]));
    const price2 = maybeUint(read(DLMM_CORE, 'get-bin-price', [
      Cl.uint(fieldUint(info2, 'initial-price')), Cl.uint(fieldUint(info2, 'bin-step')), Cl.int(active2),
    ]));
    expect(price1).not.toBe(price2);

    // Add real forked LP through Bitflow's public core entry point. The target
    // gets just over the router's 1% depth floor, plus enough active-bin
    // liquidity to make a positive quote. This keeps the pool's step, fee,
    // price and active-bin formulas live while creating a deterministic pick.
    const sellSbtc = price2 > price1;
    const outputToken = sellSbtc ? USDCX : SBTC;
    const depths = [pool1, pool2, pool3].map(function (pool) { return balance(outputToken, pool); });
    const deepest = depths.reduce(function (max, value) { return value > max ? value : max; }, 0n);
    const requiredDepth = deepest / 100n + 1n;
    const inputAmount = sellSbtc ? 100_000n : 100_000_000n;
    const quoteReserve = sellSbtc ? 100_000_000n : 100_000n;
    const depthTopUp = requiredDepth > depths[1] ? requiredDepth - depths[1] : 0n;
    const liquidity = depthTopUp + quoteReserve;
    const lp = sellSbtc ? USDC_WHALE : SBTC_WHALE;
    const xLiquidity = sellSbtc ? 0n : liquidity;
    const yLiquidity = sellSbtc ? liquidity : 0n;
    expect(call(DLMM_CORE, 'add-liquidity', [
      Cl.principal(pool2), Cl.principal(SBTC), Cl.principal(USDCX), Cl.int(active2),
      Cl.uint(xLiquidity), Cl.uint(yLiquidity), Cl.uint(1), Cl.uint(liquidity), Cl.uint(liquidity),
    ], lp).type).toBe('ok');

    const fee = fieldUint(info2, sellSbtc ? 'x-protocol-fee' : 'y-protocol-fee')
      + fieldUint(info2, sellSbtc ? 'x-provider-fee' : 'y-provider-fee')
      + fieldUint(info2, sellSbtc ? 'x-variable-fee' : 'y-variable-fee');
    const targetThreshold = (price1 + price2) / 2n;
    const baseLimit = limitForThreshold(targetThreshold, sellSbtc, fee);
    let limit = 0n;
    for (let offset = -5n; offset <= 5n; offset += 1n) {
      const candidate = baseLimit + offset;
      if (candidate <= 0n) continue;
      const threshold = dlmmThreshold(candidate, sellSbtc, fee);
      const selectsPool2 = sellSbtc
        ? price2 >= threshold && threshold > price1
        : price2 <= threshold && threshold < price1;
      if (selectsPool2) {
        limit = candidate;
        break;
      }
    }
    expect(limit, `fork pool prices must admit a limit selecting pool 2: ${price1}, ${price2}`).toBeGreaterThan(0n);

    const quote1 = rawUint(simnet.callPrivateFn(ROUTER, 'dlmm-out', [Cl.uint(1), Cl.uint(inputAmount), Cl.bool(sellSbtc), Cl.uint(limit)], DEPLOYER).result);
    const quote2 = rawUint(simnet.callPrivateFn(ROUTER, 'dlmm-out', [Cl.uint(2), Cl.uint(inputAmount), Cl.bool(sellSbtc), Cl.uint(limit)], DEPLOYER).result);
    const quote3 = rawUint(simnet.callPrivateFn(ROUTER, 'dlmm-out', [Cl.uint(3), Cl.uint(inputAmount), Cl.bool(sellSbtc), Cl.uint(limit)], DEPLOYER).result);
    const pick = simnet.callPrivateFn(ROUTER, 'dlmm-pick', [Cl.bool(sellSbtc), Cl.uint(inputAmount), Cl.uint(limit)], DEPLOYER).result;
    expect(quote2).toBeGreaterThan(0n);
    expect(quote2).toBeGreaterThanOrEqual(quote1);
    expect(quote2).toBeGreaterThanOrEqual(quote3);
    expect(pick).toEqual(Cl.uint(2));
  });

  it('returns zero after live DIA BTC/USD is older than 7200 seconds', function () {
    setupBase();
    const buy = setupBuyRung();
    const dia = read(DIA, 'get-value', [Cl.stringAscii('BTC/USD')]);
    const diaTime = fieldUint(dia, 'timestamp') / 1_000n;
    const before = rawUint(simnet.execute('stacks-block-time').result);
    expect(rawUint(read(buy, 'miner-mid'))).toBeGreaterThan(0n);
    const target = diaTime + 7_201n;
    if (target > before) simnet.mineEmptyBurnBlocks(Number((target - before + 599n) / 600n));
    simnet.mineEmptyBlocks(1);
    const after = rawUint(simnet.execute('stacks-block-time').result);
    expect(after - diaTime).toBeGreaterThan(7_200n);
    expect(rawUint(read(buy, 'miner-mid'))).toBe(0n);
    expect(rawUint(read(buy, 'current-cap'))).toBe(0n);
    expect(call(buy, 'refresh-guard', [], DEPLOYER)).toEqual(Cl.error(Cl.uint(7008)));
  });

  it('keeps a buy rung usable after USDCx protocol-burn reduces its shares', function () {
    // Keep this small test position below the market's minimum so it remains
    // held by the rung while still exceeding the live USDCx burn minimum.
    setupBase(1_000_000_000n);
    const buy = deployBuyRungWithBurnProbe();
    const deposit = 200_000_000n;
    const proceeds = 20_000n;
    const burn = 5_000_000n;
    expect(call(USDCX, 'transfer', [Cl.uint(deposit), Cl.principal(USDC_WHALE), Cl.principal(TAKER), Cl.none()], USDC_WHALE)).toEqual(Cl.ok(Cl.bool(true)));
    expect(call(SBTC, 'transfer', [Cl.uint(proceeds), Cl.principal(SBTC_WHALE), Cl.principal(buy), Cl.none()], SBTC_WHALE)).toEqual(Cl.ok(Cl.bool(true)));
    expect(call(buy, 'deposit', [Cl.uint(deposit)], TAKER).type).toBe('ok');
    expect(call(buy, 'sync', [], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
    const usdcxBeforeBurn = balance(USDCX, buy);
    expect(usdcxBeforeBurn).toBe(deposit);
    expect(call(buy, 'test-protocol-burn-usdcx', [Cl.uint(burn)], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));
    expect(balance(USDCX, buy)).toBe(usdcxBeforeBurn - burn);
    expect(call(buy, 'sync', [], DEPLOYER)).toEqual(Cl.ok(Cl.bool(true)));

    const sbtcBeforeClaim = balance(SBTC, TAKER);
    expect(call(buy, 'claim', [], TAKER).type).toBe('ok');
    expect(balance(SBTC, TAKER)).toBe(sbtcBeforeClaim + proceeds);
    const usdcxBeforeWithdraw = balance(USDCX, TAKER);
    expect(call(buy, 'withdraw', [Cl.uint(50_000_000), Cl.none()], TAKER).type).toBe('ok');
    expect(balance(USDCX, TAKER) - usdcxBeforeWithdraw).toBe(50_000_000n);
    expect(call(buy, 'claim', [], TAKER).type).toBe('ok');
  });
});
