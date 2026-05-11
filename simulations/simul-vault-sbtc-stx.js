// simul-vault-sbtc-stx.js
// Stxer mainnet-fork simulation: full lifecycle of vault-sbtc-stx against
// a real markets-sbtc-stx-jing instance.
//
// Differences from simul-vault-sbtc-usdcx:
//   - token-y is native STX (denominated as wstx on the equity ledger).
//     deposit-stx / withdraw-stx use stx-transfer? + with-stx, not FT.
//   - signed-intent side strings are "wstx" / "sbtc-token".
//   - has BOTH execute-bitflow-swap (xyk-core) AND execute-dlmm-swap
//     (DLMM router). This sim exercises both.
//
// Run: npx tsx simulations/simul-vault-sbtc-stx.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  stringAsciiCV,
  bufferCV,
  someCV,
  noneCV,
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
  WSTX_FQN,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  TEST_INTENT_PUBKEY_HEX,
  buildIntentHashHex,
  signIntent,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const VAULT_AUTH_NAME = "jing-vault-auth";
const VAULT_NAME = "vault-sbtc-stx";
const VAULT_ID = `${DEPLOYER}.${VAULT_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_10K = 10_000;
const STX_100 = 100_000_000;
const STX_500 = 500_000_000;
const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);
const vaultCV = contractPrincipalCV(DEPLOYER, VAULT_NAME);

async function main() {
  console.log("=== VAULT-SBTC-STX END-TO-END STXER SIM ===\n");
  console.log(`Test signing pubkey: 0x${TEST_INTENT_PUBKEY_HEX}`);

  // jing-deposit (STX side) signed intent.
  const jingDepositIntent = {
    vault: vaultCV,
    action: "jing-deposit",
    side: WSTX_ASSET_NAME, // "wstx"
    amount: STX_100,
    limitPrice: 5_000_000_000_000,
    authId: 1,
    expiry: 0,
  };
  const jingDepositHashHex = buildIntentHashHex(jingDepositIntent);
  const jingDepositSig = signIntent(jingDepositHashHex);

  // bitflow-swap (sBTC -> STX via xyk-core sBTC/STX pool).
  const bitflowSwapIntent = {
    vault: vaultCV,
    action: "bitflow-swap",
    side: SBTC_ASSET_NAME, // "sbtc-token"
    amount: SBTC_10K,
    limitPrice: 1, // permissive on sbtc side (limit-price in numerator)
    authId: 2,
    expiry: 0,
  };
  const bitflowSwapHashHex = buildIntentHashHex(bitflowSwapIntent);
  const bitflowSwapSig = signIntent(bitflowSwapHashHex);

  // dlmm-swap (STX -> sBTC via DLMM router; pool layout x=wstx, y=sBTC).
  const dlmmSwapIntent = {
    vault: vaultCV,
    action: "dlmm-swap",
    side: WSTX_ASSET_NAME, // "wstx"
    amount: STX_100,
    limitPrice: 999_999_999_999_999, // permissive ceiling on wstx side
    authId: 3,
    expiry: 0,
  };
  const dlmmSwapHashHex = buildIntentHashHex(dlmmSwapIntent);
  const dlmmSwapSig = signIntent(dlmmSwapHashHex);

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
      marketCV,
      sbtcTrait,
      wstxTrait,
      uintCV(MIN_SBTC),
      uintCV(MIN_STX),
      btcFeedBuf,
      stxFeedBuf,
    ],
    useLive: true,
  });

  // Deploy jing-vault-auth + vault, register + init.
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
    });

  const sessionId = await sim
    .addEvalCode(JING_CORE_ID, `(is-registered '${VAULT_ID})`)
    .addEvalCode(VAULT_ID, "(get-status)")

    // Owner sets keeper.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "set-keeper",
      function_args: [someCV(standardPrincipalCV(STX_DEPOSITOR_1))],
    })

    // Fund OWNER (DEPLOYER) with sBTC + STX. DEPLOYER (SPV9..) has minimal
    // free STX, so pre-fund from STX_DEPOSITOR_1 (2953 STX free).
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(SBTC_10K),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(DEPLOYER),
        noneCV(),
      ],
    })
    .addSTXTransfer({
      sender: STX_DEPOSITOR_1,
      recipient: DEPLOYER,
      amount: STX_500 + STX_100, // covers deposit + buffer for the bitflow path
    })

    // Owner deposits sBTC + STX into vault.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-sbtc",
      function_args: [uintCV(SBTC_10K)],
    })
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-stx",
      function_args: [uintCV(STX_500)],
    })
    .addEvalCode(VAULT_ID, "(get-status)")
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${VAULT_ID})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${WSTX_FQN} '${VAULT_ID})`)

    // Signed jing-deposit (STX side).
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "execute-jing-deposit",
      function_args: [
        bufferCV(Buffer.from(jingDepositSig, "hex")),
        stringAsciiCV(jingDepositIntent.side),
        uintCV(jingDepositIntent.amount),
        uintCV(jingDepositIntent.limitPrice),
        uintCV(jingDepositIntent.authId),
        uintCV(jingDepositIntent.expiry),
      ],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${VAULT_ID})`)

    // Replay → ERR_REPLAY (u6003).
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "execute-jing-deposit",
      function_args: [
        bufferCV(Buffer.from(jingDepositSig, "hex")),
        stringAsciiCV(jingDepositIntent.side),
        uintCV(jingDepositIntent.amount),
        uintCV(jingDepositIntent.limitPrice),
        uintCV(jingDepositIntent.authId),
        uintCV(jingDepositIntent.expiry),
      ],
    })

    // Keeper cancels the in-flight market deposit.
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "cancel-jing-stx",
      function_args: [],
    })
    .addEvalCode(VAULT_ID, "(get-status)")

    // Signed bitflow-swap (sBTC -> STX via xyk-core).
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "execute-bitflow-swap",
      function_args: [
        bufferCV(Buffer.from(bitflowSwapSig, "hex")),
        stringAsciiCV(bitflowSwapIntent.side),
        uintCV(bitflowSwapIntent.amount),
        uintCV(bitflowSwapIntent.limitPrice),
        uintCV(bitflowSwapIntent.authId),
        uintCV(bitflowSwapIntent.expiry),
      ],
    })
    .addEvalCode(VAULT_ID, "(get-status)")

    // Signed dlmm-swap (STX -> sBTC via DLMM router).
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "execute-dlmm-swap",
      function_args: [
        bufferCV(Buffer.from(dlmmSwapSig, "hex")),
        stringAsciiCV(dlmmSwapIntent.side),
        uintCV(dlmmSwapIntent.amount),
        uintCV(dlmmSwapIntent.limitPrice),
        uintCV(dlmmSwapIntent.authId),
        uintCV(dlmmSwapIntent.expiry),
      ],
    })
    .addEvalCode(VAULT_ID, "(get-status)")
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${VAULT_ID})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${WSTX_FQN} '${VAULT_ID})`)

    // Owner withdraws remaining STX.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "withdraw-stx",
      function_args: [uintCV(STX_100)],
    })
    .addEvalCode(VAULT_ID, "(get-status)")

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
