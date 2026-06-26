import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { Cl, cvToJSON, getAddressFromPrivateKey } from "@stacks/transactions";
import {
  SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN, USDCX_FQN, SBTC_DEPOSITOR_1,
  BTC_USD_FEED_HEX, STX_USD_FEED_HEX,
  PYTH_STORAGE, PYTH_DECODER, WORMHOLE_CORE,
  buildRfqAuthHashHex, signIntent, TEST_INTENT_PRIVKEY,
} from "../simulations/_setup.js";

// ============================================================================
// rfq oracle-gate unit tests (rfq-sbtc-{stx,usdcx}-jing).
//
// The four Pyth sanity gates in fix-price — STALE_PRICE (u1005),
// PRICE_UNCERTAIN (u1006), ZERO_PRICE (u1009) and EXPO_MISMATCH (u1020, stx
// only) — can't be provoked with real Hermes VAAs on a mainnet fork: fix-price
// always `verify-and-update`s a fresh VAA before reading, real feeds are
// positive / tight-conf / expo=-8, and pyth won't store an older-than-current
// price. So the stxer harnesses leave them as code-review-only.
//
// Here we deploy a MOCK pyth-storage (settable feed data) + a no-op mock oracle,
// patch the rfq source to point its two hardcoded pyth contract refs at the
// mocks (same trick the markets queue-full test uses for MAX_DEPOSITORS), inject
// crafted feed data, and assert each gate fires. The client is a synthetic
// keypair so we sign the SIP-018 fix-price authorization ourselves.
// ============================================================================

function detectRemoteData(): boolean {
  try {
    const supply = cvToJSON(
      simnet.callReadOnlyFn(SBTC_FQN, "get-total-supply", [], simnet.getAccounts().get("deployer")!).result,
    );
    return Number(supply.value?.value || 0) > 0;
  } catch {
    return true;
  }
}
const remoteDataEnabled = detectRemoteData();

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const MM = accounts.get("wallet_1")!;            // the winning market-maker (fix-price sender)
const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet"); // synthetic, key-controlled
const JING_CORE = "jing-core";

const PYTH_ORACLE_FQN = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4";
const PYTH_STORAGE_FQN = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4";

const SBTC_IN = 200_000;
const MIN_OUT = 1_000;
const MAX_PREMIUM_BPS = 100;
const AUTH_BIG = 10_000_000_000;

// A "normal" feed: positive price, tight conf, expo -8, far-future publish-time
// (so the freshness gate always passes — isolating whichever gate we target).
const NORMAL = { price: 100_000_000, conf: 1, expo: -8, pubTime: 99_999_999_999 };

const cp = (fqn: string) => Cl.contractPrincipal(fqn.split(".")[0], fqn.split(".")[1]);

const MOCK_STORAGE_SRC = `
;; test-only stand-in for pyth-storage-v4 get-price; lets tests inject feed data.
(define-map feeds (buff 32) { price: int, conf: uint, expo: int, publish-time: uint })
(define-public (set-feed (feed (buff 32)) (price int) (conf uint) (expo int) (publish-time uint))
  (ok (map-set feeds feed { price: price, conf: conf, expo: expo, publish-time: publish-time })))
(define-read-only (get-price (price-feed-id (buff 32)))
  (map-get? feeds price-feed-id))
`;

const MOCK_ORACLE_SRC = `
;; test-only no-op stand-in for pyth-oracle-v4 verify-and-update-price-feeds.
(use-trait pyth-storage-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.storage-trait)
(use-trait pyth-decoder-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-traits-v2.decoder-trait)
(use-trait wormhole-core-trait 'SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.wormhole-traits-v2.core-trait)
(define-public (verify-and-update-price-feeds
    (price-feed-bytes (buff 8192))
    (execution-parameters {
      pyth-storage-contract: <pyth-storage-trait>,
      pyth-decoder-contract: <pyth-decoder-trait>,
      wormhole-core-contract: <wormhole-core-trait>,
    }))
  ;; determinate err type (uint) so the caller's try! type-checks; the err
  ;; branch is dead, the mock always succeeds.
  (if true (ok true) (err u0)))
`;

type Feed = { price: number; conf: number; expo: number; pubTime: number };

/** Deploy mock storage + oracle + a patched rfq (pyth refs swapped for mocks),
 *  wire the registry, and initialize. Unique names per call so tests don't
 *  collide on simnet's persisted state. */
function deployStack(market: "stx" | "usdcx", suffix: string) {
  const storageName = `mock-pyth-storage-${suffix}`;
  const oracleName = `mock-pyth-oracle-${suffix}`;
  const rfqName = `rfq-patched-${suffix}`;
  const file = market === "stx"
    ? "./contracts/rfq/rfq-sbtc-stx-jing.clar"
    : "./contracts/rfq/rfq-sbtc-usdcx-jing.clar";

  const src = fs.readFileSync(file, "utf8")
    .replaceAll(`'${PYTH_ORACLE_FQN}`, `'${deployer}.${oracleName}`)
    .replaceAll(`'${PYTH_STORAGE_FQN}`, `'${deployer}.${storageName}`);

  simnet.deployContract(storageName, MOCK_STORAGE_SRC, { clarityVersion: 5 } as any, deployer);
  simnet.deployContract(oracleName, MOCK_ORACLE_SRC, { clarityVersion: 5 } as any, deployer);
  simnet.deployContract(rfqName, src, { clarityVersion: 5 } as any, deployer);

  const rfqArg = Cl.contractPrincipal(deployer, rfqName);
  expect(simnet.callPublicFn(JING_CORE, "set-verified-contract", [rfqArg], deployer).result)
    .toBeOk(Cl.bool(true));

  const initArgs = market === "stx"
    ? [rfqArg, cp(SBTC_FQN), cp(WSTX_FQN), Cl.bufferFromHex(BTC_USD_FEED_HEX), Cl.bufferFromHex(STX_USD_FEED_HEX), Cl.uint(0)]
    : [rfqArg, cp(SBTC_FQN), cp(USDCX_FQN), Cl.bufferFromHex(BTC_USD_FEED_HEX), Cl.uint(0)];
  expect(simnet.callPublicFn(rfqName, "initialize", initArgs, deployer).result).toBeOk(Cl.bool(true));

  return { rfqName, storageName };
}

function setFeed(storageName: string, feedHex: string, f: Feed) {
  expect(simnet.callPublicFn(storageName, "set-feed",
    [Cl.bufferFromHex(feedHex), Cl.int(f.price), Cl.uint(f.conf), Cl.int(f.expo), Cl.uint(f.pubTime)],
    deployer).result).toBeOk(Cl.bool(true));
}

function fundClientSbtc(): boolean {
  try {
    const r = simnet.callPublicFn(SBTC_FQN, "transfer",
      [Cl.uint(SBTC_IN * 2), Cl.principal(SBTC_DEPOSITOR_1), Cl.principal(CLIENT), Cl.none()],
      SBTC_DEPOSITOR_1);
    return cvToJSON(r.result).success === true;
  } catch {
    return false;
  }
}

function openRfq(rfqName: string) {
  const r = simnet.callPublicFn(rfqName, "open-rfq",
    [Cl.uint(SBTC_IN), Cl.uint(MIN_OUT), cp(SBTC_FQN), Cl.stringAscii(SBTC_ASSET_NAME)], CLIENT);
  expect(r.result).toBeOk(Cl.uint(0));
}

function fixPrice(market: "stx" | "usdcx", rfqName: string) {
  const sig = signIntent(
    buildRfqAuthHashHex({
      market: Cl.contractPrincipal(deployer, rfqName), rfqId: 0,
      winner: Cl.principal(MM), maxPremiumBps: MAX_PREMIUM_BPS, authExpiry: AUTH_BIG,
    }, 1),
    TEST_INTENT_PRIVKEY,
  );
  const tail = [Cl.bufferFromHex(sig)];
  const vaas = market === "stx"
    ? [Cl.bufferFromHex("00"), Cl.bufferFromHex("00")]
    : [Cl.bufferFromHex("00")];
  const traits = [cp(PYTH_STORAGE), cp(PYTH_DECODER), cp(WORMHOLE_CORE)];
  return simnet.callPublicFn(rfqName, "fix-price",
    [Cl.uint(0), Cl.uint(1_000_000), Cl.uint(MAX_PREMIUM_BPS), Cl.uint(AUTH_BIG), ...tail, ...vaas, ...traits],
    MM);
}

// Run one gate: deploy, fund+open, set the crafted feed-x (+ normal feed-y for
// stx), fix-price, assert the expected error. Returns false if funding skipped.
function runGate(market: "stx" | "usdcx", suffix: string, feedX: Feed, expectedErr: number): boolean {
  const { rfqName, storageName } = deployStack(market, suffix);
  if (!fundClientSbtc()) {
    console.log(`[rfq-oracle ${market}/${suffix}] skipped — sBTC funding unavailable (remote_data VM state)`);
    return false;
  }
  openRfq(rfqName);
  setFeed(storageName, BTC_USD_FEED_HEX, feedX);
  if (market === "stx") setFeed(storageName, STX_USD_FEED_HEX, NORMAL);
  expect(fixPrice(market, rfqName).result).toBeErr(Cl.uint(expectedErr));
  return true;
}

describe.skipIf(!remoteDataEnabled)("rfq-sbtc-stx-jing oracle gates", () => {
  it("fix-price: ERR_ZERO_PRICE (1009) when feed price is not positive", () => {
    runGate("stx", "stx-zero", { ...NORMAL, price: 0 }, 1009);
  });
  it("fix-price: ERR_STALE_PRICE (1005) when publish-time is past MAX_STALENESS", () => {
    runGate("stx", "stx-stale", { ...NORMAL, pubTime: 1 }, 1005);
  });
  it("fix-price: ERR_PRICE_UNCERTAIN (1006) when conf >= price / MAX_CONF_RATIO", () => {
    runGate("stx", "stx-unc", { ...NORMAL, conf: NORMAL.price }, 1006);
  });
  it("fix-price: ERR_EXPO_MISMATCH (1020) when the two feeds' exponents differ", () => {
    // feed-x expo -7 vs the normal feed-y expo -8.
    runGate("stx", "stx-expo", { ...NORMAL, expo: -7 }, 1020);
  });
});

describe.skipIf(!remoteDataEnabled)("rfq-sbtc-usdcx-jing oracle gates", () => {
  it("fix-price: ERR_ZERO_PRICE (1009) when feed price is not positive", () => {
    runGate("usdcx", "usdcx-zero", { ...NORMAL, price: 0 }, 1009);
  });
  it("fix-price: ERR_STALE_PRICE (1005) when publish-time is past MAX_STALENESS", () => {
    runGate("usdcx", "usdcx-stale", { ...NORMAL, pubTime: 1 }, 1005);
  });
  it("fix-price: ERR_PRICE_UNCERTAIN (1006) when conf >= price / MAX_CONF_RATIO", () => {
    runGate("usdcx", "usdcx-unc", { ...NORMAL, conf: NORMAL.price }, 1006);
  });
});
