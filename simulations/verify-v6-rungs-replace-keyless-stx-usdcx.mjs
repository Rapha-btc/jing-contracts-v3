// verify-v6-rungs-replace-keyless-stx-usdcx.mjs
// STX/USDCx port of verify-v6-rungs-replace-keyless.js (same scenarios R1-R12,
// same check structure). Fork at the TIP on the LIVE jing-core-v6: a fresh
// jing-ladder-stx-usdcx-v1 (owner DEP) + markets-stx-usdcx-jing-v6-4 (stripped
// source) deployed by DEP; verify + initialize by the core owner multisig
// (operator handed to it and back to DEP); every core admin call by CORE_OWNER.
//
// Roles (map by role, not by name):
//   x side (rests STX)   = ladder "sel-band" = jing-sell-stx-usdc-<bps>  (orig: buy-band jing-buy-stx-spread-*, sBTC)
//   y side (rests USDCx) = ladder "buy-band" = jing-buy-stx-usdc-<bps>   (orig: sel-band jing-sell-stx-spread-*, STX)
// Amounts kept in the same relation to the market minimums (1 STX / 1 USDCx):
//   orig SATS 20000 (20x min x) -> X_AMT 20 STX; orig USTX 5 STX (5x min y) -> Y_AMT 5 USDCx;
//   R10 500/100/400 sats vs min 1000 -> 0.5/0.1/0.4 STX vs min 1 STX (lowered to 0.1 STX);
//   R11 0.5/0.1/0.4 STX vs min 1 STX -> 0.5/0.1/0.4 USDCx vs min 1 USDCx (lowered to 0.1);
//   R8 market deposit 2000 sats (2x min) -> 2 STX; R12 2000 sats -> 2 STX, 5 STX -> 5 USDCx.
// Guard: the band rungs here read DIA STX/USD (+/-20%) instead of the RFQ
//   native oracle (/2, x2). The DIA read is a plain contract read (no burn
//   tenure data), but it goes stale (u0 -> push u7008) after the 435 synthetic
//   burn blocks, so R12 keeps the original's design: the rung source with the
//   DIA literal pointed at a one-line mock of get-value (fresh timestamp =
//   stacks-block-time) blessed as the new canonical. floor = NATIVE*0.8.
// Market initialize on this set needs tx-sender = operator = core owner, so the
//   R8 markets-b / markets-c copies get set-operator(CORE_OWNER) first (2 extra
//   checks); the u5005 / ok / u5006 outcomes are the original's.
//
// Run: node simulations/verify-v6-rungs-replace-keyless-stx-usdcx.mjs
import { rungReceipt } from './_rung-receipt.js';
import { installChunkedSubmit } from './_chunked-submit.js';
import { ClarityVersion, uintCV, trueCV, falseCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, someCV, noneCV, deserializeCV, cvToString } from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult } from 'stxer';
import { NODE, DEP, CORE, CORE_OWNER, WSTX, USDCX, DIA, STX_WHALES, USDCX_WHALES, N, C, src, traits } from './_stx-usdcx-v6-common.mjs';
installChunkedSubmit();

const CORE_ID = CORE, MKT = N.market, MARKET = C.market, LADDER = C.ladder;
const wstxT = traits.x, usdcxT = traits.y;
const A = STX_WHALES[1]; // STX holder: x-rung member (orig: sBTC holder on buy rungs)
const S = USDCX_WHALES[0]; // USDCx holder: y-rung member (orig: STX holder on sell rungs)
const KEEPER = 'SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3'; // anyone; also the second deployer
const X_SRC = src(N.sellTpl), Y_SRC = src(N.buyTpl);
const XN = (b, who = DEP) => `${who}.jing-sell-stx-usdc-${b}`, YN = (b, who = DEP) => `${who}.jing-buy-stx-usdc-${b}`;
const X20 = XN(20), X30 = XN(30), X30B = XN(30, KEEPER);
const Y20 = YN(20), Y30 = YN(30), Y30B = YN(30, KEEPER);
const XS = 'sel-band', YS = 'buy-band'; // ladder side names by role
const X_AMT = 20_000_000, Y_AMT = 5_000_000;
const MINX = 1_000_000, MINY = 1_000_000;
const initArgs = (canon) => [contractPrincipalCV(DEP, canon), wstxT, usdcxT, uintCV(MINX), uintCV(MINY), uintCV(45), uintCV(7)];

let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === 'function' ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}: ${String(actual).slice(0, 170)}${ok ? '' : ` (want ${typeof want === 'function' ? want.toString().slice(0, 80) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return '<no tx>'; if ('Err' in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch { return r.Ok.result; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return '<no eval>'; if (!('Ok' in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const uintOf = (v) => BigInt(String(v).replace(/^u/, ''));
const okTrue = '(ok true)';

async function main() {
  console.log('=== v6 rungs (STX/USDCx): replaced / retired band rung keeps serving its members (keyless) ===');
  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: fn === 'withdraw' ? [...args, noneCV()] : args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: 'tx', want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: 'eval', want }); return steps[steps.length - 1]; };
  const deploy = (sender, name, code) => tx(`deploy ${sender.slice(0, 6)}.${name}`, (bb) => bb.withSender(sender).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes('ERR'));
  const state = (label, cid, want) => ev(label, '(get-state)', want, cid);
  const nm = (cid) => cid.split('.')[1];
  const cp = (cid) => contractPrincipalCV(cid.split('.')[0], cid.split('.')[1]);

  // ---- the STX/USDCx stack on the live core ----
  ev('live core owner = the multisig', '(get-contract-owner)', CORE_OWNER, CORE_ID);
  deploy(DEP, N.ladder, src(N.ladder)); deploy(DEP, MKT, src(MKT));
  tx('market operator -> core owner', call(DEP, 'set-operator', [standardPrincipalCV(CORE_OWNER)]), okTrue);
  tx('core-v6 verifies the market (core owner)', call(CORE_OWNER, 'set-verified-contract', [contractPrincipalCV(DEP, MKT)], CORE_ID), okTrue);
  tx('market initialize (core owner)', call(CORE_OWNER, 'initialize', initArgs(MKT)), okTrue);
  tx('market operator -> DEP', call(CORE_OWNER, 'set-operator', [standardPrincipalCV(DEP)]), okTrue);
  deploy(DEP, nm(X20), X_SRC); deploy(DEP, nm(X30), X_SRC); deploy(DEP, nm(Y20), Y_SRC); deploy(DEP, nm(Y30), Y_SRC);
  tx(`canonical ${XS} (x)`, call(DEP, 'set-canonical', [stringAsciiCV(XS), cp(X20)], LADDER), okTrue);
  tx(`canonical ${YS} (y)`, call(DEP, 'set-canonical', [stringAsciiCV(YS), cp(Y20)], LADDER), okTrue);
  for (const r of [X20, X30, Y20, Y30]) tx(`init ${nm(r)}`, call(DEP, 'initialize', [uintCV(nm(r).endsWith('20') ? 20 : 30), trueCV()], r), okTrue);
  ev(`band count ${XS} 2`, `(get-band-count "${XS}")`, 'u2', LADDER);
  ev(`band count ${YS} 2`, `(get-band-count "${YS}")`, 'u2', LADDER);

  // =============== R1: y side (USDCx), replace ===============
  const s0 = ev('R1 S USDCx before', `(contract-call? '${USDCX} get-balance '${S})`, (v) => String(v).startsWith('(ok'));
  tx('R1 S funds the y spread-30 rung (x side empty: keyless push)', call(S, 'deposit', [uintCV(Y_AMT)], Y30), rungReceipt('deposit'));
  state('R1 y rung resting 5 USDCx', Y30, (v) => field(v, 'resting') === `u${Y_AMT}`);
  ev('R1 the rung holds a seat on y', `(is-protected-y '${Y30})`, 'true');
  deploy(KEEPER, nm(Y30B), Y_SRC);
  tx("R1 owner initializes the keeper's deploy: replaces the y spread-30 rung", call(DEP, 'initialize', [uintCV(30), trueCV()], Y30B), okTrue);
  ev('R1 the new rung holds the seat', `(is-protected-y '${Y30B})`, 'true');
  ev('R1 the old rung lost it', `(is-protected-y '${Y30})`, 'false');
  ev('R1 ladder: old rung not current', `(is-band-y '${Y30})`, 'false', LADDER);
  ev('R1 ladder: old rung STILL registered (it holds member funds)', `(is-registered '${Y30})`, 'true', LADDER);
  ev('R1 ladder: spread 30 points at the new rung', `(get-rung "${YS}" u30)`, `(some ${Y30B})`, LADDER);
  ev(`R1 band count ${YS} still 2`, `(get-band-count "${YS}")`, 'u2', LADDER);
  tx('R1 S withdraws 1 USDCx from the replaced rung -> ok', call(S, 'withdraw', [uintCV(1_000_000)], Y30), rungReceipt('withdraw'));
  tx('R1 S claims on the replaced rung -> ok', call(S, 'claim', [], Y30), rungReceipt('claim'));
  tx('R1 keeper pushes the replaced rung -> ok (nothing held: false)', call(KEEPER, 'push', [], Y30), '(ok false)');
  tx('R1 S withdraws the rest -> ok', call(S, 'withdraw', [uintCV(Y_AMT)], Y30), rungReceipt('withdraw'));
  state('R1 y rung empty', Y30, (v) => field(v, 'resting') === 'u0' && field(v, 'held-uusdcx') === 'u0');
  const s1 = ev('R1 S USDCx after', `(contract-call? '${USDCX} get-balance '${S})`, (v) => String(v).startsWith('(ok'));
  ev('R1 the y side is empty again', '(len (get-token-y-depositors u0))', 'u0');

  // =============== R2: x side (STX), replace ===============
  const a0 = ev('R2 A uSTX before', `(stx-get-balance '${A})`, (v) => uintOf(v) > 0n);
  tx('R2 A funds the x spread-30 rung (y side empty: keyless push)', call(A, 'deposit', [uintCV(X_AMT)], X30), rungReceipt('deposit'));
  state('R2 x rung resting 20 STX', X30, (v) => field(v, 'resting') === `u${X_AMT}` && field(v, 'held-ustx') === 'u0');
  tx('R2 A funds the x spread-20 rung too (for the retire block)', call(A, 'deposit', [uintCV(X_AMT)], X20), rungReceipt('deposit'));
  deploy(KEEPER, nm(X30B), X_SRC);
  tx("R2 owner initializes the keeper's deploy: replaces the x spread-30 rung", call(DEP, 'initialize', [uintCV(30), trueCV()], X30B), okTrue);
  ev('R2 the new rung holds the seat', `(is-protected-x '${X30B})`, 'true');
  ev('R2 the old rung lost it', `(is-protected-x '${X30})`, 'false');
  ev('R2 ladder: old rung not current', `(is-band-x '${X30})`, 'false', LADDER);
  ev('R2 ladder: old rung STILL registered', `(is-registered '${X30})`, 'true', LADDER);
  ev('R2 seated list on x = spread-20 + new spread-30', '(len (get-seated-x))', 'u2');
  tx('R2 sync-seat on the replaced rung -> u1028 (not a seat)', call(KEEPER, 'sync-seat', [cp(X30)]), '(err u1028)');
  ev("R2 the old rung's 20 STX still rest on the book", `(get-token-x-deposit u0 '${X30})`, `u${X_AMT}`);
  tx('R2 A withdraws 1 uSTX from the replaced rung -> ok', call(A, 'withdraw', [uintCV(1)], X30), rungReceipt('withdraw'));
  tx('R2 A claims on the replaced rung -> ok', call(A, 'claim', [], X30), rungReceipt('claim'));
  tx('R2 keeper pushes the replaced rung -> (ok false)', call(KEEPER, 'push', [], X30), '(ok false)');
  tx('R2 A withdraws the rest -> ok', call(A, 'withdraw', [uintCV(X_AMT)], X30), rungReceipt('withdraw'));
  state('R2 x rung empty', X30, (v) => field(v, 'resting') === 'u0' && field(v, 'held-ustx') === 'u0');
  ev('R2 A position gone', `(get-position '${A})`, (v) => String(v).includes('u0'), X30);

  // =============== R3: retire x spread 20 ===============
  tx('R3 owner retires x spread 20', call(DEP, 'retire-band', [stringAsciiCV(XS), uintCV(20)], LADDER), okTrue);
  ev(`R3 band count ${XS} 1`, `(get-band-count "${XS}")`, 'u1', LADDER);
  ev('R3 ladder: retired rung not current', `(is-band-x '${X20})`, 'false', LADDER);
  ev('R3 ladder: retired rung STILL registered', `(is-registered '${X20})`, 'true', LADDER);
  ev('R3 spread 20 is free', `(get-rung "${XS}" u20)`, 'none', LADDER);
  ev('R3 market copy still seats it until a sync', `(is-protected-x '${X20})`, 'true');
  tx('R3 anyone syncs a seated rung: prune drops the retired one', call(KEEPER, 'sync-seat', [cp(X30B)]), (v) => String(v).startsWith('(ok'));
  ev('R3 the retired rung no longer holds a seat', `(is-protected-x '${X20})`, 'false');
  ev('R3 seated list on x = the new spread-30 only', '(len (get-seated-x))', 'u1');
  tx('R3 A withdraws 1 uSTX from the retired rung -> ok', call(A, 'withdraw', [uintCV(1)], X20), rungReceipt('withdraw'));
  tx('R3 keeper pushes the retired rung -> (ok false)', call(KEEPER, 'push', [], X20), '(ok false)');
  tx('R3 A withdraws the rest -> ok', call(A, 'withdraw', [uintCV(X_AMT)], X20), rungReceipt('withdraw'));
  state('R3 retired rung empty', X20, (v) => field(v, 'resting') === 'u0');
  tx('R3 retire again -> u6010 (spread free)', call(DEP, 'retire-band', [stringAsciiCV(XS), uintCV(20)], LADDER), '(err u6010)');

  // =============== R4: the old rung lives on as an ordinary maker ===============
  tx('R4 A deposits into the replaced spread-30 rung again -> ok (ordinary maker now)', call(A, 'deposit', [uintCV(X_AMT)], X30), rungReceipt('deposit'));
  state('R4 resting 20 STX again', X30, (v) => field(v, 'resting') === `u${X_AMT}`);
  ev('R4 it is on the book without a seat', `(is-protected-x '${X30})`, 'false');
  ev('R4 ladder still refuses it a seat', `(is-band-x '${X30})`, 'false', LADDER);
  tx('R4 A withdraws all -> ok', call(A, 'withdraw', [uintCV(X_AMT)], X30), rungReceipt('withdraw'));
  const a1 = ev('R4 A uSTX after', `(stx-get-balance '${A})`, (v) => uintOf(v) > 0n);
  tx('R4 a fresh deploy at the RETIRED spread 20 by the owner: registers as a new seat', (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: 'jing-sell-stx-usdc-20-b', source_code: X_SRC, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes('ERR'));
  tx('R4 ... but its name must carry the spread: u7009', call(DEP, 'initialize', [uintCV(20), trueCV()], `${DEP}.jing-sell-stx-usdc-20-b`), '(err u7009)');
  deploy(KEEPER, 'jing-sell-stx-usdc-20', X_SRC);
  tx("R4 owner seats the keeper's spread-20 deploy: count back to 2", call(DEP, 'initialize', [uintCV(20), trueCV()], XN(20, KEEPER)), okTrue);
  ev(`R4 band count ${XS} 2`, `(get-band-count "${XS}")`, 'u2', LADDER);
  ev('R4 the retired rung stays registered and not current', `(and (is-registered '${X20}) (not (is-band-x '${X20})))`, 'true', LADDER);

  // =============== R5: unseated band rungs + seat-band ===============
  const X40 = XN(40), X50 = XN(50);
  deploy(DEP, nm(X40), X_SRC);
  tx('R5 stranger initializes unseated -> u7001 (owner only, seated or not)', call(KEEPER, 'initialize', [uintCV(40), falseCV()], X40), '(err u7001)');
  tx('R5 owner initializes spread 40 UNSEATED -> ok', call(DEP, 'initialize', [uintCV(40), falseCV()], X40), okTrue);
  tx('R5 initialize again -> u7002', call(DEP, 'initialize', [uintCV(40), trueCV()], X40), '(err u7002)');
  ev('R5 registered', `(is-registered '${X40})`, 'true', LADDER);
  ev('R5 not current', `(is-current-rung '${X40})`, 'false', LADDER);
  ev('R5 ladder: no seat', `(is-band-x '${X40})`, 'false', LADDER);
  ev('R5 market: no seat', `(is-protected-x '${X40})`, 'false');
  ev('R5 spread 40 has no holder', `(get-rung "${XS}" u40)`, 'none', LADDER);
  ev(`R5 band count ${XS} still 2`, `(get-band-count "${XS}")`, 'u2', LADDER);
  tx('R5 A deposits into the unseated rung -> ok (pushed as an ordinary maker)', call(A, 'deposit', [uintCV(X_AMT)], X40), rungReceipt('deposit'));
  state('R5 resting 20 STX', X40, (v) => field(v, 'resting') === `u${X_AMT}` && field(v, 'held-ustx') === 'u0');
  ev('R5 on the book, no seat', `(is-protected-x '${X40})`, 'false');
  tx('R5 sync-seat on it -> u1028', call(KEEPER, 'sync-seat', [cp(X40)]), '(err u1028)');
  tx('R5 register-unseated from an EOA -> u6002 (no contract hash)', call(KEEPER, 'register-unseated', [stringAsciiCV(XS), uintCV(40), uintCV(0)], LADDER), '(err u6002)');
  tx('R5 stranger seat-band -> u6001', call(KEEPER, 'seat-band', [cp(X40)], LADDER), '(err u6001)');
  tx('R5 seat-band on an unknown principal -> u6010', call(DEP, 'seat-band', [cp(XN(99))], LADDER), '(err u6010)');
  tx('R5 seat-band on a seated rung -> u6012', call(DEP, 'seat-band', [cp(X30B)], LADDER), '(err u6012)');
  tx('R5 seat-band RE-SEATS the replaced spread-30 rung: replaces its successor', call(DEP, 'seat-band', [cp(X30)], LADDER), okTrue);
  ev('R5 spread 30 points at the old rung again', `(get-rung "${XS}" u30)`, `(some ${X30})`, LADDER);
  ev('R5 the successor is registered, not current', `(and (is-registered '${X30B}) (not (is-current-rung '${X30B})))`, 'true', LADDER);
  ev(`R5 band count ${XS} still 2 (replace)`, `(get-band-count "${XS}")`, 'u2', LADDER);
  tx('R5 seat-band the unseated spread-40 rung -> ok (free spread: count 3)', call(DEP, 'seat-band', [cp(X40)], LADDER), okTrue);
  ev(`R5 band count ${XS} 3`, `(get-band-count "${XS}")`, 'u3', LADDER);
  ev('R5 ladder seats it now', `(is-band-x '${X40})`, 'true', LADDER);
  ev('R5 market copy lags until a sync', `(is-protected-x '${X40})`, 'false');
  tx('R5 anyone syncs it on the market', call(KEEPER, 'sync-seat', [cp(X40)]), (v) => String(v).startsWith('(ok'));
  ev('R5 market seats it', `(is-protected-x '${X40})`, 'true');
  ev('R5 the same sync pruned the replaced successor', `(is-protected-x '${X30B})`, 'false');
  tx('R5 sync the re-seated spread-30 rung too', call(KEEPER, 'sync-seat', [cp(X30)]), (v) => String(v).startsWith('(ok'));
  ev('R5 seated list on x = spread-20 (keeper), spread-30 (re-seated), spread-40', '(len (get-seated-x))', 'u3');
  ev('R5 seated x holds the re-seated spread-30', `(is-protected-x '${X30})`, 'true');
  tx('R5 A withdraws all from spread 40 (seated now, still fine)', call(A, 'withdraw', [uintCV(X_AMT)], X40), rungReceipt('withdraw'));
  tx('R5 max under seats held (2 < 3) -> u6011', call(DEP, 'set-max-band-per-side', [uintCV(2)], LADDER), '(err u6011)');
  tx('R5 max = seats held (3) -> ok', call(DEP, 'set-max-band-per-side', [uintCV(3)], LADDER), okTrue);
  deploy(DEP, nm(X50), X_SRC);
  tx('R5 initialize spread 50 SEATED on a full side -> u6011', call(DEP, 'initialize', [uintCV(50), trueCV()], X50), '(err u6011)');
  ev('R5 ... and the failed initialize left it uninitialized (not registered)', `(is-registered '${X50})`, 'false', LADDER);
  tx('R5 initialize spread 50 UNSEATED on a full side -> ok', call(DEP, 'initialize', [uintCV(50), falseCV()], X50), okTrue);
  tx('R5 seat-band it on the full side -> u6011', call(DEP, 'seat-band', [cp(X50)], LADDER), '(err u6011)');
  tx('R5 raise the max to 4', call(DEP, 'set-max-band-per-side', [uintCV(4)], LADDER), okTrue);
  tx('R5 seat-band it -> ok', call(DEP, 'seat-band', [cp(X50)], LADDER), okTrue);
  ev(`R5 band count ${XS} 4`, `(get-band-count "${XS}")`, 'u4', LADDER);
  tx('R5 retire spread 50 -> ok (back to an unseated, registered rung)', call(DEP, 'retire-band', [stringAsciiCV(XS), uintCV(50)], LADDER), okTrue);
  ev('R5 retired: registered, not current', `(and (is-registered '${X50}) (not (is-current-rung '${X50})))`, 'true', LADDER);
  tx('R5 seat-band the retired rung again -> ok (retire is reversible)', call(DEP, 'seat-band', [cp(X50)], LADDER), okTrue);
  ev(`R5 band count ${XS} 4 again`, `(get-band-count "${XS}")`, 'u4', LADDER);
  tx('R5 sync-seat-count: market seats follow the max (4)', call(KEEPER, 'sync-seat-count', []), '(ok u4)');

  // =============== R6: prune-seats when a side has no current rung left ===============
  tx(`R6 retire ${YS} 20`, call(DEP, 'retire-band', [stringAsciiCV(YS), uintCV(20)], LADDER), okTrue);
  tx(`R6 retire ${YS} 30`, call(DEP, 'retire-band', [stringAsciiCV(YS), uintCV(30)], LADDER), okTrue);
  ev(`R6 band count ${YS} 0`, `(get-band-count "${YS}")`, 'u0', LADDER);
  ev('R6 market copy still seats both retired y rungs', '(len (get-seated-y))', 'u2');
  ev('R6 the retired spread-20 y rung is still protected in the copy', `(is-protected-y '${Y20})`, 'true');
  tx('R6 sync-seat on a retired rung -> u1028 (nothing current on y to sync)', call(KEEPER, 'sync-seat', [cp(Y30B)]), '(err u1028)');
  tx('R6 sync-seat-count also prunes retired seats', call(KEEPER, 'sync-seat-count', []), '(ok u4)');
  ev('R6 sync-seat-count pruned the retired y seats', '(len (get-seated-y))', 'u0');
  ev('R6 x side before the prune: 3 in the copy', '(len (get-seated-x))', 'u3');
  tx('R6 anyone prunes', call(KEEPER, 'prune-seats', []), '(ok u4)');
  ev('R6 y copy empty', '(len (get-seated-y))', 'u0');
  ev('R6 retired y rung no longer protected', `(is-protected-y '${Y20})`, 'false');
  ev('R6 x copy untouched (3 current seats)', '(len (get-seated-x))', 'u3');
  ev('R6 prune adds nothing: spread 50 (ladder-seated, never synced) still absent', `(is-protected-x '${X50})`, 'false');
  tx('R6 prune again: idempotent', call(KEEPER, 'prune-seats', []), '(ok u4)');
  ev('R6 x copy still 3', '(len (get-seated-x))', 'u3');
  tx('R6 sync-seat spread 50 -> now 4 on x', call(KEEPER, 'sync-seat', [cp(X50)]), (v) => String(v).startsWith('(ok'));
  ev('R6 x copy 4', '(len (get-seated-x))', 'u4');

  // =============== R10: x band rung holding under the market minimum ===============
  // R10 and R11 run BEFORE R7 (as in the original): after the 435 synthetic burn blocks DIA is stale (u0 guard).
  tx('R10 A deposits 0.5 STX into the x spread-50 band rung: under the 1 STX minimum -> HELD, not pushed', call(A, 'deposit', [uintCV(500_000)], X50), rungReceipt('deposit'));
  state('R10 held 0.5 STX, resting 0', X50, (v) => field(v, 'held-ustx') === 'u500000' && field(v, 'resting') === 'u0');
  tx('R10 A withdraws 0.1 STX: served from what is held, the market untouched', call(A, 'withdraw', [uintCV(100_000)], X50), rungReceipt('withdraw'));
  state('R10 held 0.4 STX, resting 0', X50, (v) => field(v, 'held-ustx') === 'u400000' && field(v, 'resting') === 'u0');
  tx('R10 keeper push: 0.4 STX < the minimum -> (ok false), stays held', call(KEEPER, 'push', [], X50), '(ok false)');
  tx('R10 operator lowers the x minimum to 0.1 STX', call(DEP, 'set-min-token-x-deposit', [uintCV(100_000)]), okTrue);
  tx('R10 keeper push: 0.4 >= 0.1 -> pushed (ok true), the band floor read from DIA', call(KEEPER, 'push', [], X50), '(ok true)');
  state('R10 held 0, resting 0.4 STX', X50, (v) => field(v, 'held-ustx') === 'u0' && field(v, 'resting') === 'u400000');
  ev("R10 the rung's order carries the band spread (some u50)", `(get-token-x-order '${X50})`, (v) => field(v, 'spread-bps') === '(some u50)');
  tx('R10 operator restores the x minimum (1 STX)', call(DEP, 'set-min-token-x-deposit', [uintCV(MINX)]), okTrue);
  tx('R10 A withdraws everything: 0.4 STX on the market under the minimum -> whole cancel, paid', call(A, 'withdraw', [uintCV(999_999_999)], X50), rungReceipt('withdraw'));
  state('R10 empty', X50, (v) => field(v, 'held-ustx') === 'u0' && field(v, 'resting') === 'u0' && field(v, 'total-shares') === 'u0');

  // =============== R11: the y band mirror, on an UNSEATED rung ===============
  const Y40 = YN(40);
  deploy(DEP, nm(Y40), Y_SRC);
  tx('R11 owner initializes y spread 40 UNSEATED -> ok (registered, no key, no count)', call(DEP, 'initialize', [uintCV(40), falseCV()], Y40), okTrue);
  ev('R11 registered, not current', `(and (is-registered '${Y40}) (not (is-current-rung '${Y40})))`, 'true', LADDER);
  ev(`R11 band count ${YS} still 0`, `(get-band-count "${YS}")`, 'u0', LADDER);
  tx('R11 S deposits 0.5 USDCx: under the 1 USDCx minimum -> HELD', call(S, 'deposit', [uintCV(500_000)], Y40), rungReceipt('deposit'));
  state('R11 held 0.5 USDCx, resting 0', Y40, (v) => field(v, 'held-uusdcx') === 'u500000' && field(v, 'resting') === 'u0');
  tx('R11 S withdraws 0.1 USDCx from held', call(S, 'withdraw', [uintCV(100_000)], Y40), rungReceipt('withdraw'));
  state('R11 held 0.4 USDCx', Y40, (v) => field(v, 'held-uusdcx') === 'u400000' && field(v, 'resting') === 'u0');
  tx('R11 keeper push: 0.4 < 1 USDCx -> (ok false)', call(KEEPER, 'push', [], Y40), '(ok false)');
  tx('R11 operator lowers the y minimum to 0.1 USDCx', call(DEP, 'set-min-token-y-deposit', [uintCV(100_000)]), okTrue);
  tx('R11 keeper push -> pushed (ok true), an ordinary maker on the book (no seat)', call(KEEPER, 'push', [], Y40), '(ok true)');
  state('R11 held 0, resting 0.4 USDCx', Y40, (v) => field(v, 'held-uusdcx') === 'u0' && field(v, 'resting') === 'u400000');
  ev('R11 on the book without a seat', `(is-protected-y '${Y40})`, 'false');
  tx('R11 operator restores the y minimum (1 USDCx)', call(DEP, 'set-min-token-y-deposit', [uintCV(MINY)]), okTrue);
  tx('R11 S withdraws everything -> whole cancel, paid', call(S, 'withdraw', [uintCV(999_999_999)], Y40), rungReceipt('withdraw'));
  state('R11 empty', Y40, (v) => field(v, 'held-uusdcx') === 'u0' && field(v, 'resting') === 'u0' && field(v, 'total-shares') === 'u0');

  // =============== R7: uninitialized rung, non-canonical rung, owner handover ===============
  const X60 = XN(60), X70 = XN(70);
  deploy(DEP, nm(X60), X_SRC);
  tx('R7 deposit into a rung nobody initialized -> u7003', call(A, 'deposit', [uintCV(X_AMT)], X60), '(err u7003)');
  tx('R7 push on it -> u7003', call(KEEPER, 'push', [], X60), '(err u7003)');
  tx('R7 withdraw on it -> u7006 (no position)', call(A, 'withdraw', [uintCV(1)], X60), '(err u7006)');
  tx('R7 claim on it -> u7006', call(A, 'claim', [], X60), '(err u7006)');
  ev('R7 not registered', `(is-registered '${X60})`, 'false', LADDER);
  deploy(DEP, nm(X70), X_SRC + '\n;; one byte off the canonical: a different contract hash\n');
  tx("R7 initialize a rung whose code is not the canonical's -> u6004 (hash mismatch at register)", call(DEP, 'initialize', [uintCV(70), trueCV()], X70), '(err u6004)');
  ev('R7 spread 70 stays free', `(get-rung "${XS}" u70)`, 'none', LADDER);
  tx('R7 stranger propose-owner -> u6001', call(KEEPER, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], LADDER), '(err u6001)');
  tx('R7 accept-owner with nothing pending -> u6008', call(KEEPER, 'accept-owner', [], LADDER), '(err u6008)');
  tx('R7 owner proposes the keeper', call(DEP, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], LADDER), okTrue);
  ev('R7 pending = keeper, eligible in 144 burn blocks', '(get-pending-owner)', (v) => String(v).includes(KEEPER), LADDER);
  tx('R7 a stranger accepts -> u6001', call(A, 'accept-owner', [], LADDER), '(err u6001)');
  tx('R7 the keeper accepts before the timelock -> u6009', call(KEEPER, 'accept-owner', [], LADDER), '(err u6009)');
  b = b.addAdvanceBlocks({ bitcoin_blocks: 145, stacks_blocks_per_bitcoin: 1 });
  tx('R7 145 burn blocks later the keeper accepts -> ok', call(KEEPER, 'accept-owner', [], LADDER), okTrue);
  ev('R7 owner = keeper', '(get-owner)', KEEPER, LADDER);
  tx('R7 the old owner can no longer retire -> u6001', call(DEP, 'retire-band', [stringAsciiCV(XS), uintCV(20)], LADDER), '(err u6001)');
  tx('R7 the new owner proposes none: cancels any pending', call(KEEPER, 'propose-owner', [noneCV()], LADDER), okTrue);
  tx('R7 accept with none pending -> u6008', call(DEP, 'accept-owner', [], LADDER), '(err u6008)');
  tx('R7 the keeper hands it back: proposes the deployer', call(KEEPER, 'propose-owner', [someCV(standardPrincipalCV(DEP))], LADDER), okTrue);
  b = b.addAdvanceBlocks({ bitcoin_blocks: 145, stacks_blocks_per_bitcoin: 1 });
  tx('R7 the deployer accepts -> ok', call(DEP, 'accept-owner', [], LADDER), okTrue);
  ev('R7 owner = deployer again', '(get-owner)', DEP, LADDER);

  // =============== R8: jing-core-v6 admin paths (live core: owner = CORE_OWNER) ===============
  const MKT_B = `${DEP}.markets-b`, MKT_C = `${DEP}.markets-c`;
  tx('R8 verify the market a second time -> u5003', call(CORE_OWNER, 'set-verified-contract', [contractPrincipalCV(DEP, MKT)], CORE_ID), '(err u5003)');
  tx('R8 stranger verifies -> u5001', call(KEEPER, 'set-verified-contract', [contractPrincipalCV(DEP, N.ladder)], CORE_ID), '(err u5001)');
  tx('R8 verify a standard principal (no code, no hash) -> u5002', call(CORE_OWNER, 'set-verified-contract', [standardPrincipalCV(KEEPER)], CORE_ID), '(err u5002)');
  deploy(DEP, 'markets-b', src(MKT));
  tx('R8 markets-b operator -> core owner (initialize needs operator = core owner)', call(DEP, 'set-operator', [standardPrincipalCV(CORE_OWNER)], MKT_B), okTrue);
  tx('R8 initialize a second market naming itself as canonical, unverified -> u5005', call(CORE_OWNER, 'initialize', initArgs('markets-b'), MKT_B), '(err u5005)');
  tx('R8 initialize it naming the verified market as canonical (same bytes) -> ok, registered', call(CORE_OWNER, 'initialize', initArgs(MKT), MKT_B), okTrue);
  ev('R8 markets-b registered in the core', `(is-registered '${MKT_B})`, 'true', CORE_ID);
  deploy(DEP, 'markets-c', src(MKT).replace('(define-constant ', '(define-constant  '));
  tx('R8 markets-c operator -> core owner', call(DEP, 'set-operator', [standardPrincipalCV(CORE_OWNER)], MKT_C), okTrue);
  tx('R8 a byte-different copy naming the verified market -> u5006 hash mismatch', call(CORE_OWNER, 'initialize', initArgs(MKT), MKT_C), '(err u5006)');
  tx('R8 stranger pauses the core -> u5001', call(KEEPER, 'pause', [], CORE_ID), '(err u5001)');
  tx('R8 unpause when not paused -> u5017', call(CORE_OWNER, 'unpause', [], CORE_ID), '(err u5017)');
  tx('R8 owner pauses the core -> ok', call(CORE_OWNER, 'pause', [], CORE_ID), okTrue);
  tx('R8 a market deposit while the core is paused -> u5016 (the core refuses the log)', call(A, 'deposit-token-x', [uintCV(2_000_000), uintCV(1), noneCV(), wstxT, stringAsciiCV('wstx')]), '(err u5016)');
  tx('R8 unpause before the timelock -> u5008', call(CORE_OWNER, 'unpause', [], CORE_ID), '(err u5008)');
  tx('R8 stranger unpauses -> u5001', call(KEEPER, 'unpause', [], CORE_ID), '(err u5001)');
  b = b.addAdvanceBlocks({ bitcoin_blocks: 145, stacks_blocks_per_bitcoin: 1 });
  tx('R8 145 burn blocks later the owner unpauses -> ok', call(CORE_OWNER, 'unpause', [], CORE_ID), okTrue);
  tx('R8 the market deposit goes through again', call(A, 'deposit-token-x', [uintCV(2_000_000), uintCV(1), noneCV(), wstxT, stringAsciiCV('wstx')]), '(ok u2000000)');
  tx('R8 A cancels it', call(A, 'cancel-token-x-deposit', [wstxT, stringAsciiCV('wstx')]), '(ok u2000000)');
  tx('R8 core accept-owner with nothing pending -> u5018', call(KEEPER, 'accept-owner', [], CORE_ID), '(err u5018)');
  tx('R8 stranger propose-owner -> u5001', call(KEEPER, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], CORE_ID), '(err u5001)');
  tx('R8 owner proposes the keeper', call(CORE_OWNER, 'propose-owner', [someCV(standardPrincipalCV(KEEPER))], CORE_ID), okTrue);
  tx('R8 a stranger accepts -> u5001', call(A, 'accept-owner', [], CORE_ID), '(err u5001)');
  tx("R8 the keeper accepts at once -> ok (no timelock on the core's handover)", call(KEEPER, 'accept-owner', [], CORE_ID), okTrue);
  ev('R8 core owner = keeper', '(get-contract-owner)', KEEPER, CORE_ID);
  tx('R8 hand back: keeper proposes the multisig', call(KEEPER, 'propose-owner', [someCV(standardPrincipalCV(CORE_OWNER))], CORE_ID), okTrue);
  tx('R8 the multisig accepts -> ok', call(CORE_OWNER, 'accept-owner', [], CORE_ID), okTrue);
  ev('R8 core owner = multisig', '(get-contract-owner)', CORE_OWNER, CORE_ID);

  // =============== R9: the seat count must leave one public slot ===============
  tx('R9 ladder rejects 60 seats (must preserve a public slot)', call(DEP, 'set-max-band-per-side', [uintCV(60)], LADDER), '(err u6011)');
  tx('R9 ladder accepts its maximum 49 seats', call(DEP, 'set-max-band-per-side', [uintCV(49)], LADDER), okTrue);
  tx('R9 sync-seat-count -> 49', call(KEEPER, 'sync-seat-count', []), '(ok u49)');
  ev('R9 protected-seats 49', '(protected-seats)', 'u49');
  tx('R9 back to 10', call(DEP, 'set-max-band-per-side', [uintCV(10)], LADDER), okTrue);
  tx('R9 sync-seat-count -> 10', call(KEEPER, 'sync-seat-count', []), '(ok u10)');

  // =============== R12: band rungs AFTER the block advances, on a mocked DIA ===============
  const NATIVE = 30_000_000n; // ~the STX/USD mid in the market unit (USDCx per STX x 1e8); x floor = 0.8x, y cap = 1.2x
  const DIA_LIT = `'${DIA}`;
  const mocked = (code) => { const m = code.split(DIA_LIT).join(`'${DEP}.dia-mock`); if (m === code) throw new Error('DIA literal not found in the rung source'); return m; };
  const X80 = XN(80), Y80 = YN(80);
  // fresh timestamp (ms) every read, so the 2h staleness gate passes on synthetic blocks; fully typed response
  deploy(DEP, 'dia-mock', `(define-read-only (get-value (key (string-ascii 32))) (if true (ok {value: u${NATIVE}, timestamp: (* stacks-block-time u1000)}) (err u1)))`);
  deploy(DEP, nm(X80), mocked(X_SRC)); deploy(DEP, nm(Y80), mocked(Y_SRC));
  tx(`R12 the mocked build becomes the canonical ${XS} (the upgrade path)`, call(DEP, 'set-canonical', [stringAsciiCV(XS), cp(X80)], LADDER), okTrue);
  tx(`R12 ... and the canonical ${YS}`, call(DEP, 'set-canonical', [stringAsciiCV(YS), cp(Y80)], LADDER), okTrue);
  tx('R12 initialize x spread 80 seated', call(DEP, 'initialize', [uintCV(80), trueCV()], X80), okTrue);
  tx('R12 initialize y spread 80 seated', call(DEP, 'initialize', [uintCV(80), trueCV()], Y80), okTrue);
  ev('R12 the mocked rung reads the mock: floor = native * 0.8', '(current-floor)', `u${NATIVE * 8000n / 10000n}`, X80);
  tx('R12 S deposits 5 USDCx into the mocked y band rung -> pushed', call(S, 'deposit', [uintCV(Y_AMT)], Y80), rungReceipt('deposit'));
  state('R12 y resting 5 USDCx', Y80, (v) => field(v, 'resting') === `u${Y_AMT}` && field(v, 'held-uusdcx') === 'u0');
  tx('R12 S withdraws all', call(S, 'withdraw', [uintCV(999_999_999)], Y80), rungReceipt('withdraw'));
  tx('R12 A deposits 2 STX into the mocked x band rung after 435 advanced burn blocks -> pushed', call(A, 'deposit', [uintCV(2_000_000)], X80), rungReceipt('deposit'));
  state('R12 resting 2 STX', X80, (v) => field(v, 'resting') === 'u2000000' && field(v, 'held-ustx') === 'u0');
  ev('R12 its order rests at the mocked floor with the band spread', `(get-token-x-order '${X80})`, (v) => field(v, 'limit') === `u${NATIVE * 8000n / 10000n}` && field(v, 'spread-bps') === '(some u80)');
  tx('R12 A withdraws all', call(A, 'withdraw', [uintCV(999_999_999)], X80), rungReceipt('withdraw'));
  state('R12 x empty', X80, (v) => field(v, 'total-shares') === 'u0' && field(v, 'resting') === 'u0');
  state('R12 y empty', Y80, (v) => field(v, 'total-shares') === 'u0' && field(v, 'resting') === 'u0');

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === 'tx' ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const okv = (v) => uintOf(String(v).replace(/^\(ok /, '').replace(/\)$/, ''));
  check('R1 S got the 5 USDCx back exactly', okv(s1.raw) - okv(s0.raw), (d) => d === 0n);
  check('R4 A got the STX back (net of tx fees)', uintOf(a1.raw) - uintOf(a0.raw), (d) => d > -1_000_000n && d <= 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
