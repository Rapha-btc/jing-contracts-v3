// PORTED TO markets-sbtc-stx-jing-v4 (Pyth Lazer): real signatures, ONLY the
// staleness window widened (this harness advances the clock by hours), one real
// signed Lazer update (PYTH_API_KEY) replaces the dummy VAA; feed ids u1/u45.
// Everything below is the v2 harness otherwise. Run: PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v4-gaps.js
// verify-markets-v2-gaps.js
// Self-verifying stxer mainnet-fork harness for the surface of
// markets-sbtc-stx-jing-v2 that no other harness called (README
// "What is left to test" 1, 2, 4 + the five uncovered public functions):
//
//   G1 operator role: set-paused / set-treasury / set-operator refuse a
//      non-operator (u1011); treasury and operator retarget; the OLD
//      operator loses set-paused after handover; round trip back.
//   G2 pause on close-deposits (b7cad2a, aibtc bounty): with a book resting
//      on both sides, pause -> deposit u1010, swap u1010, close-deposits
//      u1010, plain settle u1010; set-token-x-limit still works (README
//      note 9: limit edits move no funds); unpause -> close-deposits ok.
//   G3 settle entry points at a fixed oracle price: `settle` (no VAA) in
//      deposit phase u1003, wrong trait u1019; `close-and-settle-with-refresh`
//      closes then dies u1012 on a book with nothing in range on x, and the
//      close is unwound with it (phase back to deposit); public
//      close-deposits ok, second close u1016, plain `settle` u1012 (the
//      passive book never crosses: a live maker at or inside the mid is
//      refused at deposit with u1022 by the same comparison the settle
//      filter uses, so at a FIXED price a public settle can never clear.
//      Its clearing path needs a price move between deposit and settle,
//      i.e. two fresh VAAs - a Hermes key).
//   G4 u1024 on a fork: cancel-cycle rolls the stuck cycle, the x maker
//      rests in the new cycle, `swap` on the same side -> u1024, and
//      nothing moved (deposit, limit, balance, cycle).
//   G6 phase and guard codes the fork never saw: initialize twice u1018,
//      deposit below min u1001, swap of u0 u1001, cancel-cycle in deposit
//      phase u1003, then after a public close: deposit / cancel / set-limit /
//      reprice-or-swap in settle phase u1002, cancel-cycle before the
//      threshold u1014, after it ok (book rolls, cycle advances).
//   G5 rebate pot fully consumed (README 4): not a sim step. The cap branch
//      `(if (> r pending) pending r)` in execute-fill is unreachable: the
//      pot is charged 20 bps on the GROSS amount and the walk draws 20 bps
//      on at most the net remainder, so pending >= r always. Checked
//      exhaustively below for every gross <= 20,000 and every mid split.
//
// Hermes is key-gated, so this runs on the REAL prices resting in
// pyth-storage-v4 with the two sim-only source patches from the v3 sim
// pattern (MAX_STALENESS loosened, both verify-and-update calls no-op'd).
// `settle` (no VAA) is untouched by the patches: it always read storage.
//
// Run: npx tsx simulations/verify-markets-v2-gaps.js
import fs from "node:fs";
import {
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  trueCV,
  falseCV,
  noneCV,
  cvToString,
  cvToJSON,
  deserializeCV,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";
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
  "5555555555555555555555555555555555555555555555555555555555555555" + "01";
// DEPLOYED=1: run against the MAINNET deployments at chavita
// (markets-sbtc-stx-jingswap = v4, swap-router-sbtc-stx-jingswap = router v2)
// and the live jing-core-v3: nothing is deployed except test-only copies;
// verify + initialize run on the fork as chavita (mainnet still has to).
const DEPLOYED = process.env.DEPLOYED === "1";
const DEPLOYER = DEPLOYED ? "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22" : (getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet"));
const mkAddr = (n) =>
  getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");

const CORE = "jing-core-v3";
const MARKET_FILE = "markets-sbtc-stx-jing-v4"; // Pyth Lazer, UNPATCHED (the local source)
// This harness advances the clock by hours, which the live 80 s staleness
// window cannot survive, so in DEPLOYED mode it runs a test copy of the
// LIVE bytes (fetched from chain, only MAX_STALENESS widened) deployed under
// a test name; the deployed bytes are otherwise exercised as is.
const MARKET_LIVE = "markets-sbtc-stx-jingswap";
const MARKET = DEPLOYED ? `${MARKET_LIVE}-clock` : MARKET_FILE;
const CORE_ID = `${DEPLOYER}.${CORE}`;
const CID = `${DEPLOYER}.${MARKET}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

// gas-only mainnet address (~20 STX free), never the operator
const OUTSIDER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";

const MIN_SBTC = 1000n;
const MIN_STX = 1_000_000n;
const PP = 100_000_000n;
const HUGE = 999_999_999_999_999n;
const DEAD_X = HUGE; // ask nobody reaches
const LIVE_Y = HUGE; // bid at any price

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
let DUMMY_VAA = bufferCV(Buffer.from("00", "hex")); // replaced by the real Lazer update in main()

// ---- sources + sim-only patches ----
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
let mktSrc = fs.readFileSync(new URL(`../contracts/${MARKET_FILE}.clar`, import.meta.url), "utf8");
if (DEPLOYED) {
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/source/SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22/${MARKET_LIVE}?proof=0`);
  mktSrc = (await r.json()).source;
  console.log(`DEPLOYED: clock-test copy ${MARKET} built from the live ${MARKET_LIVE} bytes (${mktSrc.length} chars), MAX_STALENESS widened only`);
}
  // v4: signatures are REAL (a signed Lazer update, verified by the live
  // oracle). ONE sim-only patch remains here: MAX_STALENESS is widened,
  // because this harness advances the chain by 43 bitcoin blocks to reach
  // CANCEL_THRESHOLD and no update fetched at build time can be fresh for
  // a clock hours ahead. The 80 s window itself is proven in
  // verify-swap-router-v2-lazer.js (W10, stale fixture refused u1002).
  mktSrc = mktSrc.replace("(define-constant MAX_STALENESS u80)", "(define-constant MAX_STALENESS u999999999)");
  if (!mktSrc.includes("MAX_STALENESS u999999999")) throw new Error("staleness patch did not apply");

// ---- decode + assert ----
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try {
    return cvToString(deserializeCV(r.Ok.result));
  } catch (e) {
    return `decode-failed: ${e.message}`;
  }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try {
    return cvToString(deserializeCV(r.Ok));
  } catch {
    return r.Ok;
  }
}
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const okPrefix = (v) => String(v).startsWith("(ok");

let checks = 0;
let failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual).includes(want);
  if (ok) console.log(`  ok   ${label}: ${String(actual).slice(0, 90)}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}: got "${actual}" want "${want}"`);
  }
}

async function storedPrice(feedHex) {
  const [addr, name] = PYTH_STORAGE.split(".");
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/call-read/${addr}/${name}/get-price`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: addr, arguments: ["0x0200000020" + feedHex] }),
  });
  const d = await r.json();
  const j = cvToJSON(deserializeCV(d.result));
  return BigInt(j.value.value.price.value);
}

// G5: the crossed-maker rebate cap. pending = rebate - floor(rebate*xc/net),
// r = floor(20bps * (net - xc)); the branch needs r > pending.
function capBranchHits(maxGross) {
  let hits = 0;
  let worst = -Infinity;
  for (let A = 1000; A <= maxGross; A++) {
    const reb = Math.floor((A * 20) / 10000);
    const net = A - reb;
    for (let xc = 1; xc < net; xc++) {
      const pend = reb - Math.floor((reb * xc) / net);
      const r = Math.floor(((net - xc) * 20) / 10000);
      const d = r - pend;
      if (d > worst) worst = d;
      if (d > 0) hits += 1;
    }
  }
  return { hits, worst };
}

async function main() {
  console.log("=== markets-v2 GAPS SELF-VERIFYING stxer harness ===\n");
  const lz = await fetchLazerUpdate();
  DUMMY_VAA = bufferCV(Buffer.from(lz.hex, "hex"));
  console.log(`Lazer update ${lz.hex.length / 2} bytes, ts ${new Date(lz.ts * 1000).toISOString()}, expo ${lz.expo}; market UNPATCHED`);
  const px = lz.px, py = lz.py;
  const MID = (px * PP) / py;
  console.log(`deployer ${DEPLOYER}  px=${px} py=${py} mid=${MID}\n`);

  // ---- actors ----
  const OP2 = mkAddr(31); // second operator
  const TREAS = mkAddr(32); // new treasury (never transacts)
  const Y9 = mkAddr(33); // fresh y-taker for the paused swap

  const X_AMT = 2000n;
  const Y_AMT = 100_000_000n; // 100 STX

  // ---- builder helpers ----
  const steps = [];
  const call = (sender, fn, args, cid = CID) => (b) =>
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const depositX = (sender, amount, limit) =>
    call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset]);
  const depositY = (sender, amount, limit) =>
    call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), DUMMY_VAA, wstxTrait, wstxAsset]);
  const swap = (sender, amount, limit, depositXSide) =>
    call(sender, "swap", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, depositXSide ? trueCV() : falseCV()]);
  // v4 has no storage-only settle: the public settlement entry is
  // settle-with-refresh with a (fresh) Lazer update; the guard codes below
  // are the same asserts, reached after the price check
  const settle = (sender, txT = sbtcTrait, txN = sbtcAsset) =>
    call(sender, "settle-with-refresh", [DUMMY_VAA, txT, txN, wstxTrait, wstxAsset]);
  const closeAndSettle = (sender) =>
    call(sender, "close-and-settle-with-refresh", [DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]);
  const setPaused = (sender, p) => call(sender, "set-paused", [p ? trueCV() : falseCV()]);
  const setTreasury = (sender, who) => call(sender, "set-treasury", [standardPrincipalCV(who)]);
  const setOperator = (sender, who) => call(sender, "set-operator", [standardPrincipalCV(who)]);
  const stxSend = (to, amt) => (b) => b.withSender(STX_DEPOSITOR_1).addSTXTransfer({ recipient: to, amount: amt });

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  if (DEPLOYED) { const origDeploy = b.addContractDeploy.bind(b); b.addContractDeploy = (p) => (p.contract_name === CORE) ? b : origDeploy(p); }
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); };
  const ev = (label, code, want, cid = CID) => {
    b = b.addEvalCode(cid, code);
    steps.push({ label, kind: "eval", want });
  };
  const cap = (label, code, cid = CID) => {
    b = b.addEvalCode(cid, code);
    const slot = { label, kind: "eval", capture: true, value: null };
    steps.push(slot);
    return slot;
  };

  // ---- deploy ----
  if (!DEPLOYED) tx("deploy core", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc }), (v) => !String(v).includes("ERR"));
  tx("deploy market (patched)", (b) => b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), (v) => !String(v).includes("ERR"));
  tx("verify market in core", call(DEPLOYER, "set-verified-contract", [contractPrincipalCV(DEPLOYER, MARKET)], CORE_ID), "(ok true)");
  tx("initialize", call(DEPLOYER, "initialize", [
    contractPrincipalCV(DEPLOYER, MARKET),
    contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
    contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
    uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n),
  ]), "(ok true)");
  tx("fund OP2 gas", stxSend(OP2, 3_000_000), okPrefix);
  tx("fund Y9 gas + 2 STX", stxSend(Y9, 5_000_000), okPrefix);

  // =============== G1: operator role ===============
  tx("G1 outsider set-paused -> u1011", setPaused(OUTSIDER, true), "(err u1011)");
  tx("G1 outsider set-treasury -> u1011", setTreasury(OUTSIDER, OUTSIDER), "(err u1011)");
  tx("G1 outsider set-operator -> u1011", setOperator(OUTSIDER, OUTSIDER), "(err u1011)");
  ev("G1 not paused", "(var-get paused)", "false");
  ev("G1 operator is deployer", "(var-get operator)", DEPLOYER);
  ev("G1 treasury is deployer", "(var-get treasury)", DEPLOYER);
  tx("G1 operator set-treasury", setTreasury(DEPLOYER, TREAS), "(ok true)");
  ev("G1 treasury retargeted", "(var-get treasury)", TREAS);
  tx("G1 operator hands over to OP2", setOperator(DEPLOYER, OP2), "(ok true)");
  ev("G1 operator is OP2", "(var-get operator)", OP2);
  tx("G1 old operator set-paused -> u1011", setPaused(DEPLOYER, true), "(err u1011)");
  tx("G1 old operator set-operator -> u1011", setOperator(DEPLOYER, DEPLOYER), "(err u1011)");

  // =============== G2: pause gates close-deposits ===============
  tx("G2 x dead ask rests", depositX(SBTC_DEPOSITOR_1, X_AMT, DEAD_X), `(ok u${X_AMT})`);
  tx("G2 y live bid rests", depositY(STX_DEPOSITOR_1, Y_AMT, LIVE_Y), `(ok u${Y_AMT})`);
  tx("G2 OP2 pauses", setPaused(OP2, true), "(ok true)");
  ev("G2 paused", "(var-get paused)", "true");
  tx("G2 deposit while paused -> u1010", depositY(STX_DEPOSITOR_1, MIN_STX, LIVE_Y), "(err u1010)");
  tx("G2 swap while paused -> u1010", swap(Y9, 2_000_000n, HUGE, false), "(err u1010)");
  tx("G2 close-deposits while paused -> u1010", call(OUTSIDER, "close-deposits", []), "(err u1010)");
  tx("G2 plain settle while paused -> u1010", settle(OUTSIDER), "(err u1010)");
  ev("G2 still deposit phase", "(get-cycle-phase)", "u0");
  tx("G2 set-token-x-limit not gated by pause", call(SBTC_DEPOSITOR_1, "set-token-x-limit", [uintCV(DEAD_X - 1n), DUMMY_VAA]), "(ok true)");
  ev("G2 limit moved while paused", `(get-token-x-limit '${SBTC_DEPOSITOR_1})`, `u${DEAD_X - 1n}`);
  tx("G2 OP2 unpauses", setPaused(OP2, false), "(ok true)");
  ev("G2 unpaused", "(var-get paused)", "false");

  // =============== G3: settle entry points at a fixed price ===============
  tx("G3 settle in deposit phase -> u1003", settle(OUTSIDER), "(err u1003)");
  tx("G3 settle wrong x trait -> u1019", settle(OUTSIDER, wstxTrait, wstxAsset), "(err u1019)");
  tx("G3 close-and-settle-with-refresh: x empty at mid -> u1012", closeAndSettle(OUTSIDER), "(err u1012)");
  ev("G3 close unwound with the settle (phase u0)", "(get-cycle-phase)", "u0");
  ev("G3 deposits-closed-block still u0", "(var-get deposits-closed-block)", "u0");
  tx("G3 public close-deposits (outsider) ok", call(OUTSIDER, "close-deposits", []), "(ok true)");
  ev("G3 settle phase", "(get-cycle-phase)", "u2");
  tx("G3 second close -> u1016", call(OUTSIDER, "close-deposits", []), "(err u1016)");
  tx("G3 plain settle, x empty at mid -> u1012", settle(OUTSIDER), "(err u1012)");
  ev("G3 cycle unchanged u0", "(get-current-cycle)", "u0");
  ev("G3 x maker still in cycle 0", `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  ev("G3 y maker still in cycle 0", `(get-token-y-deposit u0 '${STX_DEPOSITOR_1})`, `u${Y_AMT}`);

  // =============== G4: u1024 on a fork ===============
  b = b.addAdvanceBlocks({ bitcoin_blocks: 43, stacks_blocks_per_bitcoin: 1 });
  tx("G4 cancel-cycle after threshold", call(OUTSIDER, "cancel-cycle", []), "(ok true)");
  ev("G4 cycle -> u1", "(get-current-cycle)", "u1");
  ev("G4 x maker rolled into u1", `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  const xBefore = cap("G4 x maker sbtc before", `(get-balance '${SBTC_DEPOSITOR_1})`, SBTC_FQN);
  tx("G4 swap on the resting side -> u1024", swap(SBTC_DEPOSITOR_1, 1500n, 1n, true), "(err u1024)");
  const xAfter = cap("G4 x maker sbtc after", `(get-balance '${SBTC_DEPOSITOR_1})`, SBTC_FQN);
  ev("G4 deposit untouched", `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  ev("G4 limit untouched", `(get-token-x-limit '${SBTC_DEPOSITOR_1})`, `u${DEAD_X - 1n}`);
  ev("G4 cycle still u1", "(get-current-cycle)", "u1");
  ev("G4 crossing flag false", "(var-get crossing)", "false");
  // the other side can still take: fresh y-taker swaps into nothing in range -> u1023, not u1024
  tx("G4 fresh y-taker has no position: passes u1024, dies u1023", swap(Y9, 2_000_000n, (MID * 101n) / 100n, false), "(err u1023)");

  // round trip the role
  tx("G1 OP2 hands back", setOperator(OP2, DEPLOYER), "(ok true)");
  ev("G1 operator is deployer again", "(var-get operator)", DEPLOYER);

  // =============== G6: phase + guard codes ===============
  // state: cycle u1, x ask 2000 @ DEAD_X-1 (SBTC_DEPOSITOR_1), y bid 100 STX (STX_DEPOSITOR_1)
  tx("G6 initialize twice -> u1018", call(DEPLOYER, "initialize", [
    contractPrincipalCV(DEPLOYER, MARKET),
    contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
    contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
    uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n),
  ]), "(err u1018)");
  tx("G6 x deposit below min -> u1001", depositX(SBTC_DEPOSITOR_1, MIN_SBTC - 1n, DEAD_X), "(err u1001)");
  tx("G6 y deposit below min -> u1001", depositY(Y9, MIN_STX - 1n, LIVE_Y), "(err u1001)");
  tx("G6 swap of u0 -> u1001", swap(Y9, 0n, HUGE, false), "(err u1001)");
  tx("G6 cancel-cycle in deposit phase -> u1003", call(OUTSIDER, "cancel-cycle", []), "(err u1003)");
  tx("G6 public close-deposits", call(OUTSIDER, "close-deposits", []), "(ok true)");
  tx("G6 y deposit in settle phase -> u1002", depositY(Y9, MIN_STX, LIVE_Y), "(err u1002)");
  tx("G6 x deposit in settle phase -> u1002", depositX(SBTC_DEPOSITOR_1, 1500n, DEAD_X), "(err u1002)");
  tx("G6 cancel resting y in settle phase -> u1002", call(STX_DEPOSITOR_1, "cancel-token-y-deposit", [wstxTrait, wstxAsset]), "(err u1002)");
  tx("G6 cancel resting x in settle phase -> u1002", call(SBTC_DEPOSITOR_1, "cancel-token-x-deposit", [sbtcTrait, sbtcAsset]), "(err u1002)");
  tx("G6 set-token-x-limit in settle phase -> u1002", call(SBTC_DEPOSITOR_1, "set-token-x-limit", [uintCV(DEAD_X), DUMMY_VAA]), "(err u1002)");
  tx("G6 set-token-y-limit in settle phase -> u1002", call(STX_DEPOSITOR_1, "set-token-y-limit", [uintCV(LIVE_Y - 1n), DUMMY_VAA]), "(err u1002)");
  tx("G6 reprice-or-swap-token-x in settle phase -> u1002", call(SBTC_DEPOSITOR_1, "reprice-or-swap-token-x", [uintCV(DEAD_X), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]), "(err u1002)");
  tx("G6 reprice-or-swap-token-y in settle phase -> u1002", call(STX_DEPOSITOR_1, "reprice-or-swap-token-y", [uintCV(LIVE_Y - 1n), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]), "(err u1002)");
  tx("G6 cancel-cycle before threshold -> u1014", call(OUTSIDER, "cancel-cycle", []), "(err u1014)");
  ev("G6 still cycle u1", "(get-current-cycle)", "u1");
  ev("G6 x deposit intact", `(get-token-x-deposit u1 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  b = b.addAdvanceBlocks({ bitcoin_blocks: 43, stacks_blocks_per_bitcoin: 1 });
  tx("G6 cancel-cycle after threshold", call(OUTSIDER, "cancel-cycle", []), "(ok true)");
  ev("G6 cycle -> u2", "(get-current-cycle)", "u2");
  ev("G6 x rolled to u2", `(get-token-x-deposit u2 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  ev("G6 y rolled to u2", `(get-token-y-deposit u2 '${STX_DEPOSITOR_1})`, `u${Y_AMT}`);
  ev("G6 back in deposit phase", "(get-cycle-phase)", "u0");

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
    if (st.capture) {
      st.value = uintOf(raw);
      console.log(`  ..   ${st.label}: ${raw}`);
    } else {
      check(st.label, raw, st.want);
    }
  }
  check("G4 x maker balance unchanged", xAfter.value - xBefore.value, (d) => d === 0n);

  // G5: exhaustive, off-chain
  const { hits, worst } = capBranchHits(20_000);
  check(`G5 rebate cap branch unreachable (gross<=20000, all mid splits; max r-pending=${worst})`, hits, (h) => h === 0 && worst <= 0);

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
