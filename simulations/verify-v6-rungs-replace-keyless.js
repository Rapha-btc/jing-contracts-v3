import { rungReceipt } from "./_rung-receipt.js";
import { installChunkedSubmit } from "./_chunked-submit.js";
installChunkedSubmit();
// verify-v6-rungs-replace-keyless.js
// SELF-VERIFYING stxer mainnet-fork harness, no Pyth key: a REPLACED or
// RETIRED band rung must keep serving its members (bounty finding, Patient
// Reed): withdraw, claim, push and deposit go through the ladder's log-*
// gate (rung-of), so the ladder must keep the `registered` row of a rung
// that lost its seat. Seat status is decided by the `rungs` key alone.
//
// Keyless because: the band rungs read the RFQ native oracle (live on the
// fork) for their floor / cap, and every deposit lands on an EMPTY opposite
// side, so the market never fetches a Pyth price. The sell block runs first
// and empties itself before the buy block so the x side is empty for it.
//
//   R1 sell side: S funds jing-sell-stx-spread-30, the owner replaces the
//      rung by a fresh deploy at spread 30; S withdraws 1, claims, withdraws
//      all, a keeper pushes; the old rung is registered, not current
//   R2 buy side: same on jing-buy-stx-spread-30 (A funds it) via replace
//   R3 retire: the owner retires spread 20 (A funded it); A withdraws all;
//      a sync on any seated rung prunes the market copy
//   R4 the old rung is an ordinary maker from then on: A deposits again
//      into the replaced rung (pushed as a plain maker), then withdraws
//   R5 unseated band rungs: initialize(bps, false) registers without a
//      seat (prints, takes deposits, no key, no count); seat-band (owner)
//      seats it later, or re-seats a replaced rung (replace path); a full
//      side refuses a seat but not an unseated rung; the max dial
//   R6 prune-seats: retire every sel-band spread so no current rung is
//      left on y; sync-seat has nothing to sync (u1028 all round), the
//      market copy is stale; prune-seats clears it, keeps every current
//      seat on x, adds nothing
//   R7 the leftovers of the coverage matrix: a rung before initialize
//      (u7003 / u7006), a rung whose code differs from the canonical
//      (u6004 at register), and the ladder's owner handover (propose,
//      accept before the timelock u6009, after 145 burn blocks ok, no
//      pending u6008, stranger u6001), handed back at the end
//   R8 jing-core-v6 admin: verify twice u5003, register from an unverified
//      canonical u5005 and from a byte-different copy u5006 (a second and a
//      third market instance), pause (a market deposit then fails u5016),
//      unpause before the timelock u5008 / by a stranger u5001 / after 145
//      blocks ok / when not paused u5017, owner handover u5018 / u5001 /
//      ok at once (no timelock on the core's handover), handed back
//   R9 the ladder bounds the seat count below the market's 50 slots
//   R10 a band rung under the market minimum: the deposit is held, a
//      withdraw is served from held, push refuses under the minimum and
//      pushes once the operator lowers it (the band floor from the miner band)
//   R11 the sell mirror on an UNSEATED sell band rung (initialize seat=false)
//   R12 band rungs after the block advances: the rung source with its oracle
//      literal pointed at a one-line mock of get-native-price (stxer refuses
//      a simulation that reads the real miner band on synthetic burn blocks)
//
// Run: npx tsx simulations/verify-v6-rungs-replace-keyless.js
import fs from "node:fs";
import { ClarityVersion, uintCV, trueCV, falseCV, bufferCV, stringAsciiCV, contractPrincipalCV, standardPrincipalCV, someCV, noneCV, deserializeCV, cvToString } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v6", MKT = "markets-sbtc-stx-jing-v6-3";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder-v1`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC holder: buy-rung member
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX holder: sell-rung member
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone; also the second deployer
// comment-only lines stripped before deploying: the v6 market crossed the
// 100,000-byte deploy limit with its comments (2026-09-15); the deploy form
// is comment-free anyway, same strip as verify-markets-v6-gaps.js
const stripComments = (t) => t.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const src = (f) => stripComments(fs.readFileSync(`./contracts/${f}.clar`, "utf8"));
const BUY_SRC = src("jing-buy-stx-core-spread"), SELL_SRC = src("jing-sell-stx-core-spread");
const BUY20 = `${DEP}.jing-buy-stx-spread-20`, BUY30 = `${DEP}.jing-buy-stx-spread-30`, BUY30B = `${KEEPER}.jing-buy-stx-spread-30`;
const SELL20 = `${DEP}.jing-sell-stx-spread-20`, SELL30 = `${DEP}.jing-sell-stx-spread-30`, SELL30B = `${KEEPER}.jing-sell-stx-spread-30`;
const SATS = 20000, USTX = 5_000_000;

let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 80) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch { return r.Ok.result; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const uintOf = (v) => BigInt(String(v).replace(/^u/, ""));
const okTrue = "(ok true)";

async function main() {
  console.log("=== v6 rungs: replaced / retired band rung keeps serving its members (keyless) ===");
  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: fn === "withdraw" ? [...args, noneCV()] : args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (sender, name, code) => tx(`deploy ${sender.slice(0, 6)}.${name}`, (bb) => bb.withSender(sender).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const state = (label, cid, want) => ev(label, "(get-state)", want, cid);
  const nm = (cid) => cid.split(".")[1];
  const cp = (cid) => contractPrincipalCV(cid.split(".")[0], cid.split(".")[1]);

  // ---- the v6 stack ----
  deploy(DEP, CORE, src(CORE)); deploy(DEP, "jing-ladder-v1", src("jing-ladder-v1")); deploy(DEP, MKT, src(MKT));
  tx("core-v6 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), okTrue);
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), okTrue);
  deploy(DEP, nm(BUY20), BUY_SRC); deploy(DEP, nm(BUY30), BUY_SRC); deploy(DEP, nm(SELL20), SELL_SRC); deploy(DEP, nm(SELL30), SELL_SRC);
  tx("canonical buy-band", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), cp(BUY20)], LADDER), okTrue);
  tx("canonical sel-band", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), cp(SELL20)], LADDER), okTrue);
  for (const r of [BUY20, BUY30, SELL20, SELL30]) tx(`init ${nm(r)}`, call(DEP, "initialize", [uintCV(nm(r).endsWith("20") ? 20 : 30), trueCV()], r), okTrue);
  ev("band count buy-band 2", '(get-band-count "buy-band")', "u2", LADDER);
  ev("band count sel-band 2", '(get-band-count "sel-band")', "u2", LADDER);

  // =============== R1: sell side, replace ===============
  const s0 = ev("R1 S balance before", `(stx-get-balance '${S})`, (v) => uintOf(v) > 0n);
  tx("R1 S funds the sell spread-30 rung (x side empty: keyless push)", call(S, "deposit", [uintCV(USTX)], SELL30), rungReceipt("deposit"));
  state("R1 sell rung resting 5 STX", SELL30, (v) => field(v, "resting") === `u${USTX}`);
  ev("R1 the rung holds a seat on y", `(is-protected-y '${SELL30})`, "true");
  deploy(KEEPER, nm(SELL30B), SELL_SRC);
  tx("R1 owner initializes the keeper's deploy: replaces the sell spread-30 rung", call(DEP, "initialize", [uintCV(30), trueCV()], SELL30B), okTrue);
  ev("R1 the new rung holds the seat", `(is-protected-y '${SELL30B})`, "true");
  ev("R1 the old rung lost it", `(is-protected-y '${SELL30})`, "false");
  ev("R1 ladder: old rung not current", `(is-band-y '${SELL30})`, "false", LADDER);
  ev("R1 ladder: old rung STILL registered (it holds member funds)", `(is-registered '${SELL30})`, "true", LADDER);
  ev("R1 ladder: spread 30 points at the new rung", '(get-rung "sel-band" u30)', `(some ${SELL30B})`, LADDER);
  ev("R1 band count sel-band still 2", '(get-band-count "sel-band")', "u2", LADDER);
  tx("R1 S withdraws 1 STX from the replaced rung -> ok", call(S, "withdraw", [uintCV(1_000_000)], SELL30), rungReceipt("withdraw"));
  tx("R1 S claims on the replaced rung -> ok", call(S, "claim", [], SELL30), rungReceipt("claim"));
  tx("R1 keeper pushes the replaced rung -> ok (nothing held: false)", call(KEEPER, "push", [], SELL30), "(ok false)");
  tx("R1 S withdraws the rest -> ok", call(S, "withdraw", [uintCV(USTX)], SELL30), rungReceipt("withdraw"));
  state("R1 sell rung empty", SELL30, (v) => field(v, "resting") === "u0" && field(v, "held-ustx") === "u0");
  const s1 = ev("R1 S balance after (fees aside, the 5 STX are back)", `(stx-get-balance '${S})`, (v) => uintOf(v) > 0n);
  ev("R1 the y side is empty again", "(len (get-token-y-depositors u0))", "u0");

  // =============== R2: buy side, replace ===============
  const a0 = ev("R2 A sats before", `(contract-call? '${SBTC} get-balance '${A})`, (v) => String(v).startsWith("(ok"));
  tx("R2 A funds the buy spread-30 rung (y side empty: keyless push)", call(A, "deposit", [uintCV(SATS)], BUY30), rungReceipt("deposit"));
  state("R2 buy rung resting 20000", BUY30, (v) => field(v, "resting") === `u${SATS}` && field(v, "held-sats") === "u0");
  tx("R2 A funds the buy spread-20 rung too (for the retire block)", call(A, "deposit", [uintCV(SATS)], BUY20), rungReceipt("deposit"));
  deploy(KEEPER, nm(BUY30B), BUY_SRC);
  tx("R2 owner initializes the keeper's deploy: replaces the buy spread-30 rung", call(DEP, "initialize", [uintCV(30), trueCV()], BUY30B), okTrue);
  ev("R2 the new rung holds the seat", `(is-protected-x '${BUY30B})`, "true");
  ev("R2 the old rung lost it", `(is-protected-x '${BUY30})`, "false");
  ev("R2 ladder: old rung not current", `(is-band-x '${BUY30})`, "false", LADDER);
  ev("R2 ladder: old rung STILL registered", `(is-registered '${BUY30})`, "true", LADDER);
  ev("R2 seated list on x = spread-20 + new spread-30", "(len (get-seated-x))", "u2");
  tx("R2 sync-seat on the replaced rung -> u1028 (not a seat)", call(KEEPER, "sync-seat", [cp(BUY30)]), "(err u1028)");
  ev("R2 the old rung's 20000 still rest on the book", `(get-token-x-deposit u0 '${BUY30})`, `u${SATS}`);
  tx("R2 A withdraws 1 sat from the replaced rung -> ok", call(A, "withdraw", [uintCV(1)], BUY30), rungReceipt("withdraw"));
  tx("R2 A claims on the replaced rung -> ok", call(A, "claim", [], BUY30), rungReceipt("claim"));
  tx("R2 keeper pushes the replaced rung -> (ok false)", call(KEEPER, "push", [], BUY30), "(ok false)");
  tx("R2 A withdraws the rest -> ok", call(A, "withdraw", [uintCV(SATS)], BUY30), rungReceipt("withdraw"));
  state("R2 buy rung empty", BUY30, (v) => field(v, "resting") === "u0" && field(v, "held-sats") === "u0");
  ev("R2 A position gone", `(get-position '${A})`, (v) => String(v).includes("u0"), BUY30);

  // =============== R3: retire spread 20 ===============
  tx("R3 owner retires buy spread 20", call(DEP, "retire-band", [stringAsciiCV("buy-band"), uintCV(20)], LADDER), okTrue);
  ev("R3 band count buy-band 1", '(get-band-count "buy-band")', "u1", LADDER);
  ev("R3 ladder: retired rung not current", `(is-band-x '${BUY20})`, "false", LADDER);
  ev("R3 ladder: retired rung STILL registered", `(is-registered '${BUY20})`, "true", LADDER);
  ev("R3 spread 20 is free", '(get-rung "buy-band" u20)', "none", LADDER);
  ev("R3 market copy still seats it until a sync", `(is-protected-x '${BUY20})`, "true");
  tx("R3 anyone syncs a seated rung: prune drops the retired one", call(KEEPER, "sync-seat", [cp(BUY30B)]), (v) => String(v).startsWith("(ok"));
  ev("R3 the retired rung no longer holds a seat", `(is-protected-x '${BUY20})`, "false");
  ev("R3 seated list on x = the new spread-30 only", "(len (get-seated-x))", "u1");
  tx("R3 A withdraws 1 sat from the retired rung -> ok", call(A, "withdraw", [uintCV(1)], BUY20), rungReceipt("withdraw"));
  tx("R3 keeper pushes the retired rung -> (ok false)", call(KEEPER, "push", [], BUY20), "(ok false)");
  tx("R3 A withdraws the rest -> ok", call(A, "withdraw", [uintCV(SATS)], BUY20), rungReceipt("withdraw"));
  state("R3 retired rung empty", BUY20, (v) => field(v, "resting") === "u0");
  tx("R3 retire again -> u6010 (spread free)", call(DEP, "retire-band", [stringAsciiCV("buy-band"), uintCV(20)], LADDER), "(err u6010)");

  // =============== R4: the old rung lives on as an ordinary maker ===============
  tx("R4 A deposits into the replaced spread-30 rung again -> ok (ordinary maker now)", call(A, "deposit", [uintCV(SATS)], BUY30), rungReceipt("deposit"));
  state("R4 resting 20000 again", BUY30, (v) => field(v, "resting") === `u${SATS}`);
  ev("R4 it is on the book without a seat", `(is-protected-x '${BUY30})`, "false");
  ev("R4 ladder still refuses it a seat", `(is-band-x '${BUY30})`, "false", LADDER);
  tx("R4 A withdraws all -> ok", call(A, "withdraw", [uintCV(SATS)], BUY30), rungReceipt("withdraw"));
  const a1 = ev("R4 A sats after", `(contract-call? '${SBTC} get-balance '${A})`, (v) => String(v).startsWith("(ok"));
  tx("R4 a fresh deploy at the RETIRED spread 20 by the owner: registers as a new seat", (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: "jing-buy-stx-spread-20-b", source_code: BUY_SRC, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  tx("R4 ... but its name must carry the spread: u7009", call(DEP, "initialize", [uintCV(20), trueCV()], `${DEP}.jing-buy-stx-spread-20-b`), "(err u7009)");
  deploy(KEEPER, "jing-buy-stx-spread-20", BUY_SRC);
  tx("R4 owner seats the keeper's spread-20 deploy: count back to 2", call(DEP, "initialize", [uintCV(20), trueCV()], `${KEEPER}.jing-buy-stx-spread-20`), okTrue);
  ev("R4 band count buy-band 2", '(get-band-count "buy-band")', "u2", LADDER);
  ev("R4 the retired rung stays registered and not current", `(and (is-registered '${BUY20}) (not (is-band-x '${BUY20})))`, "true", LADDER);

  // =============== R5: unseated band rungs + seat-band ===============
  const BUY40 = `${DEP}.jing-buy-stx-spread-40`, BUY50 = `${DEP}.jing-buy-stx-spread-50`, BUY20B = `${KEEPER}.jing-buy-stx-spread-20`;
  deploy(DEP, nm(BUY40), BUY_SRC);
  tx("R5 stranger initializes unseated -> u7001 (owner only, seated or not)", call(KEEPER, "initialize", [uintCV(40), falseCV()], BUY40), "(err u7001)");
  tx("R5 owner initializes spread 40 UNSEATED -> ok", call(DEP, "initialize", [uintCV(40), falseCV()], BUY40), okTrue);
  tx("R5 initialize again -> u7002", call(DEP, "initialize", [uintCV(40), trueCV()], BUY40), "(err u7002)");
  ev("R5 registered", `(is-registered '${BUY40})`, "true", LADDER);
  ev("R5 not current", `(is-current-rung '${BUY40})`, "false", LADDER);
  ev("R5 ladder: no seat", `(is-band-x '${BUY40})`, "false", LADDER);
  ev("R5 market: no seat", `(is-protected-x '${BUY40})`, "false");
  ev("R5 spread 40 has no holder", '(get-rung "buy-band" u40)', "none", LADDER);
  ev("R5 band count buy-band still 2", '(get-band-count "buy-band")', "u2", LADDER);
  tx("R5 A deposits into the unseated rung -> ok (pushed as an ordinary maker)", call(A, "deposit", [uintCV(SATS)], BUY40), rungReceipt("deposit"));
  state("R5 resting 20000", BUY40, (v) => field(v, "resting") === `u${SATS}` && field(v, "held-sats") === "u0");
  ev("R5 on the book, no seat", `(is-protected-x '${BUY40})`, "false");
  tx("R5 sync-seat on it -> u1028", call(KEEPER, "sync-seat", [cp(BUY40)]), "(err u1028)");
  tx("R5 register-unseated from an EOA -> u6002 (no contract hash)", call(KEEPER, "register-unseated", [stringAsciiCV("buy-band"), uintCV(40), uintCV(0)], LADDER), "(err u6002)");
  tx("R5 stranger seat-band -> u6001", call(KEEPER, "seat-band", [cp(BUY40)], LADDER), "(err u6001)");
  tx("R5 seat-band on an unknown principal -> u6010", call(DEP, "seat-band", [cp(`${DEP}.jing-buy-stx-spread-99`)], LADDER), "(err u6010)");
  tx("R5 seat-band on a seated rung -> u6012", call(DEP, "seat-band", [cp(BUY30B)], LADDER), "(err u6012)");
  tx("R5 seat-band RE-SEATS the replaced spread-30 rung: replaces its successor", call(DEP, "seat-band", [cp(BUY30)], LADDER), okTrue);
  ev("R5 spread 30 points at the old rung again", '(get-rung "buy-band" u30)', `(some ${BUY30})`, LADDER);
  ev("R5 the successor is registered, not current", `(and (is-registered '${BUY30B}) (not (is-current-rung '${BUY30B})))`, "true", LADDER);
  ev("R5 band count buy-band still 2 (replace)", '(get-band-count "buy-band")', "u2", LADDER);
  tx("R5 seat-band the unseated spread-40 rung -> ok (free spread: count 3)", call(DEP, "seat-band", [cp(BUY40)], LADDER), okTrue);
  ev("R5 band count buy-band 3", '(get-band-count "buy-band")', "u3", LADDER);
  ev("R5 ladder seats it now", `(is-band-x '${BUY40})`, "true", LADDER);
  ev("R5 market copy lags until a sync", `(is-protected-x '${BUY40})`, "false");
  tx("R5 anyone syncs it on the market", call(KEEPER, "sync-seat", [cp(BUY40)]), (v) => String(v).startsWith("(ok"));
  ev("R5 market seats it", `(is-protected-x '${BUY40})`, "true");
  ev("R5 the same sync pruned the replaced successor", `(is-protected-x '${BUY30B})`, "false");
  tx("R5 sync the re-seated spread-30 rung too", call(KEEPER, "sync-seat", [cp(BUY30)]), (v) => String(v).startsWith("(ok"));
  ev("R5 seated list on x = spread-20 (keeper), spread-30 (re-seated), spread-40", "(len (get-seated-x))", "u3");
  ev("R5 seated x holds the re-seated spread-30", `(is-protected-x '${BUY30})`, "true");
  tx("R5 A withdraws all from spread 40 (seated now, still fine)", call(A, "withdraw", [uintCV(SATS)], BUY40), rungReceipt("withdraw"));
  // the max dial: lower to the seats held, a seat is refused, an unseated rung is not
  tx("R5 max under seats held (2 < 3) -> u6011", call(DEP, "set-max-band-per-side", [uintCV(2)], LADDER), "(err u6011)");
  tx("R5 max = seats held (3) -> ok", call(DEP, "set-max-band-per-side", [uintCV(3)], LADDER), okTrue);
  deploy(DEP, nm(BUY50), BUY_SRC);
  tx("R5 initialize spread 50 SEATED on a full side -> u6011", call(DEP, "initialize", [uintCV(50), trueCV()], BUY50), "(err u6011)");
  ev("R5 ... and the failed initialize left it uninitialized (not registered)", `(is-registered '${BUY50})`, "false", LADDER);
  tx("R5 initialize spread 50 UNSEATED on a full side -> ok", call(DEP, "initialize", [uintCV(50), falseCV()], BUY50), okTrue);
  tx("R5 seat-band it on the full side -> u6011", call(DEP, "seat-band", [cp(BUY50)], LADDER), "(err u6011)");
  tx("R5 raise the max to 4", call(DEP, "set-max-band-per-side", [uintCV(4)], LADDER), okTrue);
  tx("R5 seat-band it -> ok", call(DEP, "seat-band", [cp(BUY50)], LADDER), okTrue);
  ev("R5 band count buy-band 4", '(get-band-count "buy-band")', "u4", LADDER);
  tx("R5 retire spread 50 -> ok (back to an unseated, registered rung)", call(DEP, "retire-band", [stringAsciiCV("buy-band"), uintCV(50)], LADDER), okTrue);
  ev("R5 retired: registered, not current", `(and (is-registered '${BUY50}) (not (is-current-rung '${BUY50})))`, "true", LADDER);
  tx("R5 seat-band the retired rung again -> ok (retire is reversible)", call(DEP, "seat-band", [cp(BUY50)], LADDER), okTrue);
  ev("R5 band count buy-band 4 again", '(get-band-count "buy-band")', "u4", LADDER);
  tx("R5 sync-seat-count: market seats follow the max (4)", call(KEEPER, "sync-seat-count", []), "(ok u4)");

  // =============== R6: prune-seats when a side has no current rung left ===============
  tx("R6 retire sel-band 20", call(DEP, "retire-band", [stringAsciiCV("sel-band"), uintCV(20)], LADDER), okTrue);
  tx("R6 retire sel-band 30", call(DEP, "retire-band", [stringAsciiCV("sel-band"), uintCV(30)], LADDER), okTrue);
  ev("R6 band count sel-band 0", '(get-band-count "sel-band")', "u0", LADDER);
  ev("R6 market copy still seats both retired sell rungs", "(len (get-seated-y))", "u2");
  ev("R6 the retired spread-20 sell rung is still protected in the copy", `(is-protected-y '${SELL20})`, "true");
  tx("R6 sync-seat on a retired rung -> u1028 (nothing current on y to sync)", call(KEEPER, "sync-seat", [cp(SELL30B)]), "(err u1028)");
  tx("R6 sync-seat-count also prunes retired seats", call(KEEPER, "sync-seat-count", []), "(ok u4)");
  ev("R6 sync-seat-count pruned the retired y seats", "(len (get-seated-y))", "u0");
  ev("R6 x side before the prune: 3 in the copy", "(len (get-seated-x))", "u3");
  tx("R6 anyone prunes", call(KEEPER, "prune-seats", []), "(ok u4)");
  ev("R6 y copy empty", "(len (get-seated-y))", "u0");
  ev("R6 retired sell rung no longer protected", `(is-protected-y '${SELL20})`, "false");
  ev("R6 x copy untouched (3 current seats)", "(len (get-seated-x))", "u3");
  ev("R6 prune adds nothing: spread 50 (ladder-seated, never synced) still absent", `(is-protected-x '${BUY50})`, "false");
  tx("R6 prune again: idempotent", call(KEEPER, "prune-seats", []), "(ok u4)");
  ev("R6 x copy still 3", "(len (get-seated-x))", "u3");
  tx("R6 sync-seat spread 50 -> now 4 on x", call(KEEPER, "sync-seat", [cp(BUY50)]), (v) => String(v).startsWith("(ok"));
  ev("R6 x copy 4", "(len (get-seated-x))", "u4");

  // =============== R10: a band rung holding under the market minimum, a keeper push, a withdraw from held ===============
  // (the seated spread-50 rung, x side; the y side is empty so every push is keyless). R10 and R11 run
  // BEFORE R7: a band rung's push reads the miner band off the RFQ native oracle, and stxer refuses a
  // simulation that does so after an addAdvanceBlocks (BlockingError at submit), which R7 and R8 use.
  tx("R10 A deposits 500 sats into the spread-50 band rung: under the 1000-sat minimum -> HELD, not pushed", call(A, "deposit", [uintCV(500)], BUY50), rungReceipt("deposit"));
  state("R10 held 500, resting 0", BUY50, (v) => field(v, "held-sats") === "u500" && field(v, "resting") === "u0");
  tx("R10 A withdraws 100 sats: served from what is held, the market untouched", call(A, "withdraw", [uintCV(100)], BUY50), rungReceipt("withdraw"));
  state("R10 held 400, resting 0", BUY50, (v) => field(v, "held-sats") === "u400" && field(v, "resting") === "u0");
  tx("R10 keeper push: 400 < the minimum -> (ok false), stays held", call(KEEPER, "push", [], BUY50), "(ok false)");
  tx("R10 operator lowers the x minimum to 100", call(DEP, "set-min-token-x-deposit", [uintCV(100)]), okTrue);
  tx("R10 keeper push: 400 >= 100 -> pushed (ok true), the band floor read from the miner band", call(KEEPER, "push", [], BUY50), "(ok true)");
  state("R10 held 0, resting 400", BUY50, (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u400");
  ev("R10 the rung's order carries the band spread (some u50)", `(get-token-x-order '${BUY50})`, (v) => field(v, "spread-bps") === "(some u50)");
  tx("R10 operator restores the x minimum (1000)", call(DEP, "set-min-token-x-deposit", [uintCV(1000)]), okTrue);
  tx("R10 A withdraws everything: 400 on the market under the minimum -> whole cancel, paid", call(A, "withdraw", [uintCV(999_999)], BUY50), rungReceipt("withdraw"));
  state("R10 empty", BUY50, (v) => field(v, "held-sats") === "u0" && field(v, "resting") === "u0" && field(v, "total-shares") === "u0");

  // =============== R11: the sell band mirror, on an UNSEATED rung ===============
  const SELL40 = `${DEP}.jing-sell-stx-spread-40`;
  deploy(DEP, nm(SELL40), SELL_SRC);
  tx("R11 owner initializes sell spread 40 UNSEATED -> ok (registered, no key, no count)", call(DEP, "initialize", [uintCV(40), falseCV()], SELL40), okTrue);
  ev("R11 registered, not current", `(and (is-registered '${SELL40}) (not (is-current-rung '${SELL40})))`, "true", LADDER);
  ev("R11 band count sel-band still 0", '(get-band-count "sel-band")', "u0", LADDER);
  tx("R11 S deposits 0.5 STX: under the 1 STX minimum -> HELD", call(S, "deposit", [uintCV(500_000)], SELL40), rungReceipt("deposit"));
  state("R11 held 0.5 STX, resting 0", SELL40, (v) => field(v, "held-ustx") === "u500000" && field(v, "resting") === "u0");
  tx("R11 S withdraws 0.1 STX from held", call(S, "withdraw", [uintCV(100_000)], SELL40), rungReceipt("withdraw"));
  state("R11 held 0.4 STX", SELL40, (v) => field(v, "held-ustx") === "u400000" && field(v, "resting") === "u0");
  tx("R11 keeper push: 0.4 < 1 STX -> (ok false)", call(KEEPER, "push", [], SELL40), "(ok false)");
  tx("R11 operator lowers the y minimum to 0.1 STX", call(DEP, "set-min-token-y-deposit", [uintCV(100_000)]), okTrue);
  tx("R11 keeper push -> pushed (ok true), an ordinary maker on the book (no seat)", call(KEEPER, "push", [], SELL40), "(ok true)");
  state("R11 held 0, resting 0.4 STX", SELL40, (v) => field(v, "held-ustx") === "u0" && field(v, "resting") === "u400000");
  ev("R11 on the book without a seat", `(is-protected-y '${SELL40})`, "false");
  tx("R11 operator restores the y minimum (1 STX)", call(DEP, "set-min-token-y-deposit", [uintCV(1_000_000)]), okTrue);
  tx("R11 S withdraws everything -> whole cancel, paid", call(S, "withdraw", [uintCV(999_999_999)], SELL40), rungReceipt("withdraw"));
  state("R11 empty", SELL40, (v) => field(v, "held-ustx") === "u0" && field(v, "resting") === "u0" && field(v, "total-shares") === "u0");

  // =============== R7: uninitialized rung, non-canonical rung, owner handover ===============
  const BUY60 = `${DEP}.jing-buy-stx-spread-60`, BUY70 = `${DEP}.jing-buy-stx-spread-70`;
  deploy(DEP, nm(BUY60), BUY_SRC);
  tx("R7 deposit into a rung nobody initialized -> u7003", call(A, "deposit", [uintCV(SATS)], BUY60), "(err u7003)");
  tx("R7 push on it -> u7003", call(KEEPER, "push", [], BUY60), "(err u7003)");
  tx("R7 withdraw on it -> u7006 (no position)", call(A, "withdraw", [uintCV(1)], BUY60), "(err u7006)");
  tx("R7 claim on it -> u7006", call(A, "claim", [], BUY60), "(err u7006)");
  ev("R7 not registered", `(is-registered '${BUY60})`, "false", LADDER);
  deploy(DEP, nm(BUY70), BUY_SRC + "\n;; one byte off the canonical: a different contract hash\n");
  tx("R7 initialize a rung whose code is not the canonical's -> u6004 (hash mismatch at register)", call(DEP, "initialize", [uintCV(70), trueCV()], BUY70), "(err u6004)");
  ev("R7 spread 70 stays free", '(get-rung "buy-band" u70)', "none", LADDER);
  tx("R7 stranger propose-owner -> u6001", call(KEEPER, "propose-owner", [someCV(standardPrincipalCV(KEEPER))], LADDER), "(err u6001)");
  tx("R7 accept-owner with nothing pending -> u6008", call(KEEPER, "accept-owner", [], LADDER), "(err u6008)");
  tx("R7 owner proposes the keeper", call(DEP, "propose-owner", [someCV(standardPrincipalCV(KEEPER))], LADDER), okTrue);
  ev("R7 pending = keeper, eligible in 144 burn blocks", "(get-pending-owner)", (v) => String(v).includes(KEEPER), LADDER);
  tx("R7 a stranger accepts -> u6001", call(A, "accept-owner", [], LADDER), "(err u6001)");
  tx("R7 the keeper accepts before the timelock -> u6009", call(KEEPER, "accept-owner", [], LADDER), "(err u6009)");
  b = b.addAdvanceBlocks({ bitcoin_blocks: 145, stacks_blocks_per_bitcoin: 1 });
  tx("R7 145 burn blocks later the keeper accepts -> ok", call(KEEPER, "accept-owner", [], LADDER), okTrue);
  ev("R7 owner = keeper", "(get-owner)", KEEPER, LADDER);
  tx("R7 the old owner can no longer retire -> u6001", call(DEP, "retire-band", [stringAsciiCV("buy-band"), uintCV(20)], LADDER), "(err u6001)");
  tx("R7 the new owner proposes none: cancels any pending", call(KEEPER, "propose-owner", [noneCV()], LADDER), okTrue);
  tx("R7 accept with none pending -> u6008", call(DEP, "accept-owner", [], LADDER), "(err u6008)");
  tx("R7 the keeper hands it back: proposes the deployer", call(KEEPER, "propose-owner", [someCV(standardPrincipalCV(DEP))], LADDER), okTrue);
  b = b.addAdvanceBlocks({ bitcoin_blocks: 145, stacks_blocks_per_bitcoin: 1 });
  tx("R7 the deployer accepts -> ok", call(DEP, "accept-owner", [], LADDER), okTrue);
  ev("R7 owner = deployer again", "(get-owner)", DEP, LADDER);

  // =============== R8: jing-core-v6 admin paths ===============
  const MKT_B = `${DEP}.markets-b`, MKT_C = `${DEP}.markets-c`;
  tx("R8 verify the v6 market a second time -> u5003", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(err u5003)");
  tx("R8 stranger verifies -> u5001", call(KEEPER, "set-verified-contract", [contractPrincipalCV(DEP, "jing-ladder-v1")], CORE_ID), "(err u5001)");
  tx("R8 verify a standard principal (no code, no hash) -> u5002", call(DEP, "set-verified-contract", [standardPrincipalCV(KEEPER)], CORE_ID), "(err u5002)");
  deploy(DEP, "markets-b", src(MKT));
  tx("R8 initialize a second market naming itself as canonical, unverified -> u5005", call(DEP, "initialize", [contractPrincipalCV(DEP, "markets-b"), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)], MKT_B), "(err u5005)");
  tx("R8 initialize it naming the verified v6 market as canonical (same bytes) -> ok, registered", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)], MKT_B), okTrue);
  ev("R8 markets-b registered in the core", `(is-registered '${MKT_B})`, "true", CORE_ID);
  // a byte-different copy WITHOUT growing the source past the 100,000-byte cap: widen one comment marker
  // (src strips the comment lines, so the extra byte goes inside the first form: whitespace, same code, another hash)
  deploy(DEP, "markets-c", src(MKT).replace("(define-constant ", "(define-constant  "));
  tx("R8 a byte-different copy naming the verified market -> u5006 hash mismatch", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)], MKT_C), "(err u5006)");
  tx("R8 stranger pauses the core -> u5001", call(KEEPER, "pause", [], CORE_ID), "(err u5001)");
  tx("R8 unpause when not paused -> u5017", call(DEP, "unpause", [], CORE_ID), "(err u5017)");
  tx("R8 owner pauses the core -> ok", call(DEP, "pause", [], CORE_ID), okTrue);
  tx("R8 a market deposit while the core is paused -> u5016 (the core refuses the log)", call(A, "deposit-token-x", [uintCV(2000), uintCV(1), noneCV(), sbtcT, stringAsciiCV("sbtc-token")]), "(err u5016)");
  tx("R8 unpause before the timelock -> u5008", call(DEP, "unpause", [], CORE_ID), "(err u5008)");
  tx("R8 stranger unpauses -> u5001", call(KEEPER, "unpause", [], CORE_ID), "(err u5001)");
  b = b.addAdvanceBlocks({ bitcoin_blocks: 145, stacks_blocks_per_bitcoin: 1 });
  tx("R8 145 burn blocks later the owner unpauses -> ok", call(DEP, "unpause", [], CORE_ID), okTrue);
  tx("R8 the market deposit goes through again", call(A, "deposit-token-x", [uintCV(2000), uintCV(1), noneCV(), sbtcT, stringAsciiCV("sbtc-token")]), "(ok u2000)");
  tx("R8 A cancels it", call(A, "cancel-token-x-deposit", [sbtcT, stringAsciiCV("sbtc-token")]), "(ok u2000)");
  tx("R8 core accept-owner with nothing pending -> u5018", call(KEEPER, "accept-owner", [], CORE_ID), "(err u5018)");
  tx("R8 stranger propose-owner -> u5001", call(KEEPER, "propose-owner", [someCV(standardPrincipalCV(KEEPER))], CORE_ID), "(err u5001)");
  tx("R8 owner proposes the keeper", call(DEP, "propose-owner", [someCV(standardPrincipalCV(KEEPER))], CORE_ID), okTrue);
  tx("R8 a stranger accepts -> u5001", call(A, "accept-owner", [], CORE_ID), "(err u5001)");
  // the core's owner handover has NO timelock (the ladder's has one; the core's 144 blocks guard unpause)
  tx("R8 the keeper accepts at once -> ok (no timelock on the core's handover)", call(KEEPER, "accept-owner", [], CORE_ID), okTrue);
  ev("R8 core owner = keeper", "(get-contract-owner)", KEEPER, CORE_ID);
  tx("R8 hand back: keeper proposes the deployer", call(KEEPER, "propose-owner", [someCV(standardPrincipalCV(DEP))], CORE_ID), okTrue);
  tx("R8 the deployer accepts -> ok", call(DEP, "accept-owner", [], CORE_ID), okTrue);
  ev("R8 core owner = deployer", "(get-contract-owner)", DEP, CORE_ID);

  // =============== R9: the seat count must leave one public slot ===============
  tx("R9 ladder rejects 60 seats (must preserve a public slot)", call(DEP, "set-max-band-per-side", [uintCV(60)], LADDER), "(err u6011)");
  tx("R9 ladder accepts its maximum 49 seats", call(DEP, "set-max-band-per-side", [uintCV(49)], LADDER), okTrue);
  tx("R9 sync-seat-count -> 49", call(KEEPER, "sync-seat-count", []), "(ok u49)");
  ev("R9 protected-seats 49", "(protected-seats)", "u49");
  tx("R9 back to 10", call(DEP, "set-max-band-per-side", [uintCV(10)], LADDER), okTrue);
  tx("R9 sync-seat-count -> 10", call(KEEPER, "sync-seat-count", []), "(ok u10)");

  // =============== R12: band rungs AFTER the block advances, on a mocked miner band ===============
  // A band rung derives its guard from the RFQ's native oracle, which samples burn-block tenure data; on
  // the synthetic burn blocks stxer mints for addAdvanceBlocks that read makes stxer refuse the whole
  // simulation at submit (BlockingError), so nothing above touches a band rung after R7. Here the same
  // rung source is deployed with the oracle literal pointed at a one-line mock (a fixed price in the
  // market unit) and blessed as the new canonical: same expression ids, same market path, the miner
  // band replaced by a constant. Real-oracle pushes stay covered by R1-R6, R10, R11 and the fill harness.
  const NATIVE = 30_000_000_000_000n; // ~the mid in the market unit; the buy floor is half of it, the sell cap twice
  const RFQ_LIT = "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing-v2-3";
  const mocked = (code) => { const m = code.split(RFQ_LIT).join(`'${DEP}.rfq-native-mock`); if (m === code) throw new Error("oracle literal not found in the rung source"); return m; };
  const BUY80 = `${DEP}.jing-buy-stx-spread-80`, SELL80 = `${DEP}.jing-sell-stx-spread-80`;
  // the response must be fully typed for the rung's `match` (a bare (ok u..) leaves the err type open)
  deploy(DEP, "rfq-native-mock", `(define-read-only (get-native-price) (if true (ok u${NATIVE}) (err u1)))`);
  deploy(DEP, nm(BUY80), mocked(BUY_SRC)); deploy(DEP, nm(SELL80), mocked(SELL_SRC));
  tx("R12 the mocked build becomes the canonical buy-band (the upgrade path)", call(DEP, "set-canonical", [stringAsciiCV("buy-band"), cp(BUY80)], LADDER), okTrue);
  tx("R12 ... and the canonical sel-band", call(DEP, "set-canonical", [stringAsciiCV("sel-band"), cp(SELL80)], LADDER), okTrue);
  tx("R12 initialize buy spread 80 seated", call(DEP, "initialize", [uintCV(80), trueCV()], BUY80), okTrue);
  tx("R12 initialize sell spread 80 seated", call(DEP, "initialize", [uintCV(80), trueCV()], SELL80), okTrue);
  ev("R12 the mocked rung reads the mock: floor = native / 2", "(current-floor)", `u${NATIVE / 2n}`, BUY80);
  // one side at a time: with the other side empty no deposit needs a price (keyless)
  tx("R12 S deposits 5 STX into the mocked sell band rung -> pushed", call(S, "deposit", [uintCV(USTX)], SELL80), rungReceipt("deposit"));
  state("R12 sell resting 5 STX", SELL80, (v) => field(v, "resting") === `u${USTX}` && field(v, "held-ustx") === "u0");
  tx("R12 S withdraws all", call(S, "withdraw", [uintCV(999_999_999)], SELL80), rungReceipt("withdraw"));
  tx("R12 A deposits 2000 sats into the mocked buy band rung after 435 advanced burn blocks -> pushed", call(A, "deposit", [uintCV(2000)], BUY80), rungReceipt("deposit"));
  state("R12 resting 2000", BUY80, (v) => field(v, "resting") === "u2000" && field(v, "held-sats") === "u0");
  ev("R12 its order rests at the mocked floor with the band spread", `(get-token-x-order '${BUY80})`, (v) => field(v, "limit") === `u${NATIVE / 2n}` && field(v, "spread-bps") === "(some u80)");
  tx("R12 A withdraws all", call(A, "withdraw", [uintCV(999_999)], BUY80), rungReceipt("withdraw"));
  state("R12 buy empty", BUY80, (v) => field(v, "total-shares") === "u0" && field(v, "resting") === "u0");
  state("R12 sell empty", SELL80, (v) => field(v, "total-shares") === "u0" && field(v, "resting") === "u0");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid); const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const sats = (v) => uintOf(String(v).replace(/^\(ok /, "").replace(/\)$/, ""));
  check("R1 S got the 5 STX back (net of tx fees)", uintOf(s1.raw) - uintOf(s0.raw), (d) => d > -1_000_000n && d <= 0n);
  check("R4 A got every sat back", sats(a1.raw) - sats(a0.raw), (d) => d === 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
