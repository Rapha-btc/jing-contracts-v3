// PORTED TO markets-sbtc-stx-jing-v6 + jing-core-v5 (pegged orders): every
// limit-taking call passes `none` in the new spread-bps slot, nothing else
// changed. Generated from verify-markets-v4-gaps.js.
// PORTED TO markets-sbtc-stx-jing-v4 (Pyth Lazer): real signatures, ONLY the
// staleness window widened (this harness advances the clock by hours), one real
// signed Lazer update (PYTH_API_KEY) replaces the dummy VAA; feed ids u1/u45.
// Everything below is the v2 harness otherwise. Run: PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v6-gaps.js
//
// REWRITTEN for 27e6f43 / aa5d4bf (phase machinery removed, cancel-cycle
// removed, error codes u1001..u1025): the market binds .jing-core-v5, so
// core-v4 is deployed here; the source is read with comment lines stripped
// (>80KB raw). There is no close and no phase any more: the book is open
// between txs and settle-with-refresh is the public keeper entry (swap and
// reprice-or-swap reach it internally). Scenarios that scripted a
// close-deposits, close-and-settle-with-refresh, cancel-cycle or a phase
// read were replaced or dropped as noted.
//
// verify-markets-v2-gaps.js
// Self-verifying stxer mainnet-fork harness for the surface of
// markets-sbtc-stx-jing-v2 that no other harness called (README
// "What is left to test" 1, 2, 4 + the five uncovered public functions):
//
//   G1 operator role: set-paused / set-treasury / set-operator refuse a
//      non-operator (u1008); treasury and operator retarget; the OLD
//      operator loses set-paused after handover; round trip back.
//   G2 pause gates the settle (b7cad2a, aibtc bounty): with a book resting
//      on both sides, pause -> deposit u1007, swap u1007, settle-with-refresh
//      u1007 (ERR_PAUSED is the first assert in execute-settlement);
//      set-token-x-limit still works (README note 9: limit edits move no
//      funds); unpause -> settle-with-refresh is past the pause gate and dies
//      u1009 on this book (nothing in range on x). (Was: outsider
//      close-deposits u1007 / ok, then close-and-settle-with-refresh.)
//   G3 settle entry points at a fixed oracle price: settle-with-refresh dies
//      u1009 on a book with nothing in range on x (the dead ask is
//      limit-rolled, the post-filter x total is under min and nobody is
//      crossing), wrong trait u1013; an outsider calling close-deposits is
//      REFUSED (no such function); cycle and both makers unchanged. (Dropped:
//      the phase / deposits-closed-block reads, the private-settle refusals
//      and the close-and-settle duplicate - none of it exists any more. The
//      passive book never crosses at a FIXED price: a live maker at or inside
//      the mid is refused at deposit with u1016 by the same comparison the
//      settle filter uses.)
//   G4 u1018 on a fork: the x maker rests in the current cycle, `swap` on
//      the same side -> u1018, and nothing moved (deposit, limit, balance,
//      cycle, crossing flag); a fresh y-taker passes u1018 and dies u1017.
//      (Was: cancel-cycle rolled the stuck cycle first; there is no stuck
//      cycle any more, so the maker rests in cycle u0 throughout.)
//   G6 guard codes the fork never saw: initialize twice u1012, deposit
//      below min u1001, swap of u0 u1001; outsider and deployer close-deposits
//      refused (no such function), cycle u0, x deposit intact; then the book
//      is never locked between txs: both makers cancel at will (funds back),
//      lists empty, settle-with-refresh on the empty book -> u1009 (raw
//      totals under min). (Dropped: cancel-cycle, the phase reads and the
//      settle-phase refusals - the phase no longer exists.)
//   G5 rebate pot fully consumed (README 4): not a sim step. The cap branch
//      `(if (> r pending) pending r)` in execute-fill is unreachable: the
//      pot is charged 20 bps on the GROSS amount and the walk draws 20 bps
//      on at most the net remainder, so pending >= r always. Checked
//      exhaustively below for every gross <= 20,000 and every mid split.
//
// Run: PYTH_API_KEY=<key> npx tsx simulations/verify-markets-v6-gaps.js
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

const CORE = "jing-core-v5"; // the v4 market binds .jing-core-v5
const MARKET_FILE = "markets-sbtc-stx-jing-v6"; // Pyth Lazer, UNPATCHED (the local source)
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
// the v4 market source is >80KB with comment lines: strip them for the deploy
const stripComments = (src) => src.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
let mktSrc = stripComments(fs.readFileSync(new URL(`../contracts/${MARKET_FILE}.clar`, import.meta.url), "utf8"));
if (!mktSrc.includes("(contract-call? .jing-core-v5")) throw new Error("market source does not bind .jing-core-v5");
if (DEPLOYED) {
  const r = await fetch(`${STACKS_NODE_API}/v2/contracts/source/SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22/${MARKET_LIVE}?proof=0`);
  mktSrc = (await r.json()).source;
  console.log(`DEPLOYED: clock-test copy ${MARKET} built from the live ${MARKET_LIVE} bytes (${mktSrc.length} chars), MAX_STALENESS widened only`);
}
  // v4: signatures are REAL (a signed Lazer update, verified by the live
  // oracle). ONE sim-only patch remains here: MAX_STALENESS is widened, so
  // the single update fetched at build time stays valid for the whole run
  // (this harness no longer advances the clock: cancel-cycle and its
  // CANCEL_THRESHOLD are gone). The 80 s window itself is proven in
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
// a call to a private function: the engine refuses it (rendered "(err none)"
// or an ENGINE-ERR string by the decoders above)
const refused = (v) => v === "(err none)" || String(v).includes("ENGINE-ERR");

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
    call(sender, "deposit-token-x", [uintCV(amount), uintCV(limit), noneCV(), DUMMY_VAA, sbtcTrait, sbtcAsset]);
  const depositY = (sender, amount, limit) =>
    call(sender, "deposit-token-y", [uintCV(amount), uintCV(limit), noneCV(), DUMMY_VAA, wstxTrait, wstxAsset]);
  const swap = (sender, amount, limit, depositXSide) =>
    call(sender, "swap", [uintCV(amount), uintCV(limit), DUMMY_VAA, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, depositXSide ? trueCV() : falseCV()]);
  // v4 has no storage-only settle: the public settlement entry (the keeper
  // path) is settle-with-refresh with a (fresh) Lazer update; the guard
  // codes below are the same asserts, reached after the trait + feed checks
  const settle = (sender, txT = sbtcTrait, txN = sbtcAsset) =>
    call(sender, "settle-with-refresh", [DUMMY_VAA, txT, txN, wstxTrait, wstxAsset]);
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
  tx("G1 outsider set-paused -> u1008", setPaused(OUTSIDER, true), "(err u1008)");
  tx("G1 outsider set-treasury -> u1008", setTreasury(OUTSIDER, OUTSIDER), "(err u1008)");
  tx("G1 outsider set-operator -> u1008", setOperator(OUTSIDER, OUTSIDER), "(err u1008)");
  ev("G1 not paused", "(var-get paused)", "false");
  ev("G1 operator is deployer", "(var-get operator)", DEPLOYER);
  ev("G1 treasury is deployer", "(var-get treasury)", DEPLOYER);
  tx("G1 operator set-treasury", setTreasury(DEPLOYER, TREAS), "(ok true)");
  ev("G1 treasury retargeted", "(var-get treasury)", TREAS);
  tx("G1 operator hands over to OP2", setOperator(DEPLOYER, OP2), "(ok true)");
  ev("G1 operator is OP2", "(var-get operator)", OP2);
  tx("G1 old operator set-paused -> u1008", setPaused(DEPLOYER, true), "(err u1008)");
  tx("G1 old operator set-operator -> u1008", setOperator(DEPLOYER, DEPLOYER), "(err u1008)");

  // =============== G2: pause gates the settle ===============
  tx("G2 x dead ask rests", depositX(SBTC_DEPOSITOR_1, X_AMT, DEAD_X), `(ok u${X_AMT})`);
  tx("G2 y live bid rests", depositY(STX_DEPOSITOR_1, Y_AMT, LIVE_Y), `(ok u${Y_AMT})`);
  tx("G2 OP2 pauses", setPaused(OP2, true), "(ok true)");
  ev("G2 paused", "(var-get paused)", "true");
  tx("G2 deposit while paused -> u1007", depositY(STX_DEPOSITOR_1, MIN_STX, LIVE_Y), "(err u1007)");
  tx("G2 swap while paused -> u1007", swap(Y9, 2_000_000n, HUGE, false), "(err u1007)");
  tx("G2 settle-with-refresh while paused -> u1007", settle(OUTSIDER), "(err u1007)");
  tx("G2 set-token-x-limit not gated by pause", call(SBTC_DEPOSITOR_1, "set-token-x-limit", [uintCV(DEAD_X - 1n), noneCV(), DUMMY_VAA]), "(ok true)");
  ev("G2 limit moved while paused", `(get-token-x-limit '${SBTC_DEPOSITOR_1})`, `u${DEAD_X - 1n}`);
  tx("G2 OP2 unpauses", setPaused(OP2, false), "(ok true)");
  ev("G2 unpaused", "(var-get paused)", "false");
  // unpaused: the settle is past the pause gate and dies on the book (x has
  // nothing in range at the mid), not on the pause
  tx("G2 unpaused settle-with-refresh: past the pause gate, x empty at mid -> u1009", settle(OUTSIDER), "(err u1009)");

  // =============== G3: settle entry points at a fixed price ===============
  tx("G3 settle-with-refresh: x empty at mid -> u1009", settle(OUTSIDER), "(err u1009)");
  tx("G3 settle-with-refresh wrong trait -> u1013", settle(OUTSIDER, wstxTrait, wstxAsset), "(err u1013)");
  tx("G3 outsider close-deposits REFUSED (no such function)", call(OUTSIDER, "close-deposits", []), refused);
  ev("G3 cycle unchanged u0", "(get-current-cycle)", "u0");
  ev("G3 x maker still in cycle 0", `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  ev("G3 y maker still in cycle 0", `(get-token-y-deposit u0 '${STX_DEPOSITOR_1})`, `u${Y_AMT}`);

  // =============== G4: u1018 on a fork ===============
  // no cancel-cycle any more: nothing is stuck, the x maker simply rests in
  // the current cycle (u0) and a swap on the same side is refused
  ev("G4 cycle u0", "(get-current-cycle)", "u0");
  ev("G4 x maker resting in u0", `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  const xBefore = cap("G4 x maker sbtc before", `(get-balance '${SBTC_DEPOSITOR_1})`, SBTC_FQN);
  tx("G4 swap on the resting side -> u1018", swap(SBTC_DEPOSITOR_1, 1500n, 1n, true), "(err u1018)");
  const xAfter = cap("G4 x maker sbtc after", `(get-balance '${SBTC_DEPOSITOR_1})`, SBTC_FQN);
  ev("G4 deposit untouched", `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  ev("G4 limit untouched", `(get-token-x-limit '${SBTC_DEPOSITOR_1})`, `u${DEAD_X - 1n}`);
  ev("G4 cycle still u0", "(get-current-cycle)", "u0");
  ev("G4 crossing flag false", "(var-get crossing)", "false");
  // the other side can still take: fresh y-taker swaps into nothing in range -> u1017, not u1018
  tx("G4 fresh y-taker has no position: passes u1018, dies u1017", swap(Y9, 2_000_000n, (MID * 101n) / 100n, false), "(err u1017)");

  // round trip the role
  tx("G1 OP2 hands back", setOperator(OP2, DEPLOYER), "(ok true)");
  ev("G1 operator is deployer again", "(var-get operator)", DEPLOYER);

  // =============== G6: guard codes ===============
  // state: cycle u0, x ask 2000 @ DEAD_X-1 (SBTC_DEPOSITOR_1), y bid 100 STX (STX_DEPOSITOR_1)
  tx("G6 initialize twice -> u1012", call(DEPLOYER, "initialize", [
    contractPrincipalCV(DEPLOYER, MARKET),
    contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
    contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
    uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n),
  ]), "(err u1012)");
  tx("G6 x deposit below min -> u1001", depositX(SBTC_DEPOSITOR_1, MIN_SBTC - 1n, DEAD_X), "(err u1001)");
  tx("G6 y deposit below min -> u1001", depositY(Y9, MIN_STX - 1n, LIVE_Y), "(err u1001)");
  tx("G6 swap of u0 -> u1001", swap(Y9, 0n, HUGE, false), "(err u1001)");
  // there is no close at all: the engine refuses the call (no such public
  // function) and the book stays open
  tx("G6 outsider close-deposits REFUSED (no such function)", call(OUTSIDER, "close-deposits", []), refused);
  tx("G6 deployer close-deposits REFUSED too (no operator backdoor)", call(DEPLOYER, "close-deposits", []), refused);
  ev("G6 still cycle u0", "(get-current-cycle)", "u0");
  ev("G6 x deposit intact", `(get-token-x-deposit u0 '${SBTC_DEPOSITOR_1})`, `u${X_AMT}`);
  // and so the book is never locked between txs: both makers cancel at will
  const yMakerBefore = cap("G6 y maker stx before cancel", `(stx-get-balance '${STX_DEPOSITOR_1})`);
  tx("G6 y maker cancels (book always open)", call(STX_DEPOSITOR_1, "cancel-token-y-deposit", [wstxTrait, wstxAsset]), `(ok u${Y_AMT})`);
  const yMakerAfter = cap("G6 y maker stx after cancel", `(stx-get-balance '${STX_DEPOSITOR_1})`);
  const xMakerBefore = cap("G6 x maker sbtc before cancel", `(get-balance '${SBTC_DEPOSITOR_1})`, SBTC_FQN);
  tx("G6 x maker cancels (book always open)", call(SBTC_DEPOSITOR_1, "cancel-token-x-deposit", [sbtcTrait, sbtcAsset]), `(ok u${X_AMT})`);
  const xMakerAfter = cap("G6 x maker sbtc after cancel", `(get-balance '${SBTC_DEPOSITOR_1})`, SBTC_FQN);
  ev("G6 y list empty", "(len (get-token-y-depositors u0))", "u0");
  ev("G6 x list empty", "(len (get-token-x-depositors u0))", "u0");
  tx("G6 settle-with-refresh on the empty book -> u1009 (raw totals under min)", settle(OUTSIDER), "(err u1009)");
  ev("G6 cycle u0", "(get-current-cycle)", "u0");

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
  check(`G6 y maker refund landed (100 STX minus gas)`, yMakerAfter.value - yMakerBefore.value, (d) => d > Y_AMT - 1_000_000n && d <= Y_AMT);
  check(`G6 x maker refund landed (${X_AMT} sats)`, xMakerAfter.value - xMakerBefore.value, (d) => d === X_AMT);

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
