// verify-v6-rungs-replace-keyless-sbtc-usdcx.mjs
// Port of verify-v6-rungs-replace-keyless.js to the sBTC/USDCx v6-5 set
// (template bytes, hash-checked) on the LIVE jing-core-v6 (owner = multisig)
// and jing-ladder-sbtc-usdcx-v1 (owner DEP), fork pinned at the block before
// the v6-5 market went live. A REPLACED or RETIRED band rung keeps serving its
// members (withdraw / claim / push / deposit go through the ladder's log-*
// gate, which keys on `registered`); seat status keys on `rungs` alone.
// Keyless: every rung deposit lands on an EMPTY opposite side (the guard is
// DIA BTC/USD, live on the fork), so the market never needs a Pyth price.
//
// Side mapping: x-resting = jing-sell-sbtc-<bps>-v2 ("sel-band"),
// y-resting = jing-buy-sbtc-<bps>-v2 ("buy-band") (the STX suite's buy-stx is
// x, sell-stx is y). The live ladder starts FULL: 10 seats per side (bps 1,
// 10..90, the live v1 rungs), max-band 10. So: a v2 rung at 20 / 30 replaces
// the live holder (count stays 10); the free spreads the STX suite takes on a
// fresh ladder (40, 50, 60, 70, 80, 99) become free bps here (45, 55, 65, 75,
// 85, 99); band counts are asserted from the live start, and the max dial is
// moved relative to the seats held (11 / 12 instead of 3 / 4).
//   R1  y: SY funds buy-30, the owner replaces it by a keeper deploy; SY
//       withdraws 1 USDCx, claims, the keeper pushes, SY withdraws all
//   R2  x: same on sell-30 (A); R3 retire x spread 20 + prune; R4 the replaced
//       rung is an ordinary maker; a re-seat at the retired spread
//   R5  unseated band rungs, seat-band, re-seat of a replaced rung, max dial
//   R6  prune-seats with no current rung left on y (all 10 buy-band retired)
//   R10 a band rung under the market minimum (held, withdraw from held, push
//       once the operator lowers it); R11 the y mirror on an UNSEATED rung
//   R7  uninitialized rung, non-canonical code (u6004), ladder handover
//       (timelock 144 burn blocks)
//   R8  jing-core-v6 admin on the live core, owner = multisig (impersonated):
//       verify twice, unverified canonical, byte-different copy, pause /
//       unpause timelock, owner handover and back
//   R9  the ladder bounds the seat count below 50
//   R12 band rungs after the block advances. The STX suite mocks the RFQ
//       native oracle in the rung SOURCE (stxer refused reads of the miner
//       band on synthetic burn blocks). Here the rung bytes stay the template
//       bytes: DIA is a plain map read, and after 435 synthetic burn blocks
//       its print is > 2 h old (miner-mid u0, asserted), so the DIA updater
//       (impersonated on the fork) re-posts the same BTC/USD value at the
//       fork time; the rungs then push at the DIA guard.
// Run: node simulations/verify-v6-rungs-replace-keyless-sbtc-usdcx.mjs
import {
  startFork, setupMarket, deployRung, fundX, fundY, bal, rid, TR, AS, ok, err, MIN_X, MIN_Y,
  DEP, LADDER, MARKET, CORE, S, P_, check, must, show, tx, evalIn, call, deploy, uintCV, noneCV, boolCV, stringAsciiCV,
} from './_rungs-sbtc-usdcx.mjs';
import { SBTC_WHALE, USDC_WHALE, bytes, NAMES, rungName } from './_sbtc-usdcx-v6-5-common.mjs';
import { summary, retry } from './_yg-loop-common.js';
import { someCV, standardPrincipalCV } from '@stacks/transactions';
import { submitSimulationSteps } from 'stxer';

const A = SBTC_WHALE, SY = USDC_WHALE;
const KEEPER = 'SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3';
const DIA = 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle';
const SATS = 20000n, UUSD = 5_000_000n;
const nm = (c) => c.split('.')[1];
const X = (b, d = DEP) => `${d}.${rungName('x', b)}`, Y = (b, d = DEP) => `${d}.${rungName('y', b)}`;
const SELL20 = X(20), SELL30 = X(30), SELL30B = X(30, KEEPER), BUY20 = Y(20), BUY30 = Y(30), BUY30B = Y(30, KEEPER);
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const isR = (m) => (v) => !!v?.ok && (m === 'deposit' ? ['amount', 'epoch', 'sbtc-paid', 'shares', 'stx-paid'] : ['sbtc', 'stx']).every((k) => typeof v.ok[k] === 'bigint');
const st = (c) => evalIn(c, '(get-state)');
const cnt = (s) => evalIn(LADDER, `(get-band-count "${s}")`);
const isOkAny = (v) => v?.ok !== undefined;
async function burn(n) {
  const out = await retry(() => submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 } }] }));
  must(`advance ${n} burn blocks`, !!out.steps?.[0]?.AdvanceBlocks, JSON.stringify(out.steps?.[0]).slice(0, 300));
}

try {
  await startFork('=== v6 rungs: replaced / retired band rung keeps serving its members (keyless, sBTC/USDCx v6-5) ===');
  group('setup');
  const { coreOwner: CO, ladderOwner: LO } = await setupMarket();
  check('ladder owner is the deployer (the suite hands it over and back)', LO === DEP, LO);
  const live = {};
  for (const s of ['sel-band', 'buy-band']) for (const b of [20, 30]) live[`${s}${b}`] = await evalIn(LADDER, `(get-rung "${s}" u${b})`);
  check('live start: sel-band 10 seats, buy-band 10 seats, max 10', (await cnt('sel-band')) === 10n && (await cnt('buy-band')) === 10n && (await evalIn(LADDER, '(get-max-band-per-side)')) === 10n);
  for (const r of [SELL20, SELL30, BUY20, BUY30]) await deploy(DEP, nm(r), bytes(r.includes('-sell-') ? 'sell' : 'buy'));
  await tx('canonical sel-band = v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL20)], { ok: true });
  await tx('canonical buy-band = v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY20)], { ok: true });
  for (const r of [SELL20, SELL30, BUY20, BUY30]) await tx(`init ${nm(r)} (seat: replaces the live holder)`, LO, r, 'initialize', [uintCV(nm(r).includes('-20-') ? 20 : 30), boolCV(true)], { ok: true });
  check('band count sel-band still 10 (replaces)', (await cnt('sel-band')) === 10n);
  check('band count buy-band still 10', (await cnt('buy-band')) === 10n);
  check('the replaced live v1 holders stay registered, not current', (await Promise.all(Object.values(live).map(async (l) => (await evalIn(LADDER, `(is-registered '${l})`)) && !(await evalIn(LADDER, `(is-current-rung '${l})`))))).every(Boolean), show(live));

  group('R1 y side, replace');
  const s0 = await bal('y', SY);
  await tx('R1 SY funds the buy spread-30 rung (x side empty: keyless push)', SY, BUY30, 'deposit', [uintCV(UUSD)], isR('deposit'));
  check('R1 buy rung resting 5 USDCx', (await st(BUY30)).resting === UUSD);
  check('R1 the rung holds a seat on y', (await evalIn(MARKET, `(is-protected-y '${BUY30})`)) === true);
  await deploy(KEEPER, nm(BUY30B), bytes('buy'));
  await tx("R1 owner initializes the keeper's deploy: replaces the buy spread-30 rung", LO, BUY30B, 'initialize', [uintCV(30), boolCV(true)], { ok: true });
  check('R1 the new rung holds the seat', (await evalIn(MARKET, `(is-protected-y '${BUY30B})`)) === true);
  check('R1 the old rung lost it', (await evalIn(MARKET, `(is-protected-y '${BUY30})`)) === false);
  check('R1 ladder: old rung not current', (await evalIn(LADDER, `(is-band-y '${BUY30})`)) === false);
  check('R1 ladder: old rung STILL registered (it holds member funds)', (await evalIn(LADDER, `(is-registered '${BUY30})`)) === true);
  check('R1 ladder: spread 30 points at the new rung', (await evalIn(LADDER, '(get-rung "buy-band" u30)')) === BUY30B);
  check('R1 band count buy-band still 10', (await cnt('buy-band')) === 10n);
  await tx('R1 SY withdraws 1 USDCx from the replaced rung -> ok', SY, BUY30, 'withdraw', [uintCV(1_000_000), noneCV()], isR('withdraw'));
  await tx('R1 SY claims on the replaced rung -> ok', SY, BUY30, 'claim', [], isR('claim'));
  await tx('R1 keeper pushes the replaced rung -> (ok false), nothing held', KEEPER, BUY30, 'push', [], { ok: false });
  await tx('R1 SY withdraws the rest -> ok', SY, BUY30, 'withdraw', [uintCV(UUSD), noneCV()], isR('withdraw'));
  { const s = await st(BUY30); check('R1 buy rung empty', s.resting === 0n && s['held-uusdcx'] === 0n, show(s)); }
  check('R1 SY got the 5 USDCx back exactly', (await bal('y', SY)) - s0 === 0n);
  check('R1 the y side is empty again', (await evalIn(MARKET, '(len (get-token-y-depositors u0))')) === 0n);

  group('R2 x side, replace');
  const a0 = await bal('x', A);
  await tx('R2 A funds the sell spread-30 rung (y side empty: keyless push)', A, SELL30, 'deposit', [uintCV(SATS)], isR('deposit'));
  { const s = await st(SELL30); check('R2 sell rung resting 20000', s.resting === SATS && s['held-sats'] === 0n, show(s)); }
  await tx('R2 A funds the sell spread-20 rung too (for the retire block)', A, SELL20, 'deposit', [uintCV(SATS)], isR('deposit'));
  await deploy(KEEPER, nm(SELL30B), bytes('sell'));
  await tx("R2 owner initializes the keeper's deploy: replaces the sell spread-30 rung", LO, SELL30B, 'initialize', [uintCV(30), boolCV(true)], { ok: true });
  check('R2 the new rung holds the seat', (await evalIn(MARKET, `(is-protected-x '${SELL30B})`)) === true);
  check('R2 the old rung lost it', (await evalIn(MARKET, `(is-protected-x '${SELL30})`)) === false);
  check('R2 ladder: old rung not current', (await evalIn(LADDER, `(is-band-x '${SELL30})`)) === false);
  check('R2 ladder: old rung STILL registered', (await evalIn(LADDER, `(is-registered '${SELL30})`)) === true);
  check('R2 seated list on x = spread-20 + new spread-30', (await evalIn(MARKET, '(len (get-seated-x))')) === 2n);
  await tx('R2 sync-seat on the replaced rung -> u1028 (not a seat)', KEEPER, MARKET, 'sync-seat', [P_(SELL30)], err(1028));
  check("R2 the old rung's 20000 still rest on the book", (await evalIn(MARKET, `(get-token-x-deposit u0 '${SELL30})`)) === SATS);
  await tx('R2 A withdraws 1 sat from the replaced rung -> ok', A, SELL30, 'withdraw', [uintCV(1), noneCV()], isR('withdraw'));
  await tx('R2 A claims on the replaced rung -> ok', A, SELL30, 'claim', [], isR('claim'));
  await tx('R2 keeper pushes the replaced rung -> (ok false)', KEEPER, SELL30, 'push', [], { ok: false });
  await tx('R2 A withdraws the rest -> ok', A, SELL30, 'withdraw', [uintCV(SATS), noneCV()], isR('withdraw'));
  { const s = await st(SELL30); check('R2 sell rung empty', s.resting === 0n && s['held-sats'] === 0n, show(s)); }
  { const p = await evalIn(SELL30, `(get-position '${A})`); check('R2 A position gone', p.shares === 0n && p.sbtc === 0n, show(p)); }

  group('R3 retire x spread 20');
  await tx('R3 owner retires sel-band spread 20', LO, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(20)], { ok: true });
  check('R3 band count sel-band 9', (await cnt('sel-band')) === 9n);
  check('R3 ladder: retired rung not current', (await evalIn(LADDER, `(is-band-x '${SELL20})`)) === false);
  check('R3 ladder: retired rung STILL registered', (await evalIn(LADDER, `(is-registered '${SELL20})`)) === true);
  check('R3 spread 20 is free', (await evalIn(LADDER, '(get-rung "sel-band" u20)')) === null);
  check('R3 market copy still seats it until a sync', (await evalIn(MARKET, `(is-protected-x '${SELL20})`)) === true);
  await tx('R3 anyone syncs a seated rung: prune drops the retired one', KEEPER, MARKET, 'sync-seat', [P_(SELL30B)], isOkAny);
  check('R3 the retired rung no longer holds a seat', (await evalIn(MARKET, `(is-protected-x '${SELL20})`)) === false);
  check('R3 seated list on x = the new spread-30 only', (await evalIn(MARKET, '(len (get-seated-x))')) === 1n);
  await tx('R3 A withdraws 1 sat from the retired rung -> ok', A, SELL20, 'withdraw', [uintCV(1), noneCV()], isR('withdraw'));
  await tx('R3 keeper pushes the retired rung -> (ok false)', KEEPER, SELL20, 'push', [], { ok: false });
  await tx('R3 A withdraws the rest -> ok', A, SELL20, 'withdraw', [uintCV(SATS), noneCV()], isR('withdraw'));
  check('R3 retired rung empty', (await st(SELL20)).resting === 0n);
  await tx('R3 retire again -> u6010 (spread free)', LO, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(20)], err(6010));

  group('R4 the old rung lives on as an ordinary maker');
  await tx('R4 A deposits into the replaced spread-30 rung again -> ok (ordinary maker now)', A, SELL30, 'deposit', [uintCV(SATS)], isR('deposit'));
  check('R4 resting 20000 again', (await st(SELL30)).resting === SATS);
  check('R4 it is on the book without a seat', (await evalIn(MARKET, `(is-protected-x '${SELL30})`)) === false);
  check('R4 ladder still refuses it a seat', (await evalIn(LADDER, `(is-band-x '${SELL30})`)) === false);
  await tx('R4 A withdraws all -> ok', A, SELL30, 'withdraw', [uintCV(SATS), noneCV()], isR('withdraw'));
  check('R4 A got every sat back', (await bal('x', A)) - a0 === 0n);
  await deploy(DEP, `${rungName('x', 20)}-b`, bytes('sell'));
  await tx("R4 a fresh deploy at the retired spread 20 named ...-20-v2-b: its name must carry the spread: u7009", LO, `${DEP}.${rungName('x', 20)}-b`, 'initialize', [uintCV(20), boolCV(true)], err(7009));
  const K20 = X(20, KEEPER);
  await deploy(KEEPER, nm(K20), bytes('sell'));
  await tx("R4 owner seats the keeper's spread-20 deploy: count back to 10", LO, K20, 'initialize', [uintCV(20), boolCV(true)], { ok: true });
  check('R4 band count sel-band 10', (await cnt('sel-band')) === 10n);
  check('R4 the retired rung stays registered and not current', (await evalIn(LADDER, `(and (is-registered '${SELL20}) (not (is-band-x '${SELL20})))`)) === true);

  group('R5 unseated band rungs + seat-band + the max dial');
  const S45 = X(45), S55 = X(55);
  await deploy(DEP, nm(S45), bytes('sell'));
  await tx('R5 stranger initializes unseated -> u7001 (owner only, seated or not)', KEEPER, S45, 'initialize', [uintCV(45), boolCV(false)], err(7001));
  await tx('R5 owner initializes spread 45 UNSEATED -> ok', LO, S45, 'initialize', [uintCV(45), boolCV(false)], { ok: true });
  await tx('R5 initialize again -> u7002', LO, S45, 'initialize', [uintCV(45), boolCV(true)], err(7002));
  check('R5 registered', (await evalIn(LADDER, `(is-registered '${S45})`)) === true);
  check('R5 not current', (await evalIn(LADDER, `(is-current-rung '${S45})`)) === false);
  check('R5 ladder: no seat', (await evalIn(LADDER, `(is-band-x '${S45})`)) === false);
  check('R5 market: no seat', (await evalIn(MARKET, `(is-protected-x '${S45})`)) === false);
  check('R5 spread 45 has no holder', (await evalIn(LADDER, '(get-rung "sel-band" u45)')) === null);
  check('R5 band count sel-band still 10', (await cnt('sel-band')) === 10n);
  await tx('R5 A deposits into the unseated rung -> ok (pushed as an ordinary maker)', A, S45, 'deposit', [uintCV(SATS)], isR('deposit'));
  { const s = await st(S45); check('R5 resting 20000', s.resting === SATS && s['held-sats'] === 0n, show(s)); }
  check('R5 on the book, no seat', (await evalIn(MARKET, `(is-protected-x '${S45})`)) === false);
  await tx('R5 sync-seat on it -> u1028', KEEPER, MARKET, 'sync-seat', [P_(S45)], err(1028));
  await tx('R5 register-unseated from an EOA -> u6002 (no contract hash)', KEEPER, LADDER, 'register-unseated', [stringAsciiCV('sel-band'), uintCV(45), uintCV(0)], err(6002));
  await tx('R5 stranger seat-band -> u6001', KEEPER, LADDER, 'seat-band', [P_(S45)], err(6001));
  await tx('R5 seat-band on an unknown principal -> u6010', LO, LADDER, 'seat-band', [P_(X(99))], err(6010));
  await tx('R5 seat-band on a seated rung -> u6012', LO, LADDER, 'seat-band', [P_(SELL30B)], err(6012));
  await tx('R5 seat-band RE-SEATS the replaced spread-30 rung: replaces its successor', LO, LADDER, 'seat-band', [P_(SELL30)], { ok: true });
  check('R5 spread 30 points at the old rung again', (await evalIn(LADDER, '(get-rung "sel-band" u30)')) === SELL30);
  check('R5 the successor is registered, not current', (await evalIn(LADDER, `(and (is-registered '${SELL30B}) (not (is-current-rung '${SELL30B})))`)) === true);
  check('R5 band count sel-band still 10 (replace)', (await cnt('sel-band')) === 10n);
  await tx('R5 seat-band the unseated spread-45 rung on the full side (10 of 10) -> u6011', LO, LADDER, 'seat-band', [P_(S45)], err(6011));
  await tx('R5 owner raises the max to 11 (the live ladder starts full; a fresh one had room)', LO, LADDER, 'set-max-band-per-side', [uintCV(11)], { ok: true });
  await tx('R5 seat-band the unseated spread-45 rung -> ok (free spread: count 11)', LO, LADDER, 'seat-band', [P_(S45)], { ok: true });
  check('R5 band count sel-band 11', (await cnt('sel-band')) === 11n);
  check('R5 ladder seats it now', (await evalIn(LADDER, `(is-band-x '${S45})`)) === true);
  check('R5 market copy lags until a sync', (await evalIn(MARKET, `(is-protected-x '${S45})`)) === false);
  await tx('R5 anyone syncs it on the market', KEEPER, MARKET, 'sync-seat', [P_(S45)], isOkAny);
  check('R5 market seats it', (await evalIn(MARKET, `(is-protected-x '${S45})`)) === true);
  check('R5 the same sync pruned the replaced successor', (await evalIn(MARKET, `(is-protected-x '${SELL30B})`)) === false);
  await tx('R5 sync the re-seated spread-30 rung too', KEEPER, MARKET, 'sync-seat', [P_(SELL30)], isOkAny);
  check('R5 seated list on x = spread-20 (keeper), spread-45, spread-30 (re-seated)', (await evalIn(MARKET, '(len (get-seated-x))')) === 3n);
  check('R5 seated x holds the re-seated spread-30', (await evalIn(MARKET, `(is-protected-x '${SELL30})`)) === true);
  await tx('R5 A withdraws all from spread 45 (seated now, still fine)', A, S45, 'withdraw', [uintCV(SATS), noneCV()], isR('withdraw'));
  await tx('R5 max under seats held (10 < 11) -> u6011', LO, LADDER, 'set-max-band-per-side', [uintCV(10)], err(6011));
  await tx('R5 max = seats held (11) -> ok', LO, LADDER, 'set-max-band-per-side', [uintCV(11)], { ok: true });
  await deploy(DEP, nm(S55), bytes('sell'));
  await tx('R5 initialize spread 55 SEATED on a full side -> u6011', LO, S55, 'initialize', [uintCV(55), boolCV(true)], err(6011));
  check('R5 ... and the failed initialize left it uninitialized (not registered)', (await evalIn(LADDER, `(is-registered '${S55})`)) === false);
  await tx('R5 initialize spread 55 UNSEATED on a full side -> ok', LO, S55, 'initialize', [uintCV(55), boolCV(false)], { ok: true });
  await tx('R5 seat-band it on the full side -> u6011', LO, LADDER, 'seat-band', [P_(S55)], err(6011));
  await tx('R5 raise the max to 12', LO, LADDER, 'set-max-band-per-side', [uintCV(12)], { ok: true });
  await tx('R5 seat-band it -> ok', LO, LADDER, 'seat-band', [P_(S55)], { ok: true });
  check('R5 band count sel-band 12', (await cnt('sel-band')) === 12n);
  await tx('R5 retire spread 55 -> ok (back to an unseated, registered rung)', LO, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(55)], { ok: true });
  check('R5 retired: registered, not current', (await evalIn(LADDER, `(and (is-registered '${S55}) (not (is-current-rung '${S55})))`)) === true);
  await tx('R5 seat-band the retired rung again -> ok (retire is reversible)', LO, LADDER, 'seat-band', [P_(S55)], { ok: true });
  check('R5 band count sel-band 12 again', (await cnt('sel-band')) === 12n);
  await tx('R5 sync-seat-count: market seats follow the max (12)', KEEPER, MARKET, 'sync-seat-count', [], { ok: 12n });

  group('R6 prune-seats when a side has no current rung left');
  const ySpreads = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  for (const b of ySpreads) await tx(`R6 retire buy-band ${b}`, LO, LADDER, 'retire-band', [stringAsciiCV('buy-band'), uintCV(b)], { ok: true });
  check('R6 band count buy-band 0', (await cnt('buy-band')) === 0n);
  check('R6 market copy still seats both retired v2 buy rungs', (await evalIn(MARKET, '(len (get-seated-y))')) === 2n);
  check('R6 the retired spread-20 buy rung is still protected in the copy', (await evalIn(MARKET, `(is-protected-y '${BUY20})`)) === true);
  await tx('R6 sync-seat on a retired rung -> u1028 (nothing current on y to sync)', KEEPER, MARKET, 'sync-seat', [P_(BUY30B)], err(1028));
  await tx('R6 sync-seat-count also prunes retired seats', KEEPER, MARKET, 'sync-seat-count', [], { ok: 12n });
  check('R6 sync-seat-count pruned the retired y seats', (await evalIn(MARKET, '(len (get-seated-y))')) === 0n);
  check('R6 x side before the prune: 3 in the copy', (await evalIn(MARKET, '(len (get-seated-x))')) === 3n);
  await tx('R6 anyone prunes', KEEPER, MARKET, 'prune-seats', [], { ok: 12n });
  check('R6 y copy empty', (await evalIn(MARKET, '(len (get-seated-y))')) === 0n);
  check('R6 retired buy rung no longer protected', (await evalIn(MARKET, `(is-protected-y '${BUY20})`)) === false);
  check('R6 x copy untouched (3 current seats)', (await evalIn(MARKET, '(len (get-seated-x))')) === 3n);
  check('R6 prune adds nothing: spread 55 (ladder-seated, never synced) still absent', (await evalIn(MARKET, `(is-protected-x '${S55})`)) === false);
  await tx('R6 prune again: idempotent', KEEPER, MARKET, 'prune-seats', [], { ok: 12n });
  check('R6 x copy still 3', (await evalIn(MARKET, '(len (get-seated-x))')) === 3n);
  await tx('R6 sync-seat spread 55 -> now 4 on x', KEEPER, MARKET, 'sync-seat', [P_(S55)], isOkAny);
  check('R6 x copy 4', (await evalIn(MARKET, '(len (get-seated-x))')) === 4n);

  group('R10 a band rung under the market minimum');
  await tx('R10 A deposits 500 sats into the spread-55 band rung: under the 1000-sat minimum -> HELD', A, S55, 'deposit', [uintCV(500)], isR('deposit'));
  { const s = await st(S55); check('R10 held 500, resting 0', s['held-sats'] === 500n && s.resting === 0n, show(s)); }
  await tx('R10 A withdraws 100 sats: served from what is held, the market untouched', A, S55, 'withdraw', [uintCV(100), noneCV()], isR('withdraw'));
  { const s = await st(S55); check('R10 held 400, resting 0', s['held-sats'] === 400n && s.resting === 0n, show(s)); }
  await tx('R10 keeper push: 400 < the minimum -> (ok false), stays held', KEEPER, S55, 'push', [], { ok: false });
  await tx('R10 operator lowers the x minimum to 100', DEP, MARKET, 'set-min-token-x-deposit', [uintCV(100)], { ok: true });
  await tx('R10 keeper push: 400 >= 100 -> pushed (ok true), the floor from DIA', KEEPER, S55, 'push', [], { ok: true });
  { const s = await st(S55); check('R10 held 0, resting 400', s['held-sats'] === 0n && s.resting === 400n, show(s)); }
  { const o = await evalIn(MARKET, `(get-token-x-order '${S55})`), f = await evalIn(S55, '(current-floor)'); check('R10 the order carries the band spread (some u55) and the DIA floor', o?.['spread-bps'] === 55n && o?.limit === f && f > 0n, show(o)); }
  await tx('R10 operator restores the x minimum (1000)', DEP, MARKET, 'set-min-token-x-deposit', [uintCV(MIN_X)], { ok: true });
  await tx('R10 A withdraws everything: 400 on the market under the minimum -> whole cancel, paid', A, S55, 'withdraw', [uintCV(999_999), noneCV()], isR('withdraw'));
  { const s = await st(S55); check('R10 empty', s['held-sats'] === 0n && s.resting === 0n && s['total-shares'] === 0n, show(s)); }

  group('R11 the y band mirror on an UNSEATED rung');
  const B45 = Y(45);
  await deploy(DEP, nm(B45), bytes('buy'));
  await tx('R11 owner initializes buy spread 45 UNSEATED -> ok (registered, no key, no count)', LO, B45, 'initialize', [uintCV(45), boolCV(false)], { ok: true });
  check('R11 registered, not current', (await evalIn(LADDER, `(and (is-registered '${B45}) (not (is-current-rung '${B45})))`)) === true);
  check('R11 band count buy-band still 0', (await cnt('buy-band')) === 0n);
  await tx('R11 SY deposits 0.5 USDCx: under the 1 USDCx minimum -> HELD', SY, B45, 'deposit', [uintCV(500_000)], isR('deposit'));
  { const s = await st(B45); check('R11 held 0.5 USDCx, resting 0', s['held-uusdcx'] === 500_000n && s.resting === 0n, show(s)); }
  await tx('R11 SY withdraws 0.1 USDCx from held', SY, B45, 'withdraw', [uintCV(100_000), noneCV()], isR('withdraw'));
  { const s = await st(B45); check('R11 held 0.4 USDCx', s['held-uusdcx'] === 400_000n && s.resting === 0n, show(s)); }
  await tx('R11 keeper push: 0.4 < 1 USDCx -> (ok false)', KEEPER, B45, 'push', [], { ok: false });
  await tx('R11 operator lowers the y minimum to 0.1 USDCx', DEP, MARKET, 'set-min-token-y-deposit', [uintCV(100_000)], { ok: true });
  await tx('R11 keeper push -> pushed (ok true), an ordinary maker on the book (no seat)', KEEPER, B45, 'push', [], { ok: true });
  { const s = await st(B45); check('R11 held 0, resting 0.4 USDCx', s['held-uusdcx'] === 0n && s.resting === 400_000n, show(s)); }
  check('R11 on the book without a seat', (await evalIn(MARKET, `(is-protected-y '${B45})`)) === false);
  await tx('R11 operator restores the y minimum (1 USDCx)', DEP, MARKET, 'set-min-token-y-deposit', [uintCV(MIN_Y)], { ok: true });
  await tx('R11 SY withdraws everything -> whole cancel, paid', SY, B45, 'withdraw', [uintCV(999_999_999), noneCV()], isR('withdraw'));
  { const s = await st(B45); check('R11 empty', s['held-uusdcx'] === 0n && s.resting === 0n && s['total-shares'] === 0n, show(s)); }

  group('R7 uninitialized rung, non-canonical rung, ladder owner handover');
  const S65 = X(65), S75 = X(75);
  await deploy(DEP, nm(S65), bytes('sell'));
  await tx('R7 deposit into a rung nobody initialized -> u7003', A, S65, 'deposit', [uintCV(SATS)], err(7003));
  await tx('R7 push on it -> u7003', KEEPER, S65, 'push', [], err(7003));
  await tx('R7 withdraw on it -> u7006 (no position)', A, S65, 'withdraw', [uintCV(1), noneCV()], err(7006));
  await tx('R7 claim on it -> u7006', A, S65, 'claim', [], err(7006));
  check('R7 not registered', (await evalIn(LADDER, `(is-registered '${S65})`)) === false);
  await deploy(DEP, nm(S75), bytes('sell') + '\n;; one byte off the canonical: a different contract hash\n');
  await tx("R7 initialize a rung whose code is not the canonical's -> u6004 (hash mismatch at register)", LO, S75, 'initialize', [uintCV(75), boolCV(true)], err(6004));
  check('R7 spread 75 stays free', (await evalIn(LADDER, '(get-rung "sel-band" u75)')) === null);
  await tx('R7 stranger propose-owner -> u6001', KEEPER, LADDER, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], err(6001));
  await tx('R7 accept-owner with nothing pending -> u6008', KEEPER, LADDER, 'accept-owner', [], err(6008));
  await tx('R7 owner proposes the keeper', LO, LADDER, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], { ok: true });
  check('R7 pending = keeper', show(await evalIn(LADDER, '(get-pending-owner)')).includes(KEEPER));
  await tx('R7 a stranger accepts -> u6001', A, LADDER, 'accept-owner', [], err(6001));
  await tx('R7 the keeper accepts before the timelock -> u6009', KEEPER, LADDER, 'accept-owner', [], err(6009));
  await burn(145);
  await tx('R7 145 burn blocks later the keeper accepts -> ok', KEEPER, LADDER, 'accept-owner', [], { ok: true });
  check('R7 owner = keeper', (await evalIn(LADDER, '(get-owner)')) === KEEPER);
  await tx('R7 the old owner can no longer retire -> u6001', LO, LADDER, 'retire-band', [stringAsciiCV('sel-band'), uintCV(20)], err(6001));
  await tx('R7 the new owner proposes none: cancels any pending', KEEPER, LADDER, 'propose-owner', [noneCV()], { ok: true });
  await tx('R7 accept with none pending -> u6008', LO, LADDER, 'accept-owner', [], err(6008));
  await tx('R7 the keeper hands it back: proposes the deployer', KEEPER, LADDER, 'propose-owner', [someCV(standardPrincipalCV(LO))], { ok: true });
  await burn(145);
  await tx('R7 the deployer accepts -> ok', LO, LADDER, 'accept-owner', [], { ok: true });
  check('R7 owner = deployer again', (await evalIn(LADDER, '(get-owner)')) === LO);

  group('R8 jing-core-v6 admin paths (live core, owner = multisig)');
  const MKT_B = `${DEP}.markets-b`, MKT_C = `${DEP}.markets-c`;
  const initArgs = (canon) => [P_(canon), TR.x, TR.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(1), uintCV(7)];
  await tx('R8 verify the v6-5 market a second time -> u5003', CO, CORE, 'set-verified-contract', [P_(MARKET)], err(5003));
  await tx('R8 stranger verifies -> u5001', KEEPER, CORE, 'set-verified-contract', [P_(LADDER)], err(5001));
  await tx('R8 verify a standard principal (no code, no hash) -> u5002', CO, CORE, 'set-verified-contract', [P_(KEEPER)], err(5002));
  await deploy(DEP, 'markets-b', bytes('market'));
  await tx('R8 markets-b set-operator -> core owner (initialize needs operator = core owner)', DEP, MKT_B, 'set-operator', [P_(CO)], { ok: true });
  await tx('R8 initialize a second market naming itself as canonical, unverified -> u5005', CO, MKT_B, 'initialize', initArgs(MKT_B), err(5005));
  await tx('R8 initialize it naming the verified v6-5 market as canonical (same bytes) -> ok, registered', CO, MKT_B, 'initialize', initArgs(MARKET), { ok: true });
  check('R8 markets-b registered in the core', (await evalIn(CORE, `(is-registered '${MKT_B})`)) === true);
  await deploy(DEP, 'markets-c', bytes('market').replace('(define-constant ', '(define-constant  '));
  await tx('R8 markets-c set-operator -> core owner', DEP, MKT_C, 'set-operator', [P_(CO)], { ok: true });
  await tx('R8 a byte-different copy naming the verified market -> u5006 hash mismatch', CO, MKT_C, 'initialize', initArgs(MARKET), err(5006));
  await tx('R8 stranger pauses the core -> u5001', KEEPER, CORE, 'pause', [], err(5001));
  await tx('R8 unpause when not paused -> u5017', CO, CORE, 'unpause', [], err(5017));
  await tx('R8 owner pauses the core -> ok', CO, CORE, 'pause', [], { ok: true });
  await tx('R8 a market deposit while the core is paused -> u5016 (the core refuses the log)', A, MARKET, 'deposit-token-x', [uintCV(2000), uintCV(1), noneCV(), TR.x, AS.x], err(5016));
  await tx('R8 unpause before the timelock -> u5008', CO, CORE, 'unpause', [], err(5008));
  await tx('R8 stranger unpauses -> u5001', KEEPER, CORE, 'unpause', [], err(5001));
  await burn(145);
  await tx('R8 145 burn blocks later the owner unpauses -> ok', CO, CORE, 'unpause', [], { ok: true });
  await tx('R8 the market deposit goes through again', A, MARKET, 'deposit-token-x', [uintCV(2000), uintCV(1), noneCV(), TR.x, AS.x], { ok: 2000n });
  await tx('R8 A cancels it', A, MARKET, 'cancel-token-x-deposit', [TR.x, AS.x], { ok: 2000n });
  await tx('R8 core accept-owner with nothing pending -> u5018', KEEPER, CORE, 'accept-owner', [], err(5018));
  await tx('R8 stranger propose-owner -> u5001', KEEPER, CORE, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], err(5001));
  await tx('R8 owner proposes the keeper', CO, CORE, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], { ok: true });
  await tx('R8 a stranger accepts -> u5001', A, CORE, 'accept-owner', [], err(5001));
  await tx("R8 the keeper accepts at once -> ok (no timelock on the core's handover)", KEEPER, CORE, 'accept-owner', [], { ok: true });
  check('R8 core owner = keeper', (await evalIn(CORE, '(get-contract-owner)')) === KEEPER);
  await tx('R8 hand back: keeper proposes the multisig', KEEPER, CORE, 'propose-owner', [someCV(P_(CO))], { ok: true });
  await tx('R8 the multisig accepts -> ok', CO, CORE, 'accept-owner', [], { ok: true });
  check('R8 core owner = multisig', (await evalIn(CORE, '(get-contract-owner)')) === CO);

  group('R9 the seat count must leave one public slot');
  await tx('R9 ladder rejects 60 seats (must preserve a public slot)', LO, LADDER, 'set-max-band-per-side', [uintCV(60)], err(6011));
  await tx('R9 ladder rejects 50 seats', LO, LADDER, 'set-max-band-per-side', [uintCV(50)], err(6011));
  await tx('R9 ladder accepts its maximum 49 seats', LO, LADDER, 'set-max-band-per-side', [uintCV(49)], { ok: true });
  await tx('R9 sync-seat-count -> 49', KEEPER, MARKET, 'sync-seat-count', [], { ok: 49n });
  check('R9 protected-seats 49', (await evalIn(MARKET, '(protected-seats)')) === 49n);
  await tx('R9 back to 12 (the seats held on x)', LO, LADDER, 'set-max-band-per-side', [uintCV(12)], { ok: true });
  await tx('R9 sync-seat-count -> 12', KEEPER, MARKET, 'sync-seat-count', [], { ok: 12n });

  group('R12 band rungs after the block advances (DIA re-posted by its updater)');
  const S85 = X(85), B85 = Y(85);
  check('R12 after 435 synthetic burn blocks the DIA print is > 2 h old: miner-mid u0', (await evalIn(S65, '(miner-mid)')) === 0n);
  const UPDATER = await evalIn(DIA, '(get-oracle-updater)');
  const dv = (await evalIn(DIA, '(get-value "BTC/USD")')).ok;
  const now = await evalIn(S65, 'stacks-block-time');
  await tx('R12 the DIA updater (impersonated) re-posts the same BTC/USD value at the fork time', UPDATER, DIA, 'set-value', [stringAsciiCV('BTC/USD'), uintCV(dv.value), uintCV(now * 1000n)], ok);
  check('R12 miner-mid live again (the same value)', (await evalIn(S65, '(miner-mid)')) === dv.value);
  await deploy(DEP, nm(S85), bytes('sell')); await deploy(DEP, nm(B85), bytes('buy'));
  await tx('R12 owner raises the max to 13 (x holds 12)', LO, LADDER, 'set-max-band-per-side', [uintCV(13)], { ok: true });
  await tx('R12 initialize sell spread 85 seated', LO, S85, 'initialize', [uintCV(85), boolCV(true)], { ok: true });
  await tx('R12 initialize buy spread 85 seated', LO, B85, 'initialize', [uintCV(85), boolCV(true)], { ok: true });
  check('R12 the rung reads DIA: floor = value * 0.8', (await evalIn(S85, '(current-floor)')) === dv.value * 8000n / 10000n);
  await tx('R12 SY deposits 5 USDCx into the buy band rung -> pushed (x side empty)', SY, B85, 'deposit', [uintCV(UUSD)], isR('deposit'));
  { const s = await st(B85); check('R12 buy resting 5 USDCx', s.resting === UUSD && s['held-uusdcx'] === 0n, show(s)); }
  { const o = await evalIn(MARKET, `(get-token-y-order '${B85})`); check('R12 its order rests at the DIA cap with the band spread', o?.limit === dv.value * 12000n / 10000n && o?.['spread-bps'] === 85n, show(o)); }
  await tx('R12 SY withdraws all', SY, B85, 'withdraw', [uintCV(999_999_999), noneCV()], isR('withdraw'));
  await tx('R12 A deposits 2000 sats into the sell band rung after 435 advanced burn blocks -> pushed', A, S85, 'deposit', [uintCV(2000)], isR('deposit'));
  { const s = await st(S85); check('R12 resting 2000', s.resting === 2000n && s['held-sats'] === 0n, show(s)); }
  { const o = await evalIn(MARKET, `(get-token-x-order '${S85})`); check('R12 its order rests at the DIA floor with the band spread', o?.limit === dv.value * 8000n / 10000n && o?.['spread-bps'] === 85n, show(o)); }
  await tx('R12 A withdraws all', A, S85, 'withdraw', [uintCV(999_999), noneCV()], isR('withdraw'));
  { const s = await st(S85); check('R12 sell empty', s['total-shares'] === 0n && s.resting === 0n, show(s)); }
  { const s = await st(B85); check('R12 buy empty', s['total-shares'] === 0n && s.resting === 0n, show(s)); }
} catch (e) { console.error(e); S.fails.push(`STOP: ${e.message}`); }
summary();
if (S.fails.length) process.exitCode = 1;
