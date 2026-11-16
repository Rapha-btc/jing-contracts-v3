// verify-v6-rungs-keyless-sbtc-usdcx.mjs
// Port of verify-v6-rungs-keyless.js to the sBTC/USDCx v6-5 set (template
// bytes, hash-checked), on the LIVE jing-core-v6 + jing-ladder-sbtc-usdcx-v1,
// fork at tip. Walks ONE band rung: ladder gating (canonical hash, bad name,
// twice, stranger), deposits held vs pushed, the operator raising the market
// minimum mid-flight, partial withdraw, whole-cancel, full exit with exact
// payout, second member, proceeds via a gift + claim, empty pool at the end.
// The opposite side of the book stays empty, so no deposit fetches a Pyth
// price: keyless (the rung's guard is DIA BTC/USD, live on the fork).
//
//   RUNG=sell  jing-sell-sbtc-20-v2: rests sBTC (x), guard floor = DIA * 0.8,
//              ladder side "sel-band"   (STX suite RUNG=buy, the x rung)
//   RUNG=buy   jing-buy-sbtc-20-v2: rests USDCx (y), guard cap = DIA * 1.2,
//              ladder side "buy-band"   (STX suite RUNG=sell, the y rung)
// Units: x 1 = 1 sat; y 1 = 1000 uUSDCx (the market minimums are 1000 sats /
// 1 USDCx, so the same counts sit at the same place against the minimum).
// N/A here: the fixed rungs (price in the name, `none` spread) and the peg
// rungs (RUNG=buy-peg / sell-peg) have no sBTC/USDCx contract; the band rung's
// name carries only its bps, so the zero-padded-hundredths name arm does not
// exist (replaced by a bps whose digits prefix the name's: 3 vs "-30-").
// Run: RUNG=sell node simulations/verify-v6-rungs-keyless-sbtc-usdcx.mjs
import {
  startFork, setupMarket, deployRung, fundX, fundY, bal, rid, TR, AS, MIN_X, MIN_Y, ok, err,
  DEP, LADDER, MARKET, SBTC, USDCX, S, P_, check, must, show, tx, evalIn, call, uintCV, noneCV, boolCV, stringAsciiCV,
} from './_rungs-sbtc-usdcx.mjs';
import { SBTC_WHALE, USDC_WHALE } from './_sbtc-usdcx-v6-5-common.mjs';
import { summary, mk } from './_yg-loop-common.js';

const KIND = (process.env.RUNG || 'sell').toLowerCase();
if (!['sell', 'buy'].includes(KIND)) throw new Error(`RUNG=${KIND}: only sell | buy exist on sBTC/USDCx (no peg rungs)`);
const side = KIND === 'sell' ? 'x' : 'y';
const BPS = 20, BAD = 30;
const RID = rid(side, BPS), BID = rid(side, BAD);
const SIDE_STR = side === 'x' ? 'sel-band' : 'buy-band';
const U = side === 'x' ? 1n : 1000n;
const u = (n) => uintCV(BigInt(n) * U);
const MIN1 = 5000n * U;
const A = side === 'x' ? SBTC_WHALE : USDC_WHALE;
const B = mk(781);
const STRANGER = 'SP000000000000000000002Q6VF78';
const guardFn = side === 'x' ? 'current-floor' : 'current-cap';
const guardVar = side === 'x' ? 'floor' : 'cap';
const heldK = side === 'x' ? 'held-sats' : 'held-uusdcx';
const inK = side === 'x' ? 'sbtc' : 'stx', outK = side === 'x' ? 'stx' : 'sbtc'; // rung receipt names: stx = USDCx
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
// the rung's tuple results come back as JS objects via plain()
// same ABI shape rule as _rung-receipt.js, on the decoded value
const isReceipt = (method) => (v) => !!v?.ok && (method === 'deposit' ? ['amount', 'epoch', 'sbtc-paid', 'shares', 'stx-paid'] : ['sbtc', 'stx']).every((k) => typeof v.ok[k] === 'bigint');
const st = async () => evalIn(RID, '(get-state)');

try {
  await startFork(`=== v6 rungs keyless (sBTC/USDCx v6-5) RUNG=${KIND} (${RID.split('.')[1]}) ===`);
  group('1 market');
  const { ladderOwner: LO } = await setupMarket();
  group('2 ladder gating');
  await deployRung(side, BPS);
  await deployRung(side, BAD);
  const liveHolder = await evalIn(LADDER, `(get-rung "${SIDE_STR}" u${BPS})`);
  const liveCanon = await evalIn(LADDER, `(get-canonical "${SIDE_STR}")`);
  console.log(`  live ${SIDE_STR} holder at ${BPS}: ${liveHolder}; canonical ${liveCanon}`);
  check(`a live v1 rung holds ${SIDE_STR} bps ${BPS} before the v2 seat`, typeof liveHolder === 'string' && liveHolder !== RID, show(liveHolder));
  await tx('initialize while the canonical is the live v1 rung (other hash) -> ERR_HASH_MISMATCH u6004', LO, RID, 'initialize', [uintCV(BPS), boolCV(true)], err(6004));
  await tx('set-canonical by stranger -> u6001', STRANGER, LADDER, 'set-canonical', [stringAsciiCV(SIDE_STR), P_(RID)], err(6001));
  await tx('set-canonical on an unknown side -> u6007', LO, LADDER, 'set-canonical', [stringAsciiCV('buy-xyz'), P_(RID)], err(6007));
  await tx(`set-canonical ${SIDE_STR} = v2 bytes (owner) -> ok`, LO, LADDER, 'set-canonical', [stringAsciiCV(SIDE_STR), P_(RID)], { ok: true });
  await tx('initialize by a non-owner -> u7001', STRANGER, RID, 'initialize', [uintCV(BPS), boolCV(true)], err(7001));
  await tx('initialize with spread 10000 bps -> ERR_BAD_SPREAD u7010', LO, BID, 'initialize', [uintCV(10000), boolCV(true)], err(7010));
  await tx(`initialize ${BID.split('.')[1]} with bps ${BPS} (name says ${BAD}) -> ERR_BAD_NAME u7009`, LO, BID, 'initialize', [uintCV(BPS), boolCV(true)], err(7009));
  await tx(`initialize ${BID.split('.')[1]} with bps 3 (digits prefix the name's 30) -> u7009`, LO, BID, 'initialize', [uintCV(3), boolCV(true)], err(7009));
  await tx(`initialize ${BID.split('.')[1]} with bps 300 -> u7009`, LO, BID, 'initialize', [uintCV(300), boolCV(true)], err(7009));
  await tx(`initialize ${RID.split('.')[1]} (bps ${BPS}, seat) -> ok, replaces the live holder`, LO, RID, 'initialize', [uintCV(BPS), boolCV(true)], { ok: true });
  await tx('initialize twice -> u7002', LO, RID, 'initialize', [uintCV(BPS), boolCV(true)], err(7002));
  check('min-market reads the v6-5 minimum', (await evalIn(RID, '(min-market)')) === (side === 'x' ? MIN_X : MIN_Y));
  check(`ladder get-rung ${SIDE_STR} u${BPS} = the v2 rung`, (await evalIn(LADDER, `(get-rung "${SIDE_STR}" u${BPS})`)) === RID);
  check('the replaced live v1 rung stays registered, not current', (await evalIn(LADDER, `(is-registered '${liveHolder})`)) === true && (await evalIn(LADDER, `(is-current-rung '${liveHolder})`)) === false);
  check(`the v2 rung holds a seat on the v6-5 market (is-protected-${side})`, (await evalIn(MARKET, `(is-protected-${side} '${RID})`)) === true);
  { const s = await st(); check(`state0: spread-bps ${BPS}, stored ${guardVar} u0 until the first push`, s['spread-bps'] === BigInt(BPS) && s[guardVar] === 0n, show(s)); }

  group('3 deposits: under the minimum held, over pushed');
  await tx('deposit below MIN_DEPOSIT -> u7005', A, RID, 'deposit', [uintCV(1)], err(7005));
  await tx('A deposit 500 (under market min) -> held', A, RID, 'deposit', [u(500)], isReceipt('deposit'));
  { const s = await st(); check('state after 500: held 500, resting 0', s[heldK] === 500n * U && s.resting === 0n, show(s)); }
  await tx('A deposit 600 -> 1100 pushed to market', A, RID, 'deposit', [u(600)], isReceipt('deposit'));
  { const s = await st(); check('state after 1100: held 0, resting 1100', s[heldK] === 0n && s.resting === 1100n * U, show(s)); }
  {
    const g = await evalIn(RID, `(${guardFn})`), dia = await evalIn(RID, '(miner-mid)');
    const want = side === 'x' ? dia * 8000n / 10000n : dia * 12000n / 10000n;
    check(`${guardFn} = DIA BTC/USD ${side === 'x' ? '* 0.8' : '* 1.2'} (DIA ${dia})`, dia > 0n && g === want, `${g} vs ${want}`);
    const o = await evalIn(MARKET, `(get-token-${side}-order '${RID})`);
    check(`market order: limit = ${guardVar} ${want}, spread-bps (some u${BPS})`, o?.limit === want && o?.['spread-bps'] === BigInt(BPS), show(o));
    check(`rung stored ${guardVar} = the pushed limit`, (await evalIn(RID, `(get-${guardVar})`)) === want);
  }

  group('4 operator raises the market minimum to 5000 units');
  await tx('operator set-min to 5000 units', DEP, MARKET, side === 'x' ? 'set-min-token-x-deposit' : 'set-min-token-y-deposit', [uintCV(MIN1)], { ok: true });
  check('min-market now 5000 units', (await evalIn(RID, '(min-market)')) === MIN1);
  await tx('A deposit 1000 with min 5000: to-push 1000 < 5000 -> HELD', A, RID, 'deposit', [u(1000)], isReceipt('deposit'));
  { const s = await st(); check('state: held 1000, resting 1100', s[heldK] === 1000n * U && s.resting === 1100n * U, show(s)); }
  await tx('A deposit 4000 -> 5000 pushed, resting 6100', A, RID, 'deposit', [u(4000)], isReceipt('deposit'));
  { const s = await st(); check('state: held 0, resting 6100', s[heldK] === 0n && s.resting === 6100n * U, show(s)); }

  group('5 withdraws: partial keeps >= min on market, else whole-cancel + hold');
  await tx('withdraw 0 -> u7004', A, RID, 'withdraw', [uintCV(0), noneCV()], err(7004));
  await tx('stranger withdraw -> u7006', STRANGER, RID, 'withdraw', [u(1), noneCV()], err(7006));
  await tx('A withdraw 500: 6100-500=5600 >= 5000 -> partial withdraw-token', A, RID, 'withdraw', [u(500), noneCV()], isReceipt('withdraw'));
  { const s = await st(); check('state: held 0, resting 5600', s[heldK] === 0n && s.resting === 5600n * U, show(s)); }
  await tx('A withdraw 1000: 5600-1000=4600 < 5000 -> whole cancel, 4600 held', A, RID, 'withdraw', [u(1000), noneCV()], isReceipt('withdraw'));
  { const s = await st(); check('state: held 4600, resting 0', s[heldK] === 4600n * U && s.resting === 0n, show(s)); }
  { const p = await evalIn(RID, `(get-position '${A})`); check('A position: 4600 unsold', p[inK] === 4600n * U, show(p)); }

  group('6 second member; shares; full exits');
  if (side === 'x') await fundX(B, 2000n); else await fundY(B, 2000n * U);
  await tx('B deposit 2000 -> 6600 pushed', B, RID, 'deposit', [u(2000)], isReceipt('deposit'));
  { const s = await st(); check('state: held 0, resting 6600, shares 6600 (1:1 at index SCALE)', s[heldK] === 0n && s.resting === 6600n * U && s['total-shares'] === 6600n * U, show(s)); }
  { const p = await evalIn(RID, `(get-position '${B})`); check('B position 2000', p[inK] === 2000n * U, show(p)); }
  const A0 = await bal(side, A);
  await tx('A withdraw everything (999999): 6600-4600=2000 < 5000 -> whole cancel, pays 4600, holds 2000', A, RID, 'withdraw', [u(999999), noneCV()], isReceipt('withdraw'));
  check(`A exit delta = ${4600n * U}`, (await bal(side, A)) - A0 === 4600n * U);
  { const s = await st(); check('state: held 2000, resting 0, shares 2000', s[heldK] === 2000n * U && s.resting === 0n && s['total-shares'] === 2000n * U, show(s)); }
  { const p = await evalIn(RID, `(get-position '${A})`); check('A position gone', p.shares === 0n && p[inK] === 0n, show(p)); }
  await tx('A withdraw again -> u7006', A, RID, 'withdraw', [u(1), noneCV()], err(7006));

  group('7 proceeds: gift the other asset, claim');
  const GIFT = side === 'x' ? 10_000_000n : 10_000n; // 10 USDCx to the sell rung / 10000 sats to the buy rung
  if (side === 'x') await fundY(RID, GIFT); else await fundX(RID, GIFT);
  await tx('sync (anyone) folds the gift as proceeds', STRANGER, RID, 'sync', [], { ok: true });
  { const p = await evalIn(RID, `(get-position '${B})`); check('B position: proceeds = whole gift', p[outK] === GIFT, show(p)); }
  const B0 = await bal(side === 'x' ? 'y' : 'x', B);
  await tx('B claim -> ok', B, RID, 'claim', [], ok);
  check('B wallet grew by the whole gift', (await bal(side === 'x' ? 'y' : 'x', B)) - B0 === GIFT);
  { const p = await evalIn(RID, `(get-position '${B})`); check('B position after claim: proceeds 0', p[outK] === 0n, show(p)); }
  await tx('B withdraw 2000 (from held) -> ok', B, RID, 'withdraw', [u(2000), noneCV()], isReceipt('withdraw'));
  { const s = await st(); check('state: empty pool, shares 0', s['total-shares'] === 0n, show(s)); }
  check('rung input balance 0', (await bal(side, RID)) === 0n);
  check('rung proceeds balance 0, deficit 0', (await bal(side === 'x' ? 'y' : 'x', RID)) === 0n && (await evalIn(RID, '(get-deficit)')) === 0n);
} catch (e) { console.error(e); S.fails.push(`STOP: ${e.message}`); }
summary();
if (S.fails.length) process.exitCode = 1;
