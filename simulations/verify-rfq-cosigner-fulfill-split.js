// verify-rfq-cosigner-fulfill-split.js
// stxer harness for commit 5619c26 ("RR review cosigner accelerate client
// whitelist and fulfill operator rfq dissociation"): the two NEW deltas in the
// local sources, deployed together on a mainnet fork:
//
//   market (contracts/rfq/rfq-sbtc-stx-jing-v2.clar, fork name v2-4):
//   - initialize takes a client-COSIGNER and enforces 3-way distinctness
//     (cosigner != operator, cosigner != client-admin, admin != operator)
//   - client whitelist ADD is a 2-of-2 with NO cooldown: client-admin
//     PROPOSES, cosigner CONFIRMS (same block); admin/operator can no longer
//     confirm (u1024); all THREE keys hold the cancel veto; revoke is
//     instant for admin OR cosigner
//   - set-client-admin can't collapse onto the cosigner; set-client-cosigner
//     is cosigner-only and can't collapse onto operator/admin
//   - KNOWN GAP (documented, expect ok): set-operator can still rotate the
//     operator ONTO the cosigner principal (no distinctness check there)
//
//   safe (contracts/rfq/jing-mm-safe-v2.clar, fork name yguazu-stx-safe-v2,
//   hard-refs rewritten v2-3 -> v2-4 and yguazu-stx-safe -> -v2, the same
//   transform the BE template repoint will apply):
//   - fulfill-rfq is gated to a SEPARATE fulfill-operator: the rfq-operator
//     (BE hot key) can fix but fulfilling with it -> u4001, and the fulfill
//     key cannot fix -> u4001 (dissociation both ways)
//   - fulfill-operator presets distinct from the rfq-operator preset
//   - propose/cancel/confirm-fulfill-operator mirror the timelocked
//     rfq-operator rotation (u4012 in cooldown, u4029 no pending)
//   - confirm-*-operator refuse to collapse fix and fulfill onto one key
//     (u4030) in BOTH directions
//   - admin kill-switch halts both fix and fulfill (u4028)
//   - post-rotation money path: fix by NEW rfq-operator, fulfill by NEW
//     fulfill-operator, exact deltas
//
// Simulator constraints as in verify-yguazu-stx-safe.js: the native oracle
// cannot run after addAdvanceBlocks (synthesized tenures), so the
// post-advance money path runs band-off; pre-advance paths run band-ON.
//
// Run: npx tsx simulations/verify-rfq-cosigner-fulfill-split.js
import fs from "node:fs";
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
const V9 = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // deployer/market operator/core owner/treasury
const FAKFUN = "SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK";
const CHAVITA = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // safe owner/admin
const RANDO = "SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT";  // rotated-to rfq-operator
const RANDO2 = "SP2QVKZ2GWP97TW4RNCT8TN65JRJPVAKERHYSS13E"; // rotated-to fulfill-operator
const OPERATOR = "SP3SPSJDYGHF0ARGV1TNS0HX6JEP7T1J684QY7JVZ";   // rfq-operator preset (BE account 3)
const FULFILL_OP = "SP3KBT5RA54JZ4N5JJYRF11QSRFR91GDMRP8VNRK7"; // fulfill-operator preset
const FRIEDGER = "SP3KJBWTS3K562BF5NXWG5JC8W90HEG7WPYH5B97X";   // genesis client
const FASTPOOL = "SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP";   // genesis client
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const pk = (h) => h.repeat(64 / h.length) + "01";
const CLIENT_ADMIN = getAddressFromPrivateKey(pk("4"), "mainnet");
const ROTATED_ADMIN = getAddressFromPrivateKey(pk("5"), "mainnet");
const COSIGNER = getAddressFromPrivateKey(pk("6"), "mainnet");
const ROTATED_COSIGNER = getAddressFromPrivateKey(pk("7"), "mainnet");
const CLIENT2 = getAddressFromPrivateKey(pk("8"), "mainnet");
const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");

const MARKET = "rfq-sbtc-stx-jing-v2-4";
const SAFE = "yguazu-stx-safe-v2";
const MARKET_ID = `${V9}.${MARKET}`;
const SAFE_ID = `${V9}.${SAFE}`;
const CORE_ID = `${V9}.jing-core-v2`;
const WCORE_ID = `${V9}.fakfun-wallet-core`;
const LIVE_V23_ID = `${V9}.rfq-sbtc-stx-jing-v2-3`; // identical price code: probe only
const marketCV = contractPrincipalCV(V9, MARKET);
const safeCV = contractPrincipalCV(V9, SAFE);

const SBTC_IN = 200_000n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";
const BIG_THRESHOLD = 1_000_000_000_000n;
const COOLDOWN = 144; // safe wallet cooldown-period (u144 at onboard)
const BOGUS = 999_999n;

// local production sources, refs rewritten exactly like the BE template
// repoint will be (market name + safe canonical name)
function loadSources() {
  const mktRaw = fs.readFileSync(new URL("../contracts/rfq/rfq-sbtc-stx-jing-v2.clar", import.meta.url), "utf8");
  const safeRaw = fs.readFileSync(new URL("../contracts/rfq/jing-mm-safe-v2.clar", import.meta.url), "utf8");
  const mktSrc = mktRaw.replaceAll("yguazu-stx-safe", SAFE); // genesis MM -> fork safe
  const safeSrc = safeRaw
    .replaceAll("rfq-sbtc-stx-jing-v2-3", MARKET)
    .replaceAll("yguazu-stx-safe", SAFE);
  if (!safeSrc.includes(`${V9}.${MARKET} fix-price`)) throw new Error("safe ref rewrite failed");
  if (!mktSrc.includes(`.${SAFE} true`)) throw new Error("market genesis rewrite failed");
  return { mktSrc, safeSrc };
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

// probe the LIVE v2-3 (identical price code) pinned to `height`, with the
// SAME two-advance structure as the main sim, measuring stacks-block-time
// after each advance
async function probe(height) {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API }).useBlockHeight(height);
  pb.addEvalCode(LIVE_V23_ID, "(get-native-price)");
  pb.addEvalCode(LIVE_V23_ID, "stacks-block-time");
  pb.addAdvanceBlocks({ bitcoin_blocks: COOLDOWN + 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
  pb.addEvalCode(LIVE_V23_ID, "stacks-block-time");
  pb.addAdvanceBlocks({ bitcoin_blocks: COOLDOWN + 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
  pb.addEvalCode(LIVE_V23_ID, "stacks-block-time");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const price = uintFrom(decodeEval(res.steps[0]));
  const tipTime = uintFrom(decodeEval(res.steps[1]));
  const t2 = uintFrom(decodeEval(res.steps[5]));
  if (price <= 0n || tipTime <= 0n || t2 <= 0n) throw new Error(`probe failed: price=${price} tip=${tipTime} t2=${t2}`);
  return { price, tipTime, t2 };
}

async function main() {
  console.log("=== cosigner 2-of-2 + fulfill-operator split harness (commit 5619c26) ===\n");
  const { mktSrc, safeSrc } = loadSources();
  const tip = await getTip();
  const HEIGHT = Number(tip.block_height) - 5;
  const { price: nativePrice, tipTime, t2 } = await probe(HEIGHT);
  const mid = (SBTC_IN * nativePrice) / 10_000_000_000n;
  const cOk = (mid * 9950n) / 10000n;
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  const ref1 = tipTime - 30n; // pre-advance quotes
  const ref2 = t2 - 60n;      // post-both-advances quotes (band off)
  console.log(`pin=${HEIGHT} tipTime=${tipTime} t2=${t2} native=${nativePrice} cOk=${cOk}`);
  console.log(`client-admin=${CLIENT_ADMIN}\ncosigner    =${COSIGNER}\nclient      =${CLIENT}\n`);

  const sig = (rfqId, refTs) => signIntent(
    buildRfqAuthHashHexV2({
      market: marketCV, rfqId, winner: safeCV, quotedOut: cOk,
      refPrice: nativePrice, refTimestamp: refTs, refVenue: REF_VENUE, authExpiry: AUTH_BIG,
    }, CHAIN), TEST_INTENT_PRIVKEY);
  const sig0 = sig(0n, ref1);
  const sig1 = sig(1n, ref1);
  const sig2 = sig(2n, ref2);

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API }).useBlockHeight(HEIGHT);
  const call = (label, sender, cid, fn, args, expect) => {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  };
  const evalc = (label, cid, code, capture) => { b.addEvalCode(cid, code); plan.push({ kind: "eval", label, capture }); };
  const advance = (n) => { b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 }); plan.push({ kind: "advance", label: `advance ${n}` }); };
  const sp = standardPrincipalCV;
  const fixArgs = (id, sigHex, refTs) => [
    uintCV(id), uintCV(cOk), uintCV(cOk), uintCV(nativePrice), uintCV(refTs),
    stringAsciiCV(REF_VENUE), uintCV(AUTH_BIG), bv(sigHex)];
  const openArgs = () => [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const ffSafe = (id) => [uintCV(id), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const initArgs = (admin, cosigner) => [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0), sp(admin), sp(cosigner)];

  // ================= deploys =================
  b.withSender(V9).addContractDeploy({ contract_name: MARKET, source_code: mktSrc });
  plan.push({ kind: "deploy", label: `deploy ${V9}.${MARKET} (local rfq-sbtc-stx-jing-v2.clar)` });
  b.withSender(V9).addContractDeploy({ contract_name: SAFE, source_code: safeSrc });
  plan.push({ kind: "deploy", label: `deploy ${V9}.${SAFE} (local jing-mm-safe-v2.clar, refs rewritten)` });

  // ================= market bring-up: initialize 3-way distinctness =================
  call("core.set-verified(v2-4)", V9, CORE_ID, "set-verified-contract", [marketCV], "(ok true)");
  call("initialize admin==operator -> u1023", V9, MARKET_ID, "initialize", initArgs(V9, COSIGNER), "(err u1023)");
  call("initialize cosigner==operator -> u1023", V9, MARKET_ID, "initialize", initArgs(CLIENT_ADMIN, V9), "(err u1023)");
  call("initialize cosigner==admin -> u1023", V9, MARKET_ID, "initialize", initArgs(CLIENT_ADMIN, CLIENT_ADMIN), "(err u1023)");
  call("initialize (3 distinct keys) -> ok", V9, MARKET_ID, "initialize", initArgs(CLIENT_ADMIN, COSIGNER), "(ok true)");
  evalc("get-client-admin", MARKET_ID, "(get-client-admin)", "CA");
  evalc("get-client-cosigner", MARKET_ID, "(get-client-cosigner)", "CS");
  evalc("genesis friedger whitelisted", MARKET_ID, `(is-whitelisted-client '${FRIEDGER})`, "GEN1");
  evalc("genesis fast-pool whitelisted", MARKET_ID, `(is-whitelisted-client '${FASTPOOL})`, "GEN2");
  evalc("genesis MM = fork safe whitelisted", MARKET_ID, `(is-whitelisted-mm '${SAFE_ID})`, "GENMM");

  // ================= safe bring-up =================
  call("wallet-core.set-verified(safe)", V9, WCORE_ID, "set-verified-contract", [safeCV, noneCV()], null);
  call("onboard by FAKFUN -> ok", FAKFUN, SAFE_ID, "onboard",
    [bv(TEST_INTENT_PUBKEY_HEX), sp(CHAVITA), noneCV(), uintCV(BIG_THRESHOLD), uintCV(BIG_THRESHOLD)], "(ok true)");
  evalc("rfq-operator preset (BE account 3)", SAFE_ID, "(get-rfq-operator)", "OPR0");
  evalc("fulfill-operator preset (distinct key)", SAFE_ID, "(get-fulfill-operator)", "FOP0");
  evalc("pending-fulfill-operator none", SAFE_ID, "(get-pending-fulfill-operator)", "PF0");

  // ================= funding =================
  call("fund CLIENT sBTC", SBTC_WHALE, SBTC_FQN, "transfer",
    [uintCV(2_000_000), sp(SBTC_WHALE), sp(CLIENT), noneCV()], null);
  b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: SAFE_ID, amount: Number(3n * cOk + 10_000_000n) });
  plan.push({ kind: "tx", label: "fund safe STX", expect: null });

  // ================= client whitelist: 2-of-2, NO cooldown =================
  call("CLIENT open before whitelist -> u2017", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(err u2017)");
  call("propose by operator V9 -> u1022", V9, MARKET_ID, "propose-client-whitelist", [sp(CLIENT)], "(err u1022)");
  call("propose by COSIGNER -> u1022 (cosigner can't propose)", COSIGNER, MARKET_ID, "propose-client-whitelist", [sp(CLIENT)], "(err u1022)");
  call("propose by client-admin -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist", [sp(CLIENT)], "(ok true)");
  evalc("pending-client recorded", MARKET_ID, `(get-pending-client '${CLIENT})`, "PC1");
  call("CLIENT open while pending -> u2017", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(err u2017)");
  call("confirm by client-admin -> u1024 (admin can NO LONGER confirm)", CLIENT_ADMIN, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT)], "(err u1024)");
  call("confirm by operator V9 -> u1024", V9, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT)], "(err u1024)");
  call("confirm by rando -> u1024", RANDO, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT)], "(err u1024)");
  call("confirm(CLIENT2, nothing pending) by COSIGNER -> u2018", COSIGNER, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT2)], "(err u2018)");
  call("cancel by rando -> u1022", RANDO, MARKET_ID, "cancel-client-whitelist", [sp(CLIENT)], "(err u1022)");
  call("cancel by COSIGNER -> ok (NEW third veto)", COSIGNER, MARKET_ID, "cancel-client-whitelist", [sp(CLIENT)], "(ok true)");
  evalc("pending cleared by cosigner veto", MARKET_ID, `(get-pending-client '${CLIENT})`, "PC2");
  call("confirm after cancel -> u2018", COSIGNER, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT)], "(err u2018)");
  call("re-propose -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist", [sp(CLIENT)], "(ok true)");
  call("cancel by operator V9 -> ok (veto kept)", V9, MARKET_ID, "cancel-client-whitelist", [sp(CLIENT)], "(ok true)");
  call("re-propose -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist", [sp(CLIENT)], "(ok true)");
  call("cancel by client-admin -> ok (veto kept)", CLIENT_ADMIN, MARKET_ID, "cancel-client-whitelist", [sp(CLIENT)], "(ok true)");
  call("re-propose (final) -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist", [sp(CLIENT)], "(ok true)");
  call("confirm by COSIGNER SAME BLOCK -> ok (NO cooldown)", COSIGNER, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT)], "(ok true)");
  evalc("CLIENT whitelisted instantly", MARKET_ID, `(is-whitelisted-client '${CLIENT})`, "CW1");

  // ================= key rotation distinctness =================
  call("set-operator -> client-admin -> u1023", V9, MARKET_ID, "set-operator", [sp(CLIENT_ADMIN)], "(err u1023)");
  call("KNOWN GAP: set-operator -> COSIGNER -> ok (no cosigner check)", V9, MARKET_ID, "set-operator", [sp(COSIGNER)], "(ok true)");
  call("rotate operator back to V9 (by COSIGNER, now operator)", COSIGNER, MARKET_ID, "set-operator", [sp(V9)], "(ok true)");
  call("set-client-admin by operator -> u1022", V9, MARKET_ID, "set-client-admin", [sp(ROTATED_ADMIN)], "(err u1022)");
  call("set-client-admin -> operator -> u1023", CLIENT_ADMIN, MARKET_ID, "set-client-admin", [sp(V9)], "(err u1023)");
  call("set-client-admin -> COSIGNER -> u1023 (NEW)", CLIENT_ADMIN, MARKET_ID, "set-client-admin", [sp(COSIGNER)], "(err u1023)");
  call("set-client-admin rotate -> ok", CLIENT_ADMIN, MARKET_ID, "set-client-admin", [sp(ROTATED_ADMIN)], "(ok true)");
  call("old admin propose -> u1022", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist", [sp(CLIENT2)], "(err u1022)");
  call("rotate admin back -> ok", ROTATED_ADMIN, MARKET_ID, "set-client-admin", [sp(CLIENT_ADMIN)], "(ok true)");
  call("set-client-cosigner by admin -> u1024", CLIENT_ADMIN, MARKET_ID, "set-client-cosigner", [sp(ROTATED_COSIGNER)], "(err u1024)");
  call("set-client-cosigner by operator -> u1024", V9, MARKET_ID, "set-client-cosigner", [sp(ROTATED_COSIGNER)], "(err u1024)");
  call("set-client-cosigner -> operator -> u1023", COSIGNER, MARKET_ID, "set-client-cosigner", [sp(V9)], "(err u1023)");
  call("set-client-cosigner -> admin -> u1023", COSIGNER, MARKET_ID, "set-client-cosigner", [sp(CLIENT_ADMIN)], "(err u1023)");
  call("set-client-cosigner rotate -> ok", COSIGNER, MARKET_ID, "set-client-cosigner", [sp(ROTATED_COSIGNER)], "(ok true)");
  call("propose CLIENT2 -> ok", CLIENT_ADMIN, MARKET_ID, "propose-client-whitelist", [sp(CLIENT2)], "(ok true)");
  call("confirm by OLD cosigner -> u1024", COSIGNER, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT2)], "(err u1024)");
  call("confirm by ROTATED cosigner -> ok", ROTATED_COSIGNER, MARKET_ID, "confirm-client-whitelist", [sp(CLIENT2)], "(ok true)");
  call("revoke CLIENT2 by ROTATED cosigner -> ok (cosigner revoke NEW)", ROTATED_COSIGNER, MARKET_ID, "revoke-client-whitelist", [sp(CLIENT2)], "(ok true)");
  evalc("CLIENT2 revoked", MARKET_ID, `(is-whitelisted-client '${CLIENT2})`, "C2W");
  call("rotate cosigner back -> ok", ROTATED_COSIGNER, MARKET_ID, "set-client-cosigner", [sp(COSIGNER)], "(ok true)");

  // ================= money path 1 (band ON): fix by rfq-op, fulfill by fulfill-op =================
  call("CLIENT open rfq0 -> ok", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(ok u0)");
  call("fix-rfq by FULFILL op -> u4001 (fulfill key can't fix)", FULFILL_OP, SAFE_ID, "fix-rfq", fixArgs(0n, sig0, ref1), "(err u4001)");
  call("fix-rfq by safe ADMIN -> u4001", CHAVITA, SAFE_ID, "fix-rfq", fixArgs(0n, sig0, ref1), "(err u4001)");
  evalc("safe STX before fix", SAFE_ID, balStx(SAFE_ID), "S0");
  evalc("client STX before", SAFE_ID, balStx(CLIENT), "C0");
  evalc("treasury STX before", SAFE_ID, balStx(V9), "T0");
  evalc("safe sBTC before", SAFE_ID, balSbtc(SAFE_ID), "SB0");
  call("fix-rfq(rfq0) by RFQ operator -> ok", OPERATOR, SAFE_ID, "fix-rfq", fixArgs(0n, sig0, ref1), "(ok u0)");
  evalc("safe STX after fix (unchanged)", SAFE_ID, balStx(SAFE_ID), "SFIX");
  call("fulfill-rfq by RFQ operator -> u4001 (THE SPLIT)", OPERATOR, SAFE_ID, "fulfill-rfq", ffSafe(0n), "(err u4001)");
  call("fulfill-rfq by safe ADMIN -> u4001", CHAVITA, SAFE_ID, "fulfill-rfq", ffSafe(0n), "(err u4001)");
  call("fulfill-rfq by rando -> u4001", RANDO, SAFE_ID, "fulfill-rfq", ffSafe(0n), "(err u4001)");
  call("fulfill-rfq(bogus) -> u4026", FULFILL_OP, SAFE_ID, "fulfill-rfq", ffSafe(BOGUS), "(err u4026)");
  call("fulfill-rfq(rfq0) by FULFILL operator -> ok", FULFILL_OP, SAFE_ID, "fulfill-rfq", ffSafe(0n), `(ok u${cOk})`);
  evalc("safe STX after fulfill", SAFE_ID, balStx(SAFE_ID), "S1");
  evalc("safe sBTC after fulfill", SAFE_ID, balSbtc(SAFE_ID), "SB1");
  evalc("client STX after", SAFE_ID, balStx(CLIENT), "C1");
  evalc("treasury STX after", SAFE_ID, balStx(V9), "T1");

  // ================= kill-switch halts BOTH sides =================
  call("CLIENT open rfq1 -> ok", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(ok u1)");
  call("fulfill-rfq(rfq1 unfixed) -> u4027", FULFILL_OP, SAFE_ID, "fulfill-rfq", ffSafe(1n), "(err u4027)");
  call("set-rfq-enabled by FULFILL op -> u4001 (can't govern)", FULFILL_OP, SAFE_ID, "set-rfq-enabled", [falseCV()], "(err u4001)");
  call("set-rfq-enabled(false) by ADMIN -> ok", CHAVITA, SAFE_ID, "set-rfq-enabled", [falseCV()], "(ok true)");
  call("fix-rfq disabled -> u4028", OPERATOR, SAFE_ID, "fix-rfq", fixArgs(1n, sig1, ref1), "(err u4028)");
  call("set-rfq-enabled(true) -> ok", CHAVITA, SAFE_ID, "set-rfq-enabled", [trueCV()], "(ok true)");
  call("fix-rfq(rfq1) -> ok", OPERATOR, SAFE_ID, "fix-rfq", fixArgs(1n, sig1, ref1), "(ok u1)");
  call("set-rfq-enabled(false) again", CHAVITA, SAFE_ID, "set-rfq-enabled", [falseCV()], "(ok true)");
  call("fulfill-rfq disabled -> u4028", FULFILL_OP, SAFE_ID, "fulfill-rfq", ffSafe(1n), "(err u4028)");
  call("set-rfq-enabled(true)", CHAVITA, SAFE_ID, "set-rfq-enabled", [trueCV()], "(ok true)");
  call("fulfill-rfq(rfq1) -> ok", FULFILL_OP, SAFE_ID, "fulfill-rfq", ffSafe(1n), `(ok u${cOk})`);

  // ================= fulfill-operator rotation: auth + collapse proposals =================
  call("propose-fulfill by rando -> u4001", RANDO, SAFE_ID, "propose-fulfill-operator", [sp(RANDO)], "(err u4001)");
  call("propose-fulfill by RFQ operator -> u4001", OPERATOR, SAFE_ID, "propose-fulfill-operator", [sp(OPERATOR)], "(err u4001)");
  call("propose-fulfill by FULFILL op -> u4001 (can't self-govern)", FULFILL_OP, SAFE_ID, "propose-fulfill-operator", [sp(RANDO2)], "(err u4001)");
  call("cancel-fulfill nothing pending -> u4029", CHAVITA, SAFE_ID, "cancel-fulfill-operator", [], "(err u4029)");
  call("confirm-fulfill nothing pending -> u4029", CHAVITA, SAFE_ID, "confirm-fulfill-operator", [], "(err u4029)");
  call("ADMIN propose-fulfill(= current RFQ op) -> ok (checked at confirm)", CHAVITA, SAFE_ID, "propose-fulfill-operator", [sp(OPERATOR)], "(ok true)");
  call("ADMIN propose-rfq(= current FULFILL op) -> ok (checked at confirm)", CHAVITA, SAFE_ID, "propose-rfq-operator", [sp(FULFILL_OP)], "(ok true)");
  evalc("pending-fulfill = OPERATOR", SAFE_ID, "(get-pending-fulfill-operator)", "PF1");
  call("confirm-fulfill early -> u4012", CHAVITA, SAFE_ID, "confirm-fulfill-operator", [], "(err u4012)");
  call("confirm-rfq early -> u4012", CHAVITA, SAFE_ID, "confirm-rfq-operator", [], "(err u4012)");

  // ================= cooldown 1: collapse guards fire at confirm =================
  advance(COOLDOWN + 1);
  call("confirm-fulfill(pending==rfq-op) -> u4030 COLLAPSE BLOCKED", CHAVITA, SAFE_ID, "confirm-fulfill-operator", [], "(err u4030)");
  call("confirm-rfq(pending==fulfill-op) -> u4030 COLLAPSE BLOCKED", CHAVITA, SAFE_ID, "confirm-rfq-operator", [], "(err u4030)");
  call("cancel-fulfill -> ok", CHAVITA, SAFE_ID, "cancel-fulfill-operator", [], "(ok true)");
  call("cancel-rfq -> ok", CHAVITA, SAFE_ID, "cancel-rfq-operator", [], "(ok true)");
  call("propose-fulfill(RANDO2) -> ok", CHAVITA, SAFE_ID, "propose-fulfill-operator", [sp(RANDO2)], "(ok true)");
  call("propose-rfq(RANDO) -> ok", CHAVITA, SAFE_ID, "propose-rfq-operator", [sp(RANDO)], "(ok true)");
  call("confirm-fulfill early (fresh clock) -> u4012", CHAVITA, SAFE_ID, "confirm-fulfill-operator", [], "(err u4012)");
  // band OFF for the post-advance fixes (native oracle can't run on synthesized tenures)
  call("set-band-enabled(false) by market operator -> ok", V9, MARKET_ID, "set-band-enabled", [falseCV()], "(ok true)");

  // ================= cooldown 2: rotations land, money path 2 =================
  advance(COOLDOWN + 1);
  call("confirm-fulfill(RANDO2) -> ok", CHAVITA, SAFE_ID, "confirm-fulfill-operator", [], "(ok true)");
  call("confirm-rfq(RANDO) -> ok", CHAVITA, SAFE_ID, "confirm-rfq-operator", [], "(ok true)");
  evalc("fulfill-operator = RANDO2", SAFE_ID, "(get-fulfill-operator)", "FOP2");
  evalc("rfq-operator = RANDO", SAFE_ID, "(get-rfq-operator)", "OPR2");
  evalc("pending-fulfill cleared", SAFE_ID, "(get-pending-fulfill-operator)", "PF2");
  call("CLIENT open rfq2 -> ok", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(ok u2)");
  call("fix by OLD rfq operator -> u4001", OPERATOR, SAFE_ID, "fix-rfq", fixArgs(2n, sig2, ref2), "(err u4001)");
  call("fix by NEW fulfill op RANDO2 -> u4001 (split holds post-rotation)", RANDO2, SAFE_ID, "fix-rfq", fixArgs(2n, sig2, ref2), "(err u4001)");
  call("fix by NEW rfq operator RANDO -> ok", RANDO, SAFE_ID, "fix-rfq", fixArgs(2n, sig2, ref2), "(ok u2)");
  call("fulfill by OLD fulfill op -> u4001", FULFILL_OP, SAFE_ID, "fulfill-rfq", ffSafe(2n), "(err u4001)");
  call("fulfill by NEW rfq operator RANDO -> u4001 (split holds)", RANDO, SAFE_ID, "fulfill-rfq", ffSafe(2n), "(err u4001)");
  evalc("client STX before rfq2 fulfill", SAFE_ID, balStx(CLIENT), "C2A");
  call("fulfill by NEW fulfill op RANDO2 -> ok", RANDO2, SAFE_ID, "fulfill-rfq", ffSafe(2n), `(ok u${cOk})`);
  evalc("client STX after rfq2 fulfill", SAFE_ID, balStx(CLIENT), "C2B");

  // ================= instant revoke re-blocks =================
  call("revoke CLIENT by COSIGNER -> ok", COSIGNER, MARKET_ID, "revoke-client-whitelist", [sp(CLIENT)], "(ok true)");
  call("CLIENT open after revoke -> u2017", CLIENT, MARKET_ID, "open-rfq", openArgs(), "(err u2017)");
  evalc("genesis untouched by revoke", MARKET_ID, `(is-whitelisted-client '${FRIEDGER})`, "GEN3");

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
  assert("client-admin set", String(cap.CA).includes(CLIENT_ADMIN), `(${cap.CA})`);
  assert("client-cosigner set", String(cap.CS).includes(COSIGNER), `(${cap.CS})`);
  assert("genesis friedger", String(cap.GEN1) === "true", `(${cap.GEN1})`);
  assert("genesis fast-pool", String(cap.GEN2) === "true", `(${cap.GEN2})`);
  assert("genesis MM fork safe", String(cap.GENMM) === "true", `(${cap.GENMM})`);
  assert("rfq-operator preset", String(cap.OPR0).includes(OPERATOR), `(${cap.OPR0})`);
  assert("fulfill-operator preset (distinct)", String(cap.FOP0).includes(FULFILL_OP), `(${cap.FOP0})`);
  assert("presets are two different keys", OPERATOR !== FULFILL_OP);
  assert("pending fulfill none at onboard", String(cap.PF0) === "none", `(${cap.PF0})`);
  assert("pending client recorded", String(cap.PC1).startsWith("(some") || /^u\d+$/.test(String(cap.PC1)), `(${cap.PC1})`);
  assert("pending cleared by cosigner veto", String(cap.PC2) === "none", `(${cap.PC2})`);
  assert("CLIENT whitelisted same-block (no cooldown)", String(cap.CW1) === "true", `(${cap.CW1})`);
  assert("CLIENT2 revoked by cosigner", String(cap.C2W) === "false", `(${cap.C2W})`);
  assert("fix moved ZERO uSTX (empty allowance)", uintFrom(cap.SFIX) === uintFrom(cap.S0), `(before=${cap.S0} after=${cap.SFIX})`);
  assert(`client STX delta rfq0=${uintFrom(cap.C1) - uintFrom(cap.C0)}`, uintFrom(cap.C1) - uintFrom(cap.C0) === clientReceives, `(want ${clientReceives})`);
  assert(`safe sBTC delta rfq0=${uintFrom(cap.SB1) - uintFrom(cap.SB0)}`, uintFrom(cap.SB1) - uintFrom(cap.SB0) === SBTC_IN, `(want ${SBTC_IN})`);
  assert(`safe STX delta rfq0=${uintFrom(cap.S1) - uintFrom(cap.S0)}`, uintFrom(cap.S1) - uintFrom(cap.S0) === -cOk, `(want ${-cOk})`);
  assert(`treasury fee delta rfq0=${uintFrom(cap.T1) - uintFrom(cap.T0)}`, uintFrom(cap.T1) - uintFrom(cap.T0) === fee, `(want ${fee})`);
  assert("pending-fulfill shows OPERATOR (collapse attempt)", String(cap.PF1).includes(OPERATOR), `(${cap.PF1})`);
  assert("fulfill-operator = RANDO2 after confirm", String(cap.FOP2).includes(RANDO2), `(${cap.FOP2})`);
  assert("rfq-operator = RANDO after confirm", String(cap.OPR2).includes(RANDO), `(${cap.OPR2})`);
  assert("pending fulfill cleared after confirm", String(cap.PF2) === "none", `(${cap.PF2})`);
  assert(`client STX delta rfq2=${uintFrom(cap.C2B) - uintFrom(cap.C2A)}`, uintFrom(cap.C2B) - uintFrom(cap.C2A) === clientReceives, `(want ${clientReceives})`);
  assert("genesis untouched by revoke", String(cap.GEN3) === "true", `(${cap.GEN3})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e.body || e); process.exit(1); });
