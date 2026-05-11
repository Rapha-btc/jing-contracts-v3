// simul-vault-sbtc-stx-price-gates.js
// Stxer mainnet-fork sim that exercises the vault's derive-min-out slippage
// gate on both Bitflow paths (xyk + DLMM) with realistic limit-prices. Four
// cases:
//   1. bitflow-swap wstx LOOSE  -> pool fills, vault returns (ok msg-hash)
//   2. bitflow-swap sbtc TIGHT  -> pool reverts on slippage
//   3. dlmm-swap    wstx TIGHT  -> router reverts on slippage
//   4. dlmm-swap    sbtc LOOSE  -> router fills, vault returns (ok msg-hash)
//
// LOOSE limit-prices are far outside any plausible mainnet rate (1e15 for
// wstx side, 1e11 for sbtc side) so the gate always permits the fill.
// TIGHT prices flip the role (1e15 for sbtc side demands 1000 STX/BTC,
// 1e11 for wstx side demands 0.1 BTC per 100 STX) so the pool can never
// satisfy.
//
// Run: npx tsx simulations/simul-vault-sbtc-stx-price-gates.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
  noneCV,
  someCV,
  standardPrincipalCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import {
  DEPLOYER,
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
  TEST_INTENT_PUBKEY_HEX,
  buildIntentHashHex,
  signIntent,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const VAULT_AUTH_NAME = "jing-vault-auth";
const VAULT_NAME = "vault-sbtc-stx";
const VAULT_ID = `${DEPLOYER}.${VAULT_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_10K = 10_000;
const STX_100 = 100_000_000;
const SBTC_FUND = 20_000;       // 2x SBTC_10K
const STX_FUND = 200_000_000;   // 2x STX_100
const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;

// Limit-price calibration (limit-price = STX-per-sBTC * 1e8):
//   - 1e15 => cap 1e7 = 10M STX/BTC  (way above mainnet ~50-100k)
//   - 1e11 => cap 1e3 = 1k  STX/BTC  (way below mainnet)
const LOOSE_WSTX = 1_000_000_000_000_000;  // 1e15: vault willing to overpay
const TIGHT_WSTX = 100_000_000_000;        // 1e11: vault demanding bargain
const LOOSE_SBTC = 100_000_000_000;        // 1e11: vault accepting any rate
const TIGHT_SBTC = 1_000_000_000_000_000;  // 1e15: vault demanding impossible

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);
const vaultCV = contractPrincipalCV(DEPLOYER, VAULT_NAME);

async function main() {
  console.log("=== VAULT-SBTC-STX PRICE-GATES STXER SIM ===\n");
  console.log(`Test signing pubkey: 0x${TEST_INTENT_PUBKEY_HEX}`);

  // Four signed intents. Each (auth-id) unique so the replay map can't
  // collapse them; outcome-decoding is by step order.
  const intents = [
    {
      label: "bitflow-LOOSE-wstx",
      action: "bitflow-swap",
      side: WSTX_ASSET_NAME,
      amount: STX_100,
      limitPrice: LOOSE_WSTX,
      authId: 1,
      expiry: 0,
    },
    {
      label: "bitflow-TIGHT-sbtc",
      action: "bitflow-swap",
      side: SBTC_ASSET_NAME,
      amount: SBTC_10K,
      limitPrice: TIGHT_SBTC,
      authId: 2,
      expiry: 0,
    },
    {
      label: "dlmm-TIGHT-wstx",
      action: "dlmm-swap",
      side: WSTX_ASSET_NAME,
      amount: STX_100,
      limitPrice: TIGHT_WSTX,
      authId: 3,
      expiry: 0,
    },
    {
      label: "dlmm-LOOSE-sbtc",
      action: "dlmm-swap",
      side: SBTC_ASSET_NAME,
      amount: SBTC_10K,
      limitPrice: LOOSE_SBTC,
      authId: 4,
      expiry: 0,
    },
  ];

  for (const i of intents) {
    i.hashHex = buildIntentHashHex({ ...i, vault: vaultCV });
    i.sig = signIntent(i.hashHex);
  }

  const vaultAuthSource = fs.readFileSync(
    "./contracts/jing-vault-auth.clar",
    "utf8",
  );
  const vaultSource = fs.readFileSync(
    "./contracts/vault-sbtc-stx.clar",
    "utf8",
  );

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV, sbtcTrait, wstxTrait,
      uintCV(MIN_SBTC), uintCV(MIN_STX),
      btcFeedBuf, stxFeedBuf,
    ],
    useLive: true,
  });

  sim = sim
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: VAULT_AUTH_NAME,
      source_code: vaultAuthSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    .addContractDeploy({
      contract_name: VAULT_NAME,
      source_code: vaultSource,
      clarity_version: ClarityVersion.Clarity5,
    })
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
    // Authorize STX_DEPOSITOR_1 as keeper so execute-* calls pass the
    // tx-sender = (OWNER or keeper) gate in verify-and-consume.
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "set-keeper",
      function_args: [someCV(standardPrincipalCV(STX_DEPOSITOR_1))],
    });

  // Fund the vault: 20k sats + 200 STX (twice the swap amounts so both
  // sides of bitflow + both sides of dlmm have inventory).
  sim = sim
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(SBTC_FUND),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(DEPLOYER),
        noneCV(),
      ],
    })
    .addSTXTransfer({
      sender: STX_DEPOSITOR_1,
      recipient: DEPLOYER,
      amount: STX_FUND,
    })
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-sbtc",
      function_args: [uintCV(SBTC_FUND)],
    })
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-stx",
      function_args: [uintCV(STX_FUND)],
    })
    .addEvalCode(VAULT_ID, "(get-status)");

  // Fire each signed intent. Order is bitflow×2 then dlmm×2; we put a
  // get-status eval after each to make the trace readable.
  for (const i of intents) {
    const fnName =
      i.action === "bitflow-swap" ? "execute-bitflow-swap" : "execute-dlmm-swap";
    sim = sim
      .withSender(STX_DEPOSITOR_1)
      .addContractCall({
        contract_id: VAULT_ID,
        function_name: fnName,
        function_args: [
          bufferCV(Buffer.from(i.sig, "hex")),
          stringAsciiCV(i.side),
          uintCV(i.amount),
          uintCV(i.limitPrice),
          uintCV(i.authId),
          uintCV(i.expiry),
        ],
      })
      .addEvalCode(VAULT_ID, "(get-status)");
  }

  const sessionId = await sim.run();
  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
  console.log("\nExpected outcomes (in order):");
  console.log("  bitflow-LOOSE-wstx: (ok 0x..)  fills via xyk");
  console.log("  bitflow-TIGHT-sbtc: (err ..)   xyk slippage");
  console.log("  dlmm-TIGHT-wstx:    (err ..)   dlmm slippage");
  console.log("  dlmm-LOOSE-sbtc:    (ok 0x..)  fills via dlmm");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
