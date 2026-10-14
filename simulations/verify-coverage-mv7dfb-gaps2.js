// verify-coverage-mv7dfb-gaps2.js - second gap pass on the final mv7dfb deploy
// bytes (deploy-bytes-mv7dfb/), one stxer fork session. Each section reaches
// an arm the earlier suites leave out, with real fork state unless marked as a
// fixture:
//   A  rungs (buy + sell): read-only sweep. `epoch-payout` on an epoch with no
//      reserve row (a future epoch, or one closed by the last withdraw) takes
//      the `none` arm.
//   B  market: a taker swap that names a wrong asset (tx-name) walks two
//      resting makers. The first fill's `as-contract?` allowance does not cover
//      the real sBTC asset, so it errs, and the second walk step takes the
//      `match acc` err arm (walk-x-book-step on asks, walk-y-book-step on
//      bids). The swap reverts; nothing moves.
//   C  router: DLMM pool v-3 holds no sBTC and its bins below the active bin
//      are empty. 260 swaps of 1 uSTX on empty bins walk its active bin down
//      to <= -475 (no transfer happens on an empty bin), then sBTC liquidity is
//      added just below it. A smart STX -> sBTC swap quotes v-3 with its
//      active bin under DLMM_CENTER_BIN - 29 (dlmm-out `aid < 29` arm).
//   D  juice pool: a signer-manager contract whose `validate-stake!` calls
//      `pox-settle-stakers`. pox-5 sets its reentrancy flag around that
//      callback, so `claim-staker-rewards-for-signer` errs and settle-one
//      takes its err arm (pox-settle-stakers -> u-settle-failed). The stake
//      itself goes through.
//   E  Fast Pool: get-clock by tx while a batch is open (batch-start arm), and
//      the signer read-only sweep on a cycle never claimed (compute-due
//      total-shares = 0 arms through get-stacker-rewards).
// Fixtures: PoX earned-reward maps for the Fast Pool cycle (as in every pool
// suite). Nothing else is set by Eval.
// Run: node simulations/verify-coverage-mv7dfb-gaps2.js   (keyless Lazer through the faktory-dao route)
import { session, bytes, sweepReadOnly, Cl, ClarityVersion, U, ok, err, P, cp, mk, DEP, POX, SBTC, WSTX, MARKET, ROUTER, SBTC_WHALE, STX_WHALE, STX, PP } from './_mv7dfb-session.mjs';

const S = session('coverage-mv7dfb-gaps2');
const { tx, ev, fixture } = S;
const STRANGER = mk(691);
const PID = `${DEP}.juice-pool-sbtc-signer`, VID = `${DEP}.juice-sbtc-autoswap`;
const FP = 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4', FV = `${FP}.fastpool-swap-vault`, FPOOL = `${FP}.signer-manager-vault-stx-rewards`;
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const POOL3 = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-3-bps-15';
const POOL1 = 'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-1-bps-15';
const BOGUS = 'not-the-asset';

await S.jing();

// ==== A: rung read-only sweeps ================================================================
await S.deploy('jing-rung-deposit-trait', bytes('jing-rung-deposit-trait'), ClarityVersion.Clarity5);
for (const [name, as] of [['jing-buy-stx-core-spread-v1', 'jing-buy-stx-spread-50'], ['jing-sell-stx-core-spread-v1', 'jing-sell-stx-spread-50']]) {
  await S.deploy(as, bytes(name), ClarityVersion.Clarity5);
  S.notes.push(`${name} (as ${as}): ${await sweepReadOnly(S, `${DEP}.${as}`, bytes(name), [{ principal: DEP, uint: 0 }, { principal: STRANGER, uint: 1000 }])} read-only calls`);
  await tx(`${as}: epoch-payout on epoch 7 (no reserve row) answers the inputs`, DEP, `${DEP}.${as}`, 'epoch-payout', [Cl.uint(7), Cl.uint(11), Cl.uint(13)], '(tuple (input u11) (proceeds u13))');
}

// ==== B: market walk err arms (wrong asset name) ===============================================
await S.fresh();
const A1 = mk(692), A2 = mk(693), B1 = mk(694), B2 = mk(695);
for (const a of [A1, A2]) await tx(`fund ${a.slice(0, 6)} 10000 sats`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(10_000), P(SBTC_WHALE), P(a), Cl.none()], '(ok true)');
for (const b of [B1, B2]) await S.sendStx(`fund ${b.slice(0, 6)} 50 STX`, STX_WHALE, b, 50n * STX);
const settleX = async (who, tag) => {
  if ((await S.evRaw(MARKET, `(get-token-x-pending-deposit '${who})`)) !== 'none')
    await tx(`${tag}: settle the pending ask`, who, MARKET, 'settle-token-x-deposit', [P(who), await S.fresh(), cp(SBTC), Cl.stringAscii('sbtc-token')], ok);
};
const settleY = async (who, tag) => {
  if ((await S.evRaw(MARKET, `(get-token-y-pending-deposit '${who})`)) !== 'none')
    await tx(`${tag}: settle the pending bid`, who, MARKET, 'settle-token-y-deposit', [P(who), await S.fresh(), cp(WSTX), Cl.stringAscii('wstx')], ok);
};
for (const [who, pct] of [[A1, 101n], [A2, 102n]]) {
  await tx(`ask 5000 sats at mid + ${pct - 100n}%`, who, MARKET, 'deposit-token-x', [Cl.uint(5_000), Cl.uint((S.MID * pct) / 100n), Cl.none(), cp(SBTC), Cl.stringAscii('sbtc-token')], '(ok u5000)');
  await settleX(who, `ask mid + ${pct - 100n}%`);
}
await ev('two asks rest on the book', MARKET, `(list (get-token-x-deposit (get-current-cycle) '${A1}) (get-token-x-deposit (get-current-cycle) '${A2}))`, '(list u5000 u5000)');
const bx = await tx(`taker swaps 10 STX for sBTC naming asset "${BOGUS}": the first walk fill errs, the second step takes the err arm`, STX_WHALE, MARKET, 'swap',
  [Cl.uint(10n * STX), Cl.uint((S.MID * 105n) / 100n), await S.fresh(), cp(SBTC), Cl.stringAscii(BOGUS), cp(WSTX), Cl.stringAscii('wstx'), Cl.bool(false)], err);
S.notes.push(`walk-x wrong asset name: ${bx.result}`);
await ev('asks untouched after the reverted swap', MARKET, `(list (get-token-x-deposit (get-current-cycle) '${A1}) (get-token-x-deposit (get-current-cycle) '${A2}))`, '(list u5000 u5000)');
await tx('control: the same swap with the real asset name fills', STX_WHALE, MARKET, 'swap',
  [Cl.uint(1n * STX + STX / 2n), Cl.uint((S.MID * 105n) / 100n), await S.fresh(), cp(SBTC), Cl.stringAscii('sbtc-token'), cp(WSTX), Cl.stringAscii('wstx'), Cl.bool(false)], ok);
for (const [who, pct] of [[B1, 99n], [B2, 98n]]) {
  await S.fresh();
  await tx(`bid 20 STX at mid - ${100n - pct}%`, who, MARKET, 'deposit-token-y', [Cl.uint(20n * STX), Cl.uint((S.MID * pct) / 100n), Cl.none(), cp(WSTX), Cl.stringAscii('wstx')], `(ok u${20n * STX})`);
  await settleY(who, `bid mid - ${100n - pct}%`);
}
await ev('two bids rest on the book', MARKET, `(list (get-token-y-deposit (get-current-cycle) '${B1}) (get-token-y-deposit (get-current-cycle) '${B2}))`, `(list u${20n * STX} u${20n * STX})`);
const by = await tx(`taker sells 5000 sats naming asset "${BOGUS}": the first walk fill errs, the second step takes the err arm`, SBTC_WHALE, MARKET, 'swap',
  [Cl.uint(5_000), Cl.uint((S.MID * 95n) / 100n), await S.fresh(), cp(SBTC), Cl.stringAscii(BOGUS), cp(WSTX), Cl.stringAscii('wstx'), Cl.bool(true)], err);
S.notes.push(`walk-y wrong asset name: ${by.result}`);
await ev('bids untouched after the reverted swap', MARKET, `(list (get-token-y-deposit (get-current-cycle) '${B1}) (get-token-y-deposit (get-current-cycle) '${B2}))`, `(list u${20n * STX} u${20n * STX})`);

// ==== C: router dlmm-out with an active bin under 29 (pool v-3) ================================
const STEPS = Array.from({ length: 130 }, (_, i) => `u${i}`).join(' ');
await S.deploy('sim-dlmm-bin-walker', `
(define-constant TARGET -475)
(define-private (step (i uint) (n uint))
  (let ((b (unwrap-panic (contract-call? '${POOL3} get-active-bin-id))))
    (if (and (> b TARGET) (is-ok (contract-call? '${DLMM_CORE} swap-x-for-y '${POOL3} '${WSTX} '${SBTC} b u1)))
      (+ n u1)
      n)))
(define-public (walk) (ok (fold step (list ${STEPS}) u0)))`, ClarityVersion.Clarity5, STX_WHALE, 'sim-only helper: swaps 1 uSTX on the empty active bin of DLMM v-3 (moves it down one bin, transfers nothing)');
const WALKER = `${STX_WHALE}.sim-dlmm-bin-walker`;
const bin3 = async () => BigInt(/-?\d+/.exec(await S.evRaw(POOL3, '(var-get active-bin-id)'))[0]);
S.notes.push(`pool v-3 active bin before: ${await bin3()}, sBTC ${await S.evRaw(POOL3, `(unwrap-panic (contract-call? '${SBTC} get-balance '${POOL3}))`)}`);
for (let i = 0; i < 4 && (await bin3()) > -475n; i++) await tx(`walk v-3 down (pass ${i + 1})`, STX_WHALE, WALKER, 'walk', [], ok);
const b3 = await bin3();
S.check('pool v-3 active bin <= -475 (aid = bin + 500 < 29)', String(b3), () => b3 <= -475n);
await tx(`add 3,000,000 sats at bin ${b3 - 2n} (below the active bin, sBTC only)`, SBTC_WHALE, DLMM_CORE, 'add-liquidity',
  [cp(POOL3), cp(WSTX), cp(SBTC), Cl.int(b3 - 2n), Cl.uint(0), Cl.uint(3_000_000), Cl.uint(1), Cl.uint(10_000), Cl.uint(10_000)], ok);
const p1 = U(await S.evRaw(ROUTER, `(let ((p (unwrap-panic (contract-call? '${POOL1} get-pool)))) (unwrap-panic (contract-call? '${DLMM_CORE} get-bin-price (get initial-price p) (get bin-step p) (get active-bin-id p))))`));
const L = ((10_000_000_000n * PP) / p1) * 103n / 100n;
const taker = mk(696);
await S.sendStx('router taker 1010 STX', STX_WHALE, taker, 1010n * STX);
const rs = await tx(`router smart 1000 STX -> sBTC at limit ${L}: dlmm-out quotes v-3 with aid < 29`, taker, ROUTER, 'smart-swap-stx-for-sbtc', [Cl.uint(1000n * STX), Cl.uint(L), Cl.none(), Cl.uint(1), Cl.uint(0)], () => true);
S.notes.push(`router smart swap with v-3 at bin ${b3}: ${rs.result}`);

// ==== D: juice pool settle-one err arm (reentrancy flag) =======================================
await S.deploy('juice-swap-vault-trait-v2', bytes('juice-swap-vault-trait-v2'), ClarityVersion.Clarity6);
await S.deploy('juice-sbtc-autoswap', bytes('juice-sbtc-autoswap'), ClarityVersion.Clarity6);
await S.deploy('juice-pool-sbtc-signer', bytes('juice-pool-sbtc-signer'), ClarityVersion.Clarity6);
const RS = `${STRANGER}.sim-reentrant-signer`;
await S.deploy('sim-reentrant-signer', `
(use-trait smt 'SP000000000000000000002Q6VF78.pox-5.signer-manager-trait)
(define-data-var settle-result (response uint uint) (ok u0))
(define-public (validate-stake! (staker principal) (first uint) (n uint) (ustx uint) (sats uint) (bond bool) (cd (optional (buff 500))))
  (begin
    (var-set settle-result (contract-call? '${PID} pox-settle-stakers (list staker) u144 none))
    (ok true)))
(define-public (reg (me <smt>) (key (buff 33)) (auth uint) (sig (buff 65)))
  (begin
    (try! (contract-call? 'SP000000000000000000002Q6VF78.pox-5 grant-signer-key key current-contract auth sig))
    (contract-call? 'SP000000000000000000002Q6VF78.pox-5 register-signer me key)))
(define-read-only (get-settle-result) (var-get settle-result))`, ClarityVersion.Clarity5, STRANGER, 'sim-only signer manager: calls pox-settle-stakers from inside validate-stake!');
{
  const [, key, auth, sig] = await S.grant(RS, 31);
  await tx('sim signer registers with pox-5', STRANGER, RS, 'reg', [cp(RS), key, auth, sig], ok);
}
if (S.offset() >= 2000) await S.advance(CYCLE_LEFT(), 'leave the prepare phase');
const staker = mk(697);
await S.sendStx('staker 1100 STX', STX_WHALE, staker, 1100n * STX);
const st = await tx('stake 1000 STX to the sim signer: validate-stake! calls pox-settle-stakers under the reentrancy flag', staker, POX, 'stake',
  [cp(RS), Cl.uint(1000n * STX), Cl.uint(1), Cl.uint(S.burn), Cl.none()], () => true);
S.notes.push(`stake via the reentrant signer: ${st.result}`);
await ev('pox-settle-stakers answered u-settle-failed (settle-one err arm)', RS, '(get-settle-result)', err);
S.notes.push(`settle result recorded by the sim signer: ${await S.evRaw(RS, '(get-settle-result)')}`);

// ==== E: Fast Pool get-clock while a batch is open + signer sweep on an unclaimed cycle ========
await S.deploy('fastpool-swap-vault', bytes('fastpool-swap-vault'), ClarityVersion.Clarity6, FP);
await S.deploy('signer-manager-vault-stx-rewards', bytes('signer-manager-vault-stx-rewards'), ClarityVersion.Clarity6, FP);
await tx('FP register-self', FP, FPOOL, 'register-self', await S.grant(FPOOL, 23), ok);
const FS1 = mk(698);
{
  const rc = 143, sats = 40_000n, key = `{reward-cycle:u${rc},bond-index:none,signer:'${FPOOL}}`;
  await tx(`real sBTC backs FP cycle ${rc}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(sats), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
  await fixture(`FP cycle ${rc}: one stacker, 1 share, mirrored`, POX, `(begin
    (map-set signer-shares-staked-for-cycle ${key} u1)
    (map-set signer-pending-staked-ustx-per-cycle {signer:'${FPOOL},cycle:u${rc}} u1)
    (map-set signer-rewards-per-token-settled-for-cycle ${key} (get-rewards-per-token-for-cycle u${rc} none))
    (map-set signer-unclaimed-rewards-for-cycle ${key} u${sats})
    (map-set staker-shares-staked-for-cycle {reward-cycle:u${rc},bond-index:none,signer:'${FPOOL},staker:'${FS1}} u1)
    (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${sats}))
    (try! (contract-call? '${FPOOL} validate-stake! '${FS1} u${rc} u1 u1 u0 false none)) (ok true))`, '(ok true)');
  await tx(`FP claim ${rc}`, STRANGER, FPOOL, 'claim-rewards', [Cl.uint(rc)], `(ok u${sats})`);
  await tx(`FP fund ${rc}`, STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(rc), cp(FV)], ok);
  await tx('FP jing-place: the batch rests as an ask', STRANGER, FV, 'jing-place', [await S.fresh()], ok);
  await tx('FP get-clock by tx while the batch is open (batch-start arm)', STRANGER, FV, 'get-clock', [], () => true);
}
await tx('FP get-stacker-rewards on cycle 0 (never claimed: total-shares 0 arms)', STRANGER, FPOOL, 'get-stacker-rewards', [P(FS1), Cl.uint(0)], (v) => /stx-due u0/.test(v) && /sbtc-gross-due u0/.test(v));
S.notes.push(`signer-manager-vault-stx-rewards: ${await sweepReadOnly(S, FPOOL, bytes('signer-manager-vault-stx-rewards'), [{ principal: FS1, uint: 0 }])} read-only calls (cycle 0)`);
S.done();

function CYCLE_LEFT() { return 2100 - S.offset() + 2; }
