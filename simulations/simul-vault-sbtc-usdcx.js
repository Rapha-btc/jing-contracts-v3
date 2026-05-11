// simul-vault-sbtc-usdcx.js
// Stxer mainnet-fork simulation: full lifecycle of vault-sbtc-usdcx against
// a real markets-sbtc-usdcx-jing instance.
//
// Flow:
//   1. addRegistryInit deploys jing-core + market and initializes the market.
//   2. Deploy vault, set-verified-contract for the vault, vault.initialize.
//   3. Owner sets owner-pubkey to the test signing key (TEST_INTENT_PUBKEY_HEX).
//   4. Owner sets keeper, deposits sBTC + USDCx.
//   5. Submit a signed jing-deposit intent (USDCx side) -> lands in market.
//   6. Cancel the in-flight market deposit via cancel-jing-usdcx -> refund.
//   7. Submit a signed dlmm-swap intent (sBTC -> USDCx via DLMM router).
//   8. Owner withdraws remaining USDCx + sBTC.
//   9. Read final get-status to confirm balances drained.
//
// Run: npx tsx simulations/simul-vault-sbtc-usdcx.js
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
  USDCX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  SBTC_FQN,
  USDCX_ADDR,
  USDCX_NAME,
  USDCX_ASSET_NAME,
  USDCX_FQN,
  BTC_USD_FEED_HEX,
  TEST_INTENT_PUBKEY_HEX,
  buildIntentHashHex,
  signIntent,
  addRegistryInit,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-usdcx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const VAULT_AUTH_NAME = "jing-vault-auth";
const VAULT_AUTH_ID = `${DEPLOYER}.${VAULT_AUTH_NAME}`;
const VAULT_NAME = "vault-sbtc-usdcx";
const VAULT_ID = `${DEPLOYER}.${VAULT_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_10K = 10_000;
const USDCX_100 = 100_000_000;
const USDCX_500 = 500_000_000;
const MIN_SBTC = 1000;
const MIN_USDCX = 1_000_000;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const usdcxTrait = contractPrincipalCV(USDCX_ADDR, USDCX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const usdcxAsset = stringAsciiCV(USDCX_ASSET_NAME);
const feedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);
const vaultCV = contractPrincipalCV(DEPLOYER, VAULT_NAME);

async function main() {
  console.log("=== VAULT-SBTC-USDCX END-TO-END STXER SIM ===\n");
  console.log(`Test signing pubkey: 0x${TEST_INTENT_PUBKEY_HEX}`);

  // Pre-compute signed-intent hashes + signatures.
  const jingDepositIntent = {
    vault: vaultCV,
    action: "jing-deposit",
    side: USDCX_ASSET_NAME, // "usdcx-token"
    amount: USDCX_100,
    limitPrice: 5_000_000_000_000,
    authId: 1,
    expiry: 0,
  };
  const jingDepositHashHex = buildIntentHashHex(jingDepositIntent);
  const jingDepositSig = signIntent(jingDepositHashHex);

  const dlmmSwapIntent = {
    vault: vaultCV,
    action: "dlmm-swap",
    side: SBTC_ASSET_NAME, // "sbtc-token"
    amount: SBTC_10K,
    limitPrice: 1, // permissive for sBTC side (limit-price in numerator)
    authId: 2,
    expiry: 0,
  };
  const dlmmSwapHashHex = buildIntentHashHex(dlmmSwapIntent);
  const dlmmSwapSig = signIntent(dlmmSwapHashHex);

  const vaultAuthSource = fs.readFileSync(
    "./contracts/jing-vault-auth.clar",
    "utf8",
  );
  const vaultSource = fs.readFileSync(
    "./contracts/vault-sbtc-usdcx.clar",
    "utf8",
  );

  let sim = SimulationBuilder.new();
  sim = addRegistryInit(sim, {
    marketName: MARKET_NAME,
    initializeArgs: [
      marketCV,
      sbtcTrait,
      usdcxTrait,
      uintCV(MIN_SBTC),
      uintCV(MIN_USDCX),
      feedBuf,
    ],
    useLive: true,
  });

  // Deploy jing-vault-auth (dep of the vault) + the vault, register + init.
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
    // Sanity reads
    .addEvalCode(JING_CORE_ID, `(is-registered '${VAULT_ID})`)
    .addEvalCode(VAULT_ID, "(get-status)")
    .addEvalCode(VAULT_ID, "(is-initialized)")

    // OWNER (DEPLOYER) sets a keeper.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "set-keeper",
      function_args: [someCV(standardPrincipalCV(USDCX_DEPOSITOR_1))],
    })

    // Fund the OWNER (DEPLOYER) so it can deposit-* into the vault.
    // SBTC: from sBTC whale → DEPLOYER.
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
    // USDCx: from USDCx whale → DEPLOYER.
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: USDCX_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(USDCX_500),
        standardPrincipalCV(USDCX_DEPOSITOR_1),
        standardPrincipalCV(DEPLOYER),
        noneCV(),
      ],
    })

    // Owner deposits into vault.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-sbtc",
      function_args: [uintCV(SBTC_10K)],
    })
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-usdcx",
      function_args: [uintCV(USDCX_500)],
    })
    .addEvalCode(VAULT_ID, "(get-status)")
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${VAULT_ID})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${USDCX_FQN} '${VAULT_ID})`)

    // Anyone (here keeper = USDCX_DEPOSITOR_1) submits the signed
    // jing-deposit intent. Vault verifies the sig against owner-pubkey
    // and forwards to the market.
    .withSender(USDCX_DEPOSITOR_1)
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
    .addEvalCode(VAULT_ID, "(get-status)")

    // Replay the same intent → ERR_REPLAY (u6003).
    .withSender(USDCX_DEPOSITOR_1)
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

    // Keeper cancels the in-flight market deposit; refund returns to vault.
    .withSender(USDCX_DEPOSITOR_1)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "cancel-jing-usdcx",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u0 '${VAULT_ID})`)
    .addEvalCode(VAULT_ID, "(get-status)")

    // Signed DLMM swap (sBTC → USDCx) — exercises the
    // dlmm-swap-router-v-1-1 path against the real mainnet pool.
    .withSender(USDCX_DEPOSITOR_1)
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

    // Owner-side revoke-intent burns a hash so it can never fire.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "revoke-intent",
      function_args: [bufferCV(Buffer.from("aa".repeat(32), "hex"))],
    })
    .addEvalCode(
      VAULT_ID,
      `(is-signature-used 0x${"aa".repeat(32)})`,
    )

    // Owner withdraws remaining USDCx + sBTC.
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "withdraw-usdcx",
      function_args: [uintCV(USDCX_500)],
    })
    .addEvalCode(VAULT_ID, "(get-status)")
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${USDCX_FQN} '${VAULT_ID})`)

    .run();

  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
