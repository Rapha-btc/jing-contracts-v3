// verify-swap-router-sbtc-stx.js
// Self-verifying stxer mainnet-fork harness for the retail router
// contracts/swap-router-sbtc-stx-jing.clar: two entry points, one per
// direction, each taking an off-chain split (jing-amount + {dlmm, xyk,
// velar}) with per-venue minimums, an optional fallback venue for the
// book residual, and a total min-out.
//
//   W1 guards: zero amount u3001; total min-out too high u3002; bad
//      fallback u3003; split not adding up to amount u3004; jing without a
//      vaa u3005; a venue's own
//      minimum too high is refused by the VENUE (DLMM
//      u2003, XYK u1019/u1020 via xyk-core, Velar u107); nothing moved across all of them; a u0
//      Velar minimum is floored, not refused. W1p partial fill: a second
//      router copy with DLMM_MAX_STEPS u1 sells more than one bin holds;
//      DLMM returns in < amount, the swap succeeds, dlmm-in is what sold,
//      unsold stays home.
//   W2 sell sBTC on one venue at a time, jing u0 + vaa none: DLMM, XYK,
//      Velar; sBTC delta == amount, STX grew by out, out == the leg's out.
//   W3 same, selling STX.
//   W4 Jing + DLMM: a 100 STX bid rests; 2000 sats via Jing, 3000 via DLMM.
//      jing-in u2000, dlmm-in u3000, maker paid net of fee + ride, jing-out
//      == mid fill net of fee, jing-out + dlmm-out == out, cycle advanced.
//   W5 empty book (bid cancelled): all-Jing, fallback none, fills nothing
//      -> the min-out backstop reverts u3002, nothing moved; Jing + XYK,
//      fallback none: XYK runs, Jing amount stays home (unsold == 4000);
//      "Jing mainly", fallback (some XYK): the whole amount lands on XYK
//      (xyk-in == 4000, unsold u0), the retail shape.
//   W8 market get-taker-capacity is tight: read-only == the JS formula to the
//      sat (mid + walk, own side subtracted), limit filters, selling exactly
//      gross-cap fills in full (dust at most), two min deposits over is
//      FOK-refused; get-storage-mid / refresh-mid (some/none) return the mid.
//   W9 smart swaps, split computed ON CHAIN at execution: W9a sell 40000 sats
//      with a bid resting, loose limit: book to capacity, DLMM the rest;
//      W9b vaa none: no book leg; W9c tight limit on an empty book: no venue
//      respects it -> u3002, nothing moved; W9d sell 200 STX with an ask
//      resting; W9f the four-venue happy path: 0.7 BTC at a limit 3% under
//      the AMMs' spot: Jing to capacity, DLMM bins until the limit, XYK +
//      Velar by closed-form room, unsold u0; W9e 3 BTC at the same limit
//      right after: the room is spent, most stays home. Every leg's achieved
//      price is checked against the limit (within the 2-unit rounding
//      slack the router concedes on venue minimums).
//   W7 four legs: W7a sell sBTC 2000 Jing + 1500 DLMM + 1500 XYK + 1000
//      Velar against a resting bid, every leg's in == planned, out == sum
//      of the four outs; W7c sell STX 5 Jing + 3 DLMM + 2 XYK + 2 Velar
//      against a resting ask; W7e jing u0 + vaa none, three AMM legs.
//
// Market runs with the two sim-only Pyth patches (staleness loosened, both
// verify-and-update calls no-op'd), same as every other v2 harness. The
// wrapper source is untouched. Venue contracts are the LIVE mainnet ones.
//
// Run: npx tsx simulations/verify-swap-router-sbtc-stx.js
import fs from "node:fs";
import {
  uintCV,
  falseCV,
  someCV,
  noneCV,
  tupleCV,
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
if ((mktSrc.match(VERIFY_BLOCK) || []).length !== 3) throw new Error("expected 3 verify blocks (settle-with-refresh, fresh-classification-price, refresh-mid)");
mktSrc = mktSrc.replace(VERIFY_BLOCK, "true");
// The fork's Pyth storage is stale (~155 sats/STX while the AMMs trade near
// 332). Pin the market's storage reads to today's Pyth mid instead, so
// makers, limits and AMM prices all sit where they do on mainnet:
// BTC $110,000 and STX $0.3710 (expo -8) = 296,480.82 STX/BTC = 337.29 sats/STX.
const PX = 11_000_000_000_000n;
const PY = 37_101_908n;
const feedLit = (p) => `(ok { price: ${p}, conf: u0, expo: -8, ema-price: ${p}, ema-conf: u0, publish-time: stacks-block-time, prev-publish-time: u0 })`;
const STORAGE_READ = /\(contract-call\?\s*'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y\.pyth-storage-v4\s+get-price\s+\(var-get oracle-feed-(x|y)\)\s*\)/g;
const reads = (mktSrc.match(STORAGE_READ) || []).length;
if (reads < 6) throw new Error(`expected at least 6 storage reads, got ${reads}`);
console.log(`pinned ${reads} Pyth storage reads in the market to the sim mid`);
mktSrc = mktSrc.replace(STORAGE_READ, (m, xy) => feedLit(xy === "x" ? PX : PY));

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
  const MID = (PX * PP) / PY; // the mid the patched market settles at
  console.log(`deployer ${DEPLOYER}  px=${PX} py=${PY} mid=${MID}  (1 STX ~ ${(10n ** 16n) / MID} sats)\n`);

  const T = SBTC_DEPOSITOR_1; // sells sBTC through the wrapper
  const S = STX_DEPOSITOR_1; // sells STX through the wrapper; rests the Jing bid in W4

  const steps = [];
  const call = (sender, fn, args, cid = RID) => (b) =>
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const amts = (d, x, v) => tupleCV({ dlmm: uintCV(d), xyk: uintCV(x), velar: uintCV(v) });
  const ONES = amts(1n, 1n, 1n);
  const ZEROS = amts(0n, 0n, 0n);
  const NO_VAA = noneCV();
  const VAA = someCV(DUMMY_VAA);
  const NONE = noneCV();
  const fb = (venue) => someCV(uintCV(venue));
  // `amount` is the sum of the four legs unless a test overrides it
  const total = (jing, a) => jing + Object.values(a.value).reduce((t, cv) => t + BigInt(cv.value), 0n);
  const sellSbtc = (sender, jing, fallback, a, m, minOut, vaa = VAA, cid = RID, amount = total(jing, a)) =>
    call(sender, "swap-sbtc-for-stx", [uintCV(amount), uintCV(jing), uintCV(1n), vaa, fallback, a, m, uintCV(minOut)], cid);
  const sellStx = (sender, jing, fallback, a, m, minOut, vaa = VAA, cid = RID, amount = total(jing, a)) =>
    call(sender, "swap-stx-for-sbtc", [uintCV(amount), uintCV(jing), uintCV(HUGE), vaa, fallback, a, m, uintCV(minOut)], cid);
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
  tx("W1 zero split -> u3001", sellSbtc(T, 0n, NONE, ZEROS, ONES, 1n, NO_VAA), "(err u3001)");
  tx("W1 bad fallback -> u3003", sellSbtc(T, 0n, fb(9n), amts(1000n, 0n, 0n), ONES, 1n, NO_VAA), "(err u3003)");
  tx("W1 jing-amount without a vaa -> u3005", sellSbtc(T, 1000n, NONE, ZEROS, ONES, 1n, NO_VAA), "(err u3005)");
  tx("W1 split does not add up to amount -> u3004", sellSbtc(T, 0n, NONE, amts(1000n, 0n, 0n), ONES, 1n, NO_VAA, RID, 999n), "(err u3004)");
  tx("W1 amount u0 with a non-zero leg -> u3001", sellSbtc(T, 0n, NONE, amts(1000n, 0n, 0n), ONES, 1n, NO_VAA, RID, 0n), "(err u3001)");
  const g0s = sbtcOf(T, "W1 before"); const g0x = stxOf(T, "W1 before");
  tx("W1 total min-out too high -> u3002", sellSbtc(T, 0n, NONE, amts(3000n, 0n, 0n), ONES, HUGE, NO_VAA), "(err u3002)");
  tx("W1 DLMM minimum too high -> venue u2003", sellSbtc(T, 0n, NONE, amts(3000n, 0n, 0n), amts(HUGE, 1n, 1n), 1n, NO_VAA), "(err u2003)");
  tx("W1 XYK minimum too high -> xyk-core u1019/u1020 (direct, no helper)", sellSbtc(T, 0n, NONE, amts(0n, 3000n, 0n), amts(1n, HUGE, 1n), 1n, NO_VAA), (v) => v === "(err u1019)" || v === "(err u1020)");
  tx("W1 Velar minimum too high -> venue u107", sellSbtc(T, 0n, NONE, amts(0n, 0n, 3000n), amts(1n, 1n, HUGE), 1n, NO_VAA), "(err u107)");
  const g1s = sbtcOf(T, "W1 after"); const g1x = stxOf(T, "W1 after");
  tx("W1 Velar minimum u0 is floored, not refused", sellSbtc(T, 0n, NONE, amts(0n, 0n, 1000n), ZEROS, 1n, NO_VAA), okPrefix);
  // W1p: one-bin walk cannot absorb 0.05 BTC; DLMM returns in < amount, swap ok
  const p0s = sbtcOf(T, "W1p before"); const p0x = stxOf(T, "W1p before");
  const rp = tx("W1p DLMM stops short of amount -> partial ok", sellSbtc(T, 0n, NONE, amts(5_000_000n, 0n, 0n), ONES, 1n, NO_VAA, `${DEPLOYER}.${ROUTER_1STEP}`), okPrefix);
  const p1s = sbtcOf(T, "W1p after"); const p1x = stxOf(T, "W1p after");

  // =============== W2: sell sBTC, one venue, no book, vaa none ===============
  const w2 = [];
  for (const [name, a, amt] of [["DLMM", amts(5000n, 0n, 0n), 5000n], ["XYK", amts(0n, 3000n, 0n), 3000n], ["Velar", amts(0n, 0n, 3000n), 3000n]]) {
    const s0 = sbtcOf(T, `W2 ${name} before`); const x0 = stxOf(T, `W2 ${name} before`);
    const r = tx(`W2 sell ${amt} sats on ${name}`, sellSbtc(T, 0n, NONE, a, ONES, 1n, NO_VAA), (v) =>
      okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(jing-in u0)") && String(v).includes("(unsold u0)"));
    const s1 = sbtcOf(T, `W2 ${name} after`); const x1 = stxOf(T, `W2 ${name} after`);
    w2.push({ name, amt, s0, x0, s1, x1, r, key: `${name.toLowerCase()}-out` });
  }

  // =============== W3: sell STX, one venue, no book, vaa none ===============
  const w3 = [];
  for (const [name, a, amt] of [["DLMM", amts(10_000_000n, 0n, 0n), 10_000_000n], ["XYK", amts(0n, 5_000_000n, 0n), 5_000_000n], ["Velar", amts(0n, 0n, 5_000_000n), 5_000_000n]]) {
    const s0 = sbtcOf(S, `W3 ${name} before`); const x0 = stxOf(S, `W3 ${name} before`);
    const r = tx(`W3 sell ${amt} uSTX on ${name}`, sellStx(S, 0n, NONE, a, ONES, 1n, NO_VAA), (v) =>
      okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(unsold u0)"));
    const s1 = sbtcOf(S, `W3 ${name} after`); const x1 = stxOf(S, `W3 ${name} after`);
    w3.push({ name, amt, s0, x0, s1, x1, r, key: `${name.toLowerCase()}-out` });
  }

  // =============== W4: Jing + DLMM ===============
  const BID = 100_000_000n; // 100 STX at any price
  tx("W4 100 STX bid rests on Jing", depositY(S, BID, HUGE), `(ok u${BID})`);
  const m0 = sbtcOf(S, "W4 maker before");
  const t0s = sbtcOf(T, "W4 taker before"); const t0x = stxOf(T, "W4 taker before");
  const r4 = tx("W4 sell 5000 sats: 2000 Jing / 3000 DLMM", sellSbtc(T, 2000n, NONE, amts(3000n, 0n, 0n), ONES, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)") && String(v).includes("(jing-in u2000)") && String(v).includes("(dlmm-in u3000)") && String(v).includes("(unsold u0)"));
  const m1 = sbtcOf(S, "W4 maker after");
  const t1s = sbtcOf(T, "W4 taker after"); const t1x = stxOf(T, "W4 taker after");
  ev("W4 market cycle advanced by the taker", "(get-current-cycle)", "u1", CID);
  ev("W4 taker holds no x position", `(get-token-x-deposit u1 '${T})`, "u0", CID);
  ev("W4 maker bid rolled (100 STX minus the fill)", `(get-token-y-deposit u1 '${S})`, (v) => uintOf(v) > 0n && uintOf(v) < BID, CID);

  // =============== W5: empty book ===============
  tx("W5 maker cancels the rolled bid", call(S, "cancel-token-y-deposit", [wstxTrait, wstxAsset], CID), okPrefix);
  const f0s = sbtcOf(T, "W5 before"); const f0x = stxOf(T, "W5 before");
  tx("W5 all-Jing, fallback none, empty book fills nothing -> min-out backstop u3002", sellSbtc(T, 4000n, NONE, ZEROS, ONES, 1n), "(err u3002)");
  const f1s = sbtcOf(T, "W5 mid"); const f1x = stxOf(T, "W5 mid");
  const r5 = tx("W5 Jing 4000 + XYK 1000, fallback none: XYK runs, Jing amount stays home", sellSbtc(T, 4000n, NONE, amts(0n, 1000n, 0n), ONES, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(jing-in u0)") && String(v).includes("(xyk-in u1000)") && String(v).includes("(unsold u4000)"));
  const f2s = sbtcOf(T, "W5 after"); const f2x = stxOf(T, "W5 after");
  ev("W5 market cycle unchanged (failed leg rolled back)", "(get-current-cycle)", "u1", CID);
  ev("W5 no x position left on the market", `(get-token-x-deposit u1 '${T})`, "u0", CID);
  const h0s = sbtcOf(T, "W5f before"); const h0x = stxOf(T, "W5f before");
  const r5f = tx("W5f Jing mainly: 4000 Jing, fallback XYK, empty book -> all 4000 on XYK", sellSbtc(T, 4000n, fb(XYK), ZEROS, ONES, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(jing-in u0)") && String(v).includes("(xyk-in u4000)") && String(v).includes("(unsold u0)"));
  const h1s = sbtcOf(T, "W5f after"); const h1x = stxOf(T, "W5f after");

  // =============== W7: four legs ===============
  tx("W7a 100 STX bid rests on Jing", depositY(S, BID, HUGE), `(ok u${BID})`);
  const a0s = sbtcOf(T, "W7a before"); const a0x = stxOf(T, "W7a before");
  const r7a = tx("W7a sell 6000 sats: 2000 Jing / 1500 DLMM / 1500 XYK / 1000 Velar", sellSbtc(T, 2000n, NONE, amts(1500n, 1500n, 1000n), ONES, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)") && String(v).includes("(jing-in u2000)") && String(v).includes("(dlmm-in u1500)") &&
    String(v).includes("(xyk-in u1500)") && String(v).includes("(velar-in u1000)") && String(v).includes("(unsold u0)"));
  const a1s = sbtcOf(T, "W7a after"); const a1x = stxOf(T, "W7a after");
  ev("W7a taker holds no x position", `(get-token-x-deposit u2 '${T})`, "u0", CID);
  tx("W7a maker cancels the rolled bid", call(S, "cancel-token-y-deposit", [wstxTrait, wstxAsset], CID), okPrefix);
  const e0s = sbtcOf(T, "W7e before"); const e0x = stxOf(T, "W7e before");
  const r7e = tx("W7e jing u0 + vaa none: 800 DLMM / 700 XYK / 500 Velar", sellSbtc(T, 0n, NONE, amts(800n, 700n, 500n), ONES, 1n, NO_VAA), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(dlmm-in u800)") && String(v).includes("(xyk-in u700)") &&
    String(v).includes("(velar-in u500)") && String(v).includes("(unsold u0)"));
  const e1s = sbtcOf(T, "W7e after"); const e1x = stxOf(T, "W7e after");
  const ASK = 20_000n;
  tx("W7c 20000 sat ask rests on Jing", call(T, "deposit-token-x", [uintCV(ASK), uintCV(1n), DUMMY_VAA, sbtcTrait, sbtcAsset], CID), `(ok u${ASK})`);
  const c0s = sbtcOf(S, "W7c before"); const c0x = stxOf(S, "W7c before");
  const r7c = tx("W7c sell 12 STX: 5 Jing / 3 DLMM / 2 XYK / 2 Velar", sellStx(S, 5_000_000n, NONE, amts(3_000_000n, 2_000_000n, 2_000_000n), ONES, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)") && String(v).includes("(jing-in u5000000)") && String(v).includes("(dlmm-in u3000000)") &&
    String(v).includes("(xyk-in u2000000)") && String(v).includes("(velar-in u2000000)") && String(v).includes("(unsold u0)"));
  const c1s = sbtcOf(S, "W7c after"); const c1x = stxOf(S, "W7c after");
  ev("W7c taker holds no y position", `(get-token-y-deposit u3 '${S})`, "u0", CID);

  // =============== W8: market get-taker-capacity is tight ===============
  // x-taker view with the x side emptied: a 100 STX bid in range and a 50
  // STX bid at -0.5% (walkable inside the taker's limit, here u1 = any).
  // Capacity = 100 STX at the mid + 50 STX at its own limit, grossed up for
  // the rebate. The same formula in JS must match the read-only; selling
  // gross-cap + two min deposits is refused by the market (FOK u1023 caught,
  // jing-ok false, nothing moved); selling exactly gross-cap fills in full
  // (at most sub-min dust back), both bids consumed.
  const SCALE = PP * 100n;
  const L_LOW = (MID * 995n) / 1000n;
  const BID_LOW = 50_000_000n;
  const midCap8 = (BID * SCALE) / MID;
  const walkCap8 = (BID_LOW * SCALE) / L_LOW;
  const netCap8 = midCap8 + walkCap8;
  const g0 = (netCap8 * 10_000n) / 9_980n;
  const gross8 = g0 - (g0 * 20n) / 10_000n > netCap8 ? g0 - 1n : g0;
  tx("W8 T cancels its rolled ask so the x side is empty", call(T, "cancel-token-x-deposit", [sbtcTrait, sbtcAsset], CID), okPrefix);
  tx("W8 100 STX bid in range (S)", depositY(S, BID, HUGE), `(ok u${BID})`);
  // a fresh account funded by S: the walkable bid must belong to neither the
  // taker (the walk skips self) nor S (a second deposit merges + reprices)
  const M8 = getAddressFromPrivateKey("8".repeat(64) + "01", "mainnet");
  tx("W8 fund the low bidder with 60 STX", (b) => b.withSender(S).addSTXTransfer({ recipient: M8, amount: 60_000_000 }), () => true);
  tx("W8 50 STX bid at -0.5% (fresh maker)", call(M8, "deposit-token-y", [uintCV(BID_LOW), uintCV(L_LOW), DUMMY_VAA, wstxTrait, wstxAsset], CID), `(ok u${BID_LOW})`);
  ev("W8 get-storage-mid == the sim's mid", "(get-storage-mid)", `(ok u${MID})`, CID);
  tx("W8 refresh-mid with a vaa returns the mid (verify no-op'd in the patched market)", call(T, "refresh-mid", [someCV(DUMMY_VAA)], CID), `(ok u${MID})`);
  tx("W8 refresh-mid with none returns the mid", call(T, "refresh-mid", [noneCV()], CID), `(ok u${MID})`);
  ev(`W8 capacity at limit u1: mid ${midCap8} + walk ${walkCap8} -> gross ${gross8}`, `(get-taker-capacity u${MID} u1 true)`, (v) =>
    String(v).includes(`(gross-cap u${gross8})`) && String(v).includes(`(mid-cap u${midCap8})`) && String(v).includes(`(walk-cap u${walkCap8})`), CID);
  ev("W8 capacity at a limit above the low bid: walk-cap u0", `(get-taker-capacity u${MID} u${(MID * 998n) / 1000n} true)`, (v) =>
    String(v).includes("(walk-cap u0)") && String(v).includes(`(mid-cap u${midCap8})`), CID);
  ev("W8 capacity with the taker's limit out of range: mid-cap u0", `(get-taker-capacity u${MID} u${MID + 1n} true)`, (v) =>
    String(v).includes("(mid-cap u0)"), CID);
  const k0s = sbtcOf(T, "W8 before"); const k0x = stxOf(T, "W8 before");
  // one min deposit over still fills (the sub-min residual is refunded as
  // dust); two over leaves a residual >= min and the market refuses (FOK)
  tx(`W8 sell gross-cap + 2 min deposits (${gross8 + 2n * MIN_SBTC}) all via Jing -> FOK refused, jing-ok false`,
    sellSbtc(T, gross8 + 2n * MIN_SBTC, NONE, ZEROS, ONES, 1n), (v) =>
    okPrefix(v) === false && String(v).includes("(err u3002)"));
  const k1s = sbtcOf(T, "W8 mid"); const k1x = stxOf(T, "W8 mid");
  const r8 = tx(`W8 sell exactly gross-cap (${gross8}) all via Jing -> full fill`, sellSbtc(T, gross8, NONE, ZEROS, ONES, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)"));
  const k2s = sbtcOf(T, "W8 after"); const k2x = stxOf(T, "W8 after");
  ev("W8 S's bid fully cleared (dust at most)", `(get-token-y-deposit u5 '${S})`, (v) => uintOf(v) < MIN_STX, CID);
  ev("W8 low bid fully walked (dust at most)", `(get-token-y-deposit u5 '${M8})`, (v) => uintOf(v) < MIN_STX, CID);

  // =============== W9: smart swaps, split computed on chain ===============
  // The oracle is pinned at 337.29 sats/STX; the live AMMs trade near 332,
  // i.e. they pay ~1.6% MORE uSTX per sat than the mid. So for an sBTC
  // seller a limit 1% under the mid leaves ~2.6% of AMM room, a limit 2%
  // above the mid leaves none (and puts the taker out of the book's range);
  // for an STX seller the AMMs ask 1.6% above the mid, so its limit must
  // allow ~3% to reach them.
  const smartSbtc = (sender, amount, limit, vaa, minOut) =>
    call(sender, "smart-swap-sbtc-for-stx", [uintCV(amount), uintCV(limit), vaa, uintCV(minOut)]);
  const smartStx = (sender, amount, limit, vaa, minOut) =>
    call(sender, "smart-swap-stx-for-sbtc", [uintCV(amount), uintCV(limit), vaa, uintCV(minOut)]);
  const L_LOOSE = (MID * 90n) / 100n;  // 10% under the mid: every venue has room
  const L_TIGHT = (MID * 102n) / 100n; // 2% over the mid: no venue, taker out of range
  tx("W9 100 STX bid rests on Jing", depositY(S, BID, HUGE), `(ok u${BID})`);
  const n0s = sbtcOf(T, "W9a before"); const n0x = stxOf(T, "W9a before");
  const r9a = tx("W9a smart sell 40000 sats, loose limit: book to capacity, DLMM next, rest XYK/Velar", smartSbtc(T, 40_000n, L_LOOSE, VAA, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)") && String(v).includes("(unsold u0)"));
  const n1s = sbtcOf(T, "W9a after"); const n1x = stxOf(T, "W9a after");
  ev("W9a bid fully cleared (dust at most)", `(get-token-y-deposit u5 '${S})`, (v) => uintOf(v) < MIN_STX, CID);
  const r9b = tx("W9b smart sell 10000 sats, vaa none: no book leg, all XYK/Velar", smartSbtc(T, 10_000n, L_LOOSE, NO_VAA, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok false)") && String(v).includes("(jing-in u0)") && String(v).includes("(unsold u0)"));
  const n2s = sbtcOf(T, "W9b after"); const n2x = stxOf(T, "W9b after");
  const n3s = sbtcOf(T, "W9c before"); const n3x = stxOf(T, "W9c before");
  tx("W9c smart sell 5000 sats, tight limit, empty book: no venue respects it -> u3002", smartSbtc(T, 5000n, L_TIGHT, VAA, 1n), "(err u3002)");
  const n4s = sbtcOf(T, "W9c after"); const n4x = stxOf(T, "W9c after");
  // W9a's mid fill left S a few uSTX of pro-rata rounding dust, rolled under
  // S's name: to the market that is a resting position, and `swap` refuses
  // a caller who rests on the side it deposits (u1024). Cancel it first.
  tx("W9d S cancels its rolled dust so it can swap on the STX side", call(S, "cancel-token-y-deposit", [wstxTrait, wstxAsset], CID), okPrefix);
  const ASK9 = 20_000n;
  tx("W9d 20000 sat ask rests on Jing", call(T, "deposit-token-x", [uintCV(ASK9), uintCV(1n), DUMMY_VAA, sbtcTrait, sbtcAsset], CID), `(ok u${ASK9})`);
  const n5s = sbtcOf(S, "W9d before"); const n5x = stxOf(S, "W9d before");
  const L_STX = (MID * 103n) / 100n; // STX seller: 3% over the mid reaches the AMMs
  const r9d = tx("W9d smart sell 200 STX, limit 3% over the mid: book to capacity, DLMM next, rest XYK/Velar", smartStx(S, 200_000_000n, L_STX, VAA, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)") && String(v).includes("(unsold u0)"));
  const n6s = sbtcOf(S, "W9d after"); const n6x = stxOf(S, "W9d after");
  ev("W9d ask fully cleared (dust at most)", `(get-token-x-deposit u6 '${T})`, (v) => uintOf(v) < MIN_SBTC, CID);
  const L_NEAR = (MID * 99n) / 100n; // 1% under the mid, ~2.6% under the AMM spot
  // W9f: the four-venue happy path at today's prices, with the book walk boundary checked
  // from both sides. Three bids rest: S 100 STX at the mid (cleared at the
  // mid), M8 50 STX at -0.5% (outside the mid, INSIDE the limit: walked),
  // M9 40 STX at -2% (OUTSIDE the 1% limit: must be left alone).
  // 0.5 BTC at a limit 1% under the mid (~0.5 BTC of AMM room): Jing fills mid + walk to
  // the sat, DLMM bins until the limit, XYK + Velar their closed-form room,
  // unsold u0; M9 receives nothing, M8 and S are paid.
  tx("W9f S 100 STX bid at the mid", depositY(S, BID, HUGE), `(ok u${BID})`);
  tx("W9f top up M8", (b) => b.withSender(S).addSTXTransfer({ recipient: M8, amount: 60_000_000 }), () => true);
  const M9 = getAddressFromPrivateKey("9".repeat(64) + "01", "mainnet");
  tx("W9f fund M9", (b) => b.withSender(S).addSTXTransfer({ recipient: M9, amount: 50_000_000 }), () => true);
  const L_IN = (MID * 995n) / 1000n;  // inside the taker's limit -> walked
  const L_OUT = (MID * 98n) / 100n;   // 2% under, below the taker's 1% limit -> untouched
  tx("W9f M8 50 STX bid at -0.5% (walkable)", call(M8, "deposit-token-y", [uintCV(BID_LOW), uintCV(L_IN), DUMMY_VAA, wstxTrait, wstxAsset], CID), `(ok u${BID_LOW})`);
  tx("W9f M9 40 STX bid at -2% (outside the 1% limit)", call(M9, "deposit-token-y", [uintCV(40_000_000n), uintCV(L_OUT), DUMMY_VAA, wstxTrait, wstxAsset], CID), "(ok u40000000)");
  const jingNet9f = (BID * PP * 100n) / MID + (BID_LOW * PP * 100n) / L_IN;
  const jingGross9f = (() => { const g = (jingNet9f * 10_000n) / 9_980n; return g - (g * 20n) / 10_000n > jingNet9f ? g - 1n : g; })();
  const q0s = sbtcOf(T, "W9f before"); const q0x = stxOf(T, "W9f before");
  const m8s0 = sbtcOf(M8, "W9f M8 before"); const m9s0 = sbtcOf(M9, "W9f M9 before"); const s9s0 = sbtcOf(S, "W9f S before");
  const r9f = tx("W9f smart sell 0.5 BTC, limit 1% under the mid: Jing mid + walk, DLMM, XYK, Velar, unsold u0", smartSbtc(T, 50_000_000n, L_NEAR, VAA, 1n), (v) =>
    okPrefix(v) && String(v).includes("(jing-ok true)") && String(v).includes("(unsold u0)"));
  const q1s = sbtcOf(T, "W9f after"); const q1x = stxOf(T, "W9f after");
  const m8s1 = sbtcOf(M8, "W9f M8 after"); const m9s1 = sbtcOf(M9, "W9f M9 after"); const s9s1 = sbtcOf(S, "W9f S after");
  tx("W9f M9 cancels its untouched bid: the full 40 STX come back", call(M9, "cancel-token-y-deposit", [wstxTrait, wstxAsset], CID), "(ok u40000000)");

  // W9e: 3 BTC at the same limit right after W9f: the venues' room at this
  // limit is spent, so almost everything stays home; what still fills does
  // so at or above the limit and everything adds up.
  const n7s = sbtcOf(T, "W9e before"); const n7x = stxOf(T, "W9e before");
  const BIG = 300_000_000n; // 3 BTC: more than the DLMM holds inside 30 bins
  const r9e = tx("W9e smart sell 3 BTC, vaa none, same limit, venues' room spent by W9f: most stays home", smartSbtc(T, BIG, L_NEAR, NO_VAA, 0n), okPrefix);
  const n8s = sbtcOf(T, "W9e after"); const n8x = stxOf(T, "W9e after");

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
  const legs = (r) => ["jing-out", "dlmm-out", "xyk-out", "velar-out"].reduce((t, k) => t + field(r.raw, k), 0n);
  check("W1 reverts moved no sBTC", g1s.value - g0s.value, (d) => d === 0n);
  check("W1 reverts moved no STX", g1x.value - g0x.value, (d) => d === 0n);
  const soldP = field(rp.raw, "dlmm-in"), unsoldP = field(rp.raw, "unsold"), outP = field(rp.raw, "out");
  check("W1p partial: dlmm-in + unsold == 5000000", soldP + unsoldP, (t) => t === 5_000_000n && unsoldP > 0n && soldP > 0n);
  check(`W1p partial: sBTC delta == dlmm-in (${soldP}), unsold stayed home`, p0s.value - p1s.value, (d) => d === soldP);
  check(`W1p partial: STX grew by out (${outP})`, p1x.value - p0x.value, (d) => d === outP && d > 0n);
  for (const w of w2) {
    const out = field(w.r.raw, "out");
    check(`W2 ${w.name} sBTC delta == ${w.amt}`, w.s0.value - w.s1.value, (d) => d === w.amt);
    check(`W2 ${w.name} STX grew by out (${out})`, w.x1.value - w.x0.value, (d) => d === out && d > 0n);
    check(`W2 ${w.name} ${w.key} == out`, field(w.r.raw, w.key), (a) => a === out);
  }
  for (const w of w3) {
    const out = field(w.r.raw, "out");
    check(`W3 ${w.name} STX delta == ${w.amt}`, w.x0.value - w.x1.value, (d) => d === w.amt);
    check(`W3 ${w.name} sBTC grew by out (${out})`, w.s1.value - w.s0.value, (d) => d === out && d > 0n);
    check(`W3 ${w.name} ${w.key} == out`, field(w.r.raw, w.key), (a) => a === out);
  }
  // W4: 2000 gross -> rebate 4, net 1996, fee 1, ride 4 -> maker +1999 sats
  check("W4 maker paid net of fee + ride (1999)", m1.value - m0.value, (d) => d === 1999n);
  check("W4 taker sBTC delta == 5000", t0s.value - t1s.value, (d) => d === 5000n);
  const out4 = field(r4.raw, "out");
  check(`W4 taker STX grew by out (${out4})`, t1x.value - t0x.value, (d) => d === out4 && d > 0n);
  const jingStx = (1996n * MID) / (PP * 100n); // uSTX the mid fill pays before fee
  const jingOut4 = field(r4.raw, "jing-out");
  check(`W4 jing-out = mid fill net of fee (~${jingStx - jingStx / 1000n})`, jingOut4,
    (o) => o > 0n && o < out4 && o <= jingStx && o >= jingStx - jingStx / 1000n - 2n);
  check("W4 jing-out + dlmm-out == out", legs(r4), (t) => t === out4);
  check("W5 all-Jing revert moved no sBTC", f1s.value - f0s.value, (d) => d === 0n);
  check("W5 all-Jing revert moved no STX", f1x.value - f0x.value, (d) => d === 0n);
  const out5 = field(r5.raw, "out");
  check("W5 sBTC delta == 1000 (Jing's 4000 stayed home)", f1s.value - f2s.value, (d) => d === 1000n);
  check(`W5 STX grew by out (${out5})`, f2x.value - f1x.value, (d) => d === out5 && d > 0n);
  check("W5 out == xyk-out alone", field(r5.raw, "xyk-out"), (v) => v === out5);
  const out5f = field(r5f.raw, "out");
  check("W5f sBTC delta == 4000 (residual rerouted to XYK)", h0s.value - h1s.value, (d) => d === 4000n);
  check(`W5f STX grew by out (${out5f})`, h1x.value - h0x.value, (d) => d === out5f && d > 0n);
  check("W5f out == xyk-out alone", field(r5f.raw, "xyk-out"), (v) => v === out5f);
  const out7a = field(r7a.raw, "out");
  check("W7a sBTC delta == 6000", a0s.value - a1s.value, (d) => d === 6000n);
  check(`W7a STX grew by out (${out7a})`, a1x.value - a0x.value, (d) => d === out7a && d > 0n);
  check("W7a out == jing-out + dlmm-out + xyk-out + velar-out", legs(r7a), (t) => t === out7a);
  check("W7a every leg paid something", ["jing-out", "dlmm-out", "xyk-out", "velar-out"].map((k) => field(r7a.raw, k)), (a) => a.every((x) => x > 0n));
  const out7e = field(r7e.raw, "out");
  check("W7e sBTC delta == 2000", e0s.value - e1s.value, (d) => d === 2000n);
  check(`W7e STX grew by out (${out7e})`, e1x.value - e0x.value, (d) => d === out7e && d > 0n);
  check("W7e out == dlmm-out + xyk-out + velar-out", legs(r7e), (t) => t === out7e);
  const out7c = field(r7c.raw, "out");
  check("W7c STX delta == 12000000", c0x.value - c1x.value, (d) => d === 12_000_000n);
  check(`W7c sBTC grew by out (${out7c})`, c1s.value - c0s.value, (d) => d === out7c && d > 0n);
  check("W7c out == sum of the four legs", legs(r7c), (t) => t === out7c);
  check("W8 over-capacity revert moved no sBTC", k1s.value - k0s.value, (d) => d === 0n);
  check("W8 over-capacity revert moved no STX", k1x.value - k0x.value, (d) => d === 0n);
  const unsold8 = field(r8.raw, "unsold"), jingIn8 = field(r8.raw, "jing-in"), out8 = field(r8.raw, "out");
  check(`W8 exact: unsold is sub-min dust (${unsold8} < ${MIN_SBTC})`, unsold8, (d) => d < MIN_SBTC);
  check(`W8 exact: jing-in + unsold == gross-cap`, jingIn8 + unsold8, (t) => t === gross8);
  check(`W8 exact: sBTC delta == jing-in (${jingIn8})`, k1s.value - k2s.value, (d) => d === jingIn8);
  check(`W8 exact: STX grew by out (${out8})`, k2x.value - k1x.value, (d) => d === out8 && d > 0n);
  const out9a = field(r9a.raw, "out");
  check("W9a sBTC delta == 40000", n0s.value - n1s.value, (d) => d === 40_000n);
  check(`W9a STX grew by out (${out9a})`, n1x.value - n0x.value, (d) => d === out9a && d > 0n);
  check("W9a out == sum of the four legs", legs(r9a), (t) => t === out9a);
  const midGross9a = (() => { const net = (BID * PP * 100n) / MID; const g = (net * 10_000n) / 9_980n; return g - (g * 20n) / 10_000n > net ? g - 1n : g; })();
  check(`W9a book leg sized to the mid capacity (gross-cap ${midGross9a}, dust at most)`, field(r9a.raw, "jing-in"), (j) => j >= midGross9a - MIN_SBTC && j <= midGross9a);
  check("W9a DLMM took the remainder after the book (active bin + bins inside a loose limit)", field(r9a.raw, "dlmm-in"), (d) => d === 40_000n - field(r9a.raw, "jing-in"));
  check("W9a legs add up: jing-in + dlmm-in + xyk-in + velar-in == 40000", ["jing-in", "dlmm-in", "xyk-in", "velar-in"].reduce((t, k) => t + field(r9a.raw, k), 0n), (t) => t === 40_000n);
  const out9b = field(r9b.raw, "out");
  check("W9b sBTC delta == 10000", n1s.value - n2s.value, (d) => d === 10_000n);
  check(`W9b STX grew by out (${out9b})`, n2x.value - n1x.value, (d) => d === out9b && d > 0n);
  check("W9b dlmm-in + xyk-in + velar-in == 10000", ["dlmm-in", "xyk-in", "velar-in"].reduce((t, k) => t + field(r9b.raw, k), 0n), (t) => t === 10_000n);
  check("W9c revert moved no sBTC", n4s.value - n3s.value, (d) => d === 0n);
  check("W9c revert moved no STX", n4x.value - n3x.value, (d) => d === 0n);
  const out9e = field(r9e.raw, "out"), unsold9e = field(r9e.raw, "unsold");
  check(`W9e sBTC delta == 3 BTC - unsold (${unsold9e})`, n7s.value - n8s.value, (d) => d === 300_000_000n - unsold9e);
  check(`W9e STX grew by out (${out9e}, may be zero: the room is spent)`, n8x.value - n7x.value, (d) => d === out9e);
  check("W9e out == sum of the four legs", legs(r9e), (t) => t === out9e);
  // W9f already took every venue's room at this limit, so W9e finds only
  // what the pools regained; the point is that nothing exceeds the limit
  // and everything is accounted for
  check("W9e DLMM leg stayed inside the limit (dlmm-in < 3 BTC)", field(r9e.raw, "dlmm-in"), (d) => d < 300_000_000n);
  check("W9e most stayed home (every venue capped by the limit)", unsold9e, (d) => d > 200_000_000n);
  check("W9e legs + unsold == 3 BTC", ["dlmm-in", "xyk-in", "velar-in", "unsold"].reduce((t, k) => t + field(r9e.raw, k), 0n), (t) => t === 300_000_000n);
  // achieved price per leg vs the limit. selling sats: out uSTX / in sats
  // >= limit / 1e10; selling uSTX: out sats / in uSTX >= 1e10 / limit.
  // The router concedes ROUND_SLACK (2 units of input) on each venue
  // minimum so pool floor-rounding cannot trip it; the check allows exactly
  // that: the limit must hold on (in - 2).
  const SLACK = 2n;
  const legPriceOk = (tag, r, limit, sellSbtc) => {
    for (const v of ["jing", "dlmm", "xyk", "velar"]) {
      const i = field(r.raw, `${v}-in`), o = field(r.raw, `${v}-out`);
      if (i === 0n) continue;
      const a = i > SLACK ? i - SLACK : 0n;
      check(`${tag} ${v} price respects the limit within 2 units of input (${o}/${i})`, [a, o], ([a, b]) => sellSbtc ? b * PP * 100n >= a * limit : b * limit >= a * PP * 100n);
    }
  };
  legPriceOk("W9a", r9a, L_LOOSE, true);
  legPriceOk("W9b", r9b, L_LOOSE, true);
  legPriceOk("W9e", r9e, L_NEAR, true);
  const out9f = field(r9f.raw, "out");
  check("W9f sBTC delta == 0.5 BTC", q0s.value - q1s.value, (d) => d === 50_000_000n);
  check(`W9f STX grew by out (${out9f})`, q1x.value - q0x.value, (d) => d === out9f && d > 0n);
  check("W9f out == sum of the four legs", legs(r9f), (t) => t === out9f);
  check("W9f all four venues filled", ["jing-in", "dlmm-in", "xyk-in", "velar-in"].map((k) => field(r9f.raw, k)), (a) => a.every((x) => x > 0n));
  check("W9f legs add up to 0.5 BTC", ["jing-in", "dlmm-in", "xyk-in", "velar-in"].reduce((t, k) => t + field(r9f.raw, k), 0n), (t) => t === 50_000_000n);
  check(`W9f book leg == mid + walk capacity (gross ${jingGross9f}, dust at most)`, field(r9f.raw, "jing-in"), (j) => j >= jingGross9f - MIN_SBTC && j <= jingGross9f);
  check("W9f S (at the mid) was paid sBTC", s9s1.value - s9s0.value, (d) => d > 0n);
  check("W9f M8 (inside the limit) was walked and paid sBTC", m8s1.value - m8s0.value, (d) => d > 0n);
  check("W9f M9 (outside the limit) received nothing", m9s1.value - m9s0.value, (d) => d === 0n);
  legPriceOk("W9f", r9f, L_NEAR, true);
  const out9d = field(r9d.raw, "out");
  check("W9d STX delta == 200000000", n5x.value - n6x.value, (d) => d === 200_000_000n);
  check(`W9d sBTC grew by out (${out9d})`, n6s.value - n5s.value, (d) => d === out9d && d > 0n);
  check("W9d out == sum of the four legs", legs(r9d), (t) => t === out9d);
  check("W9d DLMM took the remainder after the book", field(r9d.raw, "dlmm-in"), (d) => d === 200_000_000n - field(r9d.raw, "jing-in"));
  legPriceOk("W9d", r9d, L_STX, false);
  const yGross9 = (() => { const net = (ASK9 * MID) / (PP * 100n); const g = (net * 10_000n) / 9_980n; return g - (g * 20n) / 10_000n > net ? g - 1n : g; })();
  check(`W9d book leg sized to the ask's capacity (gross-cap ${yGross9}, dust at most)`, field(r9d.raw, "jing-in"), (j) => j >= yGross9 - MIN_STX && j <= yGross9);

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
