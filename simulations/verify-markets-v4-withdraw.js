// verify-markets-v4-withdraw.js
// Self-verifying stxer mainnet-fork harness for the partial withdrawals
// (withdraw-token-x / withdraw-token-y, 87cfd5d) on markets-sbtc-stx-jing-v4
// bound to jing-core-v4 (log-withdraw-x/y). Deploys core-v4 + the market
// UNPATCHED + a park instance (MAX_DEPOSITORS u3, the bounty-fixes recipe)
// under a throwaway deployer.
//
// Two tiers:
//   L / Y  live positions, no oracle read (the opposite side is empty, so
//          deposit-* never classifies): runs WITHOUT a key.
//   G / P  open book + parked positions: the park needs a full side and an
//          in-range newcomer, which reads a real Lazer update. Needs
//          PYTH_API_KEY; skipped (and said so) without it.
//
// Run: npx tsx simulations/verify-markets-v4-withdraw.js
//      PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v4-withdraw.js
import fs from "node:fs";
import {
  uintCV, contractPrincipalCV, standardPrincipalCV, stringAsciiCV, bufferCV, noneCV,
  cvToString, deserializeCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_ADDR, SBTC_NAME, SBTC_ASSET_NAME, SBTC_FQN,
  WSTX_ADDR, WSTX_NAME, WSTX_ASSET_NAME,
} from "./_setup.js";

const OWNER_PRIVKEY = "5555555555555555555555555555555555555555555555555555555555555555" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");
const mkAddr = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");

const CORE = "jing-core-v4";
const MARKET = "markets-sbtc-stx-jing-v5";
const PARK = "markets-sbtc-stx-jing-v4-park";
const CORE_ID = `${DEPLOYER}.${CORE}`;
const CID = `${DEPLOYER}.${MARKET}`;
const PID = `${DEPLOYER}.${PARK}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const WITH_KEY = !!process.env.PYTH_API_KEY;

const MIN_SBTC = 1000n;
const MIN_STX = 1_000_000n;
const PP = 100_000_000n;
const HUGE = 999_999_999_999_999n;
const DEAD_X = HUGE; // ask far above any mid: never crosses
const DEAD_Y = 1n; // bid far below any mid

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
let UPDATE = bufferCV(Buffer.from("00", "hex")); // real Lazer update when a key is set

// The v4 source passed 100 KB with the withdraw functions (stxer / the
// deploy payload cap): comment-only lines are dropped, as the deployed
// bytes are. Code lines are untouched.
const stripComments = (src) => src.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
const mktSrc = stripComments(fs.readFileSync(new URL(`../contracts/${MARKET}.clar`, import.meta.url), "utf8"));
if (Buffer.byteLength(mktSrc) > 100_000) throw new Error(`market source still ${Buffer.byteLength(mktSrc)} bytes`);
if (!mktSrc.includes("(contract-call? .jing-core-v4")) throw new Error("market source does not bind .jing-core-v4");
if (!mktSrc.includes("(define-constant MAX_DEPOSITORS u50)")) throw new Error("MAX_DEPOSITORS anchor missing");
const parkSrc = mktSrc.replace("(define-constant MAX_DEPOSITORS u50)", "(define-constant MAX_DEPOSITORS u3)");

function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const okPrefix = (v) => String(v).startsWith("(ok");

let checks = 0, failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual).includes(want);
  if (ok) console.log(`  ok   ${label}: ${String(actual).slice(0, 90)}`);
  else { failures += 1; console.log(`  FAIL ${label}: got "${actual}" want "${want}"`); }
}

async function main() {
  console.log("=== markets-v4 partial withdrawals: SELF-VERIFYING stxer harness ===\n");
  let MID = 0n;
  if (WITH_KEY) {
    const lz = await fetchLazerUpdate();
    UPDATE = bufferCV(Buffer.from(lz.hex, "hex"));
    MID = (lz.px * PP) / lz.py;
    console.log(`Lazer update ${lz.hex.length / 2} bytes, ts ${new Date(lz.ts * 1000).toISOString()}; mid=${MID}`);
  } else {
    console.log("no PYTH_API_KEY: live-side tiers only (L, Y); open-book (G) and parked (P, PX) skipped");
  }
  console.log(`deployer ${DEPLOYER}\n`);

  // actors
  const A = SBTC_DEPOSITOR_1; // x maker on MARKET
  const B = mkAddr(31); // y maker on PARK (live tier)
  const G1 = mkAddr(32); // y bid for the phase gate on MARKET
  const P1 = mkAddr(33), P2 = mkAddr(34), N1 = mkAddr(35); // y park
  const Q1 = mkAddr(36), Q2 = mkAddr(37), Q3 = mkAddr(38), N4 = mkAddr(39); // x park

  const steps = [];
  const call = (sender, fn, args, cid = CID) => (b) =>
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const depositX = (sender, amount, limit, cid = CID) =>
    call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), UPDATE, sbtcTrait, sbtcAsset], cid);
  const depositY = (sender, amount, limit, cid = CID) =>
    call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), UPDATE, wstxTrait, wstxAsset], cid);
  const withdrawX = (sender, amount, cid = CID, trait = sbtcTrait, asset = sbtcAsset) =>
    call(sender, "withdraw-token-x", [uintCV(amount), trait, asset], cid);
  const withdrawY = (sender, amount, cid = CID, trait = wstxTrait, asset = wstxAsset) =>
    call(sender, "withdraw-token-y", [uintCV(amount), trait, asset], cid);
  const cancelY = (sender, cid = CID) => call(sender, "cancel-token-y-deposit", [wstxTrait, wstxAsset], cid);
  const cancelX = (sender, cid = CID) => call(sender, "cancel-token-x-deposit", [sbtcTrait, sbtcAsset], cid);
  const readmitY = (sender, who, cid = PID) => call(sender, "readmit-token-y", [standardPrincipalCV(who), UPDATE], cid);
  const readmitX = (sender, who, cid = PID) => call(sender, "readmit-token-x", [standardPrincipalCV(who), UPDATE], cid);
  const sbtcSend = (to, amt) => (b) =>
    b.withSender(SBTC_DEPOSITOR_1).addContractCall({
      contract_id: SBTC_FQN, function_name: "transfer",
      function_args: [uintCV(amt), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(to), noneCV()],
    });
  const stxSend = (to, amt) => (b) => b.withSender(STX_DEPOSITOR_1).addSTXTransfer({ recipient: to, amount: amt });

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); };
  const ev = (label, code, want, cid = CID) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); };
  const cap = (label, code, cid = CID) => {
    b = b.addEvalCode(cid, code);
    const slot = { label, kind: "eval", capture: true, value: null };
    steps.push(slot);
    return slot;
  };
  const equityX = (who) => `(get-token-equity '${SBTC_FQN} '${who})`;
  const equityY = (who) => `(get-token-equity '${WSTX_ADDR}.${WSTX_NAME} '${who})`;

  // ---- deploy ----
  tx("deploy jing-core-v4", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy market v4 (unpatched, on core-v4)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy park market (MAX u3)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: PARK, source_code: parkSrc }), (v) => !String(v).includes("ERR"));
  for (const [name, cid] of [[MARKET, CID], [PARK, PID]]) {
    tx(`verify ${name} in core-v4`, call(DEPLOYER, "set-verified-contract", [contractPrincipalCV(DEPLOYER, name)], CORE_ID), "(ok true)");
    tx(`initialize ${name}`, call(DEPLOYER, "initialize", [
      contractPrincipalCV(DEPLOYER, name), contractPrincipalCV(SBTC_ADDR, SBTC_NAME), contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
      uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n),
    ], cid), "(ok true)");
  }

  // ---- funding ----
  for (const [who, ustx, sats] of [
    [B, 105_000_000, 0n], [G1, 3_000_000, 0n],
    [P1, 3_500_000, 0n], [P2, 3_500_000, 0n], [N1, 3_500_000, 0n],
    [Q1, 1_000_000, 3000n], [Q2, 1_000_000, 3000n], [Q3, 1_000_000, 3000n], [N4, 1_000_000, 4000n],
  ]) {
    tx(`fund ${who.slice(0, 6)} stx`, stxSend(who, ustx), okPrefix);
    if (sats > 0n) tx(`fund ${who.slice(0, 6)} sbtc`, sbtcSend(who, sats), okPrefix);
  }

  // =============== L: live x position on MARKET (no y side, no oracle) ===============
  tx("L1 withdraw-x with no deposit -> u1005", withdrawX(A, 1000n), "(err u1005)");
  tx("L2 A rests 10000 sats at a dead ask", depositX(A, 10_000n, DEAD_X), "(ok u10000)");
  const aEqBefore = cap("A core equity-x after deposit", equityX(A), CORE_ID);
  tx("L3 withdraw-x 0 -> u1005", withdrawX(A, 0n), "(err u1005)");
  tx("L4 withdraw-x the whole size -> u1024 USE_CANCEL", withdrawX(A, 10_000n), "(err u1024)");
  tx("L5 withdraw-x more than the size -> u1024", withdrawX(A, 20_000n), "(err u1024)");
  tx("L6 withdraw-x leaving 500 < min 1000 -> u1001", withdrawX(A, 9_500n), "(err u1001)");
  tx("L7 withdraw-x with the wrong trait -> u1013", withdrawX(A, 3_000n, CID, wstxTrait, wstxAsset), "(err u1013)");
  tx("L8 B (no x position) withdraw-x -> u1005", withdrawX(B, 1000n), "(err u1005)");
  const aBefore = cap("A sbtc before", `(get-balance '${A})`, SBTC_FQN);
  tx("L9 withdraw-x 3000 -> (ok u7000)", withdrawX(A, 3_000n), "(ok u7000)");
  const aAfter = cap("A sbtc after", `(get-balance '${A})`, SBTC_FQN);
  ev("L10 live size 7000", `(get-token-x-deposit u0 '${A})`, "u7000");
  ev("L11 totals 7000", "(get total-token-x (get-cycle-totals u0))", "u7000");
  ev("L12 limit untouched", `(get-token-x-limit '${A})`, `u${DEAD_X}`);
  ev("L13 still listed", "(len (get-token-x-depositors u0))", "u1");
  ev("L14 nothing parked", `(get-token-x-parked '${A})`, "u0");
  const aEqAfter = cap("A core equity-x after withdraw", equityX(A), CORE_ID);
  tx("L15 second withdraw-x 1000 -> (ok u6000)", withdrawX(A, 1_000n), "(ok u6000)");
  tx("L16 withdraw-x leaving exactly min (5000) -> (ok u1000)", withdrawX(A, 5_000n), "(ok u1000)");
  tx("L17 withdraw-x 1 below min -> u1001", withdrawX(A, 1n), "(err u1001)");
  tx("L18 cancel refunds the remaining 1000", cancelX(A), "(ok u1000)");
  ev("L19 list empty after cancel", "(len (get-token-x-depositors u0))", "u0");
  ev("L20 totals 0", "(get total-token-x (get-cycle-totals u0))", "u0");

  // =============== Y: live y position on PARK (no x side, no oracle) ===============
  tx("Y1 withdraw-y with no deposit -> u1005", withdrawY(B, 1_000_000n, PID), "(err u1005)");
  tx("Y2 B rests 100 STX at a live bid", depositY(B, 100_000_000n, HUGE, PID), "(ok u100000000)");
  tx("Y3 withdraw-y the whole size -> u1024", withdrawY(B, 100_000_000n, PID), "(err u1024)");
  tx("Y4 withdraw-y leaving 0.5 STX -> u1001", withdrawY(B, 99_500_000n, PID), "(err u1001)");
  tx("Y5 withdraw-y wrong trait -> u1013", withdrawY(B, 30_000_000n, PID, sbtcTrait, sbtcAsset), "(err u1013)");
  const bBefore = cap("B stx before", `(stx-get-balance '${B})`, PID);
  tx("Y6 withdraw-y 30 STX -> (ok u70000000)", withdrawY(B, 30_000_000n, PID), "(ok u70000000)");
  const bAfter = cap("B stx after", `(stx-get-balance '${B})`, PID);
  ev("Y7 live size 70 STX", `(get-token-y-deposit u0 '${B})`, "u70000000", PID);
  ev("Y8 totals 70 STX", "(get total-token-y (get-cycle-totals u0))", "u70000000", PID);
  ev("Y9 limit untouched", `(get-token-y-limit '${B})`, `u${HUGE}`, PID);
  ev("Y10 still listed", "(len (get-token-y-depositors u0))", "u1", PID);
  const bEq = cap("B core equity-y after withdraw", equityY(B), CORE_ID);

  if (WITH_KEY) {
    // =============== G: the book is always open (no phases, aa5d4bf) ===============
    // close-deposits and cancel-cycle no longer exist: there is no settle
    // phase between txs at all, so withdraw/cancel are never phase-gated.
    // An outsider's call is refused as no such public function (engine
    // error, no tx) and live withdraws still work.
    tx("G1 A rests 5000 sats again", depositX(A, 5_000n, DEAD_X), "(ok u5000)");
    tx("G2 G1 rests 2 STX dead bid (x present -> priced, real update)", depositY(G1, 2_000_000n, DEAD_Y), "(ok u2000000)");
    tx("G3 outsider close-deposits -> refused (no such function)", call(DEPLOYER, "close-deposits", []), (v) => v === "(err none)" || String(v).includes("ENGINE-ERR"));
    tx("G3b outsider cancel-cycle -> refused (no such function)", call(DEPLOYER, "cancel-cycle", []), (v) => v === "(err none)" || String(v).includes("ENGINE-ERR"));
    tx("G5 withdraw-x on live size still works -> (ok u4000)", withdrawX(A, 1_000n), "(ok u4000)");
    tx("G6 withdraw-y on live size still works -> (ok u1500000)", withdrawY(G1, 500_000n), "(ok u1500000)");
    tx("G7 cancel-x still works -> (ok u4000)", cancelX(A), "(ok u4000)");

    // =============== P: parked y on PARK (MAX u3; B already holds one slot) ===============
    const LP1 = (MID * 90n) / 100n; // -10%: the farthest out of range
    const LP2 = (MID * 95n) / 100n; // -5%
    tx("P1 P1 bids 2 STX at -10%", depositY(P1, 2_000_000n, LP1, PID), "(ok u2000000)");
    tx("P2 P2 bids 2 STX at -5%", depositY(P2, 2_000_000n, LP2, PID), "(ok u2000000)");
    ev("P3 side full (3)", "(len (get-token-y-depositors u0))", "u3", PID);
    tx("P4 N1 in-range newcomer -> parks P1", depositY(N1, 2_000_000n, HUGE, PID), "(ok u2000000)");
    ev("P5 P1 parked 2 STX", `(get-token-y-parked '${P1})`, "u2000000", PID);
    ev("P6 P1 off the cycle", `(get-token-y-deposit u0 '${P1})`, "u0", PID);
    const tot0 = cap("P totals before parked withdraw", "(get total-token-y (get-cycle-totals u0))", PID);
    tx("P7 parked withdraw-y whole -> u1024", withdrawY(P1, 2_000_000n, PID), "(err u1024)");
    tx("P8 parked withdraw-y leaving 0.5 STX -> u1001", withdrawY(P1, 1_500_000n, PID), "(err u1001)");
    const p1Before = cap("P1 stx before", `(stx-get-balance '${P1})`, PID);
    tx("P9 parked withdraw-y 0.5 STX -> (ok u1500000)", withdrawY(P1, 500_000n, PID), "(ok u1500000)");
    const p1After = cap("P1 stx after", `(stx-get-balance '${P1})`, PID);
    ev("P10 parked now 1.5 STX", `(get-token-y-parked '${P1})`, "u1500000", PID);
    ev("P11 still off the cycle", `(get-token-y-deposit u0 '${P1})`, "u0", PID);
    const tot1 = cap("P totals after parked withdraw", "(get total-token-y (get-cycle-totals u0))", PID);
    ev("P12 limit kept", `(get-token-y-limit '${P1})`, `u${LP1}`, PID);
    tx("P13 B cancels -> slot", cancelY(B, PID), "(ok u70000000)");
    tx("P14 readmit P1 -> ok u1500000 (the shrunk size)", readmitY(DEPLOYER, P1), "(ok u1500000)");
    ev("P15 P1 live 1.5 STX", `(get-token-y-deposit u0 '${P1})`, "u1500000", PID);
    ev("P16 P1 unparked", `(get-token-y-parked '${P1})`, "u0", PID);
    tx("P17 live withdraw-y 0.5 STX after readmit -> (ok u1000000)", withdrawY(P1, 500_000n, PID), "(ok u1000000)");

    // =============== PX: parked x on PARK (clear y first so asks pass the gate) ===============
    for (const who of [P1, P2, N1]) tx(`PX clear y ${who.slice(0, 6)}`, cancelY(who, PID), okPrefix);
    ev("PX y side empty", "(len (get-token-y-depositors u0))", "u0", PID);
    const LQ1 = (MID * 110n) / 100n; // +10%: farthest out of range ask
    const LQ3 = (MID * 105n) / 100n; // +5%
    tx("PX1 Q1 asks 3000 at +10%", depositX(Q1, 3000n, LQ1, PID), "(ok u3000)");
    tx("PX2 Q2 asks 3000 at 1 (in range)", depositX(Q2, 3000n, 1n, PID), "(ok u3000)");
    tx("PX3 Q3 asks 3000 at +5%", depositX(Q3, 3000n, LQ3, PID), "(ok u3000)");
    ev("PX4 side full (3)", "(len (get-token-x-depositors u0))", "u3", PID);
    tx("PX5 N4 in-range newcomer -> parks Q1", depositX(N4, 4000n, 1n, PID), "(ok u4000)");
    ev("PX6 Q1 parked 3000", `(get-token-x-parked '${Q1})`, "u3000", PID);
    const q1Before = cap("Q1 sbtc before", `(get-balance '${Q1})`, SBTC_FQN);
    tx("PX7 parked withdraw-x 500 -> (ok u2500)", withdrawX(Q1, 500n, PID), "(ok u2500)");
    const q1After = cap("Q1 sbtc after", `(get-balance '${Q1})`, SBTC_FQN);
    ev("PX8 parked now 2500", `(get-token-x-parked '${Q1})`, "u2500", PID);
    ev("PX9 totals exclude parked (10000)", "(get total-token-x (get-cycle-totals u0))", "u10000", PID);
    tx("PX10 parked withdraw-x leaving 999 -> u1001", withdrawX(Q1, 1501n, PID), "(err u1001)");
    tx("PX11 Q2 cancels -> slot", cancelX(Q2, PID), "(ok u3000)");
    tx("PX12 readmit Q1 -> ok u2500", readmitX(DEPLOYER, Q1), "(ok u2500)");
    ev("PX13 Q1 live 2500", `(get-token-x-deposit u0 '${Q1})`, "u2500", PID);

    steps._rel = { tot0, tot1, p1Before, p1After, q1Before, q1After };
  }

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;

  let i = 0;
  for (const st of steps) {
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    i += 1;
    if (st.capture) { st.value = uintOf(raw); console.log(`  ..   ${st.label}: ${raw}`); }
    else check(st.label, raw, st.want);
  }

  // relative checks
  check("L9 A got exactly 3000 sats back", aAfter.value - aBefore.value, (d) => d === 3000n);
  check("L core equity-x debited by 3000", aEqBefore.value - aEqAfter.value, (d) => d === 3000n);
  check("Y6 B got exactly 30 STX back", bAfter.value - bBefore.value, (d) => d === 30_000_000n);
  check("Y core equity-y == 70 STX", bEq.value, (v) => v === 70_000_000n);
  if (WITH_KEY) {
    const r = steps._rel;
    check("P parked withdraw leaves cycle totals unchanged", r.tot1.value - r.tot0.value, (d) => d === 0n);
    check("P9 P1 got exactly 0.5 STX back", r.p1After.value - r.p1Before.value, (d) => d === 500_000n);
    check("PX7 Q1 got exactly 500 sats back", r.q1After.value - r.q1Before.value, (d) => d === 500n);
  }

  console.log(`\n${checks - failures}/${checks} checks green${WITH_KEY ? "" : " (live tiers only, no PYTH_API_KEY)"}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
