// verify-v6-rungs-fill-lazer-sbtc-usdcx.mjs
// Port of verify-v6-rungs-fill-lazer.js to the sBTC/USDCx v6-5 set (template
// bytes, hash-checked; LIVE jing-core-v6 + jing-ladder-sbtc-usdcx-v1; fork
// pinned at the block before the v6-5 market went live). Real fills with
// signed [1,7] prints (keyless route).
// The STX suite uses FIXED rungs priced 1% outside the mid. sBTC/USDCx has only
// band rungs, so the same walk runs on band rungs at 90 bps (just outside the
// mid on both sides, the closest live-ladder bps to the STX suite's 1%):
//   F1 jing-sell-sbtc-90-v2 (rests sBTC, ask mid + 90 bps) and
//      jing-buy-sbtc-90-v2 (rests USDCx, bid mid - 90 bps) rest; orders carry
//      the DIA guard as limit and (some u90)
//   F2 a taker pays USDCx: walks the sell rung's ask at its pegged price (one
//      match at mid + 90 bps); the buy rung's bid (under the mid) rolls with
//      its limit at the clearing; sync folds the fill in, the member claims,
//      the wallet moves by the claimed amount
//   F3 a taker sells sBTC: walks the buy rung's bid at mid - 90 bps; claim exact
//   F4 exits: what is left comes back, both pools empty
//   F5 SOLD OUT: a zero-spread buy-band rung (5 USDCx, in range at the mid)
//      next to a deep direct bid; one sBTC seller clears the rung whole in the
//      batch and walks the deep bid; the rung's sync closes its epoch, the
//      member claims from the closed epoch, withdraw -> u7006.
// N/A: the STX F5 also clears a fixed sell rung and a zero-spread peg rung;
// neither contract exists on sBTC/USDCx, so F5 has one rung (and the
// "three makers cleared" count is one). Fixed-price match checks become
// pegged-price checks (mid +/- 90 bps).
// Bps 90 is held on the live ladder (replaced); bps 0 is a new seat, so the
// ladder owner raises max-band-per-side 10 -> 11 for F5 (owner call on the fork).
// Run: node simulations/verify-v6-rungs-fill-lazer-sbtc-usdcx.mjs
import {
  startFork, setupMarket, deployRung, fundX, fundY, bal, rid, TR, AS, ok, err, freshUpd, prints,
  DEP, LADDER, MARKET, S, P_, check, must, show, tx, evalIn, uintCV, noneCV, boolCV, stringAsciiCV,
} from './_rungs-sbtc-usdcx.mjs';
import { SBTC_WHALE, USDC_WHALE } from './_sbtc-usdcx-v6-5-common.mjs';
import { summary, mk } from './_yg-loop-common.js';

const A = SBTC_WHALE, SY = USDC_WHALE, B = mk(782);
const SCALE = 1_000_000_000_000n, BPS = 90n;
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const isRcpt = (m) => (v) => !!v?.ok && (m === 'deposit' ? ['amount', 'epoch', 'sbtc-paid', 'shares', 'stx-paid'] : ['sbtc', 'stx']).every((k) => typeof v.ok[k] === 'bigint');
let U;
const upd = async () => (U = await freshUpd(U));

try {
  await startFork('=== v6 band rungs, real fill (sBTC/USDCx v6-5) ===');
  group('setup');
  const { ladderOwner: LO } = await setupMarket();
  const SELL = await deployRung('x', 90), BUY = await deployRung('y', 90);
  await tx('canonical sel-band = v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL)], { ok: true });
  await tx('canonical buy-band = v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY)], { ok: true });
  await tx('init jing-sell-sbtc-90-v2 (seat)', LO, SELL, 'initialize', [uintCV(BPS), boolCV(true)], { ok: true });
  await tx('init jing-buy-sbtc-90-v2 (seat)', LO, BUY, 'initialize', [uintCV(BPS), boolCV(true)], { ok: true });
  await upd();
  const MID = U.mid;
  const FLOOR = await evalIn(SELL, '(current-floor)'), CAP = await evalIn(BUY, '(current-cap)');
  console.log(`  mid ${MID}; ask mid+90 ${MID * 10090n / 10000n}; bid mid-90 ${MID * 9910n / 10000n}; floor ${FLOOR} cap ${CAP}`);
  await fundX(B, 100_000n); await fundY(B, 100_000_000n);
  const swap = (label, sender, amount, limit, depX, want) => tx(label, sender, MARKET, 'swap', [uintCV(amount), uintCV(limit), U.cv, TR.x, AS.x, TR.y, AS.y, boolCV(depX)], want);

  group('F1 both rungs rest');
  await tx('F1 A deposits 20000 sats into the sell rung (y side empty: placed)', A, SELL, 'deposit', [uintCV(20000)], isRcpt('deposit'));
  const Y1 = 25_000_000n;
  await tx('F1 SY deposits 25 USDCx into the buy rung (x side rests: escrowed)', SY, BUY, 'deposit', [uintCV(Y1)], isRcpt('deposit'));
  await upd();
  await tx('F1 settle the buy rung escrow with a newer signed print', B, MARKET, 'settle-token-y-deposit', [P_(BUY), U.cv, TR.y, AS.y], { ok: Y1 });
  check('F1 buy pending cleared', (await evalIn(MARKET, `(get-token-y-pending-deposit '${BUY})`)) === null);
  { const o = await evalIn(MARKET, `(get-token-x-order '${SELL})`); check('F1 sell rung order: limit = floor, spread (some u90)', o?.limit === FLOOR && o?.['spread-bps'] === BPS, show(o)); }
  { const o = await evalIn(MARKET, `(get-token-y-order '${BUY})`); check('F1 buy rung order: limit = cap, spread (some u90)', o?.limit === CAP && o?.['spread-bps'] === BPS, show(o)); }

  group('F2 taker pays USDCx: walks the sell rung ask');
  await upd();
  const M2 = U.mid, ASK = M2 * 10090n / 10000n;
  const a0 = await bal('y', A);
  const fillX = await swap('F2 B pays 8 USDCx (swap, 3% limit)', B, 8_000_000n, M2 * 103n / 100n, false, ok);
  await tx('F2 sell rung sync', B, SELL, 'sync', [], { ok: true });
  { const s = await evalIn(SELL, '(get-state)'); check('F2 sell rung: unfilled-index dropped', s['unfilled-index'] < SCALE, show(s)); }
  const posA = await evalIn(SELL, `(get-position '${A})`);
  check('F2 sell rung: A has USDCx proceeds', posA.stx > 0n, show(posA));
  await tx('F2 A claims', A, SELL, 'claim', [], ok);
  const dA = (await bal('y', A)) - a0;
  await tx('F2 buy rung sync (rolled, not filled)', B, BUY, 'sync', [], { ok: true });
  { const s = await evalIn(BUY, '(get-state)'); check('F2 buy rung: untouched', s['unfilled-index'] === SCALE, show(s)); }
  const mx = prints(fillX.receipt).filter((p) => p.event === 'match');
  check(`F2 one match at the sell rung's pegged ask (mid ${M2} + 90 bps = ${ASK})`, mx.length === 1 && mx[0].price === ASK, show(mx));
  const roll = prints(fillX.receipt).filter((p) => p.event === 'limit-roll-y' && p.depositor === BUY);
  check('F2 the buy rung bid rolled with its limit at the clearing (clearing - 90 bps)', roll.length === 1 && roll[0].limit === roll[0].clearing * 9910n / 10000n, show(roll));
  check(`F2 A's USDCx grew by the position's proceeds (${posA.stx}, minus fees)`, dA > 0n && dA <= posA.stx && dA >= posA.stx - 1_000_000n, `${dA}`);

  group('F3 taker sells sBTC: walks the buy rung bid');
  await upd();
  const M3 = U.mid, BIDP = M3 * 9910n / 10000n;
  const s0 = await bal('x', SY);
  const fillY = await swap('F3 B sells 15000 sats (swap, 3% limit)', B, 15000n, M3 * 97n / 100n, true, ok);
  await tx('F3 buy rung sync', B, BUY, 'sync', [], { ok: true });
  { const s = await evalIn(BUY, '(get-state)'); check('F3 buy rung: unfilled-index dropped', s['unfilled-index'] < SCALE, show(s)); }
  const posS = await evalIn(BUY, `(get-position '${SY})`);
  check('F3 buy rung: SY has sats proceeds', posS.sbtc > 0n, show(posS));
  await tx('F3 SY claims', SY, BUY, 'claim', [], ok);
  check(`F3 SY's sats grew by exactly the position's proceeds (${posS.sbtc})`, (await bal('x', SY)) - s0 === posS.sbtc);
  const my = prints(fillY.receipt).filter((p) => p.event === 'match');
  check(`F3 one match at the buy rung's pegged bid (mid ${M3} - 90 bps = ${BIDP})`, my.length === 1 && my[0].price === BIDP, show(my));

  group('F4 exits');
  await upd();
  await tx('F4 A withdraws everything', A, SELL, 'withdraw', [uintCV(999_999_999n), noneCV()], isRcpt('withdraw'));
  await tx('F4 SY withdraws everything', SY, BUY, 'withdraw', [uintCV(999_999_999_999n), noneCV()], isRcpt('withdraw'));
  check('F4 sell rung empty', (await evalIn(SELL, '(get-state)'))['total-shares'] === 0n);
  check('F4 buy rung empty', (await evalIn(BUY, '(get-state)'))['total-shares'] === 0n);

  group('F5 the buy side SOLD OUT (zero-spread band rung cleared in the batch)');
  const B0 = await deployRung('y', 0);
  await tx('F5 ladder owner raises max-band-per-side 10 -> 11 (bps 0 is a new seat)', LO, LADDER, 'set-max-band-per-side', [uintCV(11)], { ok: true });
  await tx('F5 init jing-buy-sbtc-0-v2 (spread 0, seated)', LO, B0, 'initialize', [uintCV(0), boolCV(true)], { ok: true });
  const Y5 = 5_000_000n;
  await tx('F5 SY deposits 5 USDCx into the zero-spread buy rung (x side empty: placed)', SY, B0, 'deposit', [uintCV(Y5)], isRcpt('deposit'));
  { const s = await evalIn(B0, '(get-state)'); check('F5 rung resting 5 USDCx, nothing held', s.resting === Y5 && s['held-uusdcx'] === 0n, show(s)); }
  await upd();
  const M5 = U.mid;
  await tx('F5 SY rests a deep direct bid: 30 USDCx at -2%', SY, MARKET, 'deposit-token-y', [uintCV(30_000_000n), uintCV(M5 * 98n / 100n), noneCV(), TR.y, AS.y], { ok: 30_000_000n });
  const SATS_15 = 15n * 10n ** 16n / M5; // ~15 USDCx of sats: the rung (5) cleared whole at the mid, the rest walks the deep bid
  const fill5 = await swap(`F5 B sells ${SATS_15} sats (~15 USDCx) at -3%: the batch clears the rung at the mid, the walk takes part of the deep bid`, B, SATS_15, M5 * 97n / 100n, true, ok);
  check('F5 rung market position u0', (await evalIn(MARKET, `(get-token-y-deposit (get-current-cycle) '${B0})`)) === 0n);
  { const d = await evalIn(MARKET, `(get-token-y-deposit (get-current-cycle) '${SY})`); check('F5 the deep bid was walked (under 30 USDCx, above 0)', d > 0n && d < 30_000_000n, `${d}`); }
  await tx('F5 sync jing-buy-sbtc-0-v2: sold out -> the epoch closes', B, B0, 'sync', [], { ok: true });
  { const s = await evalIn(B0, '(get-state)'); check('F5 epoch 1, shares reset, nothing resting or held', s.epoch === 1n && s['total-shares'] === 0n && s.resting === 0n && s['held-uusdcx'] === 0n, show(s)); }
  { const p = await evalIn(B0, `(get-position '${SY})`); check("F5 SY's position: from the closed epoch, only sats owed", p.stx === 0n && p.sbtc > 0n, show(p)); }
  await tx('F5 SY claims (old epoch: paid in full, position gone)', SY, B0, 'claim', [], isRcpt('withdraw'));
  { const p = await evalIn(B0, `(get-position '${SY})`); check("F5 SY's position gone", p.shares === 0n && p.sbtc === 0n, show(p)); }
  await tx('F5 SY withdraws -> u7006 (no position)', SY, B0, 'withdraw', [uintCV(1), noneCV()], err(7006));
  await tx('F5 SY cancels the rest of the deep bid', SY, MARKET, 'cancel-token-y-deposit', [TR.y, AS.y], ok);
  const l5 = prints(fill5.receipt);
  check('F5 the walk matched one maker (the deep bid); the rung was cleared in the batch, not walked', l5.filter((p) => p.event === 'match').length === 1, show(l5.filter((p) => p.event === 'match')));
  check('F5 the rung cleared 5 USDCx whole in the batch (distribute-y-depositor, y-cleared u5000000)', l5.filter((p) => p.event === 'distribute-y-depositor' && p.depositor === B0 && p['y-cleared'] === Y5).length === 1, show(l5.filter((p) => p.event === 'distribute-y-depositor')));
} catch (e) { console.error(e); S.fails.push(`STOP: ${e.message}`); }
summary();
if (S.fails.length) process.exitCode = 1;
