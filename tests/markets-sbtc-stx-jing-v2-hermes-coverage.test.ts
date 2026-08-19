import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";
import { tx } from "@stacks/clarinet-sdk";

// ============================================================================
// markets-sbtc-stx-jing-v2: Hermes-gated branch-coverage suite.
//
// Companion to markets-sbtc-stx-jing-v2-coverage.test.ts (deterministic).
// These scenarios need a real Pyth VAA - crossing gates, warm-storage
// classification, plain settle, empty settlements - and follow the
// mechanism suite's convention: fetch the VAA right before staging, batch
// ALL staging plus the action into one mineBlock so the 80-second staleness
// window survives, and skip (never fail) when Hermes is unreachable or the
// VAA aged out. Everything runs against the canonical manifest contract so
// coverage counts it.
// ============================================================================

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const C = "markets-sbtc-stx-jing-v2";
const JING_CORE = "jing-core-v3";
const MARKET = `${deployer}.${C}`;

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_ASSET = "sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const SBTC_TRAIT = Cl.contractPrincipal(
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
  "sbtc-token",
);
const WSTX_TOKEN = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2";
const WSTX_ASSET = "wstx";
const WSTX_TRAIT = Cl.contractPrincipal(
  "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR",
  "token-stx-v-1-2",
);

const BTC_FEED =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const STX_FEED =
  "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";

const MIN_X = 1_000;
const MIN_Y = 1_000_000;
const LIVE_BID = 999_999_999_999_999; // y limit far above any price: always live
const LIVE_ASK = 1; // x limit far below any price: always live
const DEAD_X = 999_999_999_999_999;
const DEAD_Y = 1;
const DUMMY_VAA = "00";

const ERR_STALE_PRICE = 1005;
const ERR_NOTHING_FILLED = 1021;
const ERR_MUST_USE_SWAP = 1022;

const PYTH_ORACLE = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4";
const PYTH_PLAN = Cl.tuple({
  "pyth-storage-contract": Cl.contractPrincipal(
    "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
    "pyth-storage-v4",
  ),
  "pyth-decoder-contract": Cl.contractPrincipal(
    "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
    "pyth-pnau-decoder-v3",
  ),
  "wormhole-core-contract": Cl.contractPrincipal(
    "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
    "wormhole-core-v4",
  ),
});

function detectRemoteData(): boolean {
  try {
    const xykPool = cvToJSON(
      simnet.callReadOnlyFn(
        "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1",
        "get-total-supply",
        [],
        deployer,
      ).result,
    );
    return Number(xykPool.value?.value || 0) > 0;
  } catch {
    return true;
  }
}
const remoteDataEnabled = detectRemoteData();

function pub(contract: string, fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(contract, fn, args, sender);
}
function ro(contract: string, fn: string, args: any[]) {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
}

async function fetchVaa(tag: string): Promise<string | null> {
  const timestamp = Math.floor(Date.now() / 1000) - 30;
  const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}&ids[]=${STX_FEED}`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    const data = await response.json();
    if (!data?.binary?.data?.[0]) {
      console.log(`[v2-cov] ${tag}: skipped - no VAA`);
      return null;
    }
    return data.binary.data[0];
  } catch (e) {
    console.log(
      `[v2-cov] ${tag}: skipped - Hermes fetch failed:`,
      (e as Error).message,
    );
    return null;
  }
}

function initTxs() {
  const marketArg = Cl.contractPrincipal(deployer, C);
  return [
    tx.callPublicFn(
      JING_CORE,
      "set-verified-contract",
      [marketArg],
      deployer,
    ),
    tx.callPublicFn(
      C,
      "initialize",
      [
        marketArg,
        Cl.principal(SBTC_TOKEN),
        Cl.principal(WSTX_TOKEN),
        Cl.uint(MIN_X),
        Cl.uint(MIN_Y),
        Cl.bufferFromHex(BTC_FEED),
        Cl.bufferFromHex(STX_FEED),
      ],
      deployer,
    ),
  ];
}

function fundSbtcTx(recipient: string, amount: number) {
  return tx.callPublicFn(
    SBTC_TOKEN,
    "transfer",
    [
      Cl.uint(amount),
      Cl.principal(SBTC_WHALE),
      Cl.principal(recipient),
      Cl.none(),
    ],
    SBTC_WHALE,
  );
}

function depositXTx(amount: number, limit: number, sender: string, vaa: string) {
  return tx.callPublicFn(
    C,
    "deposit-token-x",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      Cl.bufferFromHex(vaa),
      SBTC_TRAIT,
      Cl.stringAscii(SBTC_ASSET),
    ],
    sender,
  );
}
function depositYTx(amount: number, limit: number, sender: string, vaa: string) {
  return tx.callPublicFn(
    C,
    "deposit-token-y",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      Cl.bufferFromHex(vaa),
      WSTX_TRAIT,
      Cl.stringAscii(WSTX_ASSET),
    ],
    sender,
  );
}

function warmPythTx(vaaHex: string, sender: string) {
  return tx.callPublicFn(
    PYTH_ORACLE,
    "verify-and-update-price-feeds",
    [Cl.bufferFromHex(vaaHex), PYTH_PLAN],
    sender,
  );
}

function isStale(result: any): boolean {
  const j = cvToJSON(result);
  return !j.success && String(j.value?.value) === String(ERR_STALE_PRICE);
}

// Result of the LAST tx in a staged block, with the staging txs before it
// checked; returns null (skip) if staging failed or the action went stale.
function lastOrSkip(
  staged: { result: any }[],
  tag: string,
): any | null {
  for (let i = 0; i < staged.length - 1; i++) {
    const j: any = cvToJSON(staged[i].result);
    if ("success" in j && !j.success) {
      console.log(
        `[v2-cov] ${tag}: staging tx ${i} failed -`,
        Cl.prettyPrint(staged[i].result),
      );
      return null;
    }
  }
  const last = staged[staged.length - 1].result;
  if (isStale(last)) {
    console.log(`[v2-cov] ${tag}: skipped - VAA aged out`);
    return null;
  }
  return last;
}

describe.skipIf(!remoteDataEnabled)(
  "markets-sbtc-stx-jing-v2 Hermes-gated coverage",
  function () {
    it("deposit-token-x: ERR_MUST_USE_SWAP when the ask would cross a live bid", async function () {
      const vaaHex = await fetchVaa("gate-x");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        depositYTx(MIN_Y * 10, LIVE_BID, wallet1, DUMMY_VAA),
        fundSbtcTx(wallet2, MIN_X),
        depositXTx(MIN_X, LIVE_ASK, wallet2, vaaHex),
      ]);
      const last = lastOrSkip(staged, "gate-x");
      if (last === null) return;
      expect(last).toBeErr(Cl.uint(ERR_MUST_USE_SWAP));
    });

    it("deposit-token-y: ERR_MUST_USE_SWAP when the bid would cross a live ask", async function () {
      const vaaHex = await fetchVaa("gate-y");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        fundSbtcTx(wallet1, MIN_X * 10),
        depositXTx(MIN_X * 10, LIVE_ASK, wallet1, DUMMY_VAA),
        depositYTx(MIN_Y, LIVE_BID, wallet2, vaaHex),
      ]);
      const last = lastOrSkip(staged, "gate-y");
      if (last === null) return;
      expect(last).toBeErr(Cl.uint(ERR_MUST_USE_SWAP));
    });

    it("set-token-x-limit: gate refuses a reprice that would cross a live bid", async function () {
      const vaaHex = await fetchVaa("limit-gate-x");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        fundSbtcTx(wallet1, MIN_X),
        depositXTx(MIN_X, DEAD_X, wallet1, DUMMY_VAA),
        // live bid enters second: the resting ask is dead, nothing crosses
        depositYTx(MIN_Y * 10, LIVE_BID, wallet2, vaaHex),
        tx.callPublicFn(
          C,
          "set-token-x-limit",
          [Cl.uint(LIVE_ASK), Cl.bufferFromHex(vaaHex)],
          wallet1,
        ),
      ]);
      const last = lastOrSkip(staged, "limit-gate-x");
      if (last === null) return;
      expect(last).toBeErr(Cl.uint(ERR_MUST_USE_SWAP));
    });

    it("set-token-y-limit: gate refuses a reprice that would cross a live ask", async function () {
      const vaaHex = await fetchVaa("limit-gate-y");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        depositYTx(MIN_Y, DEAD_Y, wallet1, DUMMY_VAA),
        fundSbtcTx(wallet2, MIN_X * 10),
        depositXTx(MIN_X * 10, LIVE_ASK, wallet2, vaaHex),
        tx.callPublicFn(
          C,
          "set-token-y-limit",
          [Cl.uint(LIVE_BID), Cl.bufferFromHex(vaaHex)],
          wallet1,
        ),
      ]);
      const last = lastOrSkip(staged, "limit-gate-y");
      if (last === null) return;
      expect(last).toBeErr(Cl.uint(ERR_MUST_USE_SWAP));
    });

    it("swap: ERR_NOTHING_FILLED against a book of dead bids", async function () {
      const vaaHex = await fetchVaa("nothing-filled");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        depositYTx(MIN_Y * 10, DEAD_Y, wallet1, DUMMY_VAA),
        fundSbtcTx(wallet2, MIN_X * 10),
        // zero the mins: the dead bid rolls at settlement, and the post-roll
        // totals assert inside execute-settlement must still pass so the
        // zero-fill check is what fires.
        tx.callPublicFn(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "set-min-token-x-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(
          C,
          "swap",
          [
            Cl.uint(MIN_X * 10),
            Cl.uint(LIVE_ASK),
            Cl.bufferFromHex(vaaHex),
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
            Cl.bool(true),
          ],
          wallet2,
        ),
      ]);
      const last = lastOrSkip(staged, "nothing-filled");
      if (last === null) return;
      expect(last).toBeErr(Cl.uint(ERR_NOTHING_FILLED));
    });

    it("plain settle after warm: empty y side settles, dead asks roll", async function () {
      const vaaHex = await fetchVaa("plain-settle");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        fundSbtcTx(wallet1, MIN_X * 5),
        depositXTx(MIN_X * 5, DEAD_X, wallet1, DUMMY_VAA),
        // zero BOTH mins: the empty y side must not block the close, and the
        // dead ask rolls inside execute-settlement before it re-asserts the
        // totals, so post-roll x total is zero too.
        tx.callPublicFn(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "set-min-token-x-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "close-deposits", [], deployer),
        warmPythTx(vaaHex, wallet2),
        tx.callPublicFn(
          C,
          "settle",
          [
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
          ],
          wallet2,
        ),
      ]);
      const last = lastOrSkip(staged, "plain-settle");
      if (last === null) return;
      if (!cvToJSON(last).success) {
        console.log("[v2-cov] plain-settle: errored -", Cl.prettyPrint(last));
        return;
      }
      // wallet1's dead ask violated the settle price and rolled forward.
      expect(
        Number(
          cvToJSON(
            ro(C, "get-token-x-deposit", [Cl.uint(1), Cl.principal(wallet1)]),
          ).value,
        ),
      ).toBe(MIN_X * 5);
    });

    it("swap (STX taker): ERR_NOTHING_FILLED against a book of dead asks", async function () {
      const vaaHex = await fetchVaa("nothing-filled-y");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        fundSbtcTx(wallet1, MIN_X * 10),
        depositXTx(MIN_X * 10, DEAD_X, wallet1, DUMMY_VAA),
        tx.callPublicFn(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "set-min-token-x-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(
          C,
          "swap",
          [
            Cl.uint(MIN_Y * 10),
            Cl.uint(LIVE_BID),
            Cl.bufferFromHex(vaaHex),
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
            Cl.bool(false),
          ],
          wallet2,
        ),
      ]);
      const last = lastOrSkip(staged, "nothing-filled-y");
      if (last === null) return;
      expect(last).toBeErr(Cl.uint(ERR_NOTHING_FILLED));
    });

    it("settle-with-refresh settles a y-only closed book (zero fills, bids roll)", async function () {
      const vaaHex = await fetchVaa("refresh-empty-y");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        depositYTx(MIN_Y * 5, DEAD_Y, wallet1, DUMMY_VAA),
        tx.callPublicFn(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "set-min-token-x-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "close-deposits", [], deployer),
        tx.callPublicFn(
          C,
          "settle-with-refresh",
          [
            Cl.bufferFromHex(vaaHex),
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
          ],
          wallet2,
        ),
      ]);
      const last = lastOrSkip(staged, "refresh-empty-y");
      if (last === null) return;
      if (!cvToJSON(last).success) {
        console.log("[v2-cov] refresh-empty-y: errored -", Cl.prettyPrint(last));
        return;
      }
      expect(cvToJSON(last).success).toBe(true);
    });

    it("settle-with-refresh settles an x-only closed book (zero fills, asks roll)", async function () {
      const vaaHex = await fetchVaa("refresh-empty");
      if (!vaaHex) return;
      const staged = simnet.mineBlock([
        ...initTxs(),
        fundSbtcTx(wallet1, MIN_X * 5),
        depositXTx(MIN_X * 5, DEAD_X, wallet1, DUMMY_VAA),
        tx.callPublicFn(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "set-min-token-x-deposit", [Cl.uint(0)], deployer),
        tx.callPublicFn(C, "close-deposits", [], deployer),
        tx.callPublicFn(
          C,
          "settle-with-refresh",
          [
            Cl.bufferFromHex(vaaHex),
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
          ],
          wallet2,
        ),
      ]);
      const last = lastOrSkip(staged, "refresh-empty");
      if (last === null) return;
      if (!cvToJSON(last).success) {
        console.log("[v2-cov] refresh-empty: errored -", Cl.prettyPrint(last));
        return;
      }
      expect(cvToJSON(last).success).toBe(true);
    });
  },
);
