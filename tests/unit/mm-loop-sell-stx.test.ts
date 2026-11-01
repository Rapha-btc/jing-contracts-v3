import { describe, expect, it } from 'vitest';
import { Cl, ClarityVersion } from '@stacks/transactions';
import { fetchLazerUpdateAny, lazerFeedTimes } from '../../simulations/_lazer.js';

const CONTRACT = 'yguazu-mm-loop-sell-stx';
const DEPLOYER = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const MARKET = DEPLOYER + '.markets-sbtc-stx-jing-v6-4';
const ORACLE = 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle';
const ORACLE_GOV = 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const RUNG_NAMES = [
  'jing-sell-stx-1',
  'jing-sell-stx-10',
  'jing-sell-stx-20',
  'jing-sell-stx-30',
  'jing-sell-stx-40',
  'jing-sell-stx-50',
  'jing-sell-stx-60',
  'jing-sell-stx-70',
  'jing-sell-stx-80',
  'jing-sell-stx-90',
];
const RUNGS = RUNG_NAMES.map(function (name) {
  return DEPLOYER + '.' + name;
});
const BPS = 10_000n;
const PRICE_SCALE = 10_000_000_000n;

const BAD_RUNG_SOURCE = `
(impl-trait 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-rung-deposit-trait.rung-trait)
(define-public (deposit (amount uint))
  (if (> amount u0)
    (ok { amount: amount, shares: amount, epoch: u0, stx-paid: u0, sbtc-paid: u0 })
    (err u1)
  )
)
(define-public (withdraw (amount uint) (update (optional (buff 8192))))
  (if (> amount u0)
    (ok { stx: u0, sbtc: u0 })
    (err u1)
  )
)
(define-public (claim)
  (if true (ok { stx: u0, sbtc: u0 }) (err u1))
)
`;

const accounts = simnet.getAccounts();
const owner = accounts.get('deployer')!;
const keeper = accounts.get('wallet_1')!;
const stranger = accounts.get('wallet_2')!;
const recipient = accounts.get('wallet_3')!;
const vault = owner + '.' + CONTRACT;
const vaultPrincipal = Cl.contractPrincipal(owner, CONTRACT);
const firstRung = Cl.contractPrincipal(DEPLOYER, RUNG_NAMES[0]);

function value(cv: any): any {
  if (cv.type === 'uint' || cv.type === 'int') return BigInt(cv.value);
  if (cv.type === 'ok' || cv.type === 'some') return value(cv.value);
  if (cv.type === 'none') return null;
  if (cv.type === 'true') return true;
  if (cv.type === 'false') return false;
  if (cv.type === 'tuple') {
    return Object.fromEntries(Object.entries(cv.value).map(function (entry: any[]) {
      return [entry[0], value(entry[1])];
    }));
  }
  if (cv.type === 'list') return cv.value.map(value);
  return cv.value;
}

function pub(fn: string, args: any[] = [], sender: string = owner): any {
  return simnet.callPublicFn(CONTRACT, fn, args, sender);
}

function privateFn(fn: string, args: any[] = [], sender: string = owner): any {
  return simnet.callPrivateFn(CONTRACT, fn, args, sender);
}

function read(fn: string, args: any[] = []): any {
  return value(simnet.callReadOnlyFn(CONTRACT, fn, args, owner).result);
}

function marketRead(fn: string, args: any[] = []): any {
  return value(simnet.callReadOnlyFn(MARKET, fn, args, owner).result);
}

function marketPub(fn: string, args: any[] = [], sender: string = owner): any {
  return simnet.callPublicFn(MARKET, fn, args, sender);
}

function oracleRead(fn: string): any {
  return value(simnet.callReadOnlyFn(ORACLE, fn, [], owner).result);
}

function oraclePub(fn: string, args: any[] = []): any {
  return simnet.callPublicFn(ORACLE, fn, args, ORACLE_GOV);
}

async function freshLazerUpdate(): Promise<any> {
  if (!process.env.STACKS_API_URL) process.env.STACKS_API_URL = 'http://127.0.0.1:8787';
  for (let attempt = 0; attempt < 20; attempt++) {
    const update = await fetchLazerUpdateAny();
    const times = await lazerFeedTimes(update.hex);
    if (times.at > Number(simnet.getBlockTime())) {
      return Cl.bufferFromHex(update.hex.replace(/^0x/, ''));
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, 1000);
    });
  }
  throw new Error('no fresh Lazer update newer than the Clarinet simnet block time');
}

function expectErr(receipt: any, code: number): void {
  expect(receipt.result).toEqual(Cl.error(Cl.uint(code)));
}

function prints(receipt: any): any[] {
  return receipt.events
    .filter(function (event: any) {
      return event.event === 'print_event' && event.data.contract_identifier === vault;
    })
    .map(function (event: any) {
      return value(event.data.value);
    });
}

function stxBalance(who: string): bigint {
  const assets = simnet.getAssetsMap().get('STX');
  return BigInt(assets?.get(who) ?? 0n);
}

function sbtcBalance(who: string): bigint {
  const receipt = simnet.callReadOnlyFn(
    SBTC,
    'get-balance',
    [Cl.principal(who)],
    owner,
  );
  return value(receipt.result);
}

function fundSbtc(amount: bigint): void {
  fundSbtcTo(amount, vaultPrincipal);
}

function fundSbtcTo(amount: bigint, to: any): void {
  const receipt = simnet.callPublicFn(
    SBTC,
    'transfer',
    [Cl.uint(amount), Cl.principal(SBTC_WHALE), to, Cl.none()],
    SBTC_WHALE,
  );
  expect(receipt.result).toEqual(Cl.ok(Cl.bool(true)));
}

function seedInventory(sats: bigint, stx: bigint): void {
  const receipt = privateFn('book-rung', [
    firstRung,
    Cl.uint(stx),
    Cl.uint(sats),
    Cl.uint(0),
    Cl.stringAscii('test-seed'),
  ]);
  expect(receipt.result).toEqual(Cl.uint(stx));
}

function rungInput(): bigint {
  const position = simnet.callReadOnlyFn(
    RUNGS[0],
    'get-position',
    [vaultPrincipal],
    owner,
  );
  return value(position.result).stx;
}

function bookSale(sats: bigint, stx: bigint): any {
  fundSbtc(sats);
  return privateFn('book-rung', [
    firstRung,
    Cl.uint(rungInput() + stx),
    Cl.uint(sats),
    Cl.uint(0),
    Cl.stringAscii('sell'),
  ]);
}

function staleCancel(receipt: any): any {
  return prints(receipt).find(function (event: any) {
    return event.event === 'yg-stale-buy-back-cancel';
  });
}

function liveXDeposit(): bigint {
  return marketRead('get-token-x-deposit', [Cl.uint(marketRead('get-current-cycle')), vaultPrincipal]);
}

function xOrderLimit(): bigint {
  const pending = marketRead('get-token-x-pending-deposit', [vaultPrincipal]);
  return pending === null ? marketRead('get-token-x-limit', [vaultPrincipal]) : pending.limit;
}

async function settleXDeposit(): Promise<void> {
  const pending = marketRead('get-token-x-pending-deposit', [vaultPrincipal]);
  if (pending !== null) {
    const update = await freshLazerUpdate();
    const settled = marketPub('settle-token-x-deposit', [
      Cl.principal(vault),
      update,
      Cl.contractPrincipal('SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4', 'sbtc-token'),
      Cl.stringAscii('sbtc-token'),
    ]);
    expect(settled.result.type).toBe('ok');
  }
  expect(liveXDeposit()).toBeGreaterThan(0n);
}

function deployBadRung(): string {
  const name = 'unlisted-rung';
  const receipt = simnet.deployContract(
    name,
    BAD_RUNG_SOURCE,
    { clarityVersion: ClarityVersion.Clarity5 },
    owner,
  );
  expect(value(receipt.result)).toBe(true);
  return owner + '.' + name;
}

describe('yguazu-mm-loop-sell-stx', function () {
  it('exposes the empty state and the complete get-state shape', function () {
    const state = read('get-state');
    expect(Object.keys(state).sort()).toEqual([
      'buy-back-floor',
      'edge-bps',
      'inv-sats',
      'inv-stx',
      'keeper',
      'max-oracle-fee',
      'owner',
      'paused',
      'rungs',
      'sats-on-market',
      'sbtc-held',
      'stx-held',
      'vwap-sell',
    ].sort());
    expect(state.owner).toBe(owner);
    expect(read('get-owner')).toBe(owner);
    expect(read('get-keeper')).toBeNull();
    expect(state.keeper).toBeNull();
    expect(state.paused).toBe(false);
    expect(state['edge-bps']).toBe(25n);
    expect(state['max-oracle-fee']).toBe(0n);
    expect(state['inv-sats']).toBe(0n);
    expect(state['inv-stx']).toBe(0n);
    expect(state['vwap-sell']).toBe(0n);
    expect(state['buy-back-floor']).toBe(0n);
    expect(state.rungs).toEqual([0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
  });

  it('gates owner, keeper, and stranger actions correctly while paused', function () {
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('set-paused', [Cl.bool(true)], keeper), 8201);
    expectErr(pub('set-paused', [Cl.bool(true)], stranger), 8201);
    expectErr(pub('set-edge-bps', [Cl.uint(30)], keeper), 8201);
    expectErr(pub('set-edge-bps', [Cl.uint(30)], stranger), 8201);
    expectErr(pub('sell', [firstRung, Cl.uint(0)]), 8206);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], keeper), 8206);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], stranger), 8202);
    expectErr(pub('claim', [firstRung], stranger), 8202);
    expectErr(pub('reconcile', [], stranger), 8202);
    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(1), Cl.none()], stranger), 8202);
    expectErr(pub('cancel-buy-back', [], stranger), 8202);
    expect(pub('set-paused', [Cl.bool(true)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('sell', [firstRung, Cl.uint(0)]), 8206);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], keeper), 8204);
    expectErr(pub('claim', [firstRung], keeper), 8204);
    expectErr(pub('reconcile', [], keeper), 8204);
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(0)], keeper), 8204);
    expectErr(pub('reprice', [Cl.uint(0)], keeper), 8204);
    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(1), Cl.none()], keeper), 8204);
    expectErr(pub('cancel-buy-back', [], keeper), 8204);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], stranger), 8202);
  });

  it('lets only the owner set edge from zero through 9999 and emits the edge event', function () {
    const zero = pub('set-edge-bps', [Cl.uint(0)]);
    expect(zero.result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-state')['edge-bps']).toBe(0n);
    expect(prints(zero)).toEqual([{ event: 'yg-set-edge-bps', bps: 0n }]);

    const max = pub('set-edge-bps', [Cl.uint(9999)]);
    expect(max.result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-state')['edge-bps']).toBe(9999n);
    expect(prints(max)).toEqual([{ event: 'yg-set-edge-bps', bps: 9999n }]);
    expectErr(pub('set-edge-bps', [Cl.uint(10000)]), 8210);
    expect(read('get-state')['edge-bps']).toBe(9999n);
  });

  it('lets only the owner set the max oracle fee and prints the configured fee', function () {
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('set-max-oracle-fee', [Cl.uint(1)], keeper), 8201);
    expectErr(pub('set-max-oracle-fee', [Cl.uint(1)], stranger), 8201);

    const receipt = pub('set-max-oracle-fee', [Cl.uint(2500)]);
    expect(receipt.result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-state')['max-oracle-fee']).toBe(2500n);
    expect(prints(receipt)).toEqual([{ event: 'yg-set-max-oracle-fee', fee: 2500n }]);
  });

  it('requires the proposed owner to accept the two-step handover', function () {
    expectErr(pub('propose-owner', [Cl.some(Cl.principal(recipient))], keeper), 8201);
    expect(pub('propose-owner', [Cl.some(Cl.principal(recipient))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('propose-owner', [Cl.none()]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-pending-owner')).toBeNull();
    expectErr(pub('accept-owner', [], recipient), 8203);
    expect(pub('propose-owner', [Cl.some(Cl.principal(recipient))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-owner')).toBe(owner);
    expect(read('get-pending-owner')).toBe(recipient);
    expectErr(pub('accept-owner', [], stranger), 8203);
    expect(pub('accept-owner', [], recipient).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-owner')).toBe(recipient);
    expect(read('get-pending-owner')).toBeNull();
    expectErr(pub('set-keeper', [Cl.none()]), 8201);
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))], recipient).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('set-edge-bps', [Cl.uint(30)], recipient).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-state')['edge-bps']).toBe(30n);
  });

  it('lets the owner pause and unpause, then remove a keeper', function () {
    expect(pub('set-paused', [Cl.bool(true)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('set-paused', [Cl.bool(false)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('set-keeper', [Cl.some(Cl.principal(keeper))], stranger), 8201);
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-keeper')).toBe(keeper);
    expect(pub('set-keeper', [Cl.none()]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-keeper')).toBeNull();
    expectErr(pub('sell', [firstRung, Cl.uint(1)], keeper), 8202);
  });

  it('allows exactly the ten deployed sell-stx rungs and rejects an unlisted rung', function () {
    for (const rung of RUNGS) {
      expect(read('is-allowed-rung', [Cl.principal(rung)])).toBe(true);
    }
    expect(read('is-allowed-rung', [Cl.contractPrincipal(owner, 'unlisted-rung')])).toBe(false);
    expect(read('rung-remaining', [Cl.contractPrincipal(owner, 'unlisted-rung')])).toBe(0n);
    const badRung = deployBadRung();
    expectErr(pub('sell', [Cl.contractPrincipal(owner, 'unlisted-rung'), Cl.uint(1)]), 8205);
    expectErr(pub('claim', [Cl.contractPrincipal(owner, 'unlisted-rung')]), 8205);
    expect(badRung).toBe(owner + '.unlisted-rung');
  });

  it('sells into each of the ten deployed sell-stx rungs, including a large sell', function () {
    const amount = 100_000_000n;
    const largeAmount = 1_000_000_000n;
    simnet.transferSTX(amount * BigInt(RUNG_NAMES.length - 1) + largeAmount, vault, owner);
    for (let index = 0; index < RUNG_NAMES.length; index++) {
      const name = RUNG_NAMES[index];
      const sellAmount = index === 0 ? largeAmount : amount;
      const rung = Cl.contractPrincipal(DEPLOYER, name);
      const receipt = pub('sell', [rung, Cl.uint(sellAmount)]);
      expect(receipt.result).toEqual(Cl.ok(Cl.uint(sellAmount)));
      expect(read('get-rung-principal', [rung])).toBeLessThanOrEqual(sellAmount);
    }
  });

  it('computes vwap and the buy-back floor with ceiling rounding, including zero inventory', function () {
    expect(read('vwap-sell')).toBe(0n);
    expect(read('buy-back-floor')).toBe(0n);
    seedInventory(3n, 1_000_001n);
    const vwap = (1_000_001n * PRICE_SCALE) / 3n;
    expect(read('vwap-sell')).toBe(vwap);
    for (const edge of [0n, 25n, 9999n]) {
      expect(pub('set-edge-bps', [Cl.uint(edge)]).result).toEqual(Cl.ok(Cl.bool(true)));
      const numerator = 1_000_001n * PRICE_SCALE * (BPS + edge);
      const denominator = 3n * BPS;
      const floor = (numerator + denominator - 1n) / denominator;
      expect(read('buy-back-floor')).toBe(floor);
      expect((floor - 1n) * denominator).toBeLessThan(numerator);
      expect(floor * denominator).toBeGreaterThanOrEqual(numerator);
      if (edge === 25n) expect(numerator % denominator).not.toBe(0n);
    }
  });

  it('keeps the floor above the exact inventory VWAP plus edge', function () {
    const sats = 25_062_026n;
    const stx = 1n;
    seedInventory(sats, stx);
    const edge = read('get-state')['edge-bps'];
    const exactNumerator = stx * PRICE_SCALE * (BPS + edge);
    const exactDenominator = sats * BPS;
    const exactFloor = (exactNumerator + exactDenominator - 1n) / exactDenominator;
    expect(read('buy-back-floor')).toBe(exactFloor);
  });

  it('does not book one consumed microSTX when the rung returns zero sBTC proceeds', function () {
    const receipt = privateFn('book-rung', [
      firstRung,
      Cl.uint(1),
      Cl.uint(0),
      Cl.uint(0),
      Cl.stringAscii('sell'),
    ]);
    expect(receipt.result).toEqual(Cl.uint(1));
    expect(read('get-state')['inv-sats']).toBe(0n);
    expect(read('get-state')['inv-stx']).toBe(0n);
    expect(read('vwap-sell')).toBe(0n);
    expect(prints(receipt).some(function (event: any) {
      return event.event === 'yg-rung-booked' && event['fill-price'] === 0n;
    })).toBe(true);
    const returnedMoreThanExpected = privateFn('book-rung', [
      firstRung,
      Cl.uint(0),
      Cl.uint(0),
      Cl.uint(1),
      Cl.stringAscii('claim'),
    ]);
    expect(returnedMoreThanExpected.result).toEqual(Cl.uint(0));
    expect(read('get-state')['inv-stx']).toBe(0n);
    expect(read('get-state')['inv-sats']).toBe(0n);
  });

  it('leaves donated rung proceeds untracked and lets the owner recover them', function () {
    const amount = 100_000_000n;
    simnet.transferSTX(amount, vault, owner);
    expect(pub('sell', [firstRung, Cl.uint(amount)]).result).toEqual(Cl.ok(Cl.uint(amount)));
    const emptyClaim = pub('claim', [firstRung]);
    expect(emptyClaim.result.type).toBe('ok');

    const vaultSbtcBeforeDonation = sbtcBalance(vault);
    fundSbtcTo(10_000n, firstRung);
    const paidClaim = pub('claim', [firstRung]);
    expect(paidClaim.result.type).toBe('ok');
    const state = read('get-state');
    const donatedSats = sbtcBalance(vault) - vaultSbtcBeforeDonation;
    expect(donatedSats).toBeGreaterThan(0n);
    expect(state['inv-sats']).toBe(0n);
    expect(state['inv-stx']).toBe(0n);

    const ownerSbtcBeforeRecovery = sbtcBalance(owner);
    expect(pub('withdraw-sbtc', [Cl.uint(donatedSats)]).result).toEqual(Cl.ok(Cl.uint(donatedSats)));
    expect(sbtcBalance(owner)).toBe(ownerSbtcBeforeRecovery + donatedSats);
    expect(sbtcBalance(vault)).toBe(vaultSbtcBeforeDonation);
    expect(read('get-state')['inv-sats']).toBe(0n);
    expect(read('get-state')['inv-stx']).toBe(0n);
  });

  it('withdraws a rung position and rejects a non-allowlisted rung', function () {
    const amount = 100_000_000n;
    simnet.transferSTX(amount, vault, owner);
    expect(pub('sell', [firstRung, Cl.uint(amount)]).result).toEqual(Cl.ok(Cl.uint(amount)));
    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(amount), Cl.none()], stranger), 8202);
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('set-paused', [Cl.bool(true)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(amount), Cl.none()], keeper), 8204);
    expect(pub('set-paused', [Cl.bool(false)]).result).toEqual(Cl.ok(Cl.bool(true)));
    const badRung = deployBadRung();
    expectErr(pub('rung-withdraw', [Cl.contractPrincipal(owner, 'unlisted-rung'), Cl.uint(1), Cl.none()]), 8205);
    const pending = marketRead('get-token-y-pending-deposit', [firstRung]);
    expect(pending).not.toBeNull();
    expect(Number(simnet.getBlockTime()) - Number(pending['submitted-at'])).toBeLessThan(86_400);
    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(10n ** 15n), Cl.none()]), 7012);
    expect(marketRead('get-token-y-pending-deposit', [firstRung])).not.toBeNull();
    simnet.mineEmptyBurnBlocks(8_641);
    const elapsed = Number(simnet.getBlockTime()) - Number(pending['submitted-at']);
    expect(elapsed).toBeGreaterThanOrEqual(86_400);
    const principal = read('get-rung-principal', [firstRung]);
    const receipt = pub('rung-withdraw', [firstRung, Cl.uint(principal), Cl.none()], keeper);
    expect(receipt.result.type).toBe('ok');
    expect(marketRead('get-token-y-pending-deposit', [firstRung])).toBeNull();
    expect(badRung).toBe(owner + '.unlisted-rung');
  });

  it('settles a fresh pending rung order with a Lazer update while max-oracle-fee is zero', async function () {
    const amount = 100_000_000n;
    simnet.transferSTX(amount, vault, owner);
    expect(pub('sell', [firstRung, Cl.uint(amount)]).result).toEqual(Cl.ok(Cl.uint(amount)));
    expect(marketRead('get-token-y-pending-deposit', [firstRung])).not.toBeNull();
    expect(oracleRead('get-fee')).toBe(0n);

    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(10n ** 15n), Cl.none()]), 7012);
    const update = await freshLazerUpdate();
    const receipt = pub('rung-withdraw', [firstRung, Cl.uint(10n ** 15n), Cl.some(update)]);
    expect(receipt.result.type).toBe('ok');
    expect(read('get-rung-principal', [firstRung])).toBe(0n);
    expect(marketRead('get-token-y-pending-deposit', [firstRung])).toBeNull();
  }, 60_000);

  it('charges a positive oracle fee only when max-oracle-fee covers it', async function () {
    const fee = 1_000n;
    const amount = 100_000_000n;
    expect(oraclePub('set-fee', [Cl.uint(fee)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(oracleRead('get-fee')).toBe(fee);
    simnet.transferSTX(amount + 10_000n, vault, owner);
    expect(pub('sell', [firstRung, Cl.uint(amount)]).result).toEqual(Cl.ok(Cl.uint(amount)));
    expect(marketRead('get-token-y-pending-deposit', [firstRung])).not.toBeNull();
    const recipientPrincipal = oracleRead('get-fee-recipient');
    const vaultStxBefore = stxBalance(vault);
    const recipientStxBefore = stxBalance(recipientPrincipal);
    const update = await freshLazerUpdate();

    const noCap = pub('rung-withdraw', [firstRung, Cl.uint(10n ** 15n), Cl.some(update)]);
    expect(noCap.result.type).toBe('err');
    expect(stxBalance(vault)).toBe(vaultStxBefore);
    expect(stxBalance(recipientPrincipal)).toBe(recipientStxBefore);
    expect(marketRead('get-token-y-pending-deposit', [firstRung])).not.toBeNull();

    expect(pub('set-max-oracle-fee', [Cl.uint(fee)]).result).toEqual(Cl.ok(Cl.bool(true)));
    const coveredUpdate = await freshLazerUpdate();
    const coveredVaultStxBefore = stxBalance(vault);
    const coveredRecipientStxBefore = stxBalance(recipientPrincipal);
    const principalBefore = read('get-rung-principal', [firstRung]);
    const covered = pub('rung-withdraw', [firstRung, Cl.uint(10n ** 15n), Cl.some(coveredUpdate)]);
    expect(covered.result.type).toBe('ok');
    expect(stxBalance(vault)).toBeGreaterThanOrEqual(coveredVaultStxBefore + principalBefore - fee - 1n);
    expect(stxBalance(vault)).toBeLessThanOrEqual(coveredVaultStxBefore + principalBefore - fee);
    expect(stxBalance(recipientPrincipal)).toBe(coveredRecipientStxBefore + fee);

    expect(pub('set-max-oracle-fee', [Cl.uint(fee - 1n)]).result).toEqual(Cl.ok(Cl.bool(true)));
    simnet.transferSTX(amount + 10_000n, vault, owner);
    expect(pub('sell', [firstRung, Cl.uint(amount)]).result).toEqual(Cl.ok(Cl.uint(amount)));
    const underCapUpdate = await freshLazerUpdate();
    const underCapVaultStxBefore = stxBalance(vault);
    const underCapRecipientStxBefore = stxBalance(recipientPrincipal);
    const underCap = pub('rung-withdraw', [firstRung, Cl.uint(10n ** 15n), Cl.some(underCapUpdate)]);
    expect(underCap.result.type).toBe('err');
    expect(stxBalance(vault)).toBe(underCapVaultStxBefore);
    expect(stxBalance(recipientPrincipal)).toBe(underCapRecipientStxBefore);
    expect(marketRead('get-token-y-pending-deposit', [firstRung])).not.toBeNull();
    expect(oraclePub('set-fee', [Cl.uint(0)]).result).toEqual(Cl.ok(Cl.bool(true)));
  }, 120_000);

  it('returns amount and inventory errors; the zero-floor guard is unreachable with paired inventory', function () {
    expectErr(pub('sell', [firstRung, Cl.uint(0)]), 8206);
    expect(pub('sell', [firstRung, Cl.uint(1)]).result.type).toBe('err');
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(0)]), 8208);
    expect(read('vwap-sell')).toBe(0n);
    expect(read('buy-back-floor')).toBe(0n);

    fundSbtc(1_000n);
    seedInventory(1_000n, 1_000n);
    expect(read('buy-back-floor')).toBeGreaterThan(0n);
    expectErr(pub('buy-back', [Cl.uint(2_001), Cl.uint(0)]), 8209);
  });

  it('checks buy-back and reprice spread, inventory, floor, then places and cancels a real market order', function () {
    expectErr(pub('buy-back', [Cl.uint(0), Cl.uint(0)]), 8206);
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(10_000)]), 8210);
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(0)], stranger), 8202);
    expectErr(pub('reprice', [Cl.uint(10_000)]), 8210);
    expectErr(pub('reprice', [Cl.uint(0)], stranger), 8202);
    expectErr(pub('reprice', [Cl.uint(0)]), 8208);
    expectErr(pub('cancel-buy-back', [], stranger), 8202);
    expect(pub('cancel-buy-back').result.type).toBe('err');

    fundSbtc(2_000n);
    seedInventory(2_000n, 10_000_000n);
    const numerator = 10_000_000n * PRICE_SCALE * (BPS + 25n);
    const denominator = 2_000n * BPS;
    const expectedFloor = (numerator + denominator - 1n) / denominator;
    const placed = pub('buy-back', [Cl.uint(1_000), Cl.uint(0)]);
    expect(placed.result).toEqual(Cl.ok(Cl.uint(expectedFloor)));
    expect(pub('buy-back', [Cl.uint(1), Cl.uint(0)]).result.type).toBe('err');
    expect(read('get-state')['sats-on-market']).toBeGreaterThan(0n);
    expectErr(pub('reprice', [Cl.uint(25)]), 1005);
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('set-paused', [Cl.bool(true)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('cancel-buy-back', [], keeper), 8204);
    expect(pub('set-paused', [Cl.bool(false)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('cancel-buy-back', [], keeper).result.type).toBe('ok');
    expect(read('get-state')['sats-on-market']).toBe(0n);
  });

  it('cancels a stale pending ask, preserves sale booking, returns the ask, and reposts at the new floor', function () {
    const sats = 2_000n;
    const proceeds = 10_000_000n;
    const ask = 1_000n;
    fundSbtc(sats);
    seedInventory(sats, proceeds);
    const initialFloor = read('buy-back-floor');
    expect(pub('buy-back', [Cl.uint(ask), Cl.uint(0)]).result).toEqual(Cl.ok(Cl.uint(initialFloor)));
    expect(marketRead('get-token-x-pending-deposit', [vaultPrincipal])).not.toBeNull();
    const satsBeforeSale = sbtcBalance(vault);
    const stateBeforeSale = read('get-state');

    const sale = bookSale(10_000n, 100_000_000n);
    const cancelled = staleCancel(sale);
    const booked = prints(sale).find(function (event: any) {
      return event.event === 'yg-rung-booked';
    });
    const stateAfterSale = read('get-state');
    const newFloor = read('buy-back-floor');
    expect(cancelled).toEqual({
      event: 'yg-stale-buy-back-cancel',
      floor: newFloor,
      live: 0n,
      pending: initialFloor,
      queued: 0n,
      cancelled: true,
    });
    expect(stateAfterSale['sats-on-market']).toBe(0n);
    expect(marketRead('get-token-x-pending-deposit', [vaultPrincipal])).toBeNull();
    expect(booked['sbtc-in']).toBe(10_000n);
    expect(booked['stx-consumed']).toBe(100_000_000n);
    expect(stateAfterSale['inv-stx']).toBe(stateBeforeSale['inv-stx'] + 100_000_000n);
    expect(stateAfterSale['inv-sats']).toBe(stateBeforeSale['inv-sats'] + 10_000n);
    expect(sbtcBalance(vault)).toBe(satsBeforeSale + ask + 10_000n);
    expect(pub('buy-back', [Cl.uint(ask), Cl.uint(0)]).result).toEqual(Cl.ok(Cl.uint(newFloor)));
  });

  it('cancels a stale live ask after its pending deposit settles', async function () {
    const sats = 2_000n;
    const proceeds = 10_000_000n;
    const ask = 1_000n;
    fundSbtc(sats);
    seedInventory(sats, proceeds);
    const initialFloor = read('buy-back-floor');
    expect(pub('buy-back', [Cl.uint(ask), Cl.uint(0)]).result).toEqual(Cl.ok(Cl.uint(initialFloor)));
    await settleXDeposit();
    expect(marketRead('get-token-x-limit', [vaultPrincipal])).toBe(initialFloor);
    const satsBeforeSale = sbtcBalance(vault);

    const sale = bookSale(10_000n, 100_000_000n);
    const cancelled = staleCancel(sale);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.live).toBe(initialFloor);
    expect(read('get-state')['sats-on-market']).toBe(0n);
    expect(liveXDeposit()).toBe(0n);
    expect(marketRead('get-token-x-limit', [vaultPrincipal])).toBe(0n);
    expect(sbtcBalance(vault)).toBe(satsBeforeSale + ask + 10_000n);
  }, 120_000);

  it('cancels when only the queued ask limit is stale and the live ask remains safe', async function () {
    const ask = 1_000n;
    const initialSats = 2_000n;
    const initialStx = 10_000_000n;
    fundSbtc(initialSats);
    seedInventory(initialSats, initialStx);
    const initialFloor = read('buy-back-floor');
    expect(pub('buy-back', [Cl.uint(ask), Cl.uint(0)]).result).toEqual(Cl.ok(Cl.uint(initialFloor)));
    await settleXDeposit();

    const cheaperSale = bookSale(2_000n, 2_000_000n);
    expect(staleCancel(cheaperSale)).toBeUndefined();
    const lowerFloor = read('buy-back-floor');
    expect(lowerFloor).toBeLessThan(initialFloor);
    const repriced = pub('reprice', [Cl.uint(0)]);
    expect(repriced.result).toEqual(Cl.ok(Cl.uint(lowerFloor)));
    expect(prints(repriced).some(function (event: any) {
      return event.event === 'yg-reprice' && event['applied-now'] === false;
    })).toBe(true);
    const queued = marketRead('get-token-x-pending-limit', [vaultPrincipal]);
    expect(queued).not.toBeNull();
    expect(marketRead('get-token-x-limit', [vaultPrincipal])).toBe(initialFloor);

    const dearerSale = bookSale(2_000n, 12_000_000n);
    const cancelled = staleCancel(dearerSale);
    const newFloor = read('buy-back-floor');
    expect(newFloor).toBeGreaterThan(lowerFloor);
    expect(newFloor).toBeLessThan(initialFloor);
    expect(cancelled.live).toBe(initialFloor);
    expect(cancelled.pending).toBe(0n);
    expect(cancelled.queued).toBe(lowerFloor);
    expect(cancelled.floor).toBe(newFloor);
    expect(cancelled.cancelled).toBe(true);
    expect(read('get-state')['sats-on-market']).toBe(0n);
    expect(marketRead('get-token-x-pending-limit', [vaultPrincipal])).toBeNull();
  }, 120_000);

  it('keeps a safe ask after a cheaper sale and leaves its order limit unchanged', function () {
    const initialSats = 2_000n;
    const initialStx = 10_000_000n;
    fundSbtc(initialSats);
    seedInventory(initialSats, initialStx);
    const initialFloor = read('buy-back-floor');
    expect(pub('buy-back', [Cl.uint(1_000), Cl.uint(0)]).result).toEqual(Cl.ok(Cl.uint(initialFloor)));
    const marketAmount = read('get-state')['sats-on-market'];

    const sale = bookSale(2_000n, 2_000_000n);
    expect(staleCancel(sale)).toBeUndefined();
    expect(read('buy-back-floor')).toBeLessThan(initialFloor);
    expect(xOrderLimit()).toBe(initialFloor);
    expect(read('get-state')['sats-on-market']).toBe(marketAmount);
  });

  it('books a sale without a cancellation event when there is no market order', function () {
    const sale = bookSale(1_000n, 2_000_000n);
    const booked = prints(sale).find(function (event: any) {
      return event.event === 'yg-rung-booked';
    });
    expect(sale.result).toEqual(Cl.uint(2_000_000n));
    expect(staleCancel(sale)).toBeUndefined();
    expect(booked['sbtc-in']).toBe(1_000n);
    expect(read('get-state')['inv-sats']).toBe(1_000n);
    expect(read('get-state')['inv-stx']).toBe(2_000_000n);
  });

  it('reconciles the README example after a new-floor fill without closing excess STX', async function () {
    const initialSats = 1_000n;
    const initialStx = 1_000_000n;
    const ask = 1_000n;
    fundSbtc(initialSats);
    seedInventory(initialSats, initialStx);
    const oldFloor = read('buy-back-floor');
    expect(pub('buy-back', [Cl.uint(ask), Cl.uint(0)]).result).toEqual(Cl.ok(Cl.uint(oldFloor)));
    const staleSale = bookSale(1_000n, 2_000_000n);
    expect(staleCancel(staleSale).cancelled).toBe(true);
    const newFloor = read('buy-back-floor');
    expect(newFloor).toBeGreaterThan(oldFloor);
    expect(pub('buy-back', [Cl.uint(ask), Cl.uint(0)]).result).toEqual(Cl.ok(Cl.uint(newFloor)));
    await settleXDeposit();

    const satsOnMarketBeforeFill = read('get-state')['sats-on-market'];
    const stxBeforeFill = stxBalance(vault);
    const update = await freshLazerUpdate();
    simnet.transferSTX(2_000_000n, keeper, owner);
    const fill = marketPub('swap', [
      Cl.uint(2_000_000),
      Cl.uint((1n << 128n) - 1n),
      update,
      Cl.contractPrincipal('SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4', 'sbtc-token'),
      Cl.stringAscii('sbtc-token'),
      Cl.contractPrincipal('SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR', 'token-stx-v-1-2'),
      Cl.stringAscii('wstx'),
      Cl.bool(false),
    ], keeper);
    expect(fill.result.type).toBe('ok');
    const satsOnMarketAfterFill = read('get-state')['sats-on-market'];
    expect(satsOnMarketAfterFill).toBeLessThan(satsOnMarketBeforeFill);
    expect(stxBalance(vault)).toBeGreaterThan(stxBeforeFill);
    const satsBeforeReconcile = read('get-state')['inv-sats'];
    const stxBeforeReconcile = read('get-state')['inv-stx'];
    expect(pub('reconcile').result.type).toBe('ok');
    const satsClosed = satsBeforeReconcile - read('get-state')['inv-sats'];
    const stxClosed = stxBeforeReconcile - read('get-state')['inv-stx'];
    expect(satsClosed).toBeLessThanOrEqual(satsOnMarketBeforeFill - satsOnMarketAfterFill);
    expect(stxClosed).toBeLessThanOrEqual(stxBalance(vault) - stxBeforeFill);
  }, 120_000);

  it('reconciles partial sBTC spend pro rata without resetting the inventory', function () {
    fundSbtc(1_500n);
    seedInventory(2_000n, 2_000_000n);
    const receipt = pub('reconcile');
    expect(receipt.result.type).toBe('ok');
    expect(read('get-state')['inv-sats']).toBe(1_500n);
    expect(read('get-state')['inv-stx']).toBe(1_500_000n);
    expect(read('vwap-sell')).toBe(10_000_000_000_000n);
  });

  it('computes the buy-back floor for an inventory near the u128 multiplication limit', function () {
    const largeStx = 1_000_000_000_000_000_000_000_000n;
    seedInventory(1n, largeStx);
    expect(pub('set-edge-bps', [Cl.uint(9999)]).result).toEqual(Cl.ok(Cl.bool(true)));
    const numerator = largeStx * PRICE_SCALE * (BPS + 9999n);
    const denominator = BPS;
    const expected = (numerator + denominator - 1n) / denominator;
    const u128Max = (1n << 128n) - 1n;
    expect(numerator).toBeLessThan(u128Max);
    expect(read('buy-back-floor')).toBe(expected);
  });

  it('resets open inventory below the satoshi dust threshold', function () {
    fundSbtc(999n);
    seedInventory(2_000n, 2_000_000n);
    const receipt = pub('reconcile');
    expect(receipt.result.type).toBe('ok');
    expect(read('get-state')['inv-sats']).toBe(0n);
    expect(read('get-state')['inv-stx']).toBe(0n);
    expect(read('vwap-sell')).toBe(0n);
  });

  it('allows withdrawals only to the owner', function () {
    expect(pub('withdraw-stx', [Cl.uint(1)]).result.type).toBe('err');
    expect(pub('withdraw-sbtc', [Cl.uint(1)]).result.type).toBe('err');
    simnet.transferSTX(2_000n, vault, owner);
    fundSbtc(2_000n);
    const ownerStxBefore = stxBalance(owner);
    const ownerSbtcBefore = sbtcBalance(owner);
    const recipientStxBefore = stxBalance(recipient);
    const recipientSbtcBefore = sbtcBalance(recipient);
    expectErr(pub('withdraw-stx', [Cl.uint(0)]), 8206);
    expectErr(pub('withdraw-sbtc', [Cl.uint(0)]), 8206);
    expectErr(pub('withdraw-stx', [Cl.uint(500)], keeper), 8201);
    expectErr(pub('withdraw-stx', [Cl.uint(500)], stranger), 8201);
    expectErr(pub('withdraw-sbtc', [Cl.uint(500)], keeper), 8201);
    expectErr(pub('withdraw-sbtc', [Cl.uint(500)], stranger), 8201);
    expect(pub('withdraw-stx', [Cl.uint(500)]).result).toEqual(Cl.ok(Cl.uint(500)));
    expect(pub('withdraw-sbtc', [Cl.uint(500)]).result).toEqual(Cl.ok(Cl.uint(500)));
    expect(stxBalance(owner)).toBe(ownerStxBefore + 500n);
    expect(sbtcBalance(owner)).toBe(ownerSbtcBefore + 500n);
    expect(stxBalance(recipient)).toBe(recipientStxBefore);
    expect(sbtcBalance(recipient)).toBe(recipientSbtcBefore);
  });
});
