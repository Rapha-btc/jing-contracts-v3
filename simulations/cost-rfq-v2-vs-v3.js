// cost-rfq-v2-vs-v3.js
// Cost comparison on a mainnet fork: fix-price with the 48-sample native
// oracle (v2) vs no oracle at all (v3). Same RFQ, same quote, same signer —
// the only delta is the guardrail. Prints ExecutionCost side by side and the
// share of Stacks block limits each consumes.
//
// Run: npx tsx simulations/cost-rfq-v2-vs-v3.js
import {
  uintCV,
  bufferCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  trueCV,
  deserializeCV,
  cvToString,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import fs from "node:fs";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1,
  SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN,
  buildRfqAuthHashHexV2, buildRfqAuthHashHexV3, signIntent,
  TEST_INTENT_PRIVKEY,
} from "./_setup.js";

const OWNER_PRIVKEY = "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");

const CORE = "jing-core-v2";
const CORE_ID = `${DEPLOYER}.${CORE}`;
const V2 = "rfq-sbtc-stx-jing-v2";
const V3 = "rfq-sbtc-stx-jing-v3";
const V2_ID = `${DEPLOYER}.${V2}`;
const V3_ID = `${DEPLOYER}.${V3}`;

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");
const MM = STX_DEPOSITOR_1;
const mmCV = standardPrincipalCV(MM);

const SBTC_IN = 200_000n;
const MAX_PREMIUM_BPS = 2000n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";

// Stacks 3.x per-block limits, for the "share of block" view
const BLOCK_LIMITS = {
  runtime: 5_000_000_000n,
  read_count: 15_000n,
  read_length: 100_000_000n,
  write_count: 15_000n,
  write_length: 15_000_000n,
};

const coreSrc = fs.readFileSync(new URL(`../contracts/rfq/deploying/${CORE}.clar`, import.meta.url), "utf8");
const v2Src = fs.readFileSync(new URL(`../contracts/rfq/${V2}.clar`, import.meta.url), "utf8");
const v3Src = fs.readFileSync(new URL(`../contracts/rfq/${V3}.clar`, import.meta.url), "utf8");

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

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

// probe the native price + tip time so the v2 quote lands in-band
async function probe() {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
    .withSender(DEPLOYER)
    .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
    .addContractDeploy({ contract_name: V2, source_code: v2Src });
  pb.addEvalCode(V2_ID, "(get-native-price)");
  pb.addEvalCode(V2_ID, "stacks-block-time");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const price = uintFrom(decodeEval(res.steps[2]));
  const tipTime = uintFrom(decodeEval(res.steps[3]));
  if (price <= 0n || tipTime <= 0n) throw new Error(`probe failed: price=${price} tipTime=${tipTime}`);
  return { price, tipTime };
}

async function main() {
  console.log("=== fix-price cost: v2 (48-sample oracle) vs v3 (no oracle) ===\n");
  const { price: nativePrice, tipTime } = await probe();
  console.log(`probe: native price=${nativePrice}, tip time=${tipTime}\n`);

  const mid = (SBTC_IN * nativePrice) / 10_000_000_000n;
  const cOk = (mid * 9950n) / 10000n;
  const minOut = mid / 2n;
  const refOk = tipTime - 30n;

  // v2 dropped max-premium-bps from the tuple + fix-price args (2026-07-15);
  // v3 keeps it, so the two markets sign and call with different shapes.
  const common = {
    rfqId: 0, winner: mmCV, quotedOut: cOk, refPrice: nativePrice,
    refTimestamp: refOk, refVenue: REF_VENUE, authExpiry: AUTH_BIG,
  };
  const sigV2 = signIntent(
    buildRfqAuthHashHexV2({ ...common, market: contractPrincipalCV(DEPLOYER, V2) }, CHAIN),
    TEST_INTENT_PRIVKEY
  );
  const sigV3 = signIntent(
    buildRfqAuthHashHexV3({
      ...common, market: contractPrincipalCV(DEPLOYER, V3), maxPremiumBps: MAX_PREMIUM_BPS,
    }, CHAIN),
    TEST_INTENT_PRIVKEY
  );

  const fixArgsV2 = (sigHex) => [uintCV(0), uintCV(cOk), uintCV(cOk),
    uintCV(nativePrice), uintCV(refOk), stringAsciiCV(REF_VENUE),
    uintCV(AUTH_BIG), bv(sigHex)];
  const fixArgsV3 = (sigHex) => [uintCV(0), uintCV(cOk), uintCV(cOk),
    uintCV(nativePrice), uintCV(refOk), stringAsciiCV(REF_VENUE),
    uintCV(MAX_PREMIUM_BPS), uintCV(AUTH_BIG), bv(sigHex)];
  const openArgs = [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const ffArgs = [uintCV(0), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  function tx(label, sender, cid, fn, args, capture = null) {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, capture });
  }

  b.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc });
  plan.push({ kind: "deploy", label: `deploy ${CORE}` });
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: V2, source_code: v2Src });
  plan.push({ kind: "deploy", label: `deploy ${V2}` });
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: V3, source_code: v3Src });
  plan.push({ kind: "deploy", label: `deploy ${V3}` });

  const v2CV = contractPrincipalCV(DEPLOYER, V2);
  const v3CV = contractPrincipalCV(DEPLOYER, V3);
  tx("verify v2", DEPLOYER, CORE_ID, "set-verified-contract", [v2CV]);
  tx("verify v3", DEPLOYER, CORE_ID, "set-verified-contract", [v3CV]);
  tx("init v2", DEPLOYER, V2_ID, "initialize", [v2CV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0)]);
  tx("init v3", DEPLOYER, V3_ID, "initialize", [v3CV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0)]);
  tx("whitelist MM on v2", DEPLOYER, V2_ID, "set-mm-whitelist", [mmCV, trueCV()]);
  tx("whitelist MM on v3", DEPLOYER, V3_ID, "set-mm-whitelist", [mmCV, trueCV()]);
  tx("fund client sBTC", SBTC_DEPOSITOR_1, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(CLIENT), noneCV()]);

  // ORDER=v3first flips which market transacts first: both markets write
  // through the shared jing-core-v2 log, so the second mover pays extra reads
  // on grown core state. Comparing same-position steps across the two runs
  // cancels that positional offset.
  const v3first = process.env.ORDER === "v3first";
  const seq = v3first
    ? [[V3_ID, fixArgsV3(sigV3), "V3"], [V2_ID, fixArgsV2(sigV2), "V2"]]
    : [[V2_ID, fixArgsV2(sigV2), "V2"], [V3_ID, fixArgsV3(sigV3), "V3"]];
  for (const [cid, , tag] of seq) tx(`open rfq0 on ${tag}`, CLIENT, cid, "open-rfq", openArgs, `OPEN_${tag}`);
  for (const [cid, args, tag] of seq) tx(`fix-price on ${tag}`, MM, cid, "fix-price", args, `FIX_${tag}`);
  for (const [cid, , tag] of seq) tx(`fulfill on ${tag}`, MM, cid, "fulfill", ffArgs, `FF_${tag}`);

  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);

  const costs = {};
  res.steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    const got = decodeTx(s);
    const ok = got.startsWith("(ok") || p.kind === "deploy" && !("Err" in (s?.Result?.Transaction || {}));
    console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${got}`);
    if (p.capture && s.ExecutionCost) costs[p.capture] = s.ExecutionCost;
  });

  console.log("\n--- ExecutionCost comparison ---");
  const dims = ["runtime", "read_count", "read_length", "write_count", "write_length"];
  const pairs = [["open-rfq", "OPEN_V2", "OPEN_V3"], ["fix-price", "FIX_V2", "FIX_V3"], ["fulfill", "FF_V2", "FF_V3"]];
  for (const [name, a, b2] of pairs) {
    if (!costs[a] || !costs[b2]) { console.log(`${name}: missing cost data`); continue; }
    console.log(`\n${name}:`);
    console.log(`  ${"dim".padEnd(13)} ${"v2".padStart(12)} ${"v3".padStart(12)} ${"delta".padStart(12)}  v2 %block`);
    for (const d of dims) {
      const va = BigInt(costs[a][d]), vb = BigInt(costs[b2][d]);
      const pct = Number(va * 10000n / BLOCK_LIMITS[d]) / 100;
      console.log(`  ${d.padEnd(13)} ${String(va).padStart(12)} ${String(vb).padStart(12)} ${String(vb - va).padStart(12)}  ${pct.toFixed(3)}%`);
    }
  }
  console.log(`\nView: ${url}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
