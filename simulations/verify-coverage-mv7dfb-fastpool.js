// verify-coverage-mv7dfb-fastpool.js - stxer mainnet fork of the Fast Pool
// swap-vault suite from its deploy bytes (fastpool-pox-5 b719e87 vault,
// 3f82a93 signer; deploy-bytes-mv7dfb/) under the Fast Pool deployer, with
// the Jing v6-3 stack + router 15aef66 + trait-v2 (and the Juice vault, as a
// foreign vault) from the faktory-dao template bytes.
// Fills what the existing fastpool sims leave out: admin set (update-admin,
// update-fees, withdraw-fees), every vault setter range, the share mirror
// (pinned skip, drift -> pin refused u1008 -> repair-mirror-many removes and
// adds), a second claim of a claimed cycle, refloor inside and after the
// window, DIA-priced split (fresh DIA, then stale DIA -> RFQ native price),
// recovery (signer deadline vs vault delay u16046, with sBTC + STX home, with
// a resting order on the book), single and batch distribution with
// recovered sBTC, dust sweeps, and the swap-vault switch (propose, cancel,
// cooldown, busy, confirm).
// Fixtures: PoX earned-reward maps per cycle (as in every pool suite).
// Run: PYTH_API_KEY=... node simulations/verify-coverage-mv7dfb-fastpool.js
import { session, bytes, tupleCV, Cl, ClarityVersion, U, ok, err, P, cp, mk, sbtcOf, stxOf, DEP, POX, SBTC, SBTC_WHALE, STX_WHALE, STX } from './_mv7dfb-session.mjs';

const FP = 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4';
const FV = `${FP}.fastpool-swap-vault`, FALT = `${FP}.fastpool-swap-vault-alt`, FPOOL = `${FP}.signer-manager-vault-stx-rewards`;
const JV = `${DEP}.juice-sbtc-autoswap`;
const ADMIN2 = mk(661), STRANGER = mk(662), FS1 = mk(663), FS2 = mk(664), FS3 = mk(665), FS4 = mk(666), FS5 = mk(667);
const S = session('coverage-mv7dfb-fastpool');
const { tx, ev, read, fixture } = S;
const fv = cp(FV);

await S.jing();
await S.deploy('juice-swap-vault-trait-v2', bytes('juice-swap-vault-trait-v2'), ClarityVersion.Clarity6);
await S.deploy('juice-sbtc-autoswap', bytes('juice-sbtc-autoswap'), ClarityVersion.Clarity6);
await S.deploy('juice-pool-sbtc-signer', bytes('juice-pool-sbtc-signer'), ClarityVersion.Clarity6);
await S.deploy('fastpool-swap-vault', bytes('fastpool-swap-vault'), ClarityVersion.Clarity6, FP);
await S.deploy('signer-manager-vault-stx-rewards', bytes('signer-manager-vault-stx-rewards'), ClarityVersion.Clarity6, FP);
await S.deploy('fastpool-swap-vault-alt', bytes('fastpool-swap-vault'), ClarityVersion.Clarity6, FP);
await tx('register-self (Fast Pool deployer)', FP, FPOOL, 'register-self', await S.grant(FPOOL, 11), ok);

// ---- admin ----------------------------------------------------------------------------
await tx('update-admin of yourself -> u1001', FP, FPOOL, 'update-admin', [P(FP), Cl.bool(false)], '(err u1001)');
await tx('stranger update-admin -> u1001', STRANGER, FPOOL, 'update-admin', [P(ADMIN2), Cl.bool(true)], '(err u1001)');
await tx('admin adds ADMIN2', FP, FPOOL, 'update-admin', [P(ADMIN2), Cl.bool(true)], '(ok true)');
await tx('stranger update-fees -> u1001', STRANGER, FPOOL, 'update-fees', [Cl.uint(100)], '(err u1001)');
await tx('update-fees 10000 -> u1004', ADMIN2, FPOOL, 'update-fees', [Cl.uint(10000)], '(err u1004)');
await tx('ADMIN2 sets fees 500 bps (5%)', ADMIN2, FPOOL, 'update-fees', [Cl.uint(500)], '(ok true)');
await tx('withdraw-fees above earned -> u1005', FP, FPOOL, 'withdraw-fees', [Cl.uint(1), P(FP)], '(err u1005)');
await tx('sweep-sbtc-dust with nothing -> u1014', FP, FPOOL, 'sweep-sbtc-dust', [P(FP)], '(err u1014)');
await tx('sweep-stx-dust with nothing -> u1014', FP, FPOOL, 'sweep-stx-dust', [P(FP)], '(err u1014)');
await tx('stranger sweep -> u1001', STRANGER, FPOOL, 'sweep-stx-dust', [P(STRANGER)], '(err u1001)');
// ---- vault setters (signer wrappers: admin + active vault; vault: POOL only + range) --------
for (const [fn, bad, good] of [['set-no-pyth-slippage-bps', 5001, 1000], ['set-leeway-bps', 1001, 500], ['set-slippage-bps', 1001, 100],
  ['set-dia-band-bps', 5001, 1000], ['set-router-cooldown', 145, 1], ['set-window-blocks', 289, 3], ['set-max-chunk-sats', 0, 60000], ['set-pyth-fee-budget', 10_000_001, 0]]) {
  const w = fn.replace(/^set-/, 'set-vault-');
  await tx(`vault ${fn} by a stranger -> u16000`, STRANGER, FV, fn, [Cl.uint(good)], '(err u16000)');
  await tx(`${w} by a stranger -> u1001`, STRANGER, FPOOL, w, [Cl.uint(good), fv], '(err u1001)');
  await tx(`${w} on a foreign vault -> u1055`, FP, FPOOL, w, [Cl.uint(good), cp(JV)], '(err u1055)');
  await tx(`${w} out of range -> u16033`, FP, FPOOL, w, [Cl.uint(bad), fv], '(err u16033)');
  await tx(`${w} u${good}`, FP, FPOOL, w, [Cl.uint(good), fv], '(ok true)');
}
await tx('jing-place with no batch (window-open none arm) -> u16030', STRANGER, FV, 'jing-place', [await S.fresh()], '(err u16030)');
await tx('jing-reclaim with no batch -> u16031', STRANGER, FV, 'jing-reclaim', [], '(err u16031)');
await tx('vault fund by a stranger -> u16000', STRANGER, FV, 'fund', [Cl.uint(1)], '(err u16000)');
await tx('vault emergency-recover by a stranger -> u16000', STRANGER, FV, 'emergency-recover', [], '(err u16000)');
await tx('recover-swap-vault with no batch -> u1053', STRANGER, FPOOL, 'recover-swap-vault', [fv], '(err u1053)');
await tx('validate-stake! called directly -> u1003', STRANGER, FPOOL, 'validate-stake!', [P(STRANGER), Cl.uint(1), Cl.uint(1), Cl.uint(1), Cl.uint(0), Cl.bool(false), Cl.none()], (v) => err(v));
// ---- real stakes ---------------------------------------------------------------------------
await S.sendStx('fund FS1 101 STX', STX_WHALE, FS1, 101n * STX);
await tx('FS1 stakes 100 STX for 96 cycles', FS1, POX, 'stake', [cp(FPOOL), Cl.uint(100n * STX), Cl.uint(96), Cl.uint(S.burn), Cl.none()], ok);
await tx('a bond stake is refused (u1015 inside pox-5)', FS1, POX, 'stake-update', [cp(FPOOL), cp(FPOOL), Cl.uint(0), Cl.uint(0), Cl.some(Cl.buffer(Buffer.from('00', 'hex')))], (v) => err(v));

// ---- cycle 144: drifted mirror, repair, two claims ---------------------------------------------
const RC = 144, F1 = 150_000n, F2 = 50_000n;
const key = `{reward-cycle:u${RC},bond-index:none,signer:'${FPOOL}}`;
const sh = (w, n) => `(map-set staker-shares-staked-for-cycle {reward-cycle:u${RC},bond-index:none,signer:'${FPOOL},staker:'${w}} u${n})`;
await tx(`real sBTC backs cycle ${RC}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(F1), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
await fixture(`cycle ${RC}: pox-5 truth FS1 2 / FS2 1 / FS3 2 (total 5); the mirror says FS1 3 / FS2 1 (drift)`, POX, `(begin
  (map-set signer-shares-staked-for-cycle ${key} u5)
  (map-set signer-pending-staked-ustx-per-cycle {signer:'${FPOOL},cycle:u${RC}} u5)
  (map-set signer-rewards-per-token-settled-for-cycle ${key} (get-rewards-per-token-for-cycle u${RC} none))
  (map-set signer-unclaimed-rewards-for-cycle ${key} u${F1})
  ${sh(FS1, 2)} ${sh(FS2, 1)} ${sh(FS3, 2)}
  (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${F1}))
  (try! (contract-call? '${FPOOL} validate-stake! '${FS1} u${RC} u1 u3 u0 false none))
  (try! (contract-call? '${FPOOL} validate-stake! '${FS2} u${RC} u1 u1 u0 false none))
  (ok true))`, '(ok true)');
await tx('claim-rewards (first claim: fee rate + deadline recorded)', STRANGER, FPOOL, 'claim-rewards', [Cl.uint(RC)], `(ok u${F1})`);
const dl = U(await S.evRaw(FPOOL, `(get deadline (get-settlement u${RC}))`));
S.check('deadline = claim height + 432', String(dl), String(BigInt(S.burn) + 432n));
await ev('fee rate 500 frozen for the cycle', FPOOL, `(get-fee-bips-for-cycle u${RC})`, 'u500');
await tx(`more sBTC for cycle ${RC}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(F2), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
await fixture(`cycle ${RC}: another ${F2} sats accrue`, POX, `(begin (map-set signer-unclaimed-rewards-for-cycle ${key} u${F2}) (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${F2})) (ok true))`, '(ok true)');
await tx('update-fees 700 after the first claim (does not apply to the cycle)', FP, FPOOL, 'update-fees', [Cl.uint(700)], '(ok true)');
await tx('second claim of the same cycle: pot grows, deadline and rate kept', STRANGER, FPOOL, 'claim-rewards', [Cl.uint(RC)], `(ok u${F2})`);
await ev('pot = both claims, deadline unchanged, rate 500', FPOOL, `{ s: (get-settlement u${RC}), f: (get-fee-bips-for-cycle u${RC}) }`, (v) => v.includes(`(pot-sats u${F1 + F2})`) && v.includes(`(deadline u${dl})`) && v.includes('(f u500)'));
await S.advance(5, 'fund later than the claim');
await tx('fund-swap-vault on a drifted mirror -> pin refused u1008', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(RC), fv], '(err u1008)');
await tx('distribute before any pin -> u1008 as well', STRANGER, FPOOL, 'distribute-rewards', [P(FS1), Cl.uint(RC)], '(err u1008)');
await tx('repair-mirror-many [FS1, FS2, FS3]: removes 1 (FS1), adds 2 (FS3), FS2 unchanged', STRANGER, FPOOL, 'repair-mirror-many', [Cl.list([P(FS1), P(FS2), P(FS3)]), Cl.uint(RC)], '(ok (tuple (added u2) (removed u1)))');
const fee = ((F1 + F2) * 500n) / 10000n;
await tx(`fund-swap-vault: pins 5 shares, takes the 5% fee (${fee} sats)`, STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(RC), fv], `(ok u${F1 + F2 - fee})`);
await ev('earned-fees = the fee; cycle pinned at 5 shares', FPOOL, `{ f: (get-earned-fees), p: (is-pinned u${RC}), t: (get total-shares (get-settlement u${RC})) }`, `(tuple (f u${fee}) (p true) (t u5))`);
await tx('repair-mirror-many on a pinned cycle -> u1012', STRANGER, FPOOL, 'repair-mirror-many', [Cl.list([P(FS1)]), Cl.uint(RC)], '(err u1012)');
await fixture('validate-stake! for FS4 into the pinned cycle: the mirror skips it', POX, `(begin (try! (contract-call? '${FPOOL} validate-stake! '${FS4} u${RC} u1 u9 u0 false none)) (ok true))`, '(ok true)');
await ev('FS4 got no mirrored share in the pinned cycle', FPOOL, `(get shares (get-stacker-rewards '${FS4} u${RC}))`, 'u0');
await tx('fund again while busy -> u1050', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(RC), fv], '(err u1050)');
await tx('distribute with nothing to pay yet -> u1013', STRANGER, FPOOL, 'distribute-rewards', [P(FS1), Cl.uint(RC)], '(err u1013)');
await tx('withdraw part of the fee (ADMIN2)', ADMIN2, FPOOL, 'withdraw-fees', [Cl.uint(1000), P(ADMIN2)], '(ok u1000)');
// ---- sales: place, refloor, smart, split, DIA split ------------------------------------------------
await tx('dia band 0 (current-mid without DIA)', FP, FPOOL, 'set-vault-dia-band-bps', [Cl.uint(0), fv], '(ok true)');
await tx('jing-place (band 0 arm)', STRANGER, FV, 'jing-place', [await S.fresh()], ok);
await tx('dia band 1000 back', FP, FPOOL, 'set-vault-dia-band-bps', [Cl.uint(1000), fv], '(ok true)');
await tx('stranger refloor-vault -> u1001', STRANGER, FPOOL, 'refloor-vault', [await S.fresh(), fv], '(err u1001)');
await tx('vault jing-refloor by a stranger -> u16000', STRANGER, FV, 'jing-refloor', [S.UPD], '(err u16000)');
await tx('admin refloor inside the window: ask at mid - leeway', FP, FPOOL, 'refloor-vault', [await S.fresh(), fv], ok);
await S.advance(3, 'window elapses');
await tx('admin refloor after the window: floor at mid - slippage', FP, FPOOL, 'refloor-vault', [await S.fresh(), fv], ok);
await tx('reclaim', STRANGER, FV, 'jing-reclaim', [], ok);
await S.stxBid(F1 + F2, 'sale');
const v0 = await read(sbtcOf(FV));
await tx('router-swap (smart): one 60k chunk', STRANGER, FV, 'router-swap', [await S.fresh()], (v) => ok(v) && v.includes('(amount u60000)'));
await S.advance(1, 'cooldown');
await tx('router-swap-split (manual, Jing leg 50k)', FP, FPOOL, 'router-swap-split', [Cl.uint(50000), Cl.uint(50000), Cl.uint(0), Cl.uint(0), Cl.uint(0), await S.fresh(), fv], (v) => ok(v) && v.includes('(unsold u0)'));
await S.cancelBid('sale');
await S.advance(1, 'cooldown');
await tx('vault router-swap-split-dia by a stranger -> u16000', STRANGER, FV, 'router-swap-split-dia', [Cl.uint(2000), Cl.uint(0), Cl.uint(2000), Cl.uint(0)], '(err u16000)');
await tx('split-dia that does not add up -> u16040', FP, FPOOL, 'router-swap-split-dia', [Cl.uint(2000), Cl.uint(0), Cl.uint(1000), Cl.uint(0), fv], '(err u16040)');
await tx('split-dia over the chunk -> u16039', FP, FPOOL, 'router-swap-split-dia', [Cl.uint(60001), Cl.uint(0), Cl.uint(60001), Cl.uint(0), fv], '(err u16039)');
await tx('split-dia 2,000 sats on XYK at the fresh DIA price', FP, FPOOL, 'router-swap-split-dia', [Cl.uint(2000), Cl.uint(0), Cl.uint(2000), Cl.uint(0), fv], (v) => ok(v) && v.includes('(price-source "dia")'));
const left = await read(sbtcOf(FV));
S.check('vault sold the two router chunks + the 2k DIA split', String(v0 - left), () => v0 - left >= 110_000n);
// ---- recovery: the signer deadline passes before the vault delay ------------------------------------
await tx('recover before the deadline -> u1052', STRANGER, FPOOL, 'recover-swap-vault', [fv], '(err u1052)');
await S.advance(Number(dl) + 1 - S.burn, 'past the signer deadline (vault delay not yet)');
await tx('recover: signer ok, vault RECOVERY_DELAY not -> u16046', STRANGER, FPOOL, 'recover-swap-vault', [fv], '(err u16046)');
await S.advance(5, 'past the vault delay');
const vx = await read(stxOf(FV)), p0 = await read(stxOf(FPOOL));
await tx(`recover-swap-vault: ${left} sats + the sale STX home`, STRANGER, FPOOL, 'recover-swap-vault', [fv], `(ok (tuple (sbtc u${left}) (stx u${vx})))`);
await ev('signer: STX + sale proceeds, recovered sBTC booked', FPOOL, `{ x: ${stxOf(FPOOL)}, u: (get-unswapped-for-cycle u${RC}), c: (get-vault-cycle) }`, `(tuple (c none) (u u${left}) (x u${p0 + vx}))`);
// ---- distribution ----------------------------------------------------------------------------------------
const s1 = await read(`(get unlocked (stx-account '${FS1}))`), b1 = await read(sbtcOf(FS1));
const d1 = await tx('distribute-rewards FS1 (2 of 5 shares): STX + recovered sBTC', STRANGER, FPOOL, 'distribute-rewards', [P(FS1), Cl.uint(RC)], ok);
S.check('FS1 gets 2/5 of the STX and of the recovered sBTC', d1.result, `(ok (tuple (sbtc u${(left * 2n) / 5n}) (stx u${(vx * 2n) / 5n})))`);
await ev('FS1 balances moved by exactly that', FPOOL, `{ x: (get unlocked (stx-account '${FS1})), s: ${sbtcOf(FS1)} }`, `(tuple (s u${b1 + (left * 2n) / 5n}) (x u${s1 + (vx * 2n) / 5n}))`);
await tx('distribute FS1 again -> u1013', STRANGER, FPOOL, 'distribute-rewards', [P(FS1), Cl.uint(RC)], '(err u1013)');
await tx('distribute-rewards-many [FS1 paid, FS2, FS3, FS5 no share]', STRANGER, FPOOL, 'distribute-rewards-many', [Cl.list([P(FS1), P(FS2), P(FS3), P(FS5)]), Cl.uint(RC)],
  `(ok (tuple (paid u2) (total-sbtc u${(left * 1n) / 5n + (left * 2n) / 5n}) (total-stx u${(vx * 1n) / 5n + (vx * 2n) / 5n})))`);
await tx('dust: 7 sats sent to the signer', SBTC_WHALE, SBTC, 'transfer', [Cl.uint(7), P(SBTC_WHALE), P(FPOOL), Cl.none()], '(ok true)');
await tx('sweep-sbtc-dust: only the unreserved sats', FP, FPOOL, 'sweep-sbtc-dust', [P(FP)], (v) => ok(v) && U(v) >= 7n);
await tx('sweep-sbtc-dust again -> u1014', FP, FPOOL, 'sweep-sbtc-dust', [P(FP)], '(err u1014)');
await S.sendStx('dust: 5 uSTX sent to the signer', STX_WHALE, FPOOL, 5n);
await tx('sweep-stx-dust', FP, FPOOL, 'sweep-stx-dust', [P(FP)], (v) => ok(v) && U(v) >= 5n);
await tx('sweep-stx-dust again -> u1014', FP, FPOOL, 'sweep-stx-dust', [P(FP)], '(err u1014)');
const ef = await read('(get-earned-fees)', FPOOL);
await tx('withdraw the rest of the fees', FP, FPOOL, 'withdraw-fees', [Cl.uint(ef), P(FP)], `(ok u${ef})`);

// ---- cycle 143 + swap-vault switch -----------------------------------------------------------------
await tx('propose-swap-vault by a stranger -> u1001', STRANGER, FPOOL, 'propose-swap-vault', [cp(FALT)], '(err u1001)');
await tx('propose the active vault -> u1055', FP, FPOOL, 'propose-swap-vault', [fv], '(err u1055)');
await tx('propose a vault of another pool (Juice) -> u1055', FP, FPOOL, 'propose-swap-vault', [cp(JV)], '(err u1055)');
await tx('confirm with nothing proposed -> u1054', FP, FPOOL, 'confirm-swap-vault', [fv, cp(FALT)], '(err u1054)');
await tx('propose the alt copy', FP, FPOOL, 'propose-swap-vault', [cp(FALT)], `(ok ${FALT})`);
await tx('cancel the proposal', FP, FPOOL, 'cancel-swap-vault-proposal', [], '(ok true)');
await tx('confirm after cancel -> u1054', FP, FPOOL, 'confirm-swap-vault', [fv, cp(FALT)], '(err u1054)');
await tx('propose the alt copy again', FP, FPOOL, 'propose-swap-vault', [cp(FALT)], `(ok ${FALT})`);
await tx('confirm inside the cooldown -> u1057', FP, FPOOL, 'confirm-swap-vault', [fv, cp(FALT)], '(err u1057)');
await tx('confirm with a different new vault -> u1055', FP, FPOOL, 'confirm-swap-vault', [fv, cp(JV)], '(err u1055)');
await tx('confirm with a non-active old vault -> u1055', FP, FPOOL, 'confirm-swap-vault', [cp(FALT), cp(FALT)], '(err u1055)');
const RC2 = 143, F3 = 80_000n;
const key2 = `{reward-cycle:u${RC2},bond-index:none,signer:'${FPOOL}}`;
await tx(`real sBTC backs cycle ${RC2}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(F3), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
await fixture(`cycle ${RC2}: FS2 1 share, mirrored`, POX, `(begin
  (map-set signer-shares-staked-for-cycle ${key2} u1)
  (map-set signer-pending-staked-ustx-per-cycle {signer:'${FPOOL},cycle:u${RC2}} u1)
  (map-set signer-rewards-per-token-settled-for-cycle ${key2} (get-rewards-per-token-for-cycle u${RC2} none))
  (map-set signer-unclaimed-rewards-for-cycle ${key2} u${F3})
  (map-set staker-shares-staked-for-cycle {reward-cycle:u${RC2},bond-index:none,signer:'${FPOOL},staker:'${FS2}} u1)
  (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${F3}))
  (try! (contract-call? '${FPOOL} validate-stake! '${FS2} u${RC2} u1 u1 u0 false none)) (ok true))`, '(ok true)');
await tx('claim cycle 143 (fees now 700)', STRANGER, FPOOL, 'claim-rewards', [Cl.uint(RC2)], `(ok u${F3})`);
await tx('fund cycle 143', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(RC2), fv], `(ok u${F3 - (F3 * 700n) / 10000n})`);
await tx('jing-place: the batch rests on the book', STRANGER, FV, 'jing-place', [await S.fresh()], ok);
await S.advance(4040, 'past the 4,032-block swap-vault cooldown (and the cycle 143 deadline)');
await tx('confirm while the old vault is funded -> u1050', FP, FPOOL, 'confirm-swap-vault', [fv, cp(FALT)], '(err u1050)');
await tx('recover-swap-vault with the order resting on the book (reclaim arm, no STX)', STRANGER, FPOOL, 'recover-swap-vault', [fv],
  `(ok (tuple (sbtc u${F3 - (F3 * 700n) / 10000n}) (stx u0)))`);
await tx('confirm-swap-vault: the alt copy is active', FP, FPOOL, 'confirm-swap-vault', [fv, cp(FALT)], `(ok ${FALT})`);
await tx('the old vault is refused now -> u1055', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(RC2), fv], '(err u1055)');
S.done();

// ---- second session at the fork tip: stale DIA -> the RFQ native price ------------------------------
// rfq-sbtc-stx-jing-v2-3 get-native-price reads burn-chain data stxer does not
// have for synthetic burn blocks (BlockingError after any AdvanceBlocks), so
// this arm runs in a session that never advances: window 0 (elapsed at once)
// and DIA's real updater key pushes values older than MAX_DIA_AGE.
const T = session('coverage-mv7dfb-fastpool-native');
await T.jing();
await T.deploy('juice-swap-vault-trait-v2', bytes('juice-swap-vault-trait-v2'), ClarityVersion.Clarity6);
await T.deploy('fastpool-swap-vault', bytes('fastpool-swap-vault'), ClarityVersion.Clarity6, FP);
await T.deploy('signer-manager-vault-stx-rewards', bytes('signer-manager-vault-stx-rewards'), ClarityVersion.Clarity6, FP);
await T.tx('register-self', FP, FPOOL, 'register-self', await T.grant(FPOOL, 12), ok);
await T.tx('window 0: a batch is elapsed at once', FP, FPOOL, 'set-vault-window-blocks', [Cl.uint(0), fv], '(ok true)');
await T.tx('router cooldown 0 (two sales in one block)', FP, FPOOL, 'set-vault-router-cooldown', [Cl.uint(0), fv], '(ok true)');
const R4 = 144, F5 = 20_000n, k4 = `{reward-cycle:u${R4},bond-index:none,signer:'${FPOOL}}`;
await T.tx(`real sBTC backs cycle ${R4}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(F5), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
await T.fixture(`cycle ${R4}: FS3 1 share, mirrored`, POX, `(begin
  (map-set signer-shares-staked-for-cycle ${k4} u1)
  (map-set signer-pending-staked-ustx-per-cycle {signer:'${FPOOL},cycle:u${R4}} u1)
  (map-set signer-rewards-per-token-settled-for-cycle ${k4} (get-rewards-per-token-for-cycle u${R4} none))
  (map-set signer-unclaimed-rewards-for-cycle ${k4} u${F5})
  (map-set staker-shares-staked-for-cycle {reward-cycle:u${R4},bond-index:none,signer:'${FPOOL},staker:'${FS3}} u1)
  (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${F5}))
  (try! (contract-call? '${FPOOL} validate-stake! '${FS3} u${R4} u1 u1 u0 false none)) (ok true))`, '(ok true)');
await T.tx('claim', STRANGER, FPOOL, 'claim-rewards', [Cl.uint(R4)], `(ok u${F5})`);
await T.tx('fund', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(R4), fv], `(ok u${F5})`);
await T.tx('split-dia on fresh DIA', FP, FPOOL, 'router-swap-split-dia', [Cl.uint(2000), Cl.uint(0), Cl.uint(2000), Cl.uint(0), fv], (v) => ok(v) && v.includes('(price-source "dia")'));
const DIA = 'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0';
const now = U(await T.evRaw(POX, 'stacks-block-time'));
const old = (now - 8000n) * 1000n;
const cur = await T.evRaw(`${DIA}.dia-oracle`, '{ s: (get value (unwrap-panic (get-value "STX/USD"))), b: (get value (unwrap-panic (get-value "BTC/USD"))) }');
const vS = U(cur.match(/\(s u\d+\)/)[0]), vB = U(cur.match(/\(b u\d+\)/)[0]);
T.fixtures.push('DIA updater (real key) re-pushes the current values with a timestamp 8,000 s old');
await T.tx('fixture: DIA updater pushes the same values, 8,000 s old', DIA, `${DIA}.dia-oracle`, 'set-multiple-values', [Cl.list([
  tupleCV({ key: Cl.stringAscii('STX/USD'), value: Cl.uint(vS), timestamp: Cl.uint(old) }), tupleCV({ key: Cl.stringAscii('BTC/USD'), value: Cl.uint(vB), timestamp: Cl.uint(old) })])], '(ok true)');
await T.tx('split-dia on stale DIA: RFQ native price, limit mid / 2', FP, FPOOL, 'router-swap-split-dia', [Cl.uint(2000), Cl.uint(0), Cl.uint(2000), Cl.uint(0), fv], (v) => ok(v) && v.includes('(price-source "native")') && v.includes('(dia-error (some u16036))'));
T.done();
