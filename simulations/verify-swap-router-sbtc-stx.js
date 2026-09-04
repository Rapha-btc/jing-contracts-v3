// verify-swap-router-sbtc-stx.js
// Self-verifying stxer mainnet-fork harness for the retail wrapper
// contracts/swap-router-sbtc-stx-jing.clar (DRAFT): Jing book first, Bitflow
// DLMM / XYK / Velar for the remainder, one tx, 100% filled or reverted.
//
//   W1 guards: zero amount u3001, jing-amount > amount u3002, bad venue u3003,
//      total min-out too high u3004 (nothing moved); the AMM leg's own
//      min-amm-out too high is refused by the VENUE (DLMM u2003, XYK u6009,
//      Velar u107), nothing moved. W1p partial fill: a second wrapper copy
//      with DLMM_MAX_STEPS u1 sells more than one bin holds; DLMM returns
//      in < amount and the wrapper refuses u3005.
//   W2 sell sBTC, book skipped (jing-amount 0): DLMM, XYK, Velar each take the
//      whole amount; sBTC delta == amount, STX grew, tuple reports
//      jing-ok false / jing-in u0 / amm-in amount.
//   W3 sell STX, book skipped: DLMM, XYK, Velar; STX delta == amount, sBTC grew.
//   W4 split: a 100 STX bid rests on Jing; taker sells 5000 sats with
//      jing-amount 2000. Jing fills the 2000 at the mid (maker paid net of
//      fee + ride), the other 3000 go to DLMM. Tuple jing-ok true /
//      jing-in u2000 / amm-in u3000; cycle advanced by the swap.
//   W6 AMM-only entry points (no VAA): amm-swap-sbtc-for-stx / -stx-for-sbtc
//      on DLMM, XYK, Velar; exact deltas, amm-out == out; guards u3001,
//      u3003, venue min-out refusal (u2003), u3005 on the 1-step copy.
//   W5 fallback: empty book (fresh cycle), jing-amount == amount. The market
//      returns an err, the wrapper catches it, the whole amount goes to the
//      venue: jing-ok false / jing-in u0 / amm-in amount; no x position was
//      left behind on the market, cycle unchanged.
//
// Market runs with the two sim-only Pyth patches (staleness loosened, both
// verify-and-update calls no-op'd), same as every other v2 harness. The
// wrapper source is untouched. Venue contracts are the LIVE mainnet ones.
//
// Run: npx tsx simulations/verify-swap-router-sbtc-stx.js
import fs from "node:fs";
import {
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
  cvToString,
  cvToJSON,
  deserializeCV,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import {
  STX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  SBTC_FQN,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  PYTH_STORAGE,
} from "./_setup.js";

const OWNER_PRIVKEY =
  "6666666666666666666666666666666666666666666666666666666666666666" + "01";
// Everything deploys as chavita.btc, the live jing-core-v3 deployer, so the
// market lands at the exact id the wrapper's JING_MARKET constant names and
// the market's relative `.jing-core-v3` resolves to the LIVE core. stxer
// needs no signature, so impersonating the deployer is free.
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";

const CORE = "jing-core-v3";
const MARKET = "markets-sbtc-stx-jing-v3";
const ROUTER = "swap-router-sbtc-stx-jing";
const CORE_ID = `${DEPLOYER}.${CORE}`;
const CID = `${DEPLOYER}.${MARKET}`;
const RID = `${DEPLOYER}.${ROUTER}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const MIN_SBTC = 1000n;
const MIN_STX = 1_000_000n;
const PP = 100_000_000n;
const HUGE = 999_999_999_999_999n;
const DLMM = 1n, XYK = 2n, VELAR = 3n;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const DUMMY_VAA = bufferCV(Buffer.from("00", "hex"));

// ---- sources + sim-only patches (market only) ----
const routerSrc = fs.readFileSync(new URL(`../contracts/${ROUTER}.clar`, import.meta.url), "utf8");
if (!routerSrc.includes(`'${DEPLOYER}.${MARKET}`)) throw new Error("wrapper JING_MARKET does not name the deployer's market");
// W1p: same wrapper, DLMM walk capped at one bin so a mid-size sell stops short
const ROUTER_1STEP = `${ROUTER}-1step`;
const router1StepSrc = (() => {
  const s = routerSrc.replace("(define-constant DLMM_MAX_STEPS u230)", "(define-constant DLMM_MAX_STEPS u1)");
  if (s === routerSrc) throw new Error("DLMM_MAX_STEPS patch did not apply");
  return s;
})();
let mktSrc = fs.readFileSync(new URL(`../contracts/${MARKET}.clar`, import.meta.url), "utf8");
mktSrc = mktSrc.replace("(define-constant MAX_STALENESS u80)", "(define-constant MAX_STALENESS u999999999)");
const VERIFY_BLOCK = /\(try! \(contract-call\? 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.pyth-oracle-v4\s*\n\s*verify-and-update-price-feeds vaa \{\s*\n\s*pyth-storage-contract: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.pyth-storage-v4,\s*\n\s*pyth-decoder-contract: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.pyth-pnau-decoder-v3,\s*\n\s*wormhole-core-contract: 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.wormhole-core-v4,\s*\n\s*\}\)\)/g;
if ((mktSrc.match(VERIFY_BLOCK) || []).length !== 2) throw new Error("expected 2 verify blocks");
mktSrc = mktSrc.replace(VERIFY_BLOCK, "true");

// ---- decode + assert ----
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
const field = (s, k) => BigInt((String(s).match(new RegExp(`\\(${k} u(\\d+)\\)`)) || [, "0"])[1]);
const okPrefix = (v) => String(v).startsWith("(ok");

let checks = 0, failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual).includes(want);
  if (ok) console.log(`  ok   ${label}: ${String(actual).slice(0, 110)}`);
  else { failures += 1; console.log(`  FAIL ${label}: got "${actual}" want "${want}"`); }
}

async function storedPrice(feedHex) {
  const [addr, name] = PYTH_STORAGE.split(".");
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/call-read/${addr}/${name}/get-price`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: addr, arguments: ["0x0200000020" + feedHex] }),
  });
  const j = cvToJSON(deserializeCV((await r.json()).result));
  return BigInt(j.value.value.price.value);
}

async function main() {
  console.log("=== swap-router-sbtc-stx-jing SELF-VERIFYING stxer harness ===\n");
  const px = await storedPrice(BTC_USD_FEED_HEX);
  const py = await storedPrice(STX_USD_FEED_HEX);
  const MID = (px * PP) / py;
  console.log(`deployer ${DEPLOYER}  px=${px} py=${py} mid=${MID}  (1 STX ~ ${(10n ** 16n) / MID} sats)\n`);

  const T = SBTC_DEPOSITOR_1; // sells sBTC through the wrapper
  const S = STX_DEPOSITOR_1; // sells STX through the wrapper; rests the Jing bid in W4

  const steps = [];
  const call = (sender, fn, args, cid = RID) => (b) =>
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const sellSbtc = (sender, amount, jing, limit, venue, minOut, minAmm = 1n) =>
    call(sender, "swap-sbtc-for-stx", [uintCV(amount), uintCV(jing), uintCV(limit), DUMMY_VAA, uintCV(venue), uintCV(minAmm), uintCV(minOut)]);
  const sellStx = (sender, amount, jing, limit, venue, minOut, minAmm = 1n) =>
    call(sender, "swap-stx-for-sbtc", [uintCV(amount), uintCV(jing), uintCV(limit), DUMMY_VAA, uintCV(venue), uintCV(minAmm), uintCV(minOut)]);
  const depositY = (sender, amount, limit) =>
    call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), DUMMY_VAA, wstxTrait, wstxAsset], CID);

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const tx = (label, fn, want) => { b = fn(b); const slot = { label, kind: "tx", want, raw: null }; steps.push(slot); return slot; };
  const ev = (label, code, want, cid = RID) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); };
  const cap = (label, code, cid) => { b = b.addEvalCode(cid, code); const slot = { label, kind: "eval", capture: true, value: null }; steps.push(slot); return slot; };
  const sbtcOf = (who, label) => cap(`${label} sbtc`, `(get-balance '${who})`, SBTC_FQN);
  const stxOf = (who, label) => cap(`${label} stx`, `(stx-get-balance '${who})`, RID);

  // ---- deploy ----
  // jing-core-v3 is LIVE at this deployer; only the market and wrappers deploy
  tx("deploy market (patched)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy wrapper (unpatched)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: ROUTER, source_code: routerSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy wrapper-1step (DLMM_MAX_STEPS u1)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: ROUTER_1STEP, source_code: router1StepSrc }), (v) => !String(v).includes("ERR"));
  tx("verify market in core", call(DEPLOYER, "set-verified-contract", [contractPrincipalCV(DEPLOYER, MARKET)], CORE_ID), "(ok true)");
  tx("initialize market", call(DEPLOYER, "initialize", [
    contractPrincipalCV(DEPLOYER, MARKET), contractPrincipalCV(SBTC_ADDR, SBTC_NAME), contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
    uintCV(MIN_SBTC), uintCV(MIN_STX), btcFeedBuf, stxFeedBuf,
  ], CID), "(ok true)");
  ev("wrapper reads market mins (read-only via literal id)", "(get-jing-min-deposits)", (v) => String(v).includes(`(min-token-x u${MIN_SBTC})`));

  // =============== W1: guards ===============
  tx("W1 zero amount -> u3001", sellSbtc(T, 0n, 0n, 1n, DLMM, 1n), "(err u3001)");
  tx("W1 jing-amount > amount -> u3002", sellSbtc(T, 1000n, 2000n, 1n, DLMM, 1n), "(err u3002)");
  tx("W1 bad venue -> u3003", sellSbtc(T, 1000n, 0n, 1n, 9n, 1n), "(err u3003)");
  const g0s = sbtcOf(T, "W1 before"); const g0x = stxOf(T, "W1 before");
  tx("W1 total min-out too high -> u3004", sellSbtc(T, 3000n, 0n, 1n, DLMM, HUGE), "(err u3004)");
  tx("W1 min-amm-out too high on DLMM -> venue u2003", sellSbtc(T, 3000n, 0n, 1n, DLMM, 1n, HUGE), "(err u2003)");
  tx("W1 min-amm-out too high on XYK -> venue u6009", sellSbtc(T, 3000n, 0n, 1n, XYK, 1n, HUGE), "(err u6009)");
  tx("W1 min-amm-out too high on Velar -> venue u107", sellSbtc(T, 3000n, 0n, 1n, VELAR, 1n, HUGE), "(err u107)");
  const g1s = sbtcOf(T, "W1 after"); const g1x = stxOf(T, "W1 after");
  tx("W1 min-amm-out u0 on Velar is floored, not refused", sellSbtc(T, 1000n, 0n, 1n, VELAR, 1n, 0n), okPrefix);
  // W1p: one-bin walk cannot absorb 0.05 BTC; DLMM returns in < amount -> u3005
  const p0s = sbtcOf(T, "W1p before"); const p0x = stxOf(T, "W1p before");
  tx("W1p DLMM stops short of amount -> u3005", (b) =>
    b.withSender(T).addContractCall({ contract_id: `${DEPLOYER}.${ROUTER_1STEP}`, function_name: "swap-sbtc-for-stx",
      function_args: [uintCV(5_000_000n), uintCV(0n), uintCV(1n), DUMMY_VAA, uintCV(DLMM), uintCV(1n), uintCV(1n)] }), "(err u3005)");
  const p1s = sbtcOf(T, "W1p after"); const p1x = stxOf(T, "W1p after");

  // =============== W2: sell sBTC, book skipped ===============
  const w2 = [];
  for (const [venue, name, amt] of [[DLMM, "DLMM", 5000n], [XYK, "XYK", 3000n], [VELAR, "Velar", 3000n]]) {
    const s0 = sbtcOf(T, `W2 ${name} before`); const x0 = stxOf(T, `W2 ${name} before`);
    const r = tx(`W2 sell ${amt} sats on ${name}`, sellSbtc(T, amt, 0n, 1n, venue, 1n), (v) =>
      okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(jing-in u0)") && String(v).includes(`(amm-in u${amt})`));
    const s1 = sbtcOf(T, `W2 ${name} after`); const x1 = stxOf(T, `W2 ${name} after`);
    w2.push({ name, amt, s0, x0, s1, x1, r });
  }

  // =============== W3: sell STX, book skipped ===============
  const w3 = [];
  for (const [venue, name, amt] of [[DLMM, "DLMM", 10_000_000n], [XYK, "XYK", 5_000_000n], [VELAR, "Velar", 5_000_000n]]) {
    const s0 = sbtcOf(S, `W3 ${name} before`); const x0 = stxOf(S, `W3 ${name} before`);
    const r = tx(`W3 sell ${amt} uSTX on ${name}`, sellStx(S, amt, 0n, HUGE, venue, 1n), (v) =>
      okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes(`(amm-in u${amt})`));
    const s1 = sbtcOf(S, `W3 ${name} after`); const x1 = stxOf(S, `W3 ${name} after`);
    w3.push({ name, amt, s0, x0, s1, x1, r });
  }

  // =============== W4: Jing fill + DLMM remainder ===============
  const BID = 100_000_000n; // 100 STX at any price
  tx("W4 100 STX bid rests on Jing", depositY(S, BID, HUGE), `(ok u${BID})`);
  const m0 = sbtcOf(S, "W4 maker before");
  const t0s = sbtcOf(T, "W4 taker before"); const t0x = stxOf(T, "W4 taker before");
  const r4 = tx("W4 sell 5000 sats, 2000 via Jing, rest DLMM", sellSbtc(T, 5000n, 2000n, 1n, DLMM, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)") && String(v).includes("(jing-in u2000)") && String(v).includes("(amm-in u3000)"));
  const m1 = sbtcOf(S, "W4 maker after");
  const t1s = sbtcOf(T, "W4 taker after"); const t1x = stxOf(T, "W4 taker after");
  ev("W4 market cycle advanced by the taker", "(get-current-cycle)", "u1", CID);
  ev("W4 taker holds no x position", `(get-token-x-deposit u1 '${T})`, "u0", CID);
  ev("W4 maker bid rolled (100 STX minus the fill)", `(get-token-y-deposit u1 '${S})`, (v) => uintOf(v) > 0n && uintOf(v) < BID, CID);

  // =============== W5: empty book -> market errs -> whole amount to venue ===============
  tx("W5 maker cancels the rolled bid", call(S, "cancel-token-y-deposit", [wstxTrait, wstxAsset], CID), okPrefix);
  const f0s = sbtcOf(T, "W5 before"); const f0x = stxOf(T, "W5 before");
  const r5 = tx("W5 sell 4000 sats, all via Jing on an empty book -> fallback", sellSbtc(T, 4000n, 4000n, 1n, XYK, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(jing-in u0)") && String(v).includes("(amm-in u4000)"));
  const f1s = sbtcOf(T, "W5 after"); const f1x = stxOf(T, "W5 after");
  ev("W5 market cycle unchanged (failed leg rolled back)", "(get-current-cycle)", "u1", CID);
  ev("W5 no x position left on the market", `(get-token-x-deposit u1 '${T})`, "u0", CID);

  // =============== W6: AMM-only entry points ===============
  const ammSbtc = (sender, amount, venue, minOut) => call(sender, "amm-swap-sbtc-for-stx", [uintCV(amount), uintCV(venue), uintCV(minOut)]);
  const ammStx = (sender, amount, venue, minOut) => call(sender, "amm-swap-stx-for-sbtc", [uintCV(amount), uintCV(venue), uintCV(minOut)]);
  tx("W6 amm zero amount -> u3001", ammSbtc(T, 0n, DLMM, 1n), "(err u3001)");
  tx("W6 amm bad venue -> u3003", ammSbtc(T, 1000n, 9n, 1n), "(err u3003)");
  tx("W6 amm min-out too high on DLMM -> venue u2003", ammSbtc(T, 1000n, DLMM, HUGE), "(err u2003)");
  tx("W6 amm partial on 1-step copy -> u3005", (b) =>
    b.withSender(T).addContractCall({ contract_id: `${DEPLOYER}.${ROUTER_1STEP}`, function_name: "amm-swap-sbtc-for-stx",
      function_args: [uintCV(5_000_000n), uintCV(DLMM), uintCV(1n)] }), "(err u3005)");
  const w6 = [];
  for (const [name, venue, amt] of [["DLMM", DLMM, 4000n], ["XYK", XYK, 2500n], ["Velar", VELAR, 2500n]]) {
    const s0 = sbtcOf(T, `W6 ${name} before`); const x0 = stxOf(T, `W6 ${name} before`);
    const r = tx(`W6 sell ${amt} sats on ${name} (amm only)`, ammSbtc(T, amt, venue, 1n), okPrefix);
    const s1 = sbtcOf(T, `W6 ${name} after`); const x1 = stxOf(T, `W6 ${name} after`);
    w6.push({ name, amt, s0, x0, s1, x1, r, dir: "sbtc" });
  }
  for (const [name, venue, amt] of [["DLMM", DLMM, 8_000_000n], ["XYK", XYK, 4_000_000n], ["Velar", VELAR, 4_000_000n]]) {
    const s0 = sbtcOf(S, `W6 ${name} before`); const x0 = stxOf(S, `W6 ${name} before`);
    const r = tx(`W6 sell ${amt} uSTX on ${name} (amm only)`, ammStx(S, amt, venue, 1n), okPrefix);
    const s1 = sbtcOf(S, `W6 ${name} after`); const x1 = stxOf(S, `W6 ${name} after`);
    w6.push({ name, amt, s0, x0, s1, x1, r, dir: "stx" });
  }

  // ---- run ----
  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  let i = 0;
  for (const st of steps) {
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    i += 1;
    st.raw = raw;
    if (st.capture) { st.value = uintOf(raw); console.log(`  ..   ${st.label}: ${raw}`); }
    else check(st.label, raw, st.want);
  }

  // relative checks
  check("W1 min-out revert moved no sBTC", g1s.value - g0s.value, (d) => d === 0n);
  check("W1 min-out revert moved no STX", g1x.value - g0x.value, (d) => d === 0n);
  check("W1p partial-fill revert moved no sBTC", p1s.value - p0s.value, (d) => d === 0n);
  check("W1p partial-fill revert moved no STX", p1x.value - p0x.value, (d) => d === 0n);
  for (const w of w2) {
    const out = field(w.r.raw, "out");
    check(`W2 ${w.name} sBTC delta == ${w.amt}`, w.s0.value - w.s1.value, (d) => d === w.amt);
    check(`W2 ${w.name} STX grew by tuple out (${out})`, w.x1.value - w.x0.value, (d) => d === out && d > 0n);
    check(`W2 ${w.name} amm-out == out (venue reported the whole leg)`, field(w.r.raw, "amm-out"), (a) => a === out);
  }
  for (const w of w3) {
    const out = field(w.r.raw, "out");
    check(`W3 ${w.name} STX delta == ${w.amt}`, w.x0.value - w.x1.value, (d) => d === w.amt);
    check(`W3 ${w.name} sBTC grew by tuple out (${out})`, w.s1.value - w.s0.value, (d) => d === out && d > 0n);
    check(`W3 ${w.name} amm-out == out`, field(w.r.raw, "amm-out"), (a) => a === out);
  }
  // W4: 2000 gross -> rebate 4, net 1996, fee 1, ride 4 -> maker +1999 sats
  check("W4 maker paid net of fee + ride (1999)", m1.value - m0.value, (d) => d === 1999n);
  check("W4 taker sBTC delta == 5000", t0s.value - t1s.value, (d) => d === 5000n);
  const out4 = field(r4.raw, "out");
  check(`W4 taker STX grew by tuple out (${out4})`, t1x.value - t0x.value, (d) => d === out4 && d > 0n);
  const jingStx = (1996n * MID) / (PP * 100n); // uSTX the mid fill pays before fee
  check(`W4 out exceeds the Jing leg alone (${jingStx})`, out4, (o) => o > jingStx);
  // jing-out comes straight from the market's post-walk tuple: the mid fill
  // net of the 10 bps fee (no walk here), strictly inside the total gained
  const jingOut4 = field(r4.raw, "jing-out");
  check(`W4 tuple jing-out = mid fill net of fee (~${jingStx - jingStx / 1000n})`, jingOut4,
    (o) => o > 0n && o < out4 && o <= jingStx && o >= jingStx - jingStx / 1000n - 2n);
  check("W4 jing-out + amm-out == out", jingOut4 + field(r4.raw, "amm-out"), (t) => t === out4);
  check("W5 tuple jing-out u0 (leg rolled back)", field(r5.raw, "jing-out"), (o) => o === 0n);
  check("W5 taker sBTC delta == 4000", f0s.value - f1s.value, (d) => d === 4000n);
  const out5 = field(r5.raw, "out");
  check(`W5 STX grew by tuple out (${out5})`, f1x.value - f0x.value, (d) => d === out5 && d > 0n);
  check("W5 amm-out == out (whole amount on the venue)", field(r5.raw, "amm-out"), (a) => a === out5);
  for (const w of w6) {
    const out = field(w.r.raw, "out");
    if (w.dir === "sbtc") {
      check(`W6 ${w.name} amm-only sBTC delta == ${w.amt}`, w.s0.value - w.s1.value, (d) => d === w.amt);
      check(`W6 ${w.name} amm-only STX grew by out (${out})`, w.x1.value - w.x0.value, (d) => d === out && d > 0n);
    } else {
      check(`W6 ${w.name} amm-only STX delta == ${w.amt}`, w.x0.value - w.x1.value, (d) => d === w.amt);
      check(`W6 ${w.name} amm-only sBTC grew by out (${out})`, w.s1.value - w.s0.value, (d) => d === out && d > 0n);
    }
    check(`W6 ${w.name} amm-out == out`, field(w.r.raw, "amm-out"), (a) => a === out);
  }

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
