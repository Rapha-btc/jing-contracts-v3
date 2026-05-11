// simul-vault-sbtc-stx-full-cycle.js
// Stxer mainnet-fork sim: vault deposits into the live jing market, the
// cycle is closed and settled-with-refresh, vault sees its slice of the
// fill on the equity ledger.
//
// Flow:
//   1. Deploy fresh jing-vault-auth + vault-sbtc-stx, register + init.
//   2. Fund OWNER with sBTC + STX; OWNER deposits into vault.
//   3. Vault.execute-jing-deposit (STX side, permissive limit-price).
//   4. Standalone sBTC depositor adds sBTC to the same market cycle so
//      both sides have inventory to clear.
//   5. close-deposits.
//   6. settle-with-refresh with two fresh Pyth VAAs.
//   7. Read settlement state + vault status + vault equity to confirm the
//      vault's slice of the cleared cycle landed.
//
// Run: npx tsx simulations/simul-vault-sbtc-stx-full-cycle.js
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
  WSTX_FQN,
  BTC_USD_FEED_HEX,
  STX_USD_FEED_HEX,
  PYTH_STORAGE,
  PYTH_DECODER,
  WORMHOLE_CORE,
  TEST_INTENT_PUBKEY_HEX,
  buildIntentHashHex,
  signIntent,
  addRegistryInit,
  fetchPythVAA,
} from "./_setup.js";

const MARKET_NAME = "markets-sbtc-stx-jing";
const MARKET_ID = `${DEPLOYER}.${MARKET_NAME}`;
const VAULT_AUTH_NAME = "jing-vault-auth";
const VAULT_NAME = "vault-sbtc-stx";
const VAULT_ID = `${DEPLOYER}.${VAULT_NAME}`;
const JING_CORE_ID = `${DEPLOYER}.jing-core`;

const SBTC_VAULT_DEPOSIT = 10_000;   // OWNER puts 10k sats into vault for buffer
const STX_VAULT_DEPOSIT = 200_000_000;  // 200 STX into vault
const STX_INTENT_AMOUNT = 100_000_000;   // 100 STX through execute-jing-deposit
const SBTC_DIRECT_DEPOSIT = 10_000;       // matching sBTC side from another wallet
const MIN_SBTC = 1000;
const MIN_STX = 1_000_000;

// Permissive limit-price (10M STX/BTC cap) so vault's deposit is always
// within the clearing range whatever Pyth reports.
const STX_LIMIT_PERMISSIVE = 1_000_000_000_000_000;
// Permissive floor for the direct sBTC depositor.
const SBTC_LIMIT_PERMISSIVE = 1;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const btcFeedBuf = bufferCV(Buffer.from(BTC_USD_FEED_HEX, "hex"));
const stxFeedBuf = bufferCV(Buffer.from(STX_USD_FEED_HEX, "hex"));
const marketCV = contractPrincipalCV(DEPLOYER, MARKET_NAME);
const vaultCV = contractPrincipalCV(DEPLOYER, VAULT_NAME);

const [pythStoreAddr, pythStoreName] = PYTH_STORAGE.split(".");
const [pythDecAddr, pythDecName] = PYTH_DECODER.split(".");
const [wormAddr, wormName] = WORMHOLE_CORE.split(".");

async function fetchLiveCycle() {
  const r = await fetch(
    `https://api.hiro.so/v2/contracts/call-read/${DEPLOYER}/${MARKET_NAME}/get-current-cycle`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender: DEPLOYER, arguments: [] }),
    },
  );
  const d = await r.json();
  // result hex: 0x01 (uint type byte) + 16 bytes big-endian
  return parseInt(d.result.slice(-32), 16);
}

async function main() {
  console.log("=== VAULT-SBTC-STX FULL-CYCLE STXER SIM ===\n");
  console.log(`Test signing pubkey: 0x${TEST_INTENT_PUBKEY_HEX}`);

  const cycle = await fetchLiveCycle();
  console.log(`Live market current-cycle = ${cycle}`);

  const vaaXHex = await fetchPythVAA(BTC_USD_FEED_HEX);
  const vaaYHex = await fetchPythVAA(STX_USD_FEED_HEX);
  console.log("Fetched fresh Pyth VAAs for BTC/USD and STX/USD.\n");

  const jingDepositIntent = {
    vault: vaultCV,
    action: "jing-deposit",
    side: WSTX_ASSET_NAME, // "wstx"
    amount: STX_INTENT_AMOUNT,
    limitPrice: STX_LIMIT_PERMISSIVE,
    authId: 1,
    expiry: 0,
  };
  const jingDepositHashHex = buildIntentHashHex(jingDepositIntent);
  const jingDepositSig = signIntent(jingDepositHashHex);

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

  // Deploy + initialize vault.
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

  // Fund OWNER and vault.
  sim = sim
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: SBTC_FQN,
      function_name: "transfer",
      function_args: [
        uintCV(SBTC_VAULT_DEPOSIT),
        standardPrincipalCV(SBTC_DEPOSITOR_1),
        standardPrincipalCV(DEPLOYER),
        noneCV(),
      ],
    })
    .addSTXTransfer({
      sender: STX_DEPOSITOR_1,
      recipient: DEPLOYER,
      amount: STX_VAULT_DEPOSIT,
    })
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-sbtc",
      function_args: [uintCV(SBTC_VAULT_DEPOSIT)],
    })
    .addContractCall({
      contract_id: VAULT_ID,
      function_name: "deposit-stx",
      function_args: [uintCV(STX_VAULT_DEPOSIT)],
    });

  // Snapshot pre-deposit state.
  sim = sim
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(MARKET_ID, `(get-cycle-totals u${cycle})`);

  // Vault's signed jing-deposit on the STX side.
  sim = sim
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
    .addEvalCode(MARKET_ID, `(get-token-y-deposit u${cycle} '${VAULT_ID})`)
    .addEvalCode(MARKET_ID, `(get-cycle-totals u${cycle})`);

  // Direct sBTC depositor adds matching inventory on the x side.
  sim = sim
    .withSender(SBTC_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "deposit-token-x",
      function_args: [
        uintCV(SBTC_DIRECT_DEPOSIT),
        uintCV(SBTC_LIMIT_PERMISSIVE),
        sbtcTrait,
        sbtcAsset,
      ],
    })
    .addEvalCode(MARKET_ID, `(get-cycle-totals u${cycle})`);

  // Close + settle-with-refresh.
  sim = sim
    .withSender(STX_DEPOSITOR_1)
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "close-deposits",
      function_args: [],
    })
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addContractCall({
      contract_id: MARKET_ID,
      function_name: "settle-with-refresh",
      function_args: [
        bufferCV(Buffer.from(vaaXHex, "hex")),
        bufferCV(Buffer.from(vaaYHex, "hex")),
        contractPrincipalCV(pythStoreAddr, pythStoreName),
        contractPrincipalCV(pythDecAddr, pythDecName),
        contractPrincipalCV(wormAddr, wormName),
        sbtcTrait, sbtcAsset, wstxTrait, wstxAsset,
      ],
    });

  // Post-settle state.
  sim = sim
    .addEvalCode(MARKET_ID, `(get-settlement u${cycle})`)
    .addEvalCode(MARKET_ID, "(get-current-cycle)")
    .addEvalCode(MARKET_ID, "(get-cycle-phase)")
    .addEvalCode(VAULT_ID, "(get-status)")
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${SBTC_FQN} '${VAULT_ID})`)
    .addEvalCode(JING_CORE_ID, `(get-token-equity '${WSTX_FQN} '${VAULT_ID})`);

  const sessionId = await sim.run();
  console.log(`\nView: https://stxer.xyz/simulations/mainnet/${sessionId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
