// STX short protocol unit tests (Clarinet SDK, pinned mainnet fork for the
// real USDCx token). The market, router and oracle are test doubles deployed
// by the manifest under the names the vault binds (see Clarinet-short.toml);
// the real Jing market / router are exercised by simulations/verify-stx-short.mjs.
// No beforeAll/beforeEach: every test arranges its own state (initBeforeEach
// resets the simnet).
import { describe, expect, it } from 'vitest';
import { Cl, ClarityValue } from '@stacks/transactions';
import { tx } from '@stacks/clarinet-sdk';

const deployer = simnet.deployer;
const VAULT = `${deployer}.stx-short-vault`;
const POOL = `${deployer}.stx-short-pool`;
const RATE = `${deployer}.stx-short-rate-model`;
const ORACLE = `${deployer}.stx-short-oracle`;
const MARKET = `${deployer}.markets-stx-usdcx-jing-v6-4`;
const ROUTER = `${deployer}.swap-router-stx-usdcx-jing-v5-5`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';

const accounts = simnet.getAccounts();
const LENDER = accounts.get('wallet_1')!;
const LENDER2 = accounts.get('wallet_2')!;
const SHORTER = accounts.get('wallet_3')!;
const KEEPER = accounts.get('wallet_4')!;
const TREASURY = deployer;

const STX = 1_000_000n;
const USD = 1_000_000n;
const P50 = 50_000_000n; // 0.50 USDC per STX, market unit (x 1e8)
const UPDATE = Cl.bufferFromHex('00');

const ST = { OPENING: 1n, OPEN: 2n, CLOSING: 3n, LIQUIDATING: 4n, CLOSED: 5n, CANCELLED: 6n, LIQUIDATED: 7n };

// ---------- helpers ----------

function call(contract: string, fn: string, args: ClarityValue[], sender: string): any {
  return simnet.callPublicFn(contract, fn, args, sender).result;
}

function read(contract: string, fn: string, args: ClarityValue[] = []): any {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
}

function ok(r: any): any {
  expect(r.type, JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe('ok');
  return r.value;
}

function errCode(r: any): bigint {
  expect(r.type).toBe('err');
  return r.value.value;
}

function plain(v: any): any {
  if (v === null || v === undefined) return v;
  switch (v.type) {
    case 'uint':
    case 'int':
      return v.value as bigint;
    case 'true':
      return true;
    case 'false':
      return false;
    case 'address':
    case 'contract':
      return v.value;
    case 'none':
      return null;
    case 'some':
    case 'ok':
    case 'err':
      return plain(v.value);
    case 'tuple': {
      const o: any = {};
      for (const [k, x] of Object.entries(v.value)) o[k] = plain(x);
      return o;
    }
    default:
      return v.value;
  }
}

function usdc(who: string): bigint {
  return plain(read(USDCX, 'get-balance', [Cl.principal(who)]));
}

function stx(who: string): bigint {
  const assets = simnet.getAssetsMap().get('STX');
  return assets?.get(who) ?? 0n;
}

function fundUsdc(to: string, amount: bigint): void {
  ok(call(USDCX, 'transfer', [Cl.uint(amount), Cl.principal(USDC_WHALE), Cl.principal(to), Cl.none()], USDC_WHALE));
}

function pos(id: bigint): any {
  return plain(read(VAULT, 'get-position', [Cl.uint(id)]));
}

function pool(): any {
  return plain(read(POOL, 'get-pool'));
}

function setPrice(p: bigint): void {
  ok(call(ORACLE, 'set-price', [Cl.uint(p)], deployer));
  ok(call(ROUTER, 'mock-set-rate', [Cl.uint(p)], deployer));
}

function now(): bigint {
  return plain(simnet.execute('stacks-block-time').result);
}

function advanceSecs(secs: bigint): void {
  const target = now() + secs;
  while (now() <= target) simnet.mineEmptyBurnBlocks(1);
}

// world: lender pool funded, venues funded, oracle at 0.50
function world(poolStx = 10_000n * STX): void {
  simnet.mintSTX(LENDER, 100_000n * STX);
  simnet.mintSTX(LENDER2, 100_000n * STX);
  simnet.mintSTX(SHORTER, 100n * STX);
  simnet.mintSTX(KEEPER, 100n * STX);
  // mintSTX only takes standard principals: fund the venue doubles by transfer
  simnet.mintSTX(deployer, 300_000n * STX);
  simnet.transferSTX(100_000n * STX, ROUTER, deployer);
  simnet.transferSTX(100_000n * STX, MARKET, deployer);
  fundUsdc(ROUTER, 50_000n * USD);
  fundUsdc(MARKET, 20_000n * USD);
  fundUsdc(SHORTER, 5_000n * USD);
  fundUsdc(KEEPER, 10n * USD);
  setPrice(P50);
  ok(call(POOL, 'deposit', [Cl.uint(poolStx)], LENDER));
}

type OpenOpts = {
  stx?: bigint;
  collateral?: bigint;
  tenor?: bigint | null;
  mode?: bigint;
  window?: bigint | null;
  limit?: bigint | null;
  slip?: bigint | null;
  incr?: bigint | null;
};

function openArgs(o: OpenOpts): ClarityValue[] {
  const opt = (v: bigint | null | undefined) => (v === null || v === undefined ? Cl.none() : Cl.some(Cl.uint(v)));
  return [
    Cl.uint(o.stx ?? 1_000n * STX),
    Cl.uint(o.collateral ?? 250n * USD),
    opt(o.tenor),
    Cl.uint(o.mode ?? 1n),
    opt(o.window),
    opt(o.limit),
    opt(o.slip),
    opt(o.incr ?? 10_000n),
    UPDATE,
  ];
}

function open(o: OpenOpts = {}, sender = SHORTER): any {
  return call(VAULT, 'open', openArgs(o), sender);
}

function closeArgs(id: bigint, mode = 1n, incr: bigint | null = 10_000n, window: bigint | null = null): ClarityValue[] {
  const opt = (v: bigint | null) => (v === null ? Cl.none() : Cl.some(Cl.uint(v)));
  return [Cl.uint(id), Cl.uint(mode), opt(window), Cl.none(), Cl.none(), opt(incr), UPDATE];
}

function step(id: bigint, sender = KEEPER): any {
  return call(VAULT, 'step', [Cl.uint(id), UPDATE], sender);
}

// keep stepping (one per block) until the position leaves `state`
function stepUntilNot(id: bigint, state: bigint, max = 60): number {
  let n = 0;
  while (pos(id).state === state && n < max) {
    const r = step(id);
    if (r.type === 'err' && r.value.value !== 5024n) throw new Error(`step err ${r.value.value}`);
    n++;
  }
  return n;
}

function expectNoResidual(): void {
  const slot = plain(read(VAULT, 'get-slot'));
  expect(slot.pos).toBeNull();
  expect(stx(VAULT)).toBe(slot['stx-booked']);
  expect(usdc(VAULT)).toBe(slot['usdc-booked']);
}

// ---------- rate model ----------

describe('rate model', function () {
  it('tiers on utilization, adds leverage premium, clamps to floor/cap', function () {
    // arrange / act
    const gc = plain(read(RATE, 'get-rate-bps', [Cl.uint(1000), Cl.uint(10_000)]));
    const warmMid = plain(read(RATE, 'get-rate-bps', [Cl.uint(6500), Cl.uint(10_000)]));
    const special = plain(read(RATE, 'get-rate-bps', [Cl.uint(9000), Cl.uint(10_000)]));
    const full = plain(read(RATE, 'get-rate-bps', [Cl.uint(10_000), Cl.uint(30_000)]));
    const lev2 = plain(read(RATE, 'get-rate-bps', [Cl.uint(1000), Cl.uint(20_000)]));
    // assert
    expect(gc).toBe(500n);
    expect(warmMid).toBe(1250n); // 500 + 1500 * 1500/3000
    expect(special).toBe(6000n); // 2000 + 8000 * 1000/2000
    expect(full).toBe(11_000n); // 10000 + 1000 premium
    expect(lev2).toBe(1000n); // 500 + 500
    expect(read(RATE, 'tier', [Cl.uint(4999)])).toEqual(Cl.stringAscii('gc'));
    expect(read(RATE, 'tier', [Cl.uint(8000)])).toEqual(Cl.stringAscii('warm'));
    expect(read(RATE, 'tier', [Cl.uint(8001)])).toEqual(Cl.stringAscii('special'));
  });

  it('quotes interest rounded up and rejects a non-monotone curve', function () {
    // act
    const q = plain(read(RATE, 'quote-interest', [Cl.uint(500n * USD), Cl.uint(1000), Cl.uint(259_200)]));
    const bad = call(RATE, 'set-curve', [Cl.uint(3000), Cl.uint(2000), Cl.uint(10_000), Cl.uint(0), Cl.uint(20_000), Cl.uint(0)], deployer);
    const notOwner = call(RATE, 'set-curve', [Cl.uint(1), Cl.uint(2), Cl.uint(3), Cl.uint(0), Cl.uint(3), Cl.uint(0)], SHORTER);
    // assert
    expect(q).toBe((500n * USD * 1000n * 259_200n + 10_000n * 31_536_000n - 1n) / (10_000n * 31_536_000n));
    expect(errCode(bad)).toBe(2002n);
    expect(errCode(notOwner)).toBe(2001n);
  });
});

// ---------- pool ----------

describe('lender pool', function () {
  it('mints shares 1:1 first, pro rata after, withdraws only idle STX', function () {
    // arrange
    world(1_000n * STX);
    // act
    ok(call(POOL, 'deposit', [Cl.uint(500n * STX)], LENDER2));
    const id = plain(ok(open({ stx: 1_000n * STX, collateral: 250n * USD })));
    const p = pool();
    const tooMuch = call(POOL, 'withdraw', [Cl.uint(1_000n * STX)], LENDER);
    const fine = call(POOL, 'withdraw', [Cl.uint(400n * STX)], LENDER);
    // assert
    expect(id).toBe(1n);
    expect(p['total-shares']).toBe(1_500n * STX);
    expect(p.lent).toBe(1_000n * STX);
    expect(p.idle).toBe(500n * STX);
    expect(errCode(tooMuch)).toBe(3006n);
    expect(plain(ok(fine))).toBe(400n * STX);
  });

  it('enforces the utilization cap and the absolute squeeze cap', function () {
    // arrange
    world(1_000n * STX);
    // act: 80% default cap
    const over = open({ stx: 801n * STX, collateral: 400n * USD });
    ok(call(POOL, 'set-max-lent', [Cl.uint(300n * STX)], deployer));
    const abs = open({ stx: 301n * STX, collateral: 200n * USD });
    const fits = open({ stx: 300n * STX, collateral: 200n * USD });
    const badCap = call(POOL, 'set-max-util-bps', [Cl.uint(9600)], deployer);
    // assert
    expect(errCode(over)).toBe(3007n);
    expect(errCode(abs)).toBe(3008n);
    expect(fits.type).toBe('ok');
    expect(errCode(badCap)).toBe(3009n);
  });

  it('only the vault can borrow / repay / add interest', function () {
    // arrange
    world();
    // act / assert
    expect(errCode(call(POOL, 'borrow', [Cl.uint(STX)], SHORTER))).toBe(3002n);
    expect(errCode(call(POOL, 'repay', [Cl.uint(0), Cl.uint(0)], SHORTER))).toBe(3002n);
    expect(errCode(call(POOL, 'add-interest', [Cl.uint(1)], SHORTER))).toBe(3002n);
  });
});

// ---------- open ----------

describe('open', function () {
  it('FAST full fill: borrows, sells at the router, locks proceeds, forwards interest net of fee', function () {
    // arrange
    world();
    const before = usdc(SHORTER);
    const treasuryBefore = usdc(TREASURY);
    // act
    const id = plain(ok(open()));
    const p = pos(id);
    const lp = pool();
    // assert: 1000 STX at 0.50 = 500 USDCx notional on 250 collateral = 2x
    expect(p.state).toBe(ST.OPEN);
    expect(p['lev-bps']).toBe(20_000n);
    expect(p['rate-bps']).toBe(1000n); // util 10% (gc 500) + 2x premium 500
    const interest = (500n * USD * 1000n * 259_200n + 10_000n * 31_536_000n - 1n) / (10_000n * 31_536_000n);
    expect(p['interest-paid']).toBe(interest);
    expect(before - usdc(SHORTER)).toBe(250n * USD + interest);
    expect(p.usdc).toBe(250n * USD + 500n * USD);
    expect(p.proceeds).toBe(500n * USD);
    expect(p.stx).toBe(0n);
    expect(lp.lent).toBe(1_000n * STX);
    const fee = interest / 10n;
    expect(usdc(TREASURY) - treasuryBefore).toBe(fee);
    expect(plain(read(POOL, 'pending-rewards', [Cl.principal(LENDER)]))).toBeLessThanOrEqual(interest - fee);
    expect(plain(read(POOL, 'pending-rewards', [Cl.principal(LENDER)]))).toBeGreaterThan(interest - fee - 2n);
    expectNoResidual();
  });

  it('FAST in increments: X% of the remainder per block until 100%', function () {
    // arrange
    world();
    // act
    const id = plain(ok(open({ incr: 5_000n })));
    const first = pos(id);
    // two keeper steps in one block: the second is refused (one increment per block)
    const block = simnet.mineBlock([
      tx.callPublicFn(VAULT, 'step', [Cl.uint(id), UPDATE], KEEPER),
      tx.callPublicFn(VAULT, 'step', [Cl.uint(id), UPDATE], LENDER),
    ]);
    const steps = stepUntilNot(id, ST.OPENING);
    const p = pos(id);
    // assert
    expect(first.state).toBe(ST.OPENING);
    expect(first.sold).toBe(500n * STX);
    expect(block[0].result.type).toBe('ok');
    expect(errCode(block[1].result)).toBe(5017n);
    expect(steps).toBeGreaterThan(3);
    expect(p.state).toBe(ST.OPEN);
    expect(p.sold).toBe(1_000n * STX);
    expectNoResidual();
  });

  it('rejects every rail breach', function () {
    // arrange
    world();
    // act / assert
    expect(errCode(open({ collateral: 166n * USD }))).toBe(5009n); // > 3x
    expect(errCode(open({ stx: 9n * STX, collateral: 10n * USD }))).toBe(5007n); // < min
    expect(errCode(open({ collateral: 0n }))).toBe(5008n);
    expect(errCode(open({ tenor: 60n }))).toBe(5010n);
    expect(errCode(open({ tenor: 40n * 86_400n }))).toBe(5010n);
    expect(errCode(open({ mode: 3n }))).toBe(5011n);
    expect(errCode(open({ mode: 2n, window: 7n }))).toBe(5012n);
    expect(errCode(open({ mode: 2n, window: 0n }))).toBe(5012n);
    expect(errCode(open({ mode: 2n, limit: (P50 * 103n) / 100n }))).toBe(5013n); // > +2% band
    expect(errCode(open({ slip: 301n }))).toBe(5014n);
    expect(errCode(open({ incr: 999n }))).toBe(5015n);
    // owner pause blocks opens only
    ok(call(VAULT, 'set-open-paused', [Cl.bool(true)], deployer));
    expect(errCode(open())).toBe(5002n);
  });

  it('oracle failure blocks open (no stale or missing price is ever used)', function () {
    // arrange
    world();
    ok(call(ORACLE, 'set-fail', [Cl.bool(true)], deployer));
    // act / assert
    expect(errCode(open())).toBe(4004n);
  });

  it('SMOOTH: rests on the batch market for the window, folds fills, then FAST for the rest', function () {
    // arrange
    world();
    // act
    const id = plain(ok(open({ mode: 2n, window: 2n })));
    const rested = pos(id);
    const busy = open({ mode: 2n }, SHORTER); // single smooth slot
    // batch 1: 400 STX fill at the limit (mid)
    ok(call(MARKET, 'mock-fill-x', [Cl.principal(VAULT), Cl.uint(400n * STX), Cl.uint(P50)], deployer));
    ok(call(MARKET, 'mock-next-cycle', [], deployer));
    const mid = plain(ok(step(id)));
    // batch 2 ends the window: the step pulls the rest and sells it FAST
    ok(call(MARKET, 'mock-next-cycle', [], deployer));
    const done = plain(ok(step(id)));
    // assert
    expect(rested.phase).toBe(2n);
    expect(rested['stx-mkt']).toBe(1_000n * STX);
    expect(errCode(busy)).toBe(5016n);
    expect(mid['stx-mkt']).toBe(600n * STX);
    expect(mid.proceeds).toBe(200n * USD);
    expect(done.state).toBe(ST.OPEN);
    expect(done.proceeds).toBe(500n * USD);
    expect(done.sold).toBe(1_000n * STX);
    expect(plain(read(VAULT, 'get-slot')).pos).toBeNull();
    expectNoResidual();
  });

  it('SMOOTH falls back to FAST when the market refuses the resting order', function () {
    // arrange
    world();
    ok(call(MARKET, 'mock-set-reject-deposits', [Cl.bool(true)], deployer));
    // act
    const id = plain(ok(open({ mode: 2n })));
    // assert
    expect(pos(id).state).toBe(ST.OPEN);
    expect(pos(id).phase).toBe(1n);
    expectNoResidual();
  });

  it('cancel on non-fill: nothing sells within bounds before the window ends', function () {
    // arrange
    world();
    const shorterBefore = usdc(SHORTER);
    ok(call(ROUTER, 'mock-set-rate', [Cl.uint((P50 * 95n) / 100n)], deployer)); // venue 5% under mid
    // act
    const id = plain(ok(open()));
    const stuck = pos(id);
    advanceSecs(1_801n);
    const r = plain(ok(step(id)));
    const lp = pool();
    // assert
    expect(stuck.state).toBe(ST.OPENING);
    expect(stuck.sold).toBe(0n);
    expect(r.state).toBe(ST.CANCELLED);
    expect(lp.lent).toBe(0n);
    expect(lp.idle).toBe(10_000n * STX);
    const interest = stuck.interest;
    const refund = (interest * 9_000n) / 10_000n; // 10% cancel fee
    expect(shorterBefore - usdc(SHORTER)).toBe(interest - refund);
    expectNoResidual();
  });

  it('partial fill then timeout: trims the debt to what sold, refunds interest on the rest', function () {
    // arrange
    world();
    ok(call(ROUTER, 'mock-set-depth', [Cl.uint(400n * STX)], deployer));
    // act
    const id = plain(ok(open()));
    ok(call(ROUTER, 'mock-set-rate', [Cl.uint((P50 * 90n) / 100n)], deployer));
    advanceSecs(1_801n);
    const p = plain(ok(step(id)));
    // assert
    expect(p.state).toBe(ST.OPEN);
    expect(p.debt).toBe(400n * STX);
    expect(pool().lent).toBe(400n * STX);
    expectNoResidual();
  });
});

// ---------- close ----------

describe('close', function () {
  it('FAST close after STX fell: repays exactly the STX borrowed, user keeps the profit', function () {
    // arrange
    world();
    const id = plain(ok(open()));
    const before = usdc(SHORTER);
    const idleBefore = pool().idle;
    setPrice(40_000_000n);
    // act
    ok(call(VAULT, 'close', closeArgs(id), SHORTER));
    stepUntilNot(id, ST.CLOSING);
    const p = pos(id);
    const lp = pool();
    // assert
    expect(p.state).toBe(ST.CLOSED);
    expect(lp.lent).toBe(0n);
    expect(lp.idle - idleBefore).toBe(1_000n * STX);
    expect(lp.losses).toBe(0n);
    // 750 USDCx - spent at 0.40 (budget at limit +1%, overshoot returned as STX)
    const got = usdc(SHORTER) - before;
    expect(got).toBe(750n * USD - p.spent);
    expect(got).toBeGreaterThan(340n * USD);
    expectNoResidual();
  });

  it('only the owner can close, only from OPEN', function () {
    // arrange
    world();
    const id = plain(ok(open()));
    // act / assert
    expect(errCode(call(VAULT, 'close', closeArgs(id), KEEPER))).toBe(5005n);
    ok(call(VAULT, 'close', closeArgs(id), SHORTER));
    expect(errCode(call(VAULT, 'close', closeArgs(id), SHORTER))).toBe(5006n);
  });

  it('SMOOTH close: rests a USDCx bid, fills in the batch, completes', function () {
    // arrange
    world();
    const id = plain(ok(open()));
    // act
    ok(call(VAULT, 'close', closeArgs(id, 2n, null, 3n), SHORTER));
    const resting = pos(id);
    ok(call(MARKET, 'mock-fill-y', [Cl.principal(VAULT), Cl.uint(resting['usdc-mkt']), Cl.uint(P50)], deployer));
    ok(call(MARKET, 'mock-next-cycle', [], deployer));
    ok(step(id));
    const p = pos(id);
    // assert
    expect(resting.state).toBe(ST.CLOSING);
    expect(resting['usdc-mkt']).toBe(500n * USD); // debt x limit (= mid)
    expect(p.state).toBe(ST.CLOSED);
    expect(pool().lent).toBe(0n);
    expectNoResidual();
  });
});

// ---------- extend ----------

describe('extend', function () {
  it('pays another tenor upfront at the current rate and moves the deadline', function () {
    // arrange
    world();
    const id = plain(ok(open({ tenor: 86_400n })));
    const p0 = pos(id);
    const before = usdc(SHORTER);
    // act
    const d = plain(ok(call(VAULT, 'extend', [Cl.uint(id), Cl.some(Cl.uint(86_400n)), UPDATE], SHORTER)));
    const p = pos(id);
    // assert
    expect(d).toBe(p0.deadline + 86_400n);
    expect(p['interest-paid']).toBeGreaterThan(p0['interest-paid']);
    expect(before - usdc(SHORTER)).toBe(p['interest-paid'] - p0['interest-paid']);
    expectNoResidual();
  });

  it('rejects when health is too low, after the deadline, or past the max horizon', function () {
    // arrange
    world();
    const id = plain(ok(open({ tenor: 3_600n })));
    // at defaults the 3x leverage cap binds before the 120% health floor
    // (3x equity => health >= 133% / 1.02); raise the floor to 140% to reach it
    ok(call(VAULT, 'set-risk', [Cl.uint(11_000), Cl.uint(14_000), Cl.uint(200), Cl.uint(300), Cl.uint(3_400), Cl.uint(3), Cl.uint(50), Cl.uint(1_000)], deployer));
    // act
    setPrice(55_000_000n); // health 750 / (550 x 1.02) = 13369 < 14000, leverage 2.75x
    const lowHealth = call(VAULT, 'extend', [Cl.uint(id), Cl.some(Cl.uint(3_600n)), UPDATE], SHORTER);
    setPrice(P50);
    const horizon = call(VAULT, 'extend', [Cl.uint(id), Cl.some(Cl.uint(30n * 86_400n)), UPDATE], SHORTER);
    advanceSecs(3_700n);
    const late = call(VAULT, 'extend', [Cl.uint(id), Cl.none(), UPDATE], SHORTER);
    // assert
    expect(errCode(lowHealth)).toBe(5019n);
    expect(errCode(horizon)).toBe(5010n);
    expect(errCode(late)).toBe(5021n);
  });
});

// ---------- liquidation ----------

describe('liquidation', function () {
  it('by health: keeper triggers, FAST buyback with presets after the offset, bounty, user gets the rest', function () {
    // arrange
    world();
    const id = plain(ok(open()));
    const keeperBefore = usdc(KEEPER);
    const userBefore = usdc(SHORTER);
    // act
    const healthy = call(VAULT, 'liquidate', [Cl.uint(id), UPDATE], KEEPER);
    setPrice(70_000_000n); // 750 / (700 x 1.02) = 10504 bps < 11000
    const health = plain(read(VAULT, 'health-at', [Cl.uint(id), Cl.uint(70_000_000n)]));
    ok(call(VAULT, 'liquidate', [Cl.uint(id), UPDATE], KEEPER));
    const userClose = call(VAULT, 'close', closeArgs(id), SHORTER);
    stepUntilNot(id, ST.LIQUIDATING);
    const p = pos(id);
    // assert
    expect(errCode(healthy)).toBe(5018n);
    expect(health).toBeLessThan(11_000n);
    expect(errCode(userClose)).toBe(5006n);
    expect(p.state).toBe(ST.LIQUIDATED);
    expect(pool().lent).toBe(0n);
    expect(pool().losses).toBe(0n);
    const bounty = (700n * USD * 50n) / 10_000n;
    expect(usdc(KEEPER) - keeperBefore).toBe(bounty);
    expect(usdc(SHORTER) - userBefore).toBe(750n * USD - p.spent - bounty);
    expectNoResidual();
  });

  it('by deadline: an OPEN position past its tenor is liquidatable even when healthy', function () {
    // arrange
    world();
    const id = plain(ok(open({ tenor: 3_600n })));
    // act
    const early = call(VAULT, 'liquidate', [Cl.uint(id), UPDATE], KEEPER);
    advanceSecs(3_700n);
    ok(call(VAULT, 'liquidate', [Cl.uint(id), UPDATE], KEEPER));
    stepUntilNot(id, ST.LIQUIDATING);
    // assert
    expect(errCode(early)).toBe(5018n);
    expect(pos(id).state).toBe(ST.LIQUIDATED);
    expect(pool().lent).toBe(0n);
    expectNoResidual();
  });

  it('waits out the unpredictable start offset (no buy in the trigger block)', function () {
    // arrange
    world();
    const id = plain(ok(open({ tenor: 3_600n })));
    advanceSecs(3_700n);
    ok(call(VAULT, 'liquidate', [Cl.uint(id), UPDATE], KEEPER));
    const liqHeight = pos(id)['liq-height'];
    // act
    const offset = plain(read(VAULT, 'liq-offset', [Cl.uint(liqHeight)]));
    let attempts = 0;
    let firstOk = 0n;
    while (attempts < 10) {
      const r = step(id);
      attempts++;
      if (r.type === 'ok') {
        firstOk = BigInt(simnet.blockHeight - 1);
        break;
      }
      expect(r.value.value).toBe(5024n);
    }
    // assert
    expect(offset).toBeLessThanOrEqual(3n);
    expect(firstOk).toBeGreaterThanOrEqual(liqHeight + 1n + offset);
  });

  it('loss absorption: underwater position, shortfall lowers share value, lenders keep the USDCx rewards', function () {
    // arrange
    world(2_000n * STX);
    ok(call(POOL, 'deposit', [Cl.uint(2_000n * STX)], LENDER2));
    const id = plain(ok(open({ stx: 1_000n * STX, collateral: 167n * USD })));
    const sharesL2 = plain(read(POOL, 'get-shares', [Cl.principal(LENDER2)]));
    const valueBefore = plain(read(POOL, 'shares-to-stx', [Cl.uint(sharesL2)]));
    // act: STX doubles; assets 667 USDCx vs 1000 USDCx owed
    setPrice(100_000_000n);
    ok(call(VAULT, 'liquidate', [Cl.uint(id), UPDATE], KEEPER));
    stepUntilNot(id, ST.LIQUIDATING);
    const p = pos(id);
    const lp = pool();
    const valueAfter = plain(read(POOL, 'shares-to-stx', [Cl.uint(sharesL2)]));
    const out = plain(ok(call(POOL, 'withdraw', [Cl.uint(sharesL2)], LENDER2)));
    // assert
    expect(p.state).toBe(ST.LIQUIDATED);
    expect(lp.lent).toBe(0n);
    expect(lp.losses).toBeGreaterThan(330n * STX);
    expect(lp.losses).toBeLessThan(336n * STX);
    expect(lp['total-assets']).toBe(4_000n * STX - lp.losses);
    expect(valueAfter).toBeLessThan(valueBefore);
    expect(out).toBe(valueAfter);
    expect(valueBefore - valueAfter).toBeLessThanOrEqual(lp.losses / 2n + 1n);
    expect(plain(read(POOL, 'pending-rewards', [Cl.principal(LENDER2)]))).toBeGreaterThan(0n);
    expectNoResidual();
  });

  it('a liquidation cancels a resting SMOOTH close and takes over', function () {
    // arrange
    world();
    const id = plain(ok(open()));
    ok(call(VAULT, 'close', closeArgs(id, 2n, null, 3n), SHORTER));
    // act
    setPrice(70_000_000n);
    ok(call(VAULT, 'liquidate', [Cl.uint(id), UPDATE], KEEPER));
    const mid = pos(id);
    stepUntilNot(id, ST.LIQUIDATING);
    // assert
    expect(mid['usdc-mkt']).toBe(0n);
    expect(plain(read(VAULT, 'get-slot')).pos).toBeNull();
    expect(pos(id).state).toBe(ST.LIQUIDATED);
    expectNoResidual();
  });
});

// ---------- admin bounds ----------

describe('owner bounds', function () {
  it('every risk / rail setter is owner-only and bounded', function () {
    // arrange
    world();
    const risk = (t: number) => [Cl.uint(t), Cl.uint(12_000), Cl.uint(200), Cl.uint(300), Cl.uint(3_400), Cl.uint(3), Cl.uint(50), Cl.uint(1_000)];
    // act / assert
    expect(errCode(call(VAULT, 'set-risk', risk(11_000), SHORTER))).toBe(5001n);
    expect(errCode(call(VAULT, 'set-risk', risk(10_000), deployer))).toBe(5003n);
    expect(errCode(call(VAULT, 'set-risk', risk(16_000), deployer))).toBe(5003n);
    ok(call(VAULT, 'set-risk', risk(11_500), deployer));
    expect(errCode(call(POOL, 'set-fee-bps', [Cl.uint(3_001)], deployer))).toBe(3009n);
    expect(errCode(call(POOL, 'set-fee-bps', [Cl.uint(100)], SHORTER))).toBe(3001n);
  });
});
