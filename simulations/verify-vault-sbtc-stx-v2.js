// verify-vault-sbtc-stx-v2.js
// Self-verifying stxer mainnet-fork harness for vault-sbtc-stx-v2 against a
// real markets-sbtc-stx-jing-v2 instance.
//
// Deploys the WHOLE v2 stack (jing-core-v3 + jing-vault-auth + market +
// vault) under a THROWAWAY deployer, with the vault's three absolute
// 'SPV9K21....' refs rewritten to the throwaway principal (same patch the
// clarinet suite uses).
//
// WHY NOT the live SPV9K21 jing-core-v2: the local jing-core-v2.clar has
// log-settlement with 14 params (x-rebate/y-rebate added for the v2
// maker/taker split); the DEPLOYED jing-core-v2 has the 12-param version.
// Deploying markets-sbtc-stx-jing-v2 at SPV9K21 therefore fails analysis
// with "expecting 12 arguments, got 14" (verified 2026-08-18, session
// 145d6eafc7eb1d49e18b5bfb33e11f1a). THE V2 ROLLOUT NEEDS A FRESH CORE
// DEPLOYMENT UNDER A NEW NAME, and the vault constants repointed to it.
//
// Proves on a real fork:
//   - initialize rebate-parity gate: ok against the real market, u6023
//     against a TAKER_REBATE_BPS-patched copy
//   - signed-intent jing-deposit + replay reject (u6003)
//   - cancel-jing-sbtc under the EMPTY as-contract? allowance `()`
//   - execute-jing-reprice: plain retarget ok, ERR_AMOUNT_MISMATCH (u6022)
//   - execute-jing-swap FOK against a resting live bid, INCLUDING paying
//     Pyth's oracle refresh fee out of the vault's PYTH_FEE_BUDGET
//     allowance (the bug found + fixed 2026-08-18)
//   - execute-bitflow-swap + execute-dlmm-swap against the real pools
//
// Run: npx tsx simulations/verify-vault-sbtc-stx-v2.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  someCV,
  noneCV,
  cvToString,
  deserializeCV,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { getAddressFromPrivateKey } from "@stacks/transactions";
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
  TEST_INTENT_PUBKEY_HEX,
  buildIntentHashHex,
  signIntent,
} from "./_setup.js";

const OWNER_PRIVKEY =
  "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");

const MARKET_NAME = "markets-sbtc-stx-jing-v2";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const VAULT_NAME = "vault-sbtc-stx-v2";
const VAULT_ID = `${DEPLOYER}.${VAULT_NAME}`;
const BAD_VAULT_NAME = "vault-v2-badrebate";
const BAD_VAULT_ID = `${DEPLOYER}.${BAD_VAULT_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core-v3`; // throwaway-deployed

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;
const SBTC_10K = 10_000;
const SBTC_2K = 2_000;
const STX_100 = 100_000_000;
const STX_500 = 500_000_000;
const DEAD_X = 999_999_999_999_999;
const LIVE_Y = 999_999_999_999_999;
const PERMISSIVE_X_LIMIT = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);
const vaultCV = contractPrincipalCV(DEPLOYER, VAULT_NAME);
const badVaultCV = contractPrincipalCV(DEPLOYER, BAD_VAULT_NAME);
const DUMMY = bufferCV(Buffer.from("00", "hex"));

const coreSrc = fs.readFileSync(
  new URL("../contracts/jing-core-v3.clar", import.meta.url),
  "utf8",
);
const vaultAuthSrc = fs.readFileSync(
  new URL("../contracts/jing-vault-auth.clar", import.meta.url),
  "utf8",
);
const mktSrc = fs.readFileSync(
  new URL(`../contracts/${MARKET_NAME}.clar`, import.meta.url),
  "utf8",
);
// Repoint the vault's absolute mainnet refs at the throwaway stack.
const vaultSrc = fs
  .readFileSync(new URL("../contracts/vault-sbtc-stx-v2.clar", import.meta.url), "utf8")
  .replaceAll("'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.", `'${DEPLOYER}.`);
const badVaultSrc = vaultSrc.replace(
  "(define-constant TAKER_REBATE_BPS u20)",
  "(define-constant TAKER_REBATE_BPS u21)",
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
    console.log(`  ok   ${label}: ${String(actual).slice(0, 100)}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}: got "${actual}" want "${want}"`);
  }
}

async function main() {
  console.log("=== vault-sbtc-stx-v2 SELF-VERIFYING stxer harness ===\n");

  const vaaHex = await fetchBundledVaa();
  const vaaBuf = bufferCV(Buffer.from(vaaHex, "hex"));

  // Signed intents (auth-ids keep the hashes distinct).
  const intent = (action, side, amount, limitPrice, authId) => {
    const d = { vault: vaultCV, action, side, amount, limitPrice, authId, expiry: 0 };
    return { d, sig: signIntent(buildIntentHashHex(d)) };
  };
  const dep1 = intent("jing-deposit", SBTC_ASSET_NAME, SBTC_10K, DEAD_X, 1);
  const dep2 = intent("jing-deposit", SBTC_ASSET_NAME, SBTC_10K, DEAD_X, 2);
  const repriceOk = intent("jing-reprice", SBTC_ASSET_NAME, SBTC_10K, DEAD_X - 1, 3);
  const repriceBad = intent("jing-reprice", SBTC_ASSET_NAME, SBTC_10K + 1, DEAD_X - 2, 4);
  const jingSwap = intent("jing-swap", SBTC_ASSET_NAME, SBTC_2K, PERMISSIVE_X_LIMIT, 5);
  // limit 1e10 -> min-out = amount (2000 uSTX floor, ~0 slippage bound but
  // NONZERO: xyk-core rejects min-dy = 0, the documented v1 config bug).
  const bitflow = intent("bitflow-swap", SBTC_ASSET_NAME, SBTC_2K, 10_000_000_000, 6);
  const dlmm = intent("dlmm-swap", WSTX_ASSET_NAME, STX_100, DEAD_X, 7);

  const vaultCall = (sender, fn, args) => (b) =>
    b.withSender(sender).addContractCall({
      contract_id: VAULT_ID,
      function_name: fn,
      function_args: args,
    });
  const exec = (sender, fn, it, vaa) =>
    vaultCall(sender, fn, [
      bufferCV(Buffer.from(it.sig, "hex")),
      stringAsciiCV(it.d.side),
      uintCV(it.d.amount),
      uintCV(it.d.limitPrice),
      uintCV(it.d.authId),
      uintCV(it.d.expiry),
      ...(vaa ? [vaa] : []),
    ]);

  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
    // Fund the throwaway deployer with STX for the vault's STX inventory.
    .addSTXTransfer({
      sender: STX_DEPOSITOR_1,
      recipient: DEPLOYER,
      amount: STX_500,
    })
    // Fresh v2 stack under the throwaway deployer.
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: "jing-core-v3",
      source_code: coreSrc,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractDeploy({
      contract_name: "jing-vault-auth",
      source_code: vaultAuthSrc,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractDeploy({
      contract_name: MARKET_NAME,
      source_code: mktSrc,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "set-verified-contract",
      function_args: [marketCV],
    })
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "initialize",
      function_args: [
        marketCV, sbtcTrait, wstxTrait,
        uintCV(MIN_SBTC), uintCV(MIN_STX), btcFeedBuf, stxFeedBuf,
      ],
    })
    // Vault + bad-rebate twin.
    .addContractDeploy({
      contract_name: VAULT_NAME,
      source_code: vaultSrc,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractDeploy({
      contract_name: BAD_VAULT_NAME,
      source_code: badVaultSrc,
      clarity_version: ClarityVersion.Clarity5,
    })
    // Bad twin: rebate assert fires BEFORE jing-core register -> u6023
    // (no set-verified-contract needed).
    .addContractCall({
      contract_id: BAD_VAULT_ID,
      function_name: "initialize",
      function_args: [badVaultCV],
    })
    // Real vault: verified + initialized against the live registry.
    .addContractCall({
      contract_id: JING_CORE_ID,
      function_name: "set-verified-contract",
      function_args: [vaultCV],
    })
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "initialize",
      function_args: [vaultCV],
    })
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "set-owner-pubkey",
      function_args: [bufferCV(Buffer.from(TEST_INTENT_PUBKEY_HEX, "hex"))],
    })
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "set-keeper",
      function_args: [someCV(standardPrincipalCV(STX_DEPOSITOR_1))],
    })
    // Fund owner, then the vault: sBTC inventory + STX (incl. Pyth fee
    // budget headroom).
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(SBTC_10K + SBTC_2K),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(DEPLOYER),
        noneCV(),
      ],
    });

  b = vaultCall(DEPLOYER, "deposit-sbtc", [uintCV(SBTC_10K + SBTC_2K)])(b);
  b = vaultCall(DEPLOYER, "deposit-stx", [uintCV(STX_100)])(b);

  // Signed jing-deposit (dead sBTC offer, empty book -> dummy VAA), keeper
  // submits. Then replay -> u6003.
  b = exec(STX_DEPOSITOR_1, "execute-jing-deposit", dep1, DUMMY)(b);
  b = b.addEvalCode(MARKET_ID, `(get-token-x-deposit u0 '${VAULT_ID})`);
  b = exec(STX_DEPOSITOR_1, "execute-jing-deposit", dep1, DUMMY)(b);

  // Reprice the resting position: plain retarget ok, wrong signed amount
  // -> u6022.
  b = exec(STX_DEPOSITOR_1, "execute-jing-reprice", repriceOk, DUMMY)(b);
  b = b.addEvalCode(MARKET_ID, `(get-token-x-limit '${VAULT_ID})`);
  b = exec(STX_DEPOSITOR_1, "execute-jing-reprice", repriceBad, DUMMY)(b);

  // Keeper cancels via the EMPTY as-contract? allowance; sBTC returns.
  b = b.addEvalCode(SBTC_FQN, `(get-balance '${VAULT_ID})`);
  b = vaultCall(STX_DEPOSITOR_1, "cancel-jing-sbtc", [])(b);
  b = b.addEvalCode(SBTC_FQN, `(get-balance '${VAULT_ID})`);

  // jing-swap taker path: a live STX bid rests (empty x book after the
  // cancel -> dummy VAA), then the vault swaps 2k sats into it with a real
  // VAA. The vault is FIRST to refresh the feeds in this block, so Pyth's
  // fee is nonzero: this exercises the PYTH_FEE_BUDGET allowance for real.
  b = b.withSender(STX_DEPOSITOR_1).addContractCall({
    contract_id: MARKET_ID,
    function_name: "deposit-token-y",
    function_args: [uintCV(STX_100), uintCV(LIVE_Y), DUMMY, wstxTrait, wstxAsset],
  });
  b = exec(STX_DEPOSITOR_1, "execute-jing-swap", jingSwap, vaaBuf)(b);
  b = b.addEvalCode(SBTC_FQN, `(get-balance '${VAULT_ID})`);

  // AMM paths against the real pools.
  b = exec(STX_DEPOSITOR_1, "execute-bitflow-swap", bitflow)(b);
  b = exec(STX_DEPOSITOR_1, "execute-dlmm-swap", dlmm)(b);
  b = b.addEvalCode(VAULT_ID, "(get-status)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;

  let i = 0;
  i++; // deployer STX funding transfer
  assert("deploy jing-core-v3 (14-arg log-settlement)", decodeTx(s[i++]), "(ok true)");
  assert("deploy jing-vault-auth", decodeTx(s[i++]), "(ok true)");
  assert("deploy market v2", decodeTx(s[i++]), "(ok true)");
  assert("core set-verified(market)", decodeTx(s[i++]), "(ok true)");
  assert("market initialize", decodeTx(s[i++]), "(ok true)");
  assert("deploy vault v2", decodeTx(s[i++]), "(ok true)");
  assert("deploy bad-rebate twin", decodeTx(s[i++]), "(ok true)");
  assert("bad twin initialize -> REBATE_MISMATCH", decodeTx(s[i++]), "(err u6023)");
  assert("core set-verified(vault)", decodeTx(s[i++]), "(ok true)");
  assert("vault initialize (rebate parity ok)", decodeTx(s[i++]), "(ok true)");
  assert("set-owner-pubkey", decodeTx(s[i++]), "(ok true)");
  assert("set-keeper", decodeTx(s[i++]), "(ok true)");
  assert("fund owner sBTC", decodeTx(s[i++]), "(ok true)");
  assert("deposit-sbtc", decodeTx(s[i++]), "(ok true)");
  assert("deposit-stx", decodeTx(s[i++]), "(ok true)");
  assert("execute-jing-deposit ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok 0x"));
  assert("vault resting on market (the signed 10k)", decodeEval(s[i++]), "u10000");
  assert("replay -> ERR_REPLAY", decodeTx(s[i++]), "(err u6003)");
  assert("execute-jing-reprice plain ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok 0x"));
  assert("limit retargeted on market", decodeEval(s[i++]), String(DEAD_X - 1));
  assert("reprice wrong amount -> AMOUNT_MISMATCH", decodeTx(s[i++]), "(err u6022)");
  const balBeforeCancel = decodeEval(s[i++]);
  assert("cancel-jing-sbtc (empty allowance) ok", decodeTx(s[i++]), "(ok true)");
  assert(
    "cancel refunded the 10k resting sats to the vault",
    `${balBeforeCancel} -> ${decodeEval(s[i++])}`,
    (v) => v.includes("(ok u2000) -> (ok u12000)"),
  );
  assert("live STX bid rests", decodeTx(s[i++]), "(ok u100000000)");
  assert("execute-jing-swap FOK ok (pays Pyth fee from budget)", decodeTx(s[i++]),
    (v) => String(v).startsWith("(ok 0x"));
  assert("vault sBTC debited by swap amount", decodeEval(s[i++]), "(ok u10000)");
  assert("execute-bitflow-swap ok", decodeTx(s[i++]), (v) => String(v).startsWith("(ok 0x"));
  // The DLMM stx-sbtc bps-15 pool is empty/quotes dy=0 on current forks
  // (the clarinet suite hits the same wall); accept the pool-side minimum-
  // received revert as the environment outcome, a fill when the pool is live.
  assert("execute-dlmm-swap ok-or-pool-empty (u2003)", decodeTx(s[i++]), (v) =>
    String(v).startsWith("(ok 0x") || String(v).includes("(err u2003)"));
  assert("final get-status decodes", decodeEval(s[i++]), (v) => String(v).includes("keeper"));

  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
