// _setup.js
// Shared helpers for jing v3 stxer simulations.
//
// The new jing-core registry adds an 8-step prelude before any market call:
//   1. Deploy jing-core
//   2. Deploy market
//   3. Owner: propose-validator
//   4. AdvanceBlocks 144 (timelock)
//   5. Validator: confirm-validator (anyone can call, simplest is validator itself)
//   6. Owner: propose-verified-contract(market)
//   7. AdvanceBlocks 144
//   8. Validator: confirm-verified-contract(market)
//   9. Owner: market.initialize(...) -> jing-core.register internally
//
// `addRegistryInit` runs steps 1-8 and lets the caller pass an
// `initializeArgs` array for step 9. The caller is responsible for any
// further senders / calls after init.

import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  ClarityVersion,
  contractPrincipalCV,
  standardPrincipalCV,
  serializeCV,
  tupleCV,
  stringAsciiCV,
  uintCV,
  privateKeyToPublic,
  publicKeyToHex,
  signMessageHashRsv,
} from "@stacks/transactions";

// --- Mainnet addresses used across all v3 sims ---
export const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
// Validator (gas only; ~20 STX free, rest PoX-locked — enough for confirms).
export const VALIDATOR = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3";
// USDCx whale, doubles as STX depositor for the sbtc-stx sims (2953 STX free).
export const USDCX_DEPOSITOR_1 = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
export const STX_DEPOSITOR_1 = USDCX_DEPOSITOR_1;
// sBTC whale: ~40.5 BTC.
export const SBTC_DEPOSITOR_1 = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

// --- Token + feed constants ---
export const SBTC_ADDR = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4";
export const SBTC_NAME = "sbtc-token";
export const SBTC_ASSET_NAME = "sbtc-token";
export const SBTC_FQN = `${SBTC_ADDR}.${SBTC_NAME}`;

export const USDCX_ADDR = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE";
export const USDCX_NAME = "usdcx";
export const USDCX_ASSET_NAME = "usdcx-token";
export const USDCX_FQN = `${USDCX_ADDR}.${USDCX_NAME}`;

export const WSTX_ADDR = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR";
export const WSTX_NAME = "token-stx-v-1-2";
export const WSTX_ASSET_NAME = "wstx";
export const WSTX_FQN = `${WSTX_ADDR}.${WSTX_NAME}`;

export const BTC_USD_FEED_HEX =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
export const STX_USD_FEED_HEX =
  "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";

// --- Protocol constants (mirror the contracts) ---
export const TIMELOCK_BURN_BLOCKS = 144;
export const CANCEL_THRESHOLD = 42;
export const JING_CORE_NAME = "jing-core";

// --- Pyth deps (mainnet) for settle-with-refresh + verify-and-update ---
export const PYTH_DEPLOYER = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y";
export const PYTH_STORAGE = `${PYTH_DEPLOYER}.pyth-storage-v4`;
export const PYTH_DECODER = `${PYTH_DEPLOYER}.pyth-pnau-decoder-v3`;
export const WORMHOLE_CORE = `${PYTH_DEPLOYER}.wormhole-core-v4`;
export const PYTH_HERMES_BASE = "https://hermes.pyth.network";

/**
 * Fetch a single Pyth VAA from Hermes for a feed at a given timestamp.
 * Returns the binary hex string (no 0x prefix).
 *
 * Used by sims that call settle-with-refresh / swap / close-and-settle-with-refresh.
 * Default timestamp is "now - 30 sec" so the VAA's publish-time is within
 * the production MAX_STALENESS = u80 freshness window.
 */
export async function fetchPythVAA(feedHex, timestamp) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000) - 30;
  const url = `${PYTH_HERMES_BASE}/v2/updates/price/${ts}?ids[]=${feedHex}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const d = await r.json();
  if (!d.binary?.data?.[0]) throw new Error(`No Pyth price at ts=${ts} for ${feedHex.slice(0, 8)}...`);
  return d.binary.data[0];
}

/**
 * Add registry-prelude steps + market.initialize to a SimulationBuilder.
 *
 * Multi-sig-owner model (no validator role, no two-step propose+confirm):
 *   1. Deploy jing-core
 *   2. Deploy market
 *   3. Owner (DEPLOYER): jing-core.set-verified-contract(market)
 *   4. Owner: market.initialize(...) -> internally calls jing-core.register
 *      (register checks tx-sender == contract-owner AND hash match)
 *
 * In production the contract-owner is intended to be a multi-sig; the
 * collapse from two-step + validator role to one-step owner action is
 * justified by multi-sig signing rounds providing the audit window.
 * See contracts/JING-CORE-DESIGN.md.
 *
 * @param {SimulationBuilder} builder       fresh / partial builder
 * @param {object} cfg
 * @param {string} cfg.marketName           e.g. "markets-sbtc-usdcx-jing"
 * @param {ClarityValue[]} cfg.initializeArgs   args for market.initialize
 *                                          (canonical, x, y, min-x, min-y,
 *                                          feed | feed-x feed-y)
 * @param {string} [cfg.marketSourceOverride]   optional market source to deploy
 *                                          instead of reading from disk (e.g.
 *                                          patched MAX_STALENESS for refresh sims)
 * @param {boolean} [cfg.useLive]           when true, skip the deploy + init
 *                                          prelude and treat jing-core + market
 *                                          as already deployed on mainnet.
 *                                          Use for vault/reserve/snpl sims that
 *                                          piggyback on the live registry+market.
 * @returns {SimulationBuilder}              builder ready for further calls
 */
export function addRegistryInit(builder, { marketName, initializeArgs, marketSourceOverride, useLive = false }) {
  if (useLive) {
    return builder;
  }
  const jingCoreSource = fs.readFileSync("./contracts/jing-core.clar", "utf8");
  const marketSource = marketSourceOverride ?? fs.readFileSync(
    `./contracts/${marketName}.clar`,
    "utf8"
  );
  const jingCoreId = `${DEPLOYER}.${JING_CORE_NAME}`;
  const marketId = `${DEPLOYER}.${marketName}`;
  const marketCV = contractPrincipalCV(DEPLOYER, marketName);

  return builder
    // Step 1: deploy jing-core (Clarity 4)
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: JING_CORE_NAME,
      source_code: jingCoreSource,
      clarity_version: ClarityVersion.Clarity4,
    })
    // Step 2: deploy market (Clarity 5)
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: marketName,
      source_code: marketSource,
      clarity_version: ClarityVersion.Clarity5,
    })
    // Step 3: owner sets verified-contract for the market (one step,
    // no timelock — multi-sig signing is the audit window)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: jingCoreId,
      function_name: "set-verified-contract",
      function_args: [marketCV],
    })
    // Step 4: owner initializes market — internally calls jing-core.register
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: marketId,
      function_name: "initialize",
      function_args: initializeArgs,
    });
}

// ============================================================================
// SIP-018 helpers for vault signed-intent stxer sims.
//
// The vaults verify intent signatures via `secp256k1-recover?` against the
// stored `owner-pubkey`. Stxer simulates calls from real mainnet addresses
// (e.g. SPV9... DEPLOYER) but we don't have their private keys. Workaround:
//
//   1. Pick a deterministic test private key (TEST_INTENT_PRIVKEY below).
//   2. Derive its 33-byte compressed pubkey (TEST_INTENT_PUBKEY_HEX).
//   3. In the sim, DEPLOYER (the vault OWNER) calls set-owner-pubkey to
//      install TEST_INTENT_PUBKEY_HEX as the signature-verification pubkey.
//   4. Sign messages off-chain with TEST_INTENT_PRIVKEY (RSV format).
//   5. Submit signed intents from any sender (anyone can submit; the sig
//      is the auth).
//
// The OWNER (mainnet address) and the signing-key pubkey are decoupled —
// that's by design: OWNER controls who can update owner-pubkey, and
// owner-pubkey is what verifies signatures. For stxer sims we set them to
// different keys; in production they'd be the same key controlled by the
// owner.
// ============================================================================

// 32-byte private key + 0x01 compression suffix (= 33 bytes / 66 hex chars).
// Deterministic seed so the simulated owner-pubkey + signatures are
// reproducible across runs.
export const TEST_INTENT_PRIVKEY =
  "1111111111111111111111111111111111111111111111111111111111111111" + "01";
export const TEST_INTENT_PUBKEY_HEX = publicKeyToHex(
  privateKeyToPublic(TEST_INTENT_PRIVKEY),
);

// Wrong-key pair to test ERR_INVALID_SIGNATURE in stxer sims.
export const WRONG_INTENT_PRIVKEY =
  "2222222222222222222222222222222222222222222222222222222222222222" + "01";

// SIP-018 constants. Match jing-vault-auth.clar's get-domain-hash:
//   sha256(consensusBuff({ name: "jing-vault", version: "1", chain-id: <id> }))
const SIP018_PREFIX = Buffer.from("534950303138", "hex"); // ASCII "SIP018"
const MAINNET_CHAIN_ID = 1;

function sha256(buf) {
  return createHash("sha256").update(buf).digest();
}

function cvSha256(cv) {
  // @stacks/transactions v7 `serializeCV` returns a HEX STRING, not raw
  // bytes. Buffer.from(string) without an encoding treats the hex chars
  // as Latin1 (e.g. "0c00..." → bytes 0x30 0x63 0x30 0x30 ...) which
  // doubles the byte stream and silently corrupts every downstream hash.
  // Parse explicitly as hex.
  const out = serializeCV(cv);
  if (typeof out === "string") return sha256(Buffer.from(out, "hex"));
  // Fallback for versions that return Uint8Array.
  return sha256(Buffer.from(out));
}

function getDomainHash(chainId = MAINNET_CHAIN_ID) {
  // Clarity serializes tuple keys in canonical (sorted) order. Match it
  // explicitly here so JS object iteration order can't subtly diverge:
  //   chain-id < name < version  (alphabetic).
  const domain = tupleCV({
    "chain-id": uintCV(chainId),
    name: stringAsciiCV("jing-vault"),
    version: stringAsciiCV("1"),
  });
  return cvSha256(domain);
}

/**
 * Off-chain mirror of jing-vault-auth.build-intent-hash. Returns a 32-byte
 * Buffer suitable for signMessageHashRsv (which takes hex). Use
 * `.toString("hex")` for the message-hash hex string.
 *
 * @param {object} details
 * @param {object} details.vault       contractPrincipalCV of the vault that will call build-intent-hash
 * @param {string} details.action      "jing-deposit" | "bitflow-swap" | "dlmm-swap"
 * @param {string} details.side        e.g. "sbtc-token", "wstx", "usdcx-token"
 * @param {number|bigint} details.amount
 * @param {number|bigint} details.limitPrice
 * @param {number|bigint} details.authId
 * @param {number|bigint} details.expiry
 * @param {number} [chainId]            defaults to mainnet (1)
 */
export function buildIntentHashHex(details, chainId) {
  // Canonical (alphabetic) tuple-key order matches Clarity's to-consensus-buff?:
  //   action < amount < auth-id < expiry < limit-price < side < vault.
  const detailsTuple = tupleCV({
    action: stringAsciiCV(details.action),
    amount: uintCV(details.amount),
    "auth-id": uintCV(details.authId),
    expiry: uintCV(details.expiry),
    "limit-price": uintCV(details.limitPrice),
    side: stringAsciiCV(details.side),
    vault: details.vault,
  });
  const detailsHash = cvSha256(detailsTuple);
  const composed = Buffer.concat([SIP018_PREFIX, getDomainHash(chainId), detailsHash]);
  return sha256(composed).toString("hex");
}

/**
 * Sign a hex message hash with RSV format. Convenience wrapper.
 */
export function signIntent(messageHashHex, privateKey = TEST_INTENT_PRIVKEY) {
  return signMessageHashRsv({ messageHash: messageHashHex, privateKey });
}

// ============================================================================
// RFQ SIP-018 helpers (rfq-sbtc-{usdcx,stx}-jing fix-price authorizations).
//
// Mirrors the contracts' `build-auth-hash`:
//   sha256( "SIP018" ++ domainHash ++ sha256(consensusBuff(detailsTuple)) )
// where domainHash = sha256(consensusBuff({ name:"jing-rfq", version:"1", chain-id }))
// and detailsTuple = { market, rfq-id, winner, max-premium-bps, expiry }.
// Clarity serializes tuple keys in canonical (sorted) order — match it exactly.
// ============================================================================

function getRfqDomainHash(chainId = MAINNET_CHAIN_ID) {
  // alphabetic: chain-id < name < version
  return cvSha256(tupleCV({
    "chain-id": uintCV(chainId),
    name: stringAsciiCV("jing-rfq"),
    version: stringAsciiCV("1"),
  }));
}

/**
 * Off-chain mirror of the RFQ contracts' build-auth-hash. Returns the 32-byte
 * message-hash HEX string for signMessageHashRsv / signIntent.
 *
 * @param {object} d
 * @param {ClarityValue} d.market         contractPrincipalCV(DEPLOYER, marketName)
 * @param {number|bigint} d.rfqId
 * @param {ClarityValue} d.winner         principal CV of the MM (the fix-price sender)
 * @param {number|bigint} d.maxPremiumBps
 * @param {number|bigint} d.authExpiry
 * @param {number} [chainId]              defaults to mainnet (1)
 */
export function buildRfqAuthHashHex(d, chainId) {
  // alphabetic key order: expiry < market < max-premium-bps < rfq-id < winner
  const details = tupleCV({
    expiry: uintCV(d.authExpiry),
    market: d.market,
    "max-premium-bps": uintCV(d.maxPremiumBps),
    "rfq-id": uintCV(d.rfqId),
    winner: d.winner,
  });
  const composed = Buffer.concat([SIP018_PREFIX, getRfqDomainHash(chainId), cvSha256(details)]);
  return sha256(composed).toString("hex");
}

/**
 * v2 mirror of build-auth-hash in rfq-sbtc-stx-jing-v2 (signed-quote honesty
 * design): tuple gains quoted-out + the TCA reference benchmark fields.
 * max-premium-bps was DELETED from v2 on 2026-07-15 (see README-rfq.md) --
 * for v3, which keeps the field, use buildRfqAuthHashHexV3.
 *
 * @param {object} d
 * @param {ClarityValue} d.market         contractPrincipalCV(DEPLOYER, marketName)
 * @param {number|bigint} d.rfqId
 * @param {ClarityValue} d.winner         principal CV of the MM (the fix-price sender)
 * @param {number|bigint} d.quotedOut     client-signed exact STX amount (uSTX)
 * @param {number|bigint} d.refPrice      declared venue price, STX-per-BTC x 1e8
 * @param {number|bigint} d.refTimestamp  venue unix seconds
 * @param {string} d.refVenue             e.g. "kraken-mid" (string-ascii 16)
 * @param {number|bigint} d.authExpiry
 * @param {number} [chainId]              defaults to mainnet (1)
 */
export function buildRfqAuthHashHexV2(d, chainId) {
  // alphabetic key order: expiry < market < quoted-out < ref-price
  //   < ref-timestamp < ref-venue < rfq-id < winner
  const details = tupleCV({
    expiry: uintCV(d.authExpiry),
    market: d.market,
    "quoted-out": uintCV(d.quotedOut),
    "ref-price": uintCV(d.refPrice),
    "ref-timestamp": uintCV(d.refTimestamp),
    "ref-venue": stringAsciiCV(d.refVenue),
    "rfq-id": uintCV(d.rfqId),
    winner: d.winner,
  });
  const composed = Buffer.concat([SIP018_PREFIX, getRfqDomainHash(chainId), cvSha256(details)]);
  return sha256(composed).toString("hex");
}

/**
 * v3 mirror of build-auth-hash in rfq-sbtc-stx-jing-v3 (bandless alternative):
 * same tuple as v2 PLUS max-premium-bps, which v3 keeps as signed TCA
 * metadata. Params as buildRfqAuthHashHexV2 plus d.maxPremiumBps.
 */
export function buildRfqAuthHashHexV3(d, chainId) {
  // alphabetic key order: expiry < market < max-premium-bps < quoted-out
  //   < ref-price < ref-timestamp < ref-venue < rfq-id < winner
  const details = tupleCV({
    expiry: uintCV(d.authExpiry),
    market: d.market,
    "max-premium-bps": uintCV(d.maxPremiumBps),
    "quoted-out": uintCV(d.quotedOut),
    "ref-price": uintCV(d.refPrice),
    "ref-timestamp": uintCV(d.refTimestamp),
    "ref-venue": stringAsciiCV(d.refVenue),
    "rfq-id": uintCV(d.rfqId),
    winner: d.winner,
  });
  const composed = Buffer.concat([SIP018_PREFIX, getRfqDomainHash(chainId), cvSha256(details)]);
  return sha256(composed).toString("hex");
}

/**
 * Fetch a Pyth VAA AND its parsed price/expo from Hermes in one call. Unlike
 * fetchPythVAA (which returns only the binary), this also returns the price the
 * contract will read after verify-and-update, so the harness can compute an
 * in-band `committed-out`. Default ts = now-30 (inside MAX_STALENESS=u80).
 */
export async function fetchPyth(feedHex, timestamp) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000) - 30;
  const url = `${PYTH_HERMES_BASE}/v2/updates/price/${ts}?ids[]=${feedHex}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const d = await r.json();
  const bin = d.binary?.data?.[0];
  const p = d.parsed?.[0]?.price;
  if (!bin || !p) throw new Error(`No Pyth data at ts=${ts} for ${feedHex.slice(0, 8)}...`);
  return { vaa: bin, price: BigInt(p.price), expo: p.expo, publishTime: p.publish_time };
}
