// verify-v6-rungs-push-lazer-sbtc-usdcx.mjs
// Port of verify-v6-rungs-push-lazer.js to the sBTC/USDCx v6-5 set (template
// bytes, hash-checked; LIVE jing-core-v6 + jing-ladder-sbtc-usdcx-v1; fork
// pinned at the block before the v6-5 market went live).
// Sponsor-friendly entry and keeper push, per band rung:
//   market refusal (paused) holds funds locally; keeper push while paused
//   leaves them held; after unpause the keeper pushes without an oracle, the
//   escrow is not live until settle; a STALE signed [1,7] print refuses the
//   settle and keeps the escrow; a newer print places it; exact stored quote
//   (limit = the DIA guard, spread (some u20)) and the effective peg at mid;
//   a sub-minimum top-up escrows against the live position, a second top-up
//   stays held while that escrow is pending, the keeper pushes it after the
//   settle; exact aggregate live; the rung-push event names the keeper and
//   the exact amount.
// The STX suite runs four rungs: fixed buy, peg sell, fixed sell, peg buy.
// sBTC/USDCx has only band rungs (pegged by bps, guard from DIA), so the same
// walk runs on jing-sell-sbtc-20-v2 (x) and jing-buy-sbtc-20-v2 (y); the
// fixed-rung quote (limit = the name's price, spread none) is N/A.
// Stale print: a real [1,7] print fetched first, then the fork clock is moved
// 85 s past its feed time (settle-token-*-deposit reads max-staleness, 80 s;
// at 45 s the STX-style age gives u1032 price-before-order instead); every
// later print is newer.
// Run: node simulations/verify-v6-rungs-push-lazer-sbtc-usdcx.mjs
import {
  startFork, setupMarket, deployRung, fundX, fundY, rid, TR, AS, ok, err, freshUpd, advanceTo, prints,
  DEP, LADDER, MARKET, CORE, S, P_, check, must, show, tx, evalIn, uintCV, noneCV, boolCV, stringAsciiCV,
} from './_rungs-sbtc-usdcx.mjs';
import { SBTC_WHALE, USDC_WHALE, fetchUsdcxUpdate, usdcxFeedTimes, midOf } from './_sbtc-usdcx-v6-5-common.mjs';
import { summary, retry } from './_yg-loop-common.js';
import { bufferCV } from '@stacks/transactions';

const A = SBTC_WHALE, SY = USDC_WHALE;
const KEEPER = 'SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3';
const BPS = 20n;
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const isRcpt = (v) => !!v?.ok && ['amount', 'epoch', 'sbtc-paid', 'shares', 'stx-paid'].every((k) => typeof v.ok[k] === 'bigint');
let U;

try {
  // the stale print: fetched before the fork, its feed time becomes > 40 s old
  const p0 = await retry(fetchUsdcxUpdate), t0 = await retry(() => usdcxFeedTimes(p0.hex));
  const STALE = bufferCV(Buffer.from(p0.hex.replace(/^0x/, ''), 'hex'));
  await startFork('=== v6 rungs: oracle-free deposit/push + keeper settle (sBTC/USDCx v6-5 band rungs) ===');
  group('setup');
  const { ladderOwner: LO } = await setupMarket();
  const SELL = await deployRung('x', 20), BUY = await deployRung('y', 20);
  await tx('canonical sel-band = v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('sel-band'), P_(SELL)], { ok: true });
  await tx('canonical buy-band = v2 bytes', LO, LADDER, 'set-canonical', [stringAsciiCV('buy-band'), P_(BUY)], { ok: true });
  await tx('init jing-sell-sbtc-20-v2', LO, SELL, 'initialize', [uintCV(BPS), boolCV(true)], { ok: true });
  await tx('init jing-buy-sbtc-20-v2', LO, BUY, 'initialize', [uintCV(BPS), boolCV(true)], { ok: true });
  const now = await advanceTo(t0.at + 85);
  check(`fork clock ${now} is > 80 s (max-staleness, what settle-token-*-deposit reads) past the stale print (${t0.at})`, now - t0.at > 80, `${now - t0.at} s`);
  must('DIA guard still live after the clock move (miner-mid > 0)', (await evalIn(SELL, '(miner-mid)')) > 0n);
  U = await freshUpd();
  const MID = U.mid;
  console.log(`  mid ${MID}`);
  await tx('seed opposite bid: 5 USDCx at -5% (the first x push must escrow)', SY, MARKET, 'deposit-token-y', [uintCV(5_000_000), uintCV(MID * 95n / 100n), noneCV(), TR.y, AS.y], { ok: 5_000_000n });
  const pushes = [];
  for (const [n, side, owner, amount, top] of [[SELL, 'x', A, 20000n, 500n], [BUY, 'y', SY, 5_000_000n, 500_000n]]) {
    group(`${n.split('.')[1]} (${side})`);
    const nm = n.split('.')[1];
    const held = side === 'x' ? 'held-sats' : 'held-uusdcx';
    const guard = await evalIn(n, side === 'x' ? '(current-floor)' : '(current-cap)');
    const settle = async (label, qty, upd, want = { ok: qty }) => { const u = upd ?? (U = await freshUpd(U)).cv; return tx(`${nm}: ${label}`, KEEPER, MARKET, `settle-token-${side}-deposit`, [P_(n), u, TR[side], AS[side]], want); };
    const pend = async () => (await evalIn(MARKET, `(get-token-${side}-pending-deposit '${n})`));
    const st = async () => evalIn(n, '(get-state)');
    await tx(`${nm}: pause market`, DEP, MARKET, 'set-paused', [boolCV(true)], { ok: true });
    await tx(`${nm}: member deposit without oracle is held on refusal`, owner, n, 'deposit', [uintCV(amount)], isRcpt);
    { const s = await st(); check(`${nm}: held exact`, s[held] === amount && s.resting === 0n, show(s)); }
    await tx(`${nm}: keeper push while paused leaves held`, KEEPER, n, 'push', [], { ok: false });
    await tx(`${nm}: unpause`, DEP, MARKET, 'set-paused', [boolCV(false)], { ok: true });
    const pushed = await tx(`${nm}: keeper push escrows without oracle`, KEEPER, n, 'push', [], { ok: true });
    pushes.push({ r: pushed, amount, nm });
    check(`${nm}: escrow exact`, (await pend())?.amount === amount);
    check(`${nm}: not live until settle`, (await evalIn(MARKET, `(get-token-${side}-deposit (get-current-cycle) '${n})`)) === 0n);
    { const s = await st(); check(`${nm}: escrow stays in member claim`, s[held] === 0n && s.resting === amount, show(s)); }
    await tx(`${nm}: nothing held to push`, KEEPER, n, 'push', [], { ok: false });
    await settle('stale signed update refuses settlement', amount, STALE, (v) => v?.err === 1002n || v?.err === 1003n);
    check(`${nm}: stale refusal preserves escrow`, (await pend())?.amount === amount);
    await settle('newer signed update places escrow', amount);
    check(`${nm}: pending cleared`, (await pend()) === null);
    { const o = await evalIn(MARKET, `(get-token-${side}-order '${n})`); check(`${nm}: exact stored quote (limit = DIA guard ${guard}, spread (some u20))`, o?.limit === guard && o?.['spread-bps'] === BPS, show(o)); }
    { const want = MID * (side === 'x' ? 10020n : 9980n) / 10000n, got = await evalIn(MARKET, `(token-${side}-limit-at '${n} u${MID})`); check(`${nm}: effective peg at mid (${want})`, got === want, `${got}`); }
    await tx(`${nm}: small top-up escrows against existing position`, owner, n, 'deposit', [uintCV(top)], isRcpt);
    await tx(`${nm}: duplicate pending makes next top-up held`, owner, n, 'deposit', [uintCV(top)], isRcpt);
    { const s = await st(); check(`${nm}: top-up held exact`, s[held] === top && s.resting === amount + top, show(s)); }
    await tx(`${nm}: keeper cannot push over pending`, KEEPER, n, 'push', [], { ok: false });
    await settle('admit first top-up', top);
    await tx(`${nm}: keeper pushes held top-up after settle`, KEEPER, n, 'push', [], { ok: true });
    await settle('admit second top-up', top);
    check(`${nm}: exact aggregate live`, (await evalIn(MARKET, `(get-token-${side}-deposit (get-current-cycle) '${n})`)) === amount + top * 2n);
    { const s = await st(); check(`${nm}: held drained`, s[held] === 0n && s.resting === amount + top * 2n, show(s)); }
    await tx(`${nm}: empty push false`, KEEPER, n, 'push', [], { ok: false });
  }
  group('events');
  for (const { r, amount, nm } of pushes) {
    const ev = prints(r.receipt).filter((p) => p.event === 'rung-push');
    check(`${nm}: rung-push event names keeper and exact amount`, ev.some((p) => p.pushed === true && p.amount === amount && p.keeper === KEEPER), show(ev));
  }
} catch (e) { console.error(e); S.fails.push(`STOP: ${e.message}`); }
summary();
if (S.fails.length) process.exitCode = 1;
