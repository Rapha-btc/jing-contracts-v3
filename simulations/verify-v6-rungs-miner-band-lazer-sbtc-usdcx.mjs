// verify-v6-rungs-miner-band-lazer-sbtc-usdcx.mjs
// Port of verify-v6-rungs-miner-band-lazer.js to the sBTC/USDCx v6-5 set
// (template bytes, hash-checked; LIVE jing-core-v6 + jing-ladder-sbtc-usdcx-v1,
// fork at tip). On sBTC/USDCx the band rungs' guard is not the RFQ native STX
// price but DIA BTC/USD (SP1G48….dia-oracle get-value "BTC/USD", 8 decimals,
// the market's own price unit): miner-mid = DIA value when its timestamp is
// < 2 h old, <= 300 s ahead and the value <= 1e16, else u0.
//   sell-sbtc (rests sBTC, x): floor = miner-mid * 0.8   (STX: buy-stx, floor = native / 2)
//   buy-sbtc  (rests USDCx, y): cap  = miner-mid * 1.2   (STX: sell-stx, cap = native * 2)
//   M1 miner-mid > 0, within 1/2 .. 2x of the Pyth [1,7] mid (unit sanity);
//      floor / cap exact; stored guard u0 at initialize, the first push sets it
//   M2 a member deposit pushes with the floor as the order limit and (some u20);
//      effective ask at mid = mid + 20 bps
//   M3 refresh-guard by a stranger re-sets the market's limit
//   M4/M5 the buy rung mirror (cap, bid at mid - 20 bps, refresh-guard)
//   D  DIA bounds (new for this guard): the DIA updater (impersonated on the
//      fork) writes boundary values: age 7199 s ok / 7200 s -> 0, 300 s ahead
//      ok / 301 s -> 0, value 1e16 ok / 1e16+1 -> 0; with miner-mid 0
//      refresh-guard -> u7008 and a member deposit is held, not pushed
//   S  protected seats on the live ladder (10 seats per side, all held):
//      seat cap via max-band, queue-full refusal at 40 open-region makers,
//      parking never takes the rung, a same-bps v2 replaces the holder, a
//      same-code deploy by a stranger replaces it again, retire + prune.
// Run: node simulations/verify-v6-rungs-miner-band-lazer-sbtc-usdcx.mjs
import {
  startFork, setupMarket, deployRung, fundX, fundY, bal, rid, TR, AS, ok, err, freshUpd, prints,
  DEP, LADDER, MARKET, SBTC, S, P_, check, must, show, tx, evalIn, call, deploy, uintCV, noneCV, boolCV, stringAsciiCV,
} from './_rungs-sbtc-usdcx.mjs';
import { SBTC_WHALE, USDC_WHALE, bytes } from './_sbtc-usdcx-v6-5-common.mjs';
import { summary } from './_yg-loop-common.js';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { submitSimulationSteps } from 'stxer';

const DIA = 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle';
const A = SBTC_WHALE, SY = USDC_WHALE;
const KEEPER = 'SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3';
const FILLERS = Array.from({ length: 41 }, (_, i) => getAddressFromPrivateKey((i + 300).toString(16).padStart(64, '0') + '01', 'mainnet'));
const FILL = 2000n, BPS = 20n;
const SELL = rid('x', 20), BUY = rid('y', 20);
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const isRcpt = (v) => !!v?.ok && ['amount', 'epoch', 'sbtc-paid', 'shares', 'stx-paid'].every((k) => typeof v.ok[k] === 'bigint');
let U;
const upd = async () => (U = await freshUpd(U));
const settle = async (label, side, who, amount) => { await upd(); return tx(label, KEEPER, MARKET, `settle-token-${side}-deposit`, [P_(who), U.cv, TR[side], AS[side]], { ok: amount }); };

try {
  await startFork('=== v6 rungs: DIA miner-band guard (sBTC/USDCx v6-5 band rungs) ===');
  group('setup');
  const { ladderOwner: LO } = await setupMarket();
  await deployRung('x', 20); await deployRung('y', 20);
  await tx('canonical sel-band = jing-sell-sbtc-20-v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL)], { ok: true });
  await tx('canonical buy-band = jing-buy-sbtc-20-v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY)], { ok: true });
  await upd();
  const MID = U.mid;
  console.log(`  pyth [1,7] mid ${MID}`);

  group('M1 the band');
  const mm = await evalIn(SELL, '(miner-mid)'), mmB = await evalIn(BUY, '(miner-mid)');
  const dia = (await evalIn(DIA, '(get-value "BTC/USD")')).ok;
  check('M1 miner-mid (sell rung, DIA BTC/USD) > 0 on a mainnet fork', mm > 0n, `${mm}`);
  check('M1 miner-mid = the DIA BTC/USD value (fresh, sane)', mm === dia.value, `${mm} vs ${show(dia)}`);
  check('M1 both rungs read the same miner-mid', mmB === mm);
  check('M1 miner-mid within 1/2 .. 2x of the Pyth mid (same unit)', mm > MID / 2n && mm < MID * 2n, `ratio ${Number(mm * 1000n / MID) / 1000}`);
  check('M1 current-floor (sell) = miner-mid * 8000 / 10000', (await evalIn(SELL, '(current-floor)')) === mm * 8000n / 10000n);
  check('M1 current-cap (buy) = miner-mid * 12000 / 10000', (await evalIn(BUY, '(current-cap)')) === mm * 12000n / 10000n);
  await tx('init jing-sell-sbtc-20-v2 (u20, seat)', LO, SELL, 'initialize', [uintCV(BPS), boolCV(true)], { ok: true });
  await tx('init jing-buy-sbtc-20-v2 (u20, seat)', LO, BUY, 'initialize', [uintCV(BPS), boolCV(true)], { ok: true });
  check('M1 stored floor after init is u0 (the first push sets it)', (await evalIn(SELL, '(get-floor)')) === 0n);
  check('M1 stored cap after init is u0', (await evalIn(BUY, '(get-cap)')) === 0n);
  await tx('M1 init again -> u7002', LO, SELL, 'initialize', [uintCV(BPS), boolCV(true)], err(7002));

  group('M2 a push rests with the band as its floor');
  const BID5 = 5_000_000n;
  await tx('M2 SY rests a 5 USDCx bid at -5% (the y side is not empty: x deposits need a price)', SY, MARKET, 'deposit-token-y', [uintCV(BID5), uintCV(MID * 95n / 100n), noneCV(), TR.y, AS.y], { ok: BID5 });
  await tx('M2 A deposits 20000 sats: pushed (escrowed) with floor = miner-mid * 0.8', A, SELL, 'deposit', [uintCV(20000)], isRcpt);
  await settle('M2 admit sell-rung escrow with a newer price', 'x', SELL, 20000n);
  { const s = await evalIn(SELL, '(get-state)'); check('M2 held 0, resting 20000', s['held-sats'] === 0n && s.resting === 20000n, show(s)); }
  const FLOOR = mm * 8000n / 10000n, CAP = mm * 12000n / 10000n;
  check('M2 the market holds the band floor as the rung limit', (await evalIn(MARKET, `(get-token-x-limit '${SELL})`)) === FLOOR);
  check('M2 the rung stored floor after the first push', (await evalIn(SELL, '(get-floor)')) === FLOOR);
  { const o = await evalIn(MARKET, `(get-token-x-order '${SELL})`); check('M2 order (some u20)', o?.['spread-bps'] === BPS, show(o)); }
  { const want = MID * (10000n + BPS) / 10000n, got = await evalIn(MARKET, `(token-x-limit-at '${SELL} u${MID})`); check(`M2 effective ask at mid = mid + 20 bps (${want})`, got === want, `${got}`); }

  group('M3 refresh-guard by a stranger');
  await tx('M3 keeper refresh-guard (sell) -> ok', KEEPER, SELL, 'refresh-guard', [], ok);
  await upd();
  await tx('M3 settle refreshed sell limit', KEEPER, MARKET, 'settle-token-x-limit', [P_(SELL), U.cv], { ok: true });
  check('M3 limit after refresh (same block: unchanged)', (await evalIn(MARKET, `(get-token-x-limit '${SELL})`)) === FLOOR);

  group('M4/M5 the buy rung');
  await tx('M4 SY deposits 5 USDCx into the buy rung: pushed (escrowed) with cap = miner-mid * 1.2', SY, BUY, 'deposit', [uintCV(BID5)], isRcpt);
  await settle('M4 admit buy-rung escrow with a newer price', 'y', BUY, BID5);
  { const s = await evalIn(BUY, '(get-state)'); check('M4 held 0, resting 5 USDCx', s['held-uusdcx'] === 0n && s.resting === BID5, show(s)); }
  check('M4 the market holds the band cap as the buy rung limit', (await evalIn(MARKET, `(get-token-y-limit '${BUY})`)) === CAP);
  { const want = MID * (10000n - BPS) / 10000n, got = await evalIn(MARKET, `(token-y-limit-at '${BUY} u${MID})`); check(`M4 effective bid at mid = mid - 20 bps (${want})`, got === want, `${got}`); }
  await tx('M5 keeper refresh-guard (buy) -> ok', KEEPER, BUY, 'refresh-guard', [], ok);
  await upd();
  await tx('M5 settle refreshed buy limit', KEEPER, MARKET, 'settle-token-y-limit', [P_(BUY), U.cv], { ok: true });

  group('S protected seats (live ladder: 10 per side, all held)');
  const ASK_NEAR = MID * 105n / 100n;
  const cnt = async (s) => evalIn(LADDER, `(get-band-count "${s}")`);
  check('S1 the sell rung holds a seat on x', (await evalIn(MARKET, `(is-protected-x '${SELL})`)) === true);
  check('S1 band count sel-band 10 (the v2 rung replaced the live bps-20 holder)', (await cnt('sel-band')) === 10n);
  check('S1 the buy rung holds a seat on y', (await evalIn(MARKET, `(is-protected-y '${BUY})`)) === true);
  check('S1 band count buy-band 10', (await cnt('buy-band')) === 10n);
  check('S1 max-band-per-side 10 (the ladder number)', (await evalIn(LADDER, '(get-max-band-per-side)')) === 10n);
  check('S1 the market local copy says 10 seats', (await evalIn(MARKET, '(protected-seats)')) === 10n);
  await tx('S1 owner cannot set the max under the seats held (10) -> u6011', LO, LADDER, 'set-max-band-per-side', [uintCV(9)], err(6011));
  await tx('S1 owner sets the max to 12 -> ok', LO, LADDER, 'set-max-band-per-side', [uintCV(12)], { ok: true });
  check('S1 the market still says 10 until a sync', (await evalIn(MARKET, '(protected-seats)')) === 10n);
  await tx('S1 anyone syncs the count', KEEPER, MARKET, 'sync-seat-count', [], ok);
  check('S1 the market now says 12', (await evalIn(MARKET, '(protected-seats)')) === 12n);
  await tx('S1 owner sets it back to 10', LO, LADDER, 'set-max-band-per-side', [uintCV(10)], { ok: true });
  await tx('S1 sync again', KEEPER, MARKET, 'sync-seat-count', [], ok);
  check('S1 the market says 10', (await evalIn(MARKET, '(protected-seats)')) === 10n);
  await tx('S1 a stranger cannot set it -> u6001', KEEPER, LADDER, 'set-max-band-per-side', [uintCV(3)], err(6001));
  await tx('S1 sync-seat on a principal the ladder does not seat -> u1028', KEEPER, MARKET, 'sync-seat', [P_(KEEPER)], err(1028));
  for (let i = 0; i < FILLERS.length; i++) {
    await fundX(FILLERS[i], FILL);
    if (i < 40) {
      await tx(`S2 filler ${i + 1} rests ${FILL} at +5%`, FILLERS[i], MARKET, 'deposit-token-x', [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), TR.x, AS.x], { ok: FILL });
      await settle(`S2 admit filler ${i + 1}`, 'x', FILLERS[i], FILL);
    }
  }
  const cyc = await evalIn(MARKET, '(get-current-cycle)');
  check('S2 x side: 40 fillers + the rung = 41', (await evalIn(MARKET, `(len (get-token-x-depositors u${cyc}))`)) === 41n);
  await tx('S3 filler 41 at +5%: full open region: submit escrows pending', FILLERS[40], MARKET, 'deposit-token-x', [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), TR.x, AS.x], { ok: FILL });
  const refused = await settle('S3 queue-full settle refunds the entrant', 'x', FILLERS[40], FILL);
  check('S3 committed queue-full event', prints(refused.receipt).some((p) => p.event === 'pending-refund-x' && p.reason === 'queue-full'), show(prints(refused.receipt)));
  check('S3 refund clears pending', (await evalIn(MARKET, `(get-token-x-pending-deposit '${FILLERS[40]})`)) === null);
  check('S3 refused entrant never live', (await evalIn(MARKET, `(get-token-x-deposit u${cyc} '${FILLERS[40]})`)) === 0n);
  check('S3 exact refund', (await bal('x', FILLERS[40])) === FILL);
  check('S3 still 41', (await evalIn(MARKET, `(len (get-token-x-depositors u${cyc}))`)) === 41n);
  await tx('S4 A tops the rung up by 1000: a protected maker only sees the hard cap -> pushed', A, SELL, 'deposit', [uintCV(1000)], isRcpt);
  await settle('S4 admit protected top-up', 'x', SELL, 1000n);
  { const s = await evalIn(SELL, '(get-state)'); check('S4 rung resting 21000', s.resting === 21000n && s['held-sats'] === 0n, show(s)); }
  await fundX(KEEPER, 3000n);
  await tx('S5 an in-range ask (3000 at 1) on the full open region: parks the 10th best filler, never the rung', KEEPER, MARKET, 'deposit-token-x', [uintCV(3000), uintCV(1), noneCV(), TR.x, AS.x], { ok: 3000n });
  await settle('S5 admit parker with a newer price', 'x', KEEPER, 3000n);
  check('S5 the rung is still live with 21000', (await evalIn(MARKET, `(get-token-x-deposit u${cyc} '${SELL})`)) === 21000n);
  check('S5 the rung is not parked', (await evalIn(MARKET, `(get-token-x-parked '${SELL})`)) === 0n);
  check('S5 still 41 on the side (one filler parked, the parker in)', (await evalIn(MARKET, `(len (get-token-x-depositors u${cyc}))`)) === 41n);
  check('S5 x total 102000: 39 fillers + 21000 rung + 3000 parker', (await evalIn(MARKET, `(get total-token-x (get-cycle-totals u${cyc}))`)) === 102000n);
  const SELL30 = rid('x', 30);
  const live30 = await evalIn(LADDER, '(get-rung "sel-band" u30)');
  await deployRung('x', 30);
  await tx('S6 init jing-sell-sbtc-30-v2 (u30): takes bps 30 from the live holder', LO, SELL30, 'initialize', [uintCV(30), boolCV(true)], { ok: true });
  check('S6 band count sel-band still 10 (a replace, not a new seat)', (await cnt('sel-band')) === 10n);
  check('S6 the second rung holds a seat on the v6-5 market', (await evalIn(MARKET, `(is-protected-x '${SELL30})`)) === true);
  check('S6 the live v1 holder of bps 30 is registered, not current', (await evalIn(LADDER, `(is-registered '${live30})`)) === true && (await evalIn(LADDER, `(is-current-rung '${live30})`)) === false, show(live30));
  const K30 = `${KEEPER}.jing-sell-sbtc-30-v2`;
  await deployRung('x', 30, KEEPER);
  await tx('S8 keeper initializes its own deploy -> u7001: only the ladder owner seats a band rung', KEEPER, K30, 'initialize', [uintCV(30), boolCV(true)], err(7001));
  check('S8 the deployer spread-30 rung still holds the seat', (await evalIn(MARKET, `(is-protected-x '${SELL30})`)) === true);
  await tx('S8 the ladder owner initializes the keeper deploy: replaces the deployer spread-30 rung', LO, K30, 'initialize', [uintCV(30), boolCV(true)], { ok: true });
  check('S8 band count sel-band still 10', (await cnt('sel-band')) === 10n);
  check('S8 the new rung holds the seat (it synced itself)', (await evalIn(MARKET, `(is-protected-x '${K30})`)) === true);
  check('S8 the old rung lost it in the same sync (prune)', (await evalIn(MARKET, `(is-protected-x '${SELL30})`)) === false);
  await tx('S8 sync-seat on the replaced rung -> u1028', KEEPER, MARKET, 'sync-seat', [P_(SELL30)], err(1028));
  check('S8 the seated list on x is the two current v2 rungs', (await evalIn(MARKET, '(len (get-seated-x))')) === 2n);
  check('S8 the old rung stays registered', (await evalIn(LADDER, `(is-registered '${SELL30})`)) === true);
  check('S8 ... but is not current', (await evalIn(LADDER, `(is-current-rung '${SELL30})`)) === false);
  await tx('S9 stranger cannot retire -> u6001', KEEPER, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(30)], err(6001));
  await tx('S9 retire an empty spread (5) -> u6010', LO, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(5)], err(6010));
  await tx('S9 owner retires spread 30', LO, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(30)], { ok: true });
  check('S9 band count sel-band 9', (await cnt('sel-band')) === 9n);
  check('S9 the retired rung still shows a seat in the copy until any sync', (await evalIn(MARKET, `(is-protected-x '${K30})`)) === true);
  await tx('S9 anyone syncs any seated rung (spread 20): the prune drops the retired one', KEEPER, MARKET, 'sync-seat', [P_(SELL)], ok);
  check('S9 the retired rung no longer holds a seat', (await evalIn(MARKET, `(is-protected-x '${K30})`)) === false);
  check('S9 the seated list on x is back to one', (await evalIn(MARKET, '(len (get-seated-x))')) === 1n);
  check('S9 the retired rung stays registered', (await evalIn(LADDER, `(is-registered '${K30})`)) === true);
  check('S9 ... but is not current', (await evalIn(LADDER, `(is-current-rung '${K30})`)) === false);
  check('S9 spread 30 is free', (await evalIn(LADDER, '(get-rung "sel-band" u30)')) === null);
  check('S9 the spread-20 rung still holds its seat', (await evalIn(MARKET, `(is-protected-x '${SELL})`)) === true);

  group('D DIA guard bounds (updater impersonated on the fork)');
  const UPDATER = await evalIn(DIA, '(get-oracle-updater)');
  const now = await evalIn(SELL, 'stacks-block-time');
  const setDia = (label, value, tsSec) => tx(label, UPDATER, DIA, 'set-value', [stringAsciiCV('BTC/USD'), uintCV(value), uintCV(tsSec * 1000n)], ok);
  const V = mm;
  const cases = [
    ['age 7199 s -> live', V, now - 7199n, V], ['age 7200 s -> u0 (stale)', V, now - 7200n, 0n],
    ['300 s ahead -> live', V, now + 300n, V], ['301 s ahead -> u0 (future)', V, now + 301n, 0n],
    ['value 1e16 -> live', 10n ** 16n, now, 10n ** 16n], ['value 1e16 + 1 -> u0 (insane)', 10n ** 16n + 1n, now, 0n],
  ];
  for (const [tag, v, ts, want] of cases) {
    await setDia(`D set DIA ${tag}`, v, ts);
    check(`D miner-mid ${tag}`, (await evalIn(SELL, '(miner-mid)')) === want && (await evalIn(BUY, '(miner-mid)')) === want, `${await evalIn(SELL, '(miner-mid)')}`);
  }
  check('D guard 0: current-floor u0 and current-cap u0', (await evalIn(SELL, '(current-floor)')) === 0n && (await evalIn(BUY, '(current-cap)')) === 0n);
  await tx('D refresh-guard with miner-mid 0 -> ERR_ZERO_PRICE u7008 (sell)', KEEPER, SELL, 'refresh-guard', [], err(7008));
  await tx('D refresh-guard with miner-mid 0 -> u7008 (buy)', KEEPER, BUY, 'refresh-guard', [], err(7008));
  check('D the market keeps the last good floor', (await evalIn(MARKET, `(get-token-x-limit '${SELL})`)) === FLOOR);
  await fundX(KEEPER, 5000n);
  await tx('D a member deposit with miner-mid 0 is HELD, not pushed (push fails u7008, deposit ok)', KEEPER, SELL, 'deposit', [uintCV(5000)], isRcpt);
  { const s = await evalIn(SELL, '(get-state)'); check('D held 5000, resting still 21000', s['held-sats'] === 5000n && s.resting === 21000n, show(s)); }
  await tx('D keeper push while the guard is 0 -> (ok false)', KEEPER, SELL, 'push', [], { ok: false });
  await setDia('D restore DIA (live value, now)', V, now);
  await tx('D keeper push with DIA back -> (ok true)', KEEPER, SELL, 'push', [], { ok: true });
  await settle('D admit the pushed 5000', 'x', SELL, 5000n);
  check('D rung resting 26000 at the floor from DIA', (await evalIn(MARKET, `(get-token-x-deposit u${cyc} '${SELL})`)) === 26000n && (await evalIn(MARKET, `(get-token-x-limit '${SELL})`)) === FLOOR);
} catch (e) { console.error(e); S.fails.push(`STOP: ${e.message}`); }
summary();
if (S.fails.length) process.exitCode = 1;
