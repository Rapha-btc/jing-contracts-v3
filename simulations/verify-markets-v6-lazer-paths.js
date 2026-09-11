// PORTED TO markets-sbtc-stx-jing-v6 + jing-core-v5 (pegged orders): every
// limit-taking call passes `none` in the new spread-bps slot, nothing else
// changed. Generated from verify-markets-v4-lazer-paths.js.
// verify-markets-v6-lazer-paths.js
// The v4-specific paths the five ported harnesses do not reach, on real
// Lazer updates (PYTH_API_KEY): the two reachable oracle errors, the gate's
// "only read the price when there is something to cross" rule, and the
// read-onlys nobody called. Also documents which remaining error codes are
// defensive (cannot be produced by a signed update) or dead.
//
//   L1 refresh-mid with the full update -> the mid the sim computed.
//   L2 an update carrying BTC only -> u1023 ERR_FEED_MISSING (STX missing).
//   L3 an update carrying BTC + USDC (feeds 1, 7) -> u1023 (STX missing).
//   L4 an update fetched WITHOUT the confidence property -> u1004
//      ERR_PRICE_UNCERTAIN, on refresh-mid and on swap.
//   L5 deposit gate: a bid with the no-confidence update on an EMPTY x side
//      is accepted (no price read); once an ask rests, the same bid is
//      refused u1004 (the gate must read the price).
//   L6 read-onlys: get-min-deposits, would-take-as-x / -y truth at the
//      live mid, get-token-x-depositors, get-settlement after a settled
//      cycle. (No cycle clock any more: get-cycle-start-block and
//      get-blocks-elapsed are gone with the phase machinery.)
//   L7 settle-with-refresh is the public keeper entry (aa5d4bf): on an
//      empty cycle it dies u1009 nothing to settle. A settled cycle is never
//      the current one (advance-cycle runs in the same tx), so u1002
//      ERR_ALREADY_SETTLED is defensive.
//
// DEPLOYED=1 runs against SPV9K21…markets-sbtc-stx-jingswap (verify +
// initialize on the fork as chavita). Run:
//   PYTH_API_KEY=<key> [DEPLOYED=1] npx tsx simulations/verify-markets-v6-lazer-paths.js
import fs from "node:fs";
import { noneCV, uintCV, contractPrincipalCV, stringAsciiCV, bufferCV, trueCV, falseCV, cvToString, deserializeCV, getAddressFromPrivateKey } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate, fetchLazerUpdateOpts } from "./_lazer.js";
import { STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_ADDR, SBTC_NAME, SBTC_ASSET_NAME, WSTX_ADDR, WSTX_NAME, WSTX_ASSET_NAME } from "./_setup.js";

const DEPLOYED = process.env.DEPLOYED === "1";
const CHAVITA = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const DEPLOYER = DEPLOYED ? CHAVITA : getAddressFromPrivateKey("5".repeat(64) + "01", "mainnet");
const CORE = "jing-core-v5";
const MARKET_FILE = "markets-sbtc-stx-jing-v6";
const MARKET = DEPLOYED ? "markets-sbtc-stx-jingswap" : MARKET_FILE;
const CID = `${DEPLOYER}.${MARKET}`;
const CORE_ID = `${DEPLOYER}.${CORE}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const PP = 100_000_000n;
const MIN_SBTC = 1000n, MIN_STX = 1_000_000n, HUGE = 999_999_999_999_999n;
const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME), wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME), wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
const mktSrc = fs.readFileSync(new URL(`../contracts/${MARKET_FILE}.clar`, import.meta.url), "utf8").split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");

let checks = 0, failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual) === want;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 160)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 80) : want})`}`);
}
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);

async function main() {
  console.log("=== markets v4 Lazer paths ===");
  const full = await fetchLazerUpdate();
  const btcOnly = await fetchLazerUpdateOpts({ ids: [1] });
  const btcUsdc = await fetchLazerUpdateOpts({ ids: [1, 7] });
  const noConf = await fetchLazerUpdateOpts({ ids: [1, 45], properties: ["price", "exponent", "publisherCount"] });
  const noFut = await fetchLazerUpdateOpts({ ids: [1, 45], properties: ["price", "exponent", "confidence", "publisherCount"] });
  const U_NOFUT = bufferCV(Buffer.from(noFut.hex, "hex"));
  const FUT_X = BigInt(Math.floor(full.futX / 1e6)), FUT_Y = BigInt(Math.floor(full.futY / 1e6));
  console.log(`envelope ts ${Math.floor(full.ts)}; feedUpdateTimestamp BTC ${FUT_X} STX ${FUT_Y} (carried forward by ${Math.floor(full.ts) - Number(FUT_X)}s / ${Math.floor(full.ts) - Number(FUT_Y)}s)`);
  const UPD = bufferCV(Buffer.from(full.hex, "hex"));
  const U_BTC = bufferCV(Buffer.from(btcOnly.hex, "hex"));
  const U_BTC_USDC = bufferCV(Buffer.from(btcUsdc.hex, "hex"));
  const U_NOCONF = bufferCV(Buffer.from(noConf.hex, "hex"));
  const MID = (full.px * PP) / full.py;
  console.log(`mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats); updates: full ${full.hex.length / 2}B, btc-only ${btcOnly.hex.length / 2}B, btc+usdc ${btcUsdc.hex.length / 2}B, no-conf ${noConf.hex.length / 2}B; ${DEPLOYED ? "DEPLOYED " + CID : "local v4"}`);

  const S = STX_DEPOSITOR_1, T = SBTC_DEPOSITOR_1;
  const steps = [];
  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const call = (sender, fn, args, cid = CID) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); };
  const ev = (label, code, want, cid = CID) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); };
  const depositY = (sender, amount, limit, upd) => call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), noneCV(), upd, wstxTrait, wstxAsset]);
  const depositX = (sender, amount, limit, upd) => call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), noneCV(), upd, sbtcTrait, sbtcAsset]);
  const swap = (sender, amount, limit, upd, depX) => call(sender, "swap", [uintCV(amount), uintCV(limit), upd, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, depX ? trueCV() : falseCV()]);

  if (!DEPLOYED) {
    tx("deploy core", (bb) => bb.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc }), (v) => !String(v).includes("ERR"));
    tx("deploy market v4 (unpatched)", (bb) => bb.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), (v) => !String(v).includes("ERR"));
  }
  tx("verify market in core", call(DEPLOYER, "set-verified-contract", [contractPrincipalCV(DEPLOYER, MARKET)], CORE_ID), (v) => v === "(ok true)" || (DEPLOYED && v === "(err u5002)"));
  tx("initialize (feeds u1/u45)", call(DEPLOYER, "initialize", [contractPrincipalCV(DEPLOYER, MARKET), contractPrincipalCV(SBTC_ADDR, SBTC_NAME), contractPrincipalCV(WSTX_ADDR, WSTX_NAME), uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n)]), (v) => v === "(ok true)" || (DEPLOYED && v === "(err u1012)"));

  // L1-L4: the oracle paths
  tx("L1 refresh-mid with the full update -> mid", call(T, "refresh-mid", [UPD]), `(ok u${MID})`);
  tx("L2 refresh-mid with a BTC-only update -> u1023 feed missing", call(T, "refresh-mid", [U_BTC]), "(err u1023)");
  tx("L3 refresh-mid with BTC + USDC (no STX) -> u1023", call(T, "refresh-mid", [U_BTC_USDC]), "(err u1023)");
  tx("L4 refresh-mid with an update lacking confidence -> u1004", call(T, "refresh-mid", [U_NOCONF]), "(err u1004)");
  // L8: per-feed freshness. publish-time on each shaped feed must be the
  // feed's own feedUpdateTimestamp in seconds (what the 80s checks read),
  // not the envelope timestamp, and must sit inside MAX_STALENESS of the
  // chain clock the checks compare against.
  ev("L8 feed-x publish-time == BTC feedUpdateTimestamp (s)", `(get publish-time (get feed-x (unwrap-panic (lazer-feeds ${"0x" + full.hex}))))`, `u${FUT_X}`);
  ev("L8 feed-y publish-time == STX feedUpdateTimestamp (s)", `(get publish-time (get feed-y (unwrap-panic (lazer-feeds ${"0x" + full.hex}))))`, `u${FUT_Y}`);
  // the numbers the freshness asserts see, side by side
  ev("L8 freshness inputs", `(let ((feeds (unwrap-panic (lazer-feeds ${"0x" + full.hex}))) (min-freshness (- stacks-block-time u80))) { publish-time-x: (get publish-time (get feed-x feeds)), publish-time-y: (get publish-time (get feed-y feeds)), stacks-block-time: stacks-block-time, min-freshness: min-freshness, x-fresh: (> (get publish-time (get feed-x feeds)) min-freshness), y-fresh: (> (get publish-time (get feed-y feeds)) min-freshness) })`, (v) => {
    const g = (k) => (String(v).match(new RegExp(`\\(${k} (u?\\d+|true|false)\\)`)) || [])[1];
    console.log(`       publish-time-x   ${g("publish-time-x")}  (BTC feedUpdateTimestamp / 1e6)`);
    console.log(`       publish-time-y   ${g("publish-time-y")}  (STX feedUpdateTimestamp / 1e6)`);
    console.log(`       stacks-block-time ${g("stacks-block-time")}`);
    console.log(`       min-freshness    ${g("min-freshness")}  (stacks-block-time - MAX_STALENESS u80)`);
    console.log(`       publish-time-x > min-freshness: ${g("x-fresh")}   publish-time-y > min-freshness: ${g("y-fresh")}`);
    return g("x-fresh") === "true" && g("y-fresh") === "true";
  });
  // the exact test fresh-classification-price makes, on the feed's own time
  ev("L8 chain clock (stacks-block-time)", "stacks-block-time", (v) => { const d = Number(uintOf(v)) - Number(FUT_Y); console.log(`       (chain clock minus STX feed time: ${d}s)`); return Math.abs(d) < 80; });
  ev("L8 STX feed time passes MAX_STALENESS against the chain clock", `(> u${FUT_Y} (- stacks-block-time u80))`, "true");
  ev("L8 a feed time 81s older than the chain clock fails it", `(> (- stacks-block-time u81) (- stacks-block-time u80))`, "false");
  tx("L8 refresh-mid with an update lacking feedUpdateTimestamp -> u1025", call(T, "refresh-mid", [U_NOFUT]), "(err u1025)");
  // L6a read-onlys before any cycle activity
  ev("L6 get-min-deposits", "(get-min-deposits)", (v) => v.includes(`(min-token-x u${MIN_SBTC})`) && v.includes(`(min-token-y u${MIN_STX})`));
  // would-take-* also need a LIVE maker on the opposite side: false on an empty book
  ev("L6 would-take-as-x on an empty book -> false", `(would-take-as-x u${MID} u${(MID * 99n) / 100n})`, "false");
  ev("L6 would-take-as-y on an empty book -> false", `(would-take-as-y u${MID} u${(MID * 101n) / 100n})`, "false");
  ev("L6 get-settlement of an unsettled cycle -> none", "(get-settlement u0)", "none");
  // L5: the gate reads the price only when the opposite side has makers
  tx("L5 bid with the no-confidence update on an empty x side -> accepted (no price read)", depositY(S, 5_000_000n, HUGE, U_NOCONF), "(ok u5000000)");
  ev("L6 would-take-as-x with a live bid, floor under the mid -> true", `(would-take-as-x u${MID} u${(MID * 99n) / 100n})`, "true");
  ev("L6 would-take-as-x with a live bid, floor over the mid -> false", `(would-take-as-x u${MID} u${(MID * 101n) / 100n})`, "false");
  tx("L5 S cancels it", call(S, "cancel-token-y-deposit", [wstxTrait, wstxAsset]), "(ok u5000000)");
  tx("L5 T rests an ask (full update)", depositX(T, 20_000n, 1n, UPD), "(ok u20000)");
  ev("L6 get-token-x-depositors lists T", "(get-token-x-depositors u0)", (v) => v.includes(T));
  ev("L6 would-take-as-y with a live ask, cap over the mid -> true", `(would-take-as-y u${MID} u${(MID * 101n) / 100n})`, "true");
  ev("L6 would-take-as-y with a live ask, cap under the mid -> false", `(would-take-as-y u${MID} u${(MID * 99n) / 100n})`, "false");
  tx("L5 the same bid against a resting ask -> u1004 (the gate must read the price)", depositY(S, 5_000_000n, HUGE, U_NOCONF), "(err u1004)");
  tx("L4 swap with the no-confidence update -> u1004", swap(S, 5_000_000n, HUGE, U_NOCONF, false), "(err u1004)");
  // L6b/L7: a real settlement, then the read-onlys and the phase gate
  tx("L6 S swaps 5 STX into T's ask with the full update", swap(S, 5_000_000n, HUGE, UPD, false), (v) => String(v).startsWith("(ok"));
  ev("L6 cycle advanced to u1", "(get-current-cycle)", "u1");
  ev("L6 get-settlement u0 is some tuple", "(get-settlement u0)", (v) => v.startsWith("(some (tuple"));
  ev(`L6 get-settlement u0 clearing price == mid`, "(get-settlement u0)", (v) => v.includes(`u${MID}`));
  tx("L7 settle-with-refresh (public keeper entry) on an empty cycle -> u1009 nothing to settle", call(T, "settle-with-refresh", [UPD, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]), "(err u1009)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  let i = 0;
  for (const st of steps) {
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    i += 1;
    check(st.label, raw, st.want);
  }
  console.log("\n  defensive / dead codes (documented, not reachable with a signed update): u1002 ERR_ALREADY_SETTLED (the cycle advances in the same tx as its settle), u1006 ERR_ZERO_PRICE, u1014 ERR_EXPO_MISMATCH (both Lazer feeds carry expo -8), u1015 ERR_NOTHING_FILLED (never raised)");
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
