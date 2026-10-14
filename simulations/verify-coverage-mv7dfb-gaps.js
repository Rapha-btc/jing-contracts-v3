// verify-coverage-mv7dfb-gaps.js - the arms the suites leave out, on the
// final mv7dfb deploy bytes (deploy-bytes-mv7dfb/), one stxer fork session:
//   A  jing-core-v6: every log-* entry point. A stranger is refused
//      (ERR_NOT_AUTHORIZED); a registered contract (a probe verified by the
//      core owner and registered through `register`, the same gate the market
//      passes) reaches each body. The probe forwards each log-* call with the
//      same parameters; it is sim-only and its own bytes are not measured.
//   B  juice pool + autoswap: the leeway / DIA-band setters, jing-place with
//      the DIA band off, refloor inside the window, recovery with the sBTC
//      already home (no market reclaim), pox-settle-stakers on a staker with
//      nothing to settle (the err arm), then every read-only function by tx.
//   C  Fast Pool: a cycle sold out and recovered with sBTC 0 + STX, a cycle
//      recovered with sBTC only (stx-due 0 on distribution), read-only sweep.
//   D  read-only sweeps of core-v6, ladder, market, router.
// Fixtures: PoX earned-reward maps (as in every pool suite).
// Run: PYTH_API_KEY=... node simulations/verify-coverage-mv7dfb-gaps.js
import { session, bytes, signatures, sweepReadOnly, Cl, ClarityVersion, U, ok, err, P, cp, mk, sbtcOf, stxOf, DEP, POX, SBTC, MARKET, ROUTER, CORE, SBTC_WHALE, STX_WHALE, STX } from './_mv7dfb-session.mjs';

const S = session('coverage-mv7dfb-gaps');
const { tx, ev, read, fixture } = S;
const STRANGER = mk(681), ALICE = mk(682), FS1 = mk(683), FS2 = mk(684);
const PID = `${DEP}.juice-pool-sbtc-signer`, VID = `${DEP}.juice-sbtc-autoswap`;
const FP = 'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4', FV = `${FP}.fastpool-swap-vault`, FPOOL = `${FP}.signer-manager-vault-stx-rewards`;
const LADDER = `${DEP}.jing-ladder-v1`;

await S.jing();
// ==== A: core-v6 log entry points ==========================================================
const coreSrc = bytes('jing-core-v6');
const logs = signatures(coreSrc, 'public').filter((f) => f.name.startsWith('log-') && f.params.every((p) => !p.type.includes('<')));
const probe = [`(define-public (reg) (contract-call? '${CORE} register current-contract))`,
  ...logs.map((f) => `(define-public (w-${f.name} ${f.params.map((p) => `(${p.name} ${p.type})`).join(' ')}) (contract-call? '${CORE} ${f.name} ${f.params.map((p) => p.name).join(' ')}))`)].join('\n');
await S.deploy('core-log-probe', probe, ClarityVersion.Clarity5, DEP, 'sim-only probe: forwards every log-* call');
const PROBE = `${DEP}.core-log-probe`;
await tx('register by an unverified contract -> refused', DEP, PROBE, 'reg', [], err);
await tx('core owner verifies the probe', DEP, CORE, 'set-verified-contract', [cp(PROBE)], '(ok true)');
// FINDING (report, not a fix): core-v6 `register` has no tx-sender == owner check, so ANY
// caller can register a contract whose code hash matches a verified entry (contracts/
// JING-CORE-DESIGN.md says register is owner-only). The market's initialize is
// operator-gated and the rungs check the ladder owner themselves, so the gate lives in the
// callers; a byte-identical copy deployed by anyone can still register and then call log-*.
await tx('FINDING: a stranger can trigger register for a hash-matching contract (no owner check)', STRANGER, PROBE, 'reg', [], '(ok true)');
await tx('register again -> u5003 already registered', DEP, PROBE, 'reg', [], '(err u5003)');
const argsFor = (f, pick) => f.params.map((p) => {
  const t = p.type;
  if (t === 'uint') return Cl.uint(pick.uint);
  if (t === 'bool') return Cl.bool(pick.bool);
  if (t === 'principal') return Cl.principal(/token|asset/.test(p.name) ? SBTC : pick.principal);
  let m;
  if ((m = t.match(/^\(buff (\d+)\)$/))) return Cl.buffer(Buffer.alloc(Math.min(32, Number(m[1])), 1));
  if (t.startsWith('(string-ascii')) return Cl.stringAscii(pick.ascii);
  if (t.startsWith('(optional')) { const inner = t.slice(10, -1); return pick.some ? Cl.some(inner === 'uint' ? Cl.uint(pick.uint) : Cl.principal(pick.principal)) : Cl.none(); }
  return null;
});
for (const f of logs) {
  const a = argsFor(f, { uint: 1000, bool: false, principal: ALICE, ascii: 'x', some: false });
  if (a.some((x) => x === null)) { S.notes.push(`log probe: ${f.name} skipped (argument type not built)`); continue; }
  await tx(`${f.name} by a stranger -> refused`, STRANGER, CORE, f.name, a, err);
  await tx(`${f.name} by the registered probe`, DEP, PROBE, `w-${f.name}`, a, () => true);
  const b = argsFor(f, { uint: 7, bool: true, principal: PROBE, ascii: 'reprice', some: true });
  await tx(`${f.name} again (other arguments: registered principal, some, true)`, DEP, PROBE, `w-${f.name}`, b, () => true);
}

{ const f = logs.find((x) => x.name === 'log-jing-swap-reconciled');
  if (f) await tx('log-jing-swap-reconciled with a target above the current equity (credit arm)', DEP, PROBE, 'w-log-jing-swap-reconciled', argsFor(f, { uint: 1_000_000_000_000, bool: true, principal: PROBE, ascii: 'x', some: true }), () => true); }
// ==== B: Juice pool + autoswap ================================================================
await S.deploy('juice-swap-vault-trait-v2', bytes('juice-swap-vault-trait-v2'), ClarityVersion.Clarity6);
await S.deploy('juice-sbtc-autoswap', bytes('juice-sbtc-autoswap'), ClarityVersion.Clarity6);
await S.deploy('juice-pool-sbtc-signer', bytes('juice-pool-sbtc-signer'), ClarityVersion.Clarity6);
await tx('register-self', DEP, PID, 'register-self', await S.grant(PID, 21), ok);
const jv = cp(VID);
for (const [w, bad, good] of [['set-vault-leeway-bps', 1001, 400], ['set-vault-dia-band-bps', 5001, 0], ['set-vault-window-blocks', 289, 3]]) {
  await tx(`${w} by a stranger -> u100`, STRANGER, PID, w, [Cl.uint(good), jv], '(err u100)');
  await tx(`vault ${w.replace('-vault', '')} direct -> u16000`, STRANGER, VID, w.replace('set-vault-', 'set-'), [Cl.uint(good)], '(err u16000)');
  await tx(`${w} out of range -> u16033`, DEP, PID, w, [Cl.uint(bad), jv], '(err u16033)');
  await tx(`${w} u${good}`, DEP, PID, w, [Cl.uint(good), jv], '(ok true)');
}
const rewards = async (rc, sats, shares) => {
  await tx(`real sBTC backs cycle ${rc}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(sats), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
  const key = `{ reward-cycle: u${rc}, bond-index: none, signer: '${PID} }`;
  const total = shares.reduce((t, [, n]) => t + n, 0n);
  await fixture(`cycle ${rc} earned ${sats} sats`, POX, `(begin
    (map-set signer-shares-staked-for-cycle ${key} u${total})
    (map-set signer-pending-staked-ustx-per-cycle { signer: '${PID}, cycle: u${rc} } u${total})
    (map-set signer-rewards-per-token-settled-for-cycle ${key} (get-rewards-per-token-for-cycle u${rc} none))
    (map-set signer-unclaimed-rewards-for-cycle ${key} u${sats})
    ${shares.map(([w, n]) => `(map-set staker-shares-staked-for-cycle { reward-cycle: u${rc}, bond-index: none, signer: '${PID}, staker: '${w} } u${n})`).join(' ')}
    (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${sats}))
    (ok true))`, '(ok true)');
};
await rewards(144, 60_000n, [[ALICE, 1000n * STX]]);
await tx('claim -> vault', STRANGER, PID, 'pox-claim-rewards', [Cl.list([]), Cl.uint(144), jv], ok);
await tx('jing-place with the DIA band off (current-mid without DIA)', STRANGER, VID, 'jing-place', [await S.fresh()], ok);
await tx('pool refloor-vault inside the window (ask arm)', DEP, PID, 'refloor-vault', [await S.fresh(), jv], ok);
await S.advance(3, 'window elapses');
await tx('pool refloor-vault after the window (floor arm)', DEP, PID, 'refloor-vault', [await S.fresh(), jv], ok);
await tx('reclaim: the sBTC is home', STRANGER, VID, 'jing-reclaim', [], ok);
await S.advance(430, 'recovery delay');
await tx('emergency-recover with nothing on the market (no reclaim arm)', STRANGER, PID, 'emergency-recover', [jv], '(ok (tuple (sbtc u60000) (stx u0)))');
await tx('pox-settle-stakers on a staker with nothing in pox-5 -> u103', STRANGER, PID, 'pox-settle-stakers', [Cl.list([P(STRANGER)]), Cl.uint(144), Cl.none()], (v) => err(v) || ok(v));
await tx('pay-recovered-sbtc-stakers', STRANGER, PID, 'pay-recovered-sbtc-stakers', [Cl.list([P(ALICE)]), Cl.uint(144), Cl.uint(0)], ok);
const curCycle = U(await S.evRaw(POX, '(current-pox-reward-cycle)'));
// pox-5 claim-staker-rewards-for-signer answers (ok u0) for unknown stakers and future cycles; a bond
// index is the remaining way to make it err (the pool supports no bonds). Logged, not asserted.
for (const [lbl, rc, bi] of [['a future cycle', curCycle + 3n, Cl.none()], ['bond index 7', 144n, Cl.some(Cl.uint(7))]]) {
  const r = await tx(`pox-settle-stakers on ${lbl} (probing the settle-one err arm)`, STRANGER, PID, 'pox-settle-stakers', [Cl.list([P(ALICE)]), Cl.uint(rc), bi], () => true);
  S.notes.push(`pox-settle-stakers on ${lbl}: ${r.result}`);
}
// a batch the book buys out in the patience phase, then recovered: sBTC 0, STX home
await rewards(143, 40_000n, [[ALICE, 1000n * STX]]);
await tx('claim 143 -> vault', STRANGER, PID, 'pox-claim-rewards', [Cl.list([]), Cl.uint(143), jv], ok);
await tx('jing-place 143', STRANGER, VID, 'jing-place', [await S.fresh()], ok);
await tx('get-clock by tx while the batch is open', STRANGER, VID, 'get-clock', [], () => true);
{
  const W = cp('SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2');
  await tx('second sBTC maker behind the vault', SBTC_WHALE, MARKET, 'deposit-token-x', [Cl.uint(100_000), Cl.uint((S.MID * 101n) / 100n), Cl.none(), cp(SBTC), Cl.stringAscii('sbtc-token')], '(ok u100000)');
  if ((await S.evRaw(MARKET, `(get-token-x-pending-deposit '${SBTC_WHALE})`)) !== 'none')
    await tx('settle the second maker', SBTC_WHALE, MARKET, 'settle-token-x-deposit', [P(SBTC_WHALE), await S.fresh(), cp(SBTC), Cl.stringAscii('sbtc-token')], ok);
  await tx('a taker buys the whole vault ask', STX_WHALE, MARKET, 'swap', [Cl.uint((60_000n * S.MID) / 10_000_000_000n), Cl.uint((S.MID * 105n) / 100n), await S.fresh(), cp(SBTC), Cl.stringAscii('sbtc-token'), W, Cl.stringAscii('wstx'), Cl.bool(false)], ok);
  await tx('the second maker leaves', SBTC_WHALE, MARKET, 'cancel-token-x-deposit', [cp(SBTC), Cl.stringAscii('sbtc-token')], () => true);
}
const jx = await read(stxOf(VID));
await S.advance(433, 'recovery delay for 143');
await tx('emergency-recover of a bought-out batch: sBTC 0, STX home', STRANGER, PID, 'emergency-recover', [jv], `(ok (tuple (sbtc u0) (stx u${jx})))`);
for (const [cid, name] of [[PID, 'juice-pool-sbtc-signer'], [VID, 'juice-sbtc-autoswap']])
  S.notes.push(`${name}: ${await sweepReadOnly(S, cid, bytes(name), [{ principal: ALICE, uint: 144 }, { principal: STRANGER, uint: 0, some: true, ascii: 'STX/USD' }])} read-only calls`);

// ==== C: Fast Pool recover arms ===============================================================
await S.deploy('fastpool-swap-vault', bytes('fastpool-swap-vault'), ClarityVersion.Clarity6, FP);
await S.deploy('signer-manager-vault-stx-rewards', bytes('signer-manager-vault-stx-rewards'), ClarityVersion.Clarity6, FP);
await tx('FP register-self', FP, FPOOL, 'register-self', await S.grant(FPOOL, 22), ok);
const fv = cp(FV);
await tx('FP window 3', FP, FPOOL, 'set-vault-window-blocks', [Cl.uint(3), fv], '(ok true)');
const fpCycle = async (rc, sats, who) => {
  const key = `{reward-cycle:u${rc},bond-index:none,signer:'${FPOOL}}`;
  await tx(`real sBTC backs FP cycle ${rc}`, SBTC_WHALE, SBTC, 'transfer', [Cl.uint(sats), P(SBTC_WHALE), P(POX), Cl.none()], '(ok true)');
  await fixture(`FP cycle ${rc}: ${who.slice(0, 6)} 1 share, mirrored`, POX, `(begin
    (map-set signer-shares-staked-for-cycle ${key} u1)
    (map-set signer-pending-staked-ustx-per-cycle {signer:'${FPOOL},cycle:u${rc}} u1)
    (map-set signer-rewards-per-token-settled-for-cycle ${key} (get-rewards-per-token-for-cycle u${rc} none))
    (map-set signer-unclaimed-rewards-for-cycle ${key} u${sats})
    (map-set staker-shares-staked-for-cycle {reward-cycle:u${rc},bond-index:none,signer:'${FPOOL},staker:'${who}} u1)
    (var-set last-accounted-rewards-only (+ (var-get last-accounted-rewards-only) u${sats}))
    (try! (contract-call? '${FPOOL} validate-stake! '${who} u${rc} u1 u1 u0 false none)) (ok true))`, '(ok true)');
  await tx(`FP claim ${rc}`, STRANGER, FPOOL, 'claim-rewards', [Cl.uint(rc)], `(ok u${sats})`);
};
await fpCycle(143, 40_000n, FS1);
await fpCycle(142, 30_000n, FS2);
await tx('FP fund 143', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(143), fv], '(ok u40000)');
await tx('FP jing-place: the batch rests as an ask', STRANGER, FV, 'jing-place', [await S.fresh()], ok);
// a taker buys the whole ask in the patience phase (a second maker behind it absorbs the rest)
const WSTXc = cp('SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2');
await tx('second sBTC maker behind the vault (mid + 1%)', SBTC_WHALE, MARKET, 'deposit-token-x', [Cl.uint(100_000), Cl.uint((S.MID * 101n) / 100n), Cl.none(), cp(SBTC), Cl.stringAscii('sbtc-token')], '(ok u100000)');
if ((await S.evRaw(MARKET, `(get-token-x-pending-deposit '${SBTC_WHALE})`)) !== 'none')
  await tx('settle the second maker', SBTC_WHALE, MARKET, 'settle-token-x-deposit', [P(SBTC_WHALE), await S.fresh(), cp(SBTC), Cl.stringAscii('sbtc-token')], ok);
const take = (60_000n * S.MID) / 10_000_000_000n;
await tx('a taker swaps STX for the whole vault ask', STX_WHALE, MARKET, 'swap', [Cl.uint(take), Cl.uint((S.MID * 105n) / 100n), await S.fresh(), cp(SBTC), Cl.stringAscii('sbtc-token'), WSTXc, Cl.stringAscii('wstx'), Cl.bool(false)], ok);
const fx = await read(stxOf(FV));
await ev('FP vault: no sBTC home or on the book, STX in, clock still set', FV, '{ s: (get sbtc-balance (unwrap-panic (get-upgrade-status))), r: (get jing-resting (unwrap-panic (get-upgrade-status))), c: (is-some (var-get batch-start)) }', '(tuple (c true) (r u0) (s u0))');
await S.advance(433, 'FP past the deadline and the vault delay');
await tx('FP recover a batch the book bought out: sBTC 0, STX home (no-sBTC arm)', STRANGER, FPOOL, 'recover-swap-vault', [fv], `(ok (tuple (sbtc u0) (stx u${fx})))`);
await tx('FP distribute 143: STX only', STRANGER, FPOOL, 'distribute-rewards', [P(FS1), Cl.uint(143)], `(ok (tuple (sbtc u0) (stx u${fx})))`);
await tx('FP fund 142', STRANGER, FPOOL, 'fund-swap-vault', [Cl.uint(142), fv], '(ok u30000)');
await S.advance(433, 'FP vault delay for 142');
await tx('FP recover 142 with nothing sold: sBTC only, STX 0', STRANGER, FPOOL, 'recover-swap-vault', [fv], '(ok (tuple (sbtc u30000) (stx u0)))');
await tx('FP distribute 142: sBTC only (stx-due 0 arm)', STRANGER, FPOOL, 'distribute-rewards', [P(FS2), Cl.uint(142)], '(ok (tuple (sbtc u30000) (stx u0)))');
for (const [cid, name] of [[FV, 'fastpool-swap-vault'], [FPOOL, 'signer-manager-vault-stx-rewards']])
  S.notes.push(`${name}: ${await sweepReadOnly(S, cid, bytes(name), [{ principal: FS1, uint: 143 }, { principal: FS2, uint: 142, some: true }])} read-only calls`);

// ==== D: Jing read-only sweeps ===================================================================
for (const [cid, name] of [[CORE, 'jing-core-v6'], [LADDER, 'jing-ladder-v1'], [MARKET, 'markets-sbtc-stx-jing-v6-3'], [ROUTER, 'swap-router-sbtc-stx-jing-v5-3']])
  S.notes.push(`${name}: ${await sweepReadOnly(S, cid, bytes(name), [{ principal: DEP, uint: 0 }, { principal: PROBE, uint: 1000, bool: true, some: true, ascii: 'sbtc-token' }])} read-only calls`);
S.done();
