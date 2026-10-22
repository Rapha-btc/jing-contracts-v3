import { describe, expect, it } from 'vitest';
import { Cl, ClarityVersion } from '@stacks/transactions';

const CONTRACT = 'yguazu-mm-loop-sell-sbtc';
const DEPLOYER = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const RUNG_NAMES = [
  'jing-buy-stx-1',
  'jing-buy-stx-10',
  'jing-buy-stx-20',
  'jing-buy-stx-30',
  'jing-buy-stx-40',
  'jing-buy-stx-50',
  'jing-buy-stx-60',
  'jing-buy-stx-70',
  'jing-buy-stx-80',
  'jing-buy-stx-90',
];
const RUNGS = RUNG_NAMES.map(function (name) {
  return DEPLOYER + '.' + name;
});
const BPS = 10_000n;
const PRICE_SCALE = 10_000_000_000n;
const RESET_DUST_USTX = 1_000_000n;

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
    Cl.uint(sats),
    Cl.uint(stx),
    Cl.uint(0),
    Cl.stringAscii('test-seed'),
  ]);
  expect(receipt.result).toEqual(Cl.uint(sats));
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

describe('yguazu-mm-loop-sell-sbtc', function () {
  it('exposes the empty state and the complete get-state shape', function () {
    const state = read('get-state');
    expect(Object.keys(state).sort()).toEqual([
      'buy-back-cap',
      'edge-bps',
      'inv-sats',
      'inv-stx',
      'keeper',
      'owner',
      'paused',
      'rungs',
      'sbtc-held',
      'stx-held',
      'stx-on-market',
      'vwap-sell',
    ].sort());
    expect(state.owner).toBe(owner);
    expect(read('get-owner')).toBe(owner);
    expect(read('get-keeper')).toBeNull();
    expect(state.keeper).toBeNull();
    expect(state.paused).toBe(false);
    expect(state['edge-bps']).toBe(25n);
    expect(state['inv-stx']).toBe(0n);
    expect(state['inv-sats']).toBe(0n);
    expect(state['vwap-sell']).toBe(0n);
    expect(state['buy-back-cap']).toBe(0n);
    expect(state.rungs).toEqual([0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
  });

  it('gates owner, keeper, and stranger actions correctly while paused', function () {
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('set-paused', [Cl.bool(true)], keeper), 8101);
    expectErr(pub('set-paused', [Cl.bool(true)], stranger), 8101);
    expectErr(pub('set-edge-bps', [Cl.uint(30)], keeper), 8101);
    expectErr(pub('set-edge-bps', [Cl.uint(30)], stranger), 8101);
    expectErr(pub('sell', [firstRung, Cl.uint(0)]), 8106);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], keeper), 8106);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], stranger), 8102);
    expectErr(pub('claim', [firstRung], stranger), 8102);
    expectErr(pub('reconcile', [], stranger), 8102);
    expect(pub('set-paused', [Cl.bool(true)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('sell', [firstRung, Cl.uint(0)]), 8106);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], keeper), 8104);
    expectErr(pub('claim', [firstRung], keeper), 8104);
    expectErr(pub('reconcile', [], keeper), 8104);
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(0)], keeper), 8104);
    expectErr(pub('reprice', [Cl.uint(0)], keeper), 8104);
    expectErr(pub('sell', [firstRung, Cl.uint(0)], stranger), 8102);
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
    expectErr(pub('set-edge-bps', [Cl.uint(10000)]), 8110);
    expect(read('get-state')['edge-bps']).toBe(9999n);
  });

  it('requires the proposed owner to accept the two-step handover', function () {
    expectErr(pub('propose-owner', [Cl.some(Cl.principal(recipient))], keeper), 8101);
    expect(pub('propose-owner', [Cl.some(Cl.principal(recipient))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('propose-owner', [Cl.none()]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-pending-owner')).toBeNull();
    expectErr(pub('accept-owner', [], recipient), 8103);
    expect(pub('propose-owner', [Cl.some(Cl.principal(recipient))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-owner')).toBe(owner);
    expect(read('get-pending-owner')).toBe(recipient);
    expectErr(pub('accept-owner', [], stranger), 8103);
    expect(pub('accept-owner', [], recipient).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-owner')).toBe(recipient);
    expect(read('get-pending-owner')).toBeNull();
    expectErr(pub('set-keeper', [Cl.none()]), 8101);
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))], recipient).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('set-edge-bps', [Cl.uint(30)], recipient).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-state')['edge-bps']).toBe(30n);
  });

  it('lets the owner pause and unpause, then remove a keeper', function () {
    expect(pub('set-paused', [Cl.bool(true)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(pub('set-paused', [Cl.bool(false)]).result).toEqual(Cl.ok(Cl.bool(true)));
    expectErr(pub('set-keeper', [Cl.some(Cl.principal(keeper))], stranger), 8101);
    expect(pub('set-keeper', [Cl.some(Cl.principal(keeper))]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-keeper')).toBe(keeper);
    expect(pub('reconcile', [], keeper).result.type).toBe('ok');
    expect(pub('set-keeper', [Cl.none()]).result).toEqual(Cl.ok(Cl.bool(true)));
    expect(read('get-keeper')).toBeNull();
    expectErr(pub('sell', [firstRung, Cl.uint(1)], keeper), 8102);
  });

  it('allows exactly the ten deployed buy-stx rungs and rejects an unlisted rung', function () {
    for (const rung of RUNGS) {
      expect(read('is-allowed-rung', [Cl.principal(rung)])).toBe(true);
    }
    expect(read('is-allowed-rung', [Cl.contractPrincipal(owner, 'unlisted-rung')])).toBe(false);
    expect(read('rung-remaining', [Cl.contractPrincipal(owner, 'unlisted-rung')])).toBe(0n);
    const badRung = deployBadRung();
    expectErr(pub('sell', [Cl.contractPrincipal(owner, 'unlisted-rung'), Cl.uint(1)]), 8105);
    expectErr(pub('claim', [Cl.contractPrincipal(owner, 'unlisted-rung')]), 8105);
    expect(badRung).toBe(owner + '.unlisted-rung');
  });

  it('sells into each of the ten deployed buy-stx rungs', function () {
    const amount = 1_000_000n;
    fundSbtc(amount * BigInt(RUNG_NAMES.length));
    for (const name of RUNG_NAMES) {
      const rung = Cl.contractPrincipal(DEPLOYER, name);
      const receipt = pub('sell', [rung, Cl.uint(amount)]);
      expect(receipt.result).toEqual(Cl.ok(Cl.uint(amount)));
      expect(read('get-rung-principal', [rung])).toBeLessThanOrEqual(amount);
    }
  });

  it('computes vwap and the buy-back cap with the contract rounding, including zero inventory', function () {
    expect(read('vwap-sell')).toBe(0n);
    expect(read('buy-back-cap')).toBe(0n);
    seedInventory(3n, 1_000_001n);
    const vwap = (1_000_001n * PRICE_SCALE) / 3n;
    expect(read('vwap-sell')).toBe(vwap);
    for (const edge of [0n, 25n, 9999n]) {
      expect(pub('set-edge-bps', [Cl.uint(edge)]).result).toEqual(Cl.ok(Cl.bool(true)));
      const numerator = vwap * (BPS - edge);
      const cap = numerator / BPS;
      expect(read('buy-back-cap')).toBe(cap);
      expect(cap * BPS).toBeLessThanOrEqual(numerator);
      expect((cap + 1n) * BPS).toBeGreaterThan(numerator);
      if (edge === 25n) expect(numerator % BPS).not.toBe(0n);
    }
  });

  it('does not book one consumed satoshi when the rung returns zero proceeds', function () {
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

  it('claims a real rung position both before and after proceeds arrive', function () {
    const amount = 1_000_000n;
    fundSbtc(amount);
    expect(pub('sell', [firstRung, Cl.uint(amount)]).result).toEqual(Cl.ok(Cl.uint(amount)));
    const emptyClaim = pub('claim', [firstRung]);
    expect(emptyClaim.result.type).toBe('ok');

    simnet.transferSTX(10_000_000n, RUNGS[0], owner);
    const paidClaim = pub('claim', [firstRung]);
    expect(paidClaim.result.type).toBe('ok');
    expect(read('get-state')['inv-stx']).toBeGreaterThan(0n);
    // A donation increases rung proceeds without consuming more principal.
    // This exposes the inv-sats/inv-stx divergence recorded in the RV report.
    expect(read('get-state')['inv-sats']).toBe(0n);
  });

  it('withdraws a rung position and rejects a non-allowlisted rung', function () {
    const amount = 1_000_000n;
    fundSbtc(amount);
    expect(pub('sell', [firstRung, Cl.uint(amount)]).result).toEqual(Cl.ok(Cl.uint(amount)));
    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(amount), Cl.none()], keeper), 8101);
    const badRung = deployBadRung();
    expectErr(pub('rung-withdraw', [Cl.contractPrincipal(owner, 'unlisted-rung'), Cl.uint(1), Cl.none()]), 8105);
    expectErr(pub('rung-withdraw', [firstRung, Cl.uint(0), Cl.none()]), 7004);
    simnet.mineEmptyBurnBlocks(8_640);
    const receipt = pub('rung-withdraw', [firstRung, Cl.uint(amount), Cl.none()]);
    expect(receipt.result.type).toBe('ok');
    expect(badRung).toBe(owner + '.unlisted-rung');
  });

  it('returns zero-amount, no-inventory, over-inventory, and zero-cap errors', function () {
    expectErr(pub('sell', [firstRung, Cl.uint(0)]), 8106);
    expect(pub('sell', [firstRung, Cl.uint(1)]).result.type).toBe('err');
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(0)]), 8108);

    simnet.transferSTX(1_000_000n, vault, owner);
    seedInventory(10_000_000_000_000_000n, 1_000_000n);
    expect(read('vwap-sell')).toBe(1n);
    expect(read('buy-back-cap')).toBe(0n);
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(0)]), 8111);
    expectErr(pub('reprice', [Cl.uint(0)]), 8111);

    simnet.transferSTX(1_000n, vault, owner);
    seedInventory(100n, 1_000n);
    expectErr(pub('buy-back', [Cl.uint(1_001_001), Cl.uint(0)]), 8109);
  });

  it('checks buy-back and reprice spread, inventory, cap, then places and cancels a real market order', function () {
    expectErr(pub('buy-back', [Cl.uint(0), Cl.uint(0)]), 8106);
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(10_000)]), 8110);
    expectErr(pub('buy-back', [Cl.uint(1), Cl.uint(0)], stranger), 8102);
    expectErr(pub('reprice', [Cl.uint(10_000)]), 8110);
    expectErr(pub('reprice', [Cl.uint(0)], stranger), 8102);
    expectErr(pub('reprice', [Cl.uint(0)]), 8108);
    expectErr(pub('cancel-buy-back', [], keeper), 8101);
    expect(pub('cancel-buy-back').result.type).toBe('err');

    simnet.transferSTX(10_000_000n, vault, owner);
    seedInventory(1_000n, 10_000_000n);
    const expectedCap = (10_000_000n * PRICE_SCALE / 1_000n) * 9_975n / BPS;
    const placed = pub('buy-back', [Cl.uint(1_000_000), Cl.uint(0)]);
    expect(placed.result).toEqual(Cl.ok(Cl.uint(expectedCap)));
    expect(pub('buy-back', [Cl.uint(1), Cl.uint(0)]).result.type).toBe('err');
    // The mainnet market excludes pending orders from set-token-y-limit.
    expectErr(pub('reprice', [Cl.uint(25)]), 1005);
    expect(pub('cancel-buy-back').result.type).toBe('ok');
  });

  it('reconciles partial STX spend pro rata without resetting the inventory', function () {
    seedInventory(2_000n, 2_000_000n);
    simnet.transferSTX(1_500_000n, vault, owner);
    const receipt = pub('reconcile');
    expect(receipt.result.type).toBe('ok');
    expect(read('get-state')['inv-stx']).toBe(1_500_000n);
    expect(read('get-state')['inv-sats']).toBe(1_500n);
    expect(read('vwap-sell')).toBe(10_000_000_000_000n);
  });

  it('resets open inventory below the STX dust threshold', function () {
    seedInventory(2_000n, 2_000_000n);
    simnet.transferSTX(Number(RESET_DUST_USTX - 1n), vault, owner);
    const receipt = pub('reconcile');
    expect(receipt.result.type).toBe('ok');
    expect(read('get-state')['inv-stx']).toBe(0n);
    expect(read('get-state')['inv-sats']).toBe(0n);
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
    expectErr(pub('withdraw-stx', [Cl.uint(0)]), 8106);
    expectErr(pub('withdraw-sbtc', [Cl.uint(0)]), 8106);
    expectErr(pub('withdraw-stx', [Cl.uint(500)], keeper), 8101);
    expectErr(pub('withdraw-stx', [Cl.uint(500)], stranger), 8101);
    expectErr(pub('withdraw-sbtc', [Cl.uint(500)], keeper), 8101);
    expectErr(pub('withdraw-sbtc', [Cl.uint(500)], stranger), 8101);
    expect(pub('withdraw-stx', [Cl.uint(500)]).result).toEqual(Cl.ok(Cl.uint(500)));
    expect(pub('withdraw-sbtc', [Cl.uint(500)]).result).toEqual(Cl.ok(Cl.uint(500)));
    expect(stxBalance(owner)).toBe(ownerStxBefore + 500n);
    expect(sbtcBalance(owner)).toBe(ownerSbtcBefore + 500n);
    expect(stxBalance(recipient)).toBe(recipientStxBefore);
    expect(sbtcBalance(recipient)).toBe(recipientSbtcBefore);
  });
});
