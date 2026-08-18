// verify-markets-sbtc-stx-jing-v2.js
// Self-verifying stxer mainnet-fork harness for markets-sbtc-stx-jing-v2
// (maker/taker split): maker gate, reprice-or-swap (plain, crossing,
// partial-fill revert), FOK swap, get-taker-rebate-bps.
//
// Deploys jing-core-v3 + the market under a THROWAWAY deployer (rfq-harness
// pattern) so reruns never collide with live SPV9K21 contracts. Uses ONE
// bundled Hermes VAA carrying both feeds (BTC/USD + STX/USD), fetched right
// before .run() so it lands inside MAX_STALENESS u80.
//
// Run: npx tsx simulations/verify-markets-sbtc-stx-jing-v2.js
import fs from "node:fs";
import {
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  trueCV,
  noneCV,
  cvToString,
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
  PYTH_HERMES_BASE,
} from "./_setup.js";

const OWNER_PRIVKEY =
  "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");

const CORE = "jing-core-v3";
const MARKET = "markets-sbtc-stx-jing-v2";
const CID = `${DEPLOYER}.${MARKET}`;
const CORE_ID = `${DEPLOYER}.${CORE}`;

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

// Third-party swap taker (the guardian address from the pause sims; only
// needs the 2.1k sats we transfer it in-sim).
const TAKER3 = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";

const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;
const SBTC_2K = 2_000;
const SBTC_10K = 10_000;
const STX_2 = 2_000_000;
const STX_100 = 100_000_000;
const LIVE_X = 1;
const DEAD_X = 999_999_999_999_999;
const LIVE_Y = 999_999_999_999_999;
const DEAD_Y = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET);
const DUMMY_VAA = bufferCV(Buffer.from("00", "hex"));

const coreSrc = fs.readFileSync(
  new URL(`../contracts/${CORE}.clar`, import.meta.url),
  "utf8",
);
const mktSrc = fs.readFileSync(
  new URL(`../contracts/${MARKET}.clar`, import.meta.url),
  "utf8",
);

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

async function fetchBundledVaa() {
  const ts = Math.floor(Date.now() / 1000) - 30;
  const url = `${PYTH_HERMES_BASE}/v2/updates/price/${ts}?ids[]=${BTC_USD_FEED_HEX}&ids[]=${STX_USD_FEED_HEX}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const d = await r.json();
  if (!d.binary?.data?.[0]) throw new Error("No bundled VAA from Hermes");
  return d.binary.data[0];
}

let checks = 0;
let failures = 0;
function assert(label, actual, want) {
  checks += 1;
  const ok =
    typeof want === "function" ? want(actual) : String(actual).includes(want);
  if (ok) {
    console.log(`  ok   ${label}: ${actual}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}: got "${actual}" want "${want}"`);
  }
}

async function main() {
  console.log("=== markets-sbtc-stx-jing-v2 SELF-VERIFYING stxer harness ===\n");
  console.log(`throwaway deployer = ${DEPLOYER}\n`);

  const vaaHex = await fetchBundledVaa();
  const vaaBuf = bufferCV(Buffer.from(vaaHex, "hex"));

  const call = (sender, fn, args) => (b) =>
    b.withSender(sender).addContractCall({
      contract_id: CID,
      function_name: fn,
      function_args: args,
    });

  const depositX = (sender, amount, limit, vaa) =>
    call(sender, "deposit-token-x", [
      uintCV(amount),
      uintCV(limit),
      vaa,
      sbtcTrait,
      sbtcAsset,
    ]);
  const depositY = (sender, amount, limit, vaa) =>
    call(sender, "deposit-token-y", [
      uintCV(amount),
      uintCV(limit),
      vaa,
      wstxTrait,
      wstxAsset,
    ]);
  const repriceX = (sender, limit, vaa) =>
    call(sender, "reprice-or-swap-token-x", [
      uintCV(limit),
      vaa,
      sbtcTrait,
      sbtcAsset,
      wstxTrait,
      wstxAsset,
    ]);

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
    .withSender(DEPLOYER)
    .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
    .addContractDeploy({ contract_name: MARKET, source_code: mktSrc })
    .addContractCall({
      contract_id: CORE_ID,
      function_name: "set-verified-contract",
      function_args: [marketCV],
    })
    .addContractCall({
      contract_id: CID,
      function_name: "initialize",
      function_args: [
        marketCV,
        contractPrincipalCV(SBTC_ADDR, SBTC_NAME),
        contractPrincipalCV(WSTX_ADDR, WSTX_NAME),
        uintCV(MIN_SBTC),
        uintCV(MIN_STX),
        btcFeedBuf,
        stxFeedBuf,
      ],
    })
    .addEvalCode(CID, "(get-taker-rebate-bps)");

  // --- cycle 0: maker gate + reprice ---
  b = depositY(STX_DEPOSITOR_1, STX_100, LIVE_Y, DUMMY_VAA)(b); // live bid rests
  b = depositX(SBTC_DEPOSITOR_1, SBTC_2K, LIVE_X, vaaBuf)(b); // crossing -> u1022
  b = depositX(SBTC_DEPOSITOR_1, SBTC_2K, DEAD_X, vaaBuf)(b); // dead -> ok
  b = call(SBTC_DEPOSITOR_1, "set-token-x-limit", [uintCV(LIVE_X), vaaBuf])(b); // retarget live -> u1022
  b = repriceX(SBTC_DEPOSITOR_1, DEAD_X - 1, vaaBuf)(b); // plain reprice -> ok zero tuple
  b = b.addEvalCode(CID, `(get-token-x-limit '${SBTC_DEPOSITOR_1})`);
  b = repriceX(SBTC_DEPOSITOR_1, 0, DUMMY_VAA)(b); // -> u1017
  b = repriceX(STX_DEPOSITOR_1, DEAD_X, DUMMY_VAA)(b); // no x deposit -> u1008
  b = b.addEvalCode(SBTC_FQN, `(get-balance '${STX_DEPOSITOR_1})`);
  b = repriceX(SBTC_DEPOSITOR_1, LIVE_X, vaaBuf)(b); // crossing -> FOK conversion
  b = b
    .addEvalCode(CID, "(get-current-cycle)")
    .addEvalCode(SBTC_FQN, `(get-balance '${STX_DEPOSITOR_1})`);

  // --- cycle 1: oversize crossing reprice reverts whole ---
  // NOTE: cycle 0's conversion consumed the x side fully but only ~11 STX
  // of the 100 STX bid; the remaining ~89 STX ROLLED into cycle 1 as live
  // resting size. The "oversize" offer must therefore exceed rolled + fresh
  // y (~91 STX ~= 17k sats): 100k sats (~540 STX worth) guarantees the
  // partial-fill revert.
  b = depositY(STX_DEPOSITOR_1, STX_2, LIVE_Y, DUMMY_VAA)(b); // tiny fresh bid
  b = depositX(SBTC_DEPOSITOR_1, 100_000, DEAD_X, vaaBuf)(b); // oversize dead offer
  b = repriceX(SBTC_DEPOSITOR_1, LIVE_X, vaaBuf)(b); // -> u1023 PARTIAL_FILL
  b = b.addEvalCode(CID, `(get-token-x-limit '${SBTC_DEPOSITOR_1})`);

  // --- swap taker path (same cycle, book still resting) ---
  // The taker must be a THIRD principal: swap's deposit-*-core tops up the
  // sender's existing same-side position and overwrites its limit, so a
  // taker who is also the resting dead maker converts their WHOLE position
  // (correct caller-scoped FOK semantics, but not what this check probes).
  b = b
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(2_100),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(TAKER3),
        noneCV(),
      ],
    });
  b = call(TAKER3, "swap", [
    uintCV(SBTC_2K), // taker inside the ~91 STX resting bid
    uintCV(LIVE_X),
    vaaBuf,
    sbtcTrait,
    sbtcAsset,
    wstxTrait,
    wstxAsset,
    trueCV(), // deposit-x
  ])(b);

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;

  let i = 0;
  assert("deploy jing-core-v3", decodeTx(s[i++]), (v) => !String(v).includes("ERR"));
  assert("deploy market v2", decodeTx(s[i++]), (v) => !String(v).includes("ERR"));
  assert("set-verified-contract", decodeTx(s[i++]), "(ok true)");
  assert("initialize", decodeTx(s[i++]), "(ok true)");
  assert("get-taker-rebate-bps", decodeEval(s[i++]), "u20");
  assert("y live bid rests", decodeTx(s[i++]), "(ok u100000000)");
  assert("crossing x deposit -> MUST_USE_SWAP", decodeTx(s[i++]), "(err u1022)");
  assert("dead x deposit ok", decodeTx(s[i++]), "(ok u2000)");
  assert("set-limit live -> MUST_USE_SWAP", decodeTx(s[i++]), "(err u1022)");
  assert("plain reprice zero tuple", decodeTx(s[i++]), (v) =>
    String(v).startsWith("(ok") && String(v).includes("(token-y-received u0)"));
  assert("limit retargeted", decodeEval(s[i++]), String(DEAD_X - 1));
  assert("reprice limit 0 -> LIMIT_REQUIRED", decodeTx(s[i++]), "(err u1017)");
  assert("reprice no deposit -> NOTHING_TO_WITHDRAW", decodeTx(s[i++]), "(err u1008)");
  const makerSbtcBefore = decodeEval(s[i++]);
  const cross = decodeTx(s[i++]);
  assert("crossing reprice converts FOK", cross, (v) =>
    String(v).startsWith("(ok") && !String(v).includes("token-y-received: u0"));
  assert("cycle advanced to u1", decodeEval(s[i++]), "u1");
  const makerSbtcAfter = decodeEval(s[i++]);
  assert(
    "y maker received sBTC (resting - fee + rebate)",
    `${makerSbtcBefore} -> ${makerSbtcAfter}`,
    () => {
      const b0 = BigInt((makerSbtcBefore.match(/u(\d+)/) || [])[1] ?? "0");
      const b1 = BigInt((makerSbtcAfter.match(/u(\d+)/) || [])[1] ?? "0");
      // resting 2000 - fee 2 + rebate 4 = 2002
      return b1 - b0 === 2002n;
    },
  );
  assert("tiny y bid rests (cycle 1)", decodeTx(s[i++]), "(ok u2000000)");
  assert("oversize dead x deposit ok", decodeTx(s[i++]), "(ok u100000)");
  assert("oversize crossing reprice -> PARTIAL_FILL", decodeTx(s[i++]), "(err u1023)");
  assert("failed conversion left old dead limit", decodeEval(s[i++]), String(DEAD_X));
  assert("fund third-party taker", decodeTx(s[i++]), "(ok true)");
  assert("swap FOK ok (third-party taker)", decodeTx(s[i++]), (v) =>
    String(v).startsWith("(ok") && !String(v).includes("(token-y-received u0)"));

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
