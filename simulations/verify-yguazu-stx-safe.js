// verify-yguazu-stx-safe.js
// stxer harness for the v2-3 stack: rfq-sbtc-stx-jing-v2-3 (market with the
// TWO-STEP client whitelist) + yguazu-stx-safe (desk safe with the TIMELOCKED
// rfq-operator rotation, operator preset to BE account 3). Both are deployed
// on a mainnet fork from the EXACT faktory-dao template strings the BE ships,
// so the deploy-name transforms (yguazu-stx-safe self-registration in onboard,
// v2-3 hard refs, SP3SPS... operator preset) are exercised byte-exact.
//
// Proves, on one pinned fork:
//   market delta vs v2-2:
//   - initialize seeds the genesis clients (friedger + fast-pool rewards) and
//     a genesis client can open immediately
//   - set-client-whitelist is GONE; adding is propose (client-admin only) ->
//     u144 burn-block cooldown -> confirm (client-admin only); pending is NOT
//     whitelisted; confirm early u2019; cancel clears; confirm/cancel with
//     nothing pending u2018; revoke is INSTANT
//   safe delta vs jing-stx-safe:
//   - rfq-operator preset to BE account 3 (deployer V9 fix -> u4001)
//   - rotation: propose (admin-only) -> cooldown -> confirm; cancel; u4012 /
//     u4029; after confirm the OLD operator is dead and the NEW operator runs
//     the FULL money path (open -> fix moves 0 uSTX -> fulfill exact deltas)
//   - admin kill-switch u4028 both ways; leaked-operator containment
//
// Simulator constraints (empirically verified):
//   - the native oracle CANNOT run after addAdvanceBlocks: sample offset u1
//     hits a synthesized tenure with no burnchain data and the node lookup
//     dies as HTTP 400 "BlockingError". The post-advance money path therefore
//     runs with the fat-finger band DISABLED (set-band-enabled false -- the
//     operator kill-switch that exists exactly for "get-native-price starts
//     erroring"); when the band is off the oracle is never read. Band-ON fix
//     coverage lives in verify-rfq-sbtc-stx-jing-v2.js (83/83) + the
//     jing-stx-safe run -- that code is byte-identical here.
//   - advanced blocks stamp burn-tenure time +1s/block, NOT stacks tip time;
//     the probe MEASURES stacks-block-time after the same advance (same
//     pinned height -> identical), and post-advance quotes sign ref =
//     measured - 60 to sit mid-window of MAX_REF_STALENESS u120.
//   - the sim pins tip-5 via useBlockHeight (fresh-tip pins 400).
//
// Run: npx tsx simulations/verify-yguazu-stx-safe.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  uintCV, bufferCV, stringAsciiCV, standardPrincipalCV, contractPrincipalCV,
  noneCV, trueCV, falseCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult, getTip } from "stxer";
import {
  STX_DEPOSITOR_1, SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN,
  buildRfqAuthHashHexV2, signIntent, TEST_INTENT_PRIVKEY, TEST_INTENT_PUBKEY_HEX,
} from "./_setup.js";

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const V9 = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // deployer/market operator/core owner
const FAKFUN = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK";
const CHAVITA = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // safe owner/admin in this sim
const RANDO = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT";  // also the ROTATED-TO operator
const OPERATOR = "SP3SPSJDYGHF0ARGV1TNS0HX6JEP7T1J684QY7JVZ"; // BE account 3: initial rfq-operator
const FRIEDGER = "SP3KJBWTS3K562BF5NXWG5JC8W90HEG7WPYH5B97X";  // genesis client
const FASTPOOL = "SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP"; // genesis client (rewards addr)
const MM2 = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E";       // future MM for the two-step tests
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const CLIENT_ADMIN_PRIVKEY = "4444444444444444444444444444444444444444444444444444444444444444" + "01";
const CLIENT_ADMIN = getAddressFromPrivateKey(CLIENT_ADMIN_PRIVKEY, "mainnet");
const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");

const MARKET = "rfq-sbtc-stx-jing-v2-3";
const SAFE = "yguazu-stx-safe";
const MARKET_ID = `${V9}.${MARKET}`;
const SAFE_ID = `${V9}.${SAFE}`;
const CORE_ID = `${V9}.jing-core-v2`;
const WCORE_ID = `${V9}.fakfun-wallet-core`;
// the LIVE v2-2 market: same price/oracle code, used only to probe
const LIVE_V22_ID = `${V9}.rfq-sbtc-stx-jing-v2-2`;
const marketCV = contractPrincipalCV(V9, MARKET);
const safeCV = contractPrincipalCV(V9, SAFE);

const SBTC_IN = 200_000n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";
const BIG_THRESHOLD = 1_000_000_000_000n;
const COOLDOWN = 144n; // safe wallet cooldown-period AND market CLIENT_WHITELIST_COOLDOWN

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(__dirname, "..", "..", "faktory-dao", "backend", "server", "utils");

// the EXACT template string the BE deploys (between the const's backticks)
function templateSource(file) {
  const ts = fs.readFileSync(path.join(TEMPLATES, file), "utf8");
  const src = ts.slice(ts.indexOf("`") + 1, ts.lastIndexOf("`"));
  if (src.length < 10_000) throw new Error(`${file}: template looks empty`);
  return src;
}

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const balStx = (a) => `(stx-get-balance '${a})`;
const balSbtc = (a) => `(contract-call? '${SBTC_FQN} get-balance '${a})`;
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");
const decodeTx = (s) => {
  const r = s?.Result?.Transaction; if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
};
const decodeEval = (s) => {
  const r = s?.Result?.Eval; if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
};

// probe the LIVE v2-2 (identical price code) pinned to `height`: native
// price, tip time, and MEASURED stacks-block-time after the same advance
async function probe(height) {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API }).useBlockHeight(height);
  pb.addEvalCode(LIVE_V22_ID, "(get-native-price)");
  pb.addEvalCode(LIVE_V22_ID, "stacks-block-time");
  pb.addAdvanceBlocks({ bitcoin_blocks: Number(COOLDOWN) + 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
  pb.addEvalCode(LIVE_V22_ID, "stacks-block-time");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const price = uintFrom(decodeEval(res.steps[0]));
  const tipTime = uintFrom(decodeEval(res.steps[1]));
  const postAdvanceTime = uintFrom(decodeEval(res.steps[3]));
  if (price <= 0n || tipTime <= 0n || postAdvanceTime <= 0n) {
    throw new Error(`probe failed: price=${price} tip=${tipTime} post=${postAdvanceTime}`);
  }
  return { price, tipTime, postAdvanceTime };
}

async function main() {
  console.log("=== v2-3 stack harness: two-step client whitelist market + yguazu-stx-safe ===\n");
  const marketSrc = templateSource("rfq-sbtc-stx-jing-v2-3-template.ts");
  const safeSrc = templateSource("yguazu-stx-safe-template.ts");
  const tip = await getTip();
  const HEIGHT = Number(tip.block_height) - 5;
  const { price: nativePrice, tipTime, postAdvanceTime } = await probe(HEIGHT);
  const mid = (SBTC_IN * nativePrice) / 10_000_000_000n;
  const cOk = (mid * 9950n) / 10000n;
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  const ref2 = postAdvanceTime - 60n; // mid-window of MAX_REF_STALENESS u120
  console.log(`pin=${HEIGHT} tipTime=${tipTime} postAdvanceTime=${postAdvanceTime} native=${nativePrice} cOk=${cOk}\n`);

  // fresh fork-deployed market: friedger opens id 0; CLIENT opens ids 1, 2
  const sig = (rfqId) => signIntent(
    buildRfqAuthHashHexV2({
      market: marketCV, rfqId, winner: safeCV, quotedOut: cOk,
      refPrice: nativePrice, refTimestamp: ref2, refVenue: REF_VENUE, authExpiry: AUTH_BIG,
    }, CHAIN), TEST_INTENT_PRIVKEY);
  const sig1 = sig(1n);
  const sig2 = sig(2n);

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API }).useBlockHeight(HEIGHT);
  const call = (label, sender, cid, fn, args, expect) => {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  };
  const evalc = (label, cid, code, capture) => { b.addEvalCode(cid, code); plan.push({ kind: "eval", label, capture }); };
  const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
  const deploy = (name, src) => {
    b.withSender(V9).addContractDeploy({ contract_name: name, source_code: src });
    plan.push({ kind: "deploy", label: `deploy ${V9}.${name}` });
  };
  const fixArgs = (id, sigHex, refTs) => [
    uintCV(id), uintCV(cOk), uintCV(cOk), uintCV(nativePrice), uintCV(refTs),
    stringAsciiCV(REF_VENUE), uintCV(AUTH_BIG), bv(sigHex)];
  const openArgs = () => [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const ffSafe = (id) => [uintCV(id), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const onboardArgs = [bv(TEST_INTENT_PUBKEY_HEX), standardPrincipalCV(CHAVITA), noneCV(), uintCV(BIG_THRESHOLD), uintCV(BIG_THRESHOLD)];
  const BOGUS = 999_999n;

  // ================= deploy the EXACT BE template strings =================
  deploy(MARKET, marketSrc);
  deploy(SAFE, safeSrc); // hard-refs the market: MUST deploy after it

  // ================= market bring-up (mirrors init-rfq-v2 flow) =================
  call("jing-core-v2.set-verified(v2-3)", V9, CORE_ID, "set-verified-contract", [marketCV], "(ok true)");
  call("market.initialize (client-admin cold key, seeds genesis clients)", V9, MARKET_ID, "initialize",
    [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0), standardPrincipalCV(CLIENT_ADMIN)], "(ok true)");
  evalc("genesis client friedger whitelisted", MARKET_ID, `(is-whitelisted-client '${FRIEDGER})`, "GEN1");
  evalc("genesis client fast-pool rewards whitelisted", MARKET_ID, `(is-whitelisted-client '${FASTPOOL})`, "GEN2");
  evalc("genesis MM = yguazu-stx-safe whitelisted", MARKET_ID, `(is-whitelisted-mm '${SAFE_ID})`, "GENMM");
  evalc("CLIENT not whitelisted", MARKET_ID, `(is-whitelisted-client '${CLIENT})`, "CW0");

  // ================= safe bring-up (no MM whitelisting needed: genesis) =================
  call("wallet-core.set-verified(yguazu-stx-safe)", V9, WCORE_ID, "set-verified-contract", [safeCV, noneCV()], null);
  call("onboard by FAKFUN -> ok (self-registers yguazu-stx-safe)", FAKFUN, SAFE_ID, "onboard", onboardArgs, "(ok true)");
  evalc("rfq-operator (preset to BE account 3)", SAFE_ID, "(get-rfq-operator)", "OPR");
  evalc("rfq-enabled (default true)", SAFE_ID, "(get-rfq-enabled)", "ENABLED");
  evalc("pending-rfq-operator (default none)", SAFE_ID, "(get-pending-rfq-operator)", "PEND0");

  // ================= funding =================
  call("fund friedger sBTC", SBTC_WHALE, SBTC_FQN, "transfer",
    [uintCV(300_000), standardPrincipalCV(SBTC_WHALE), standardPrincipalCV(FRIEDGER), noneCV()], null);
  call("fund CLIENT sBTC", SBTC_WHALE, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_WHALE), standardPrincipalCV(CLIENT), noneCV()], null);
  b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: SAFE_ID, amount: Number(2n * cOk + 5_000_000n) });
  plan.push({ kind: "tx", label: "fund safe STX", expect: null });

  // ================= genesis client can open right away =================
  call("friedger open rfq0 (genesis, no cooldown)", FRIEDGER, MARKET_ID, "open-rfq", openArgs(), "(ok u0)");

  // ================= TWO-STEP client whitelist =================
  call("CLIENT open before whitelist -> u2017", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(err u2017)");
  call("propose-client by market OPERATOR (V9) -> u1022", V9, MARKET_ID, "propose-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u1022)");
  call("propose-client by rando -> u1022", RANDO, MARKET_ID, "propose-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u1022)");
  call("propose-client by client-admin -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(ok true)");
  evalc("pending-client recorded", MARKET_ID, `(get-pending-client '${CLIENT})`, "PC1");
  call("CLIENT open while PENDING -> still u2017", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(err u2017)");
  call("confirm-client early -> u2019 (in cooldown)", CLIENT_ADMIN, MARKET_ID, "confirm-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u2019)");
  call("confirm-client by V9 -> u1022", V9, MARKET_ID, "confirm-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u1022)");
  call("cancel-client by rando -> u1022", RANDO, MARKET_ID, "cancel-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u1022)");
  call("cancel-client by market OPERATOR (V9) -> ok (dual veto)", V9, MARKET_ID, "cancel-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(ok true)");
  evalc("pending cleared after operator veto", MARKET_ID, `(get-pending-client '${CLIENT})`, "PC2");
  call("confirm-client with nothing pending -> u2018", CLIENT_ADMIN, MARKET_ID, "confirm-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u2018)");
  call("cancel-client with nothing pending -> u2018", CLIENT_ADMIN, MARKET_ID, "cancel-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u2018)");
  call("re-propose-client by client-admin -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(ok true)");
  call("cancel-client by client-admin -> ok", CLIENT_ADMIN, MARKET_ID, "cancel-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(ok true)");
  call("re-propose-client (final, for the post-cooldown confirm) -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(ok true)");

  // ================= TWO-STEP MM whitelist (mirror, operator-owned) =================
  call("propose-mm by rando -> u1011", RANDO, MARKET_ID, "propose-mm-whitelist",
    [standardPrincipalCV(MM2)], "(err u1011)");
  call("propose-mm by client-admin -> u1011", CLIENT_ADMIN, MARKET_ID, "propose-mm-whitelist",
    [standardPrincipalCV(MM2)], "(err u1011)");
  call("propose-mm(MM2) by operator -> ok", V9, MARKET_ID, "propose-mm-whitelist",
    [standardPrincipalCV(MM2)], "(ok true)");
  evalc("pending-mm recorded", MARKET_ID, `(get-pending-mm '${MM2})`, "PM1");
  evalc("MM2 not whitelisted while pending", MARKET_ID, `(is-whitelisted-mm '${MM2})`, "MMW0");
  call("confirm-mm early -> u2021 (in cooldown)", V9, MARKET_ID, "confirm-mm-whitelist",
    [standardPrincipalCV(MM2)], "(err u2021)");
  call("confirm-mm by client-admin -> u1011", CLIENT_ADMIN, MARKET_ID, "confirm-mm-whitelist",
    [standardPrincipalCV(MM2)], "(err u1011)");
  call("cancel-mm by rando -> u1011", RANDO, MARKET_ID, "cancel-mm-whitelist",
    [standardPrincipalCV(MM2)], "(err u1011)");
  call("cancel-mm by client-admin -> ok (dual veto)", CLIENT_ADMIN, MARKET_ID, "cancel-mm-whitelist",
    [standardPrincipalCV(MM2)], "(ok true)");
  call("confirm-mm with nothing pending -> u2020", V9, MARKET_ID, "confirm-mm-whitelist",
    [standardPrincipalCV(MM2)], "(err u2020)");
  call("cancel-mm with nothing pending -> u2020", V9, MARKET_ID, "cancel-mm-whitelist",
    [standardPrincipalCV(MM2)], "(err u2020)");
  call("re-propose-mm(MM2) by operator -> ok", V9, MARKET_ID, "propose-mm-whitelist",
    [standardPrincipalCV(MM2)], "(ok true)");

  // ================= safe: TIMELOCKED operator rotation (pre-cooldown) =================
  call("propose-rfq-operator by rando -> u4001", RANDO, SAFE_ID, "propose-rfq-operator",
    [standardPrincipalCV(RANDO)], "(err u4001)");
  call("propose-rfq-operator by OPERATOR -> u4001 (can't self-govern)", OPERATOR, SAFE_ID, "propose-rfq-operator",
    [standardPrincipalCV(OPERATOR)], "(err u4001)");
  call("propose-rfq-operator(RANDO) by ADMIN -> ok", CHAVITA, SAFE_ID, "propose-rfq-operator",
    [standardPrincipalCV(RANDO)], "(ok true)");
  evalc("pending-rfq-operator = RANDO", SAFE_ID, "(get-pending-rfq-operator)", "PEND1");
  call("confirm by rando -> u4001", RANDO, SAFE_ID, "confirm-rfq-operator", [], "(err u4001)");
  call("confirm by ADMIN before cooldown -> u4012", CHAVITA, SAFE_ID, "confirm-rfq-operator", [], "(err u4012)");
  call("cancel by ADMIN -> ok", CHAVITA, SAFE_ID, "cancel-rfq-operator", [], "(ok true)");
  call("confirm with nothing pending -> u4029", CHAVITA, SAFE_ID, "confirm-rfq-operator", [], "(err u4029)");
  call("cancel with nothing pending -> u4029", CHAVITA, SAFE_ID, "cancel-rfq-operator", [], "(err u4029)");
  call("re-propose(RANDO) by ADMIN -> ok", CHAVITA, SAFE_ID, "propose-rfq-operator",
    [standardPrincipalCV(RANDO)], "(ok true)");

  // ================= safe fix auth matrix (bogus id: market u2001 = past the gate) =================
  call("fix-rfq(bogus) by rando -> u4001", RANDO, SAFE_ID, "fix-rfq", fixArgs(BOGUS, sig1, ref2), "(err u4001)");
  call("fix-rfq(bogus) by ADMIN -> u4001", CHAVITA, SAFE_ID, "fix-rfq", fixArgs(BOGUS, sig1, ref2), "(err u4001)");
  call("fix-rfq(bogus) by DEPLOYER V9 -> u4001", V9, SAFE_ID, "fix-rfq", fixArgs(BOGUS, sig1, ref2), "(err u4001)");
  call("fix-rfq(bogus) by OPERATOR -> market u2001 (past the gate)", OPERATOR, SAFE_ID, "fix-rfq", fixArgs(BOGUS, sig1, ref2), "(err u2001)");

  // ================= the shared cooldown =================
  advance(Number(COOLDOWN) + 1);

  // band OFF: the native oracle cannot run on synthesized tenures (see header)
  call("set-band-enabled(false) by rando -> u1011", RANDO, MARKET_ID, "set-band-enabled", [falseCV()], "(err u1011)");
  call("set-band-enabled(false) by operator -> ok", V9, MARKET_ID, "set-band-enabled", [falseCV()], "(ok true)");

  // ================= confirm both timelocks =================
  call("confirm-client after cooldown -> ok", CLIENT_ADMIN, MARKET_ID, "confirm-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(ok true)");
  evalc("CLIENT whitelisted now", MARKET_ID, `(is-whitelisted-client '${CLIENT})`, "CW1");
  call("confirm-mm after cooldown -> ok", V9, MARKET_ID, "confirm-mm-whitelist",
    [standardPrincipalCV(MM2)], "(ok true)");
  evalc("MM2 whitelisted now", MARKET_ID, `(is-whitelisted-mm '${MM2})`, "MMW1");
  call("confirm-rfq-operator after cooldown -> ok", CHAVITA, SAFE_ID, "confirm-rfq-operator", [], "(ok true)");
  evalc("rfq-operator = RANDO after confirm", SAFE_ID, "(get-rfq-operator)", "OPR2");
  evalc("pending cleared after confirm", SAFE_ID, "(get-pending-rfq-operator)", "PEND3");

  // ================= money path, driven by the ROTATED operator =================
  call("CLIENT open rfq1", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(ok u1)");
  call("fix-rfq(rfq1) by OLD operator -> u4001", OPERATOR, SAFE_ID, "fix-rfq", fixArgs(1n, sig1, ref2), "(err u4001)");
  evalc("safe STX before fix", SAFE_ID, balStx(SAFE_ID), "S0");
  evalc("client STX before", SAFE_ID, balStx(CLIENT), "C0");
  evalc("treasury STX before", SAFE_ID, balStx(V9), "T0");
  call("fix-rfq(rfq1) by NEW operator (RANDO) -> ok", RANDO, SAFE_ID, "fix-rfq", fixArgs(1n, sig1, ref2), "(ok u1)");
  evalc("safe STX after fix (unchanged, empty allowance)", SAFE_ID, balStx(SAFE_ID), "SFIX");
  evalc("safe sBTC before fulfill", SAFE_ID, balSbtc(SAFE_ID), "SB0");
  call("fulfill-rfq(rfq1) by NEW operator -> ok", RANDO, SAFE_ID, "fulfill-rfq", ffSafe(1n), `(ok u${cOk})`);
  evalc("safe STX after fulfill", SAFE_ID, balStx(SAFE_ID), "S1");
  evalc("safe sBTC after fulfill", SAFE_ID, balSbtc(SAFE_ID), "SB1");
  evalc("client STX after", SAFE_ID, balStx(CLIENT), "C1");
  evalc("treasury STX after", SAFE_ID, balStx(V9), "T1");

  // ================= admin kill-switch on rfq2 =================
  call("CLIENT open rfq2", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(ok u2)");
  call("set-rfq-enabled(false) by rotated OPERATOR -> u4001", RANDO, SAFE_ID, "set-rfq-enabled", [falseCV()], "(err u4001)");
  call("set-rfq-enabled(false) by ADMIN -> ok", CHAVITA, SAFE_ID, "set-rfq-enabled", [falseCV()], "(ok true)");
  call("fix-rfq while disabled -> u4028", RANDO, SAFE_ID, "fix-rfq", fixArgs(2n, sig2, ref2), "(err u4028)");
  call("set-rfq-enabled(true) -> ok", CHAVITA, SAFE_ID, "set-rfq-enabled", [trueCV()], "(ok true)");
  call("fix-rfq(rfq2) after re-enable -> ok", RANDO, SAFE_ID, "fix-rfq", fixArgs(2n, sig2, ref2), "(ok u2)");
  call("set-rfq-enabled(false) again", CHAVITA, SAFE_ID, "set-rfq-enabled", [falseCV()], "(ok true)");
  call("fulfill-rfq while disabled -> u4028", RANDO, SAFE_ID, "fulfill-rfq", ffSafe(2n), "(err u4028)");
  call("set-rfq-enabled(true)", CHAVITA, SAFE_ID, "set-rfq-enabled", [trueCV()], "(ok true)");
  call("fulfill-rfq(rfq2) -> ok", RANDO, SAFE_ID, "fulfill-rfq", ffSafe(2n), `(ok u${cOk})`);

  // ================= leaked-operator containment =================
  call("rotated operator stx-transfer -> u4001", RANDO, SAFE_ID, "stx-transfer",
    [uintCV(1_000_000), standardPrincipalCV(RANDO), noneCV(), noneCV(), noneCV()], "(err u4001)");
  call("rotated operator sip010-transfer -> u4001", RANDO, SAFE_ID, "sip010-transfer",
    [uintCV(1), standardPrincipalCV(RANDO), noneCV(), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME), noneCV(), noneCV()], "(err u4001)");

  // ================= instant revoke =================
  call("revoke-client by V9 -> u1022", V9, MARKET_ID, "revoke-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(err u1022)");
  call("revoke-client by client-admin -> ok (INSTANT)", CLIENT_ADMIN, MARKET_ID, "revoke-client-whitelist",
    [standardPrincipalCV(CLIENT)], "(ok true)");
  call("CLIENT open after revoke -> u2017", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(err u2017)");
  evalc("genesis clients untouched by revoke", MARKET_ID, `(is-whitelisted-client '${FRIEDGER})`, "GEN3");

  // ---- run + verify ----
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;
  res.steps.forEach((s, i) => {
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      const ok = p.expect === null ? (got.startsWith("(ok") || got === "<no tx>") : got === p.expect;
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok || p.expect === null ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const v = decodeEval(s); if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else if (p.kind === "advance") { console.log(`⏩ [${i}] ${p.label}`); }
  });

  console.log("\n--- assertions ---");
  const assert = (label, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` ${detail}` : ""}`); ok ? pass++ : fail++; };
  assert("genesis friedger whitelisted at initialize", String(cap.GEN1) === "true", `(${cap.GEN1})`);
  assert("genesis fast-pool rewards whitelisted at initialize", String(cap.GEN2) === "true", `(${cap.GEN2})`);
  assert("genesis MM yguazu-stx-safe whitelisted at initialize", String(cap.GENMM) === "true", `(${cap.GENMM})`);
  assert("CLIENT starts NOT whitelisted", String(cap.CW0) === "false", `(${cap.CW0})`);
  assert("pending MM recorded (proposed-at)", String(cap.PM1).startsWith("(some"), `(${cap.PM1})`);
  assert("MM2 not whitelisted while pending", String(cap.MMW0) === "false", `(${cap.MMW0})`);
  assert("MM2 whitelisted after confirm", String(cap.MMW1) === "true", `(${cap.MMW1})`);
  assert("rfq-operator preset to BE account 3", String(cap.OPR).includes(OPERATOR), `(${cap.OPR})`);
  assert("rfq-enabled default true", String(cap.ENABLED) === "true", `(${cap.ENABLED})`);
  assert("pending operator none at onboard", String(cap.PEND0) === "none", `(${cap.PEND0})`);
  assert("pending client recorded (proposed-at)", String(cap.PC1).startsWith("(some"), `(${cap.PC1})`);
  assert("pending client cleared after cancel", String(cap.PC2) === "none", `(${cap.PC2})`);
  assert("pending operator shows RANDO", String(cap.PEND1).includes(RANDO), `(${cap.PEND1})`);
  assert("CLIENT whitelisted after confirm", String(cap.CW1) === "true", `(${cap.CW1})`);
  assert("operator = RANDO after confirm", String(cap.OPR2).includes(RANDO), `(${cap.OPR2})`);
  assert("pending operator none after confirm", String(cap.PEND3) === "none", `(${cap.PEND3})`);
  assert("fix moved ZERO uSTX from safe (empty allowance)", uintFrom(cap.SFIX) === uintFrom(cap.S0), `(before=${cap.S0} after=${cap.SFIX})`);
  assert(`client STX +net delta=${uintFrom(cap.C1) - uintFrom(cap.C0)}`, uintFrom(cap.C1) - uintFrom(cap.C0) === clientReceives, `(want ${clientReceives})`);
  assert(`safe sBTC +sbtc-in delta=${uintFrom(cap.SB1) - uintFrom(cap.SB0)}`, uintFrom(cap.SB1) - uintFrom(cap.SB0) === SBTC_IN, `(want ${SBTC_IN})`);
  assert(`safe STX -fixed delta=${uintFrom(cap.S1) - uintFrom(cap.S0)}`, uintFrom(cap.S1) - uintFrom(cap.S0) === -cOk, `(want ${-cOk})`);
  assert(`treasury STX +fee delta=${uintFrom(cap.T1) - uintFrom(cap.T0)}`, uintFrom(cap.T1) - uintFrom(cap.T0) === fee, `(want ${fee})`);
  assert("genesis clients untouched by revoke", String(cap.GEN3) === "true", `(${cap.GEN3})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e.body || e); process.exit(1); });
