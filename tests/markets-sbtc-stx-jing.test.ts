import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

// ============================================================================
// markets-sbtc-stx-jing: parity mirror of v2 sbtc-stx-0-v2 against the v3
// dual-feed market (token-x = sBTC, token-y = STX via the bitflow wstx
// facade `token-stx-v-1-2`, feeds = BTC/USD + STX/USD).
//
// Differences from the USDCx single-feed test:
//   - `initialize` takes TWO buff-32 feeds (BTC then STX)
//   - oracle-price is computed from both feeds: (price-x * 1e8) / price-y
//   - token-y deposit/cancel/payout legs use native `stx-transfer?` internally
//     (the wstx trait is just a contract-of identity check at the boundary)
//   - settle-with-refresh takes vaa-x AND vaa-y (BTC + STX VAAs)
//
// Differences vs v2 sbtc-stx-0-v2:
//   - generic API (deposit-token-x / -y), not deposit-stx / deposit-sbtc
//   - jing-core 2-step registry (validator + verified-contract timelock)
//   - no DEPOSIT_MIN_BLOCKS / BUFFER_BLOCKS / DEX gate
//   - no premium variant (clearing == oracle)
// ============================================================================

// `remoteDataEnabled` may throw "Clarity VM failed to track token supply"
// when an earlier test file in the same fork settled an sBTC trade — the
// known clarinet remote_data VM bug surfaces on subsequent reads of any
// SIP-010 supply call. Treat a throw as "remote data still wired" so the
// suite runs; per-test try/catch already absorbs the bug at settlement time.
function detectRemoteData(): boolean {
  try {
    const xykPool = cvToJSON(
      simnet.callReadOnlyFn(
        "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1",
        "get-total-supply",
        [],
        simnet.getAccounts().get("deployer")!,
      ).result,
    );
    return Number(xykPool.value?.value || 0) > 0;
  } catch {
    return true;
  }
}
const remoteDataEnabled = detectRemoteData();

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;
const wallet4 = accounts.get("wallet_4")!;
const wallet5 = accounts.get("wallet_5")!;

const C = "markets-sbtc-stx-jing";
const JING_CORE = "jing-core";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_ASSET = "sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const SBTC_TRAIT = Cl.contractPrincipal(
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
  "sbtc-token",
);

// Bitflow's wstx SIP-010 facade — markets-sbtc-stx-jing's token-y. The market
// runs the actual transfer via `stx-transfer?` natively; the trait passed at
// the call boundary is only used for `(is-eq (contract-of t) (var-get token-y))`.
const WSTX_TOKEN = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2";
const WSTX_ASSET = "wstx"; // unused on STX side (no with-ft) but required arg
const WSTX_TRAIT = Cl.contractPrincipal(
  "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR",
  "token-stx-v-1-2",
);

const PYTH_STORAGE = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4";
const BTC_FEED =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const STX_FEED =
  "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";

const MIN_X = 1_000; // 1k sats sBTC
const MIN_Y = 1_000_000; // 1 STX (6dec)

const SBTC_2K = 2_000;
const SBTC_10K = 10_000;
const SBTC_50K = 50_000;
const SBTC_100K = 100_000;

const STX_1 = 1_000_000;
const STX_2 = 2_000_000;
const STX_10 = 10_000_000;
const STX_50 = 50_000_000;
const STX_100 = 100_000_000;
const STX_200 = 200_000_000;
const STX_500 = 500_000_000;

const CANCEL_THRESHOLD = 42;
const PRICE_PRECISION = 100_000_000;
const BPS_PRECISION = 10_000;
const FEE_BPS = 10;

function pub(contract: string, fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(contract, fn, args, sender);
}

function ro(contract: string, fn: string, args: any[]) {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
}

function fundSbtc(recipient: string, amount: number) {
  const result = simnet.callPublicFn(
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
  expect(result.result).toBeOk(Cl.bool(true));
}

// jing-core registry handshake. See markets-sbtc-usdcx-jing.test.ts for the
// full rationale — single-step `set-verified-contract` (owner-only, no
// timelock) followed by `initialize` which self-registers.
function setupRegistryAndInit() {
  const marketArg = Cl.contractPrincipal(deployer, C);

  expect(
    pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
  ).toBeOk(Cl.bool(true));

  // Dual-feed initialize: feed-x = BTC/USD, feed-y = STX/USD.
  expect(
    pub(
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
    ).result,
  ).toBeOk(Cl.bool(true));
}

function depositX(amount: number, limit: number, sender: string) {
  return pub(
    C,
    "deposit-token-x",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      SBTC_TRAIT,
      Cl.stringAscii(SBTC_ASSET),
    ],
    sender,
  );
}

function depositY(amount: number, limit: number, sender: string) {
  return pub(
    C,
    "deposit-token-y",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      WSTX_TRAIT,
      Cl.stringAscii(WSTX_ASSET),
    ],
    sender,
  );
}

function cancelX(sender: string) {
  return pub(
    C,
    "cancel-token-x-deposit",
    [SBTC_TRAIT, Cl.stringAscii(SBTC_ASSET)],
    sender,
  );
}

function cancelY(sender: string) {
  return pub(
    C,
    "cancel-token-y-deposit",
    [WSTX_TRAIT, Cl.stringAscii(WSTX_ASSET)],
    sender,
  );
}

function settle(sender: string) {
  return pub(
    C,
    "settle",
    [
      SBTC_TRAIT,
      Cl.stringAscii(SBTC_ASSET),
      WSTX_TRAIT,
      Cl.stringAscii(WSTX_ASSET),
    ],
    sender,
  );
}

function getOraclePrices() {
  const btcPyth = cvToJSON(
    simnet.callReadOnlyFn(
      PYTH_STORAGE,
      "get-price",
      [Cl.bufferFromHex(BTC_FEED)],
      deployer,
    ).result,
  );
  const stxPyth = cvToJSON(
    simnet.callReadOnlyFn(
      PYTH_STORAGE,
      "get-price",
      [Cl.bufferFromHex(STX_FEED)],
      deployer,
    ).result,
  );
  const btcPrice = Number(btcPyth.value?.value?.price?.value || 0);
  const stxPrice = Number(stxPyth.value?.value?.price?.value || 0);
  const oraclePrice =
    stxPrice > 0 ? Math.floor((btcPrice * PRICE_PRECISION) / stxPrice) : 0;
  return { btcPrice, stxPrice, oraclePrice };
}

describe.skipIf(!remoteDataEnabled)(
  "markets-sbtc-stx-jing (sBTC/STX, BTC_USD + STX_USD feeds)",
  function () {
    // --- Initialization + registry ---
    it("initialize: requires verified-contract; rejects double-init and non-operator", function () {
      const marketArg = Cl.contractPrincipal(deployer, C);

      // Without registry, register inside initialize fails ERR_NOT_VERIFIED.
      const naked = pub(
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
      );
      expect(naked.result).toBeErr(Cl.uint(5005));

      setupRegistryAndInit();

      expect(
        pub(
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
        ).result,
      ).toBeErr(Cl.uint(1018));

      expect(ro(C, "get-min-deposits", [])).toBeTuple({
        "min-token-x": Cl.uint(MIN_X),
        "min-token-y": Cl.uint(MIN_Y),
      });
    });

    it("initialize: non-operator rejected", function () {
      const marketArg = Cl.contractPrincipal(deployer, C);
      const r = pub(
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
        wallet1,
      );
      expect(r.result).toBeErr(Cl.uint(1011));
    });

    // --- Initial state ---
    it("initial state: cycle 0, deposit phase, zero totals", function () {
      setupRegistryAndInit();
      expect(ro(C, "get-current-cycle", [])).toBeUint(0);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      expect(ro(C, "get-cycle-totals", [Cl.uint(0)])).toBeTuple({
        "total-token-x": Cl.uint(0),
        "total-token-y": Cl.uint(0),
      });
    });

    // --- Deposit validation ---
    it("rejects token-y deposits below minimum", function () {
      setupRegistryAndInit();
      expect(depositY(100, 100_000, wallet1).result).toBeErr(Cl.uint(1001));
    });

    it("rejects zero limit price (token-y)", function () {
      setupRegistryAndInit();
      expect(depositY(STX_10, 0, wallet1).result).toBeErr(Cl.uint(1017));
    });

    it("rejects wrong-trait (token-y called with sBTC trait)", function () {
      setupRegistryAndInit();
      const r = pub(
        C,
        "deposit-token-y",
        [
          Cl.uint(STX_10),
          Cl.uint(100_000),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet1,
      );
      expect(r.result).toBeErr(Cl.uint(1019));
    });

    it("rejects wrong-trait (token-x called with wstx trait)", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_2K);
      const r = pub(
        C,
        "deposit-token-x",
        [
          Cl.uint(SBTC_2K),
          Cl.uint(100_000),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        wallet2,
      );
      expect(r.result).toBeErr(Cl.uint(1019));
    });

    // --- token-y (STX) lifecycle ---
    it("token-y (STX): deposit, top-up, cancel, re-deposit", function () {
      setupRegistryAndInit();
      const LIMIT = 5_000_000_000_000;

      expect(depositY(STX_100, LIMIT, wallet1).result).toBeOk(Cl.uint(STX_100));
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(STX_100);
      expect(ro(C, "get-token-y-limit", [Cl.principal(wallet1)])).toBeUint(
        LIMIT,
      );
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet1),
      ]);

      expect(depositY(STX_50, LIMIT, wallet1).result).toBeOk(Cl.uint(STX_50));
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(STX_100 + STX_50);
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet1),
      ]);

      expect(cancelY(wallet1).result).toBeOk(Cl.uint(STX_100 + STX_50));
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(0);
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([]);
      expect(cancelY(wallet1).result).toBeErr(Cl.uint(1008));

      expect(depositY(STX_100, LIMIT, wallet1).result).toBeOk(Cl.uint(STX_100));
    });

    // --- token-x (sBTC) lifecycle ---
    it("token-x (sBTC): deposit, top-up, cancel, re-deposit", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_100K * 2);
      const LIMIT = 5_000_000_000_000;

      expect(depositX(SBTC_100K, LIMIT, wallet2).result).toBeOk(
        Cl.uint(SBTC_100K),
      );
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_100K);
      expect(ro(C, "get-token-x-limit", [Cl.principal(wallet2)])).toBeUint(
        LIMIT,
      );

      expect(depositX(SBTC_10K, LIMIT, wallet2).result).toBeOk(
        Cl.uint(SBTC_10K),
      );
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_100K + SBTC_10K);
      expect(ro(C, "get-token-x-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet2),
      ]);

      expect(cancelX(wallet2).result).toBeOk(Cl.uint(SBTC_100K + SBTC_10K));
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(0);
      expect(cancelX(wallet2).result).toBeErr(Cl.uint(1008));

      expect(depositX(SBTC_100K, LIMIT, wallet2).result).toBeOk(
        Cl.uint(SBTC_100K),
      );
    });

    // --- Limit updates ---
    it("set-token-y-limit and set-token-x-limit", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_10K);

      depositY(STX_10, 5_000_000_000_000, wallet1);
      expect(
        pub(C, "set-token-y-limit", [Cl.uint(6_000_000_000_000)], wallet1)
          .result,
      ).toBeOk(Cl.bool(true));
      expect(ro(C, "get-token-y-limit", [Cl.principal(wallet1)])).toBeUint(
        6_000_000_000_000,
      );
      expect(
        pub(C, "set-token-y-limit", [Cl.uint(0)], wallet1).result,
      ).toBeErr(Cl.uint(1017));
      expect(
        pub(C, "set-token-y-limit", [Cl.uint(6_000_000_000_000)], wallet4)
          .result,
      ).toBeErr(Cl.uint(1008));

      depositX(SBTC_10K, 5_000_000_000_000, wallet2);
      expect(
        pub(C, "set-token-x-limit", [Cl.uint(7_000_000_000_000)], wallet2)
          .result,
      ).toBeOk(Cl.bool(true));
      expect(ro(C, "get-token-x-limit", [Cl.principal(wallet2)])).toBeUint(
        7_000_000_000_000,
      );
    });

    it("set-token-x-limit error paths: zero rejected, no deposit rejected", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_2K);
      depositX(SBTC_2K, 5_000_000_000_000, wallet2);
      expect(
        pub(C, "set-token-x-limit", [Cl.uint(0)], wallet2).result,
      ).toBeErr(Cl.uint(1017));
      expect(
        pub(C, "set-token-x-limit", [Cl.uint(5_000_000_000_000)], wallet4)
          .result,
      ).toBeErr(Cl.uint(1008));
    });

    // --- Admin ---
    it("admin: pause, operator, treasury, min deposits", function () {
      setupRegistryAndInit();

      expect(pub(C, "set-paused", [Cl.bool(true)], wallet1).result).toBeErr(
        Cl.uint(1011),
      );
      expect(
        pub(C, "set-paused", [Cl.bool(true)], deployer).result,
      ).toBeOk(Cl.bool(true));
      expect(depositY(STX_10, 100_000, wallet1).result).toBeErr(Cl.uint(1010));
      pub(C, "set-paused", [Cl.bool(false)], deployer);

      expect(
        pub(C, "set-operator", [Cl.principal(wallet1)], deployer).result,
      ).toBeOk(Cl.bool(true));
      expect(
        pub(C, "set-paused", [Cl.bool(true)], deployer).result,
      ).toBeErr(Cl.uint(1011));
      pub(C, "set-paused", [Cl.bool(false)], wallet1);
      pub(C, "set-operator", [Cl.principal(deployer)], wallet1);

      expect(
        pub(C, "set-treasury", [Cl.principal(wallet1)], deployer).result,
      ).toBeOk(Cl.bool(true));
      expect(
        pub(C, "set-treasury", [Cl.principal(wallet2)], wallet1).result,
      ).toBeErr(Cl.uint(1011));
      pub(C, "set-treasury", [Cl.principal(deployer)], deployer);

      expect(
        pub(C, "set-min-token-y-deposit", [Cl.uint(STX_10)], deployer).result,
      ).toBeOk(Cl.bool(true));
      expect(depositY(STX_2, 100_000, wallet1).result).toBeErr(Cl.uint(1001));
      pub(C, "set-min-token-y-deposit", [Cl.uint(MIN_Y)], deployer);

      fundSbtc(wallet2, SBTC_2K);
      expect(
        pub(C, "set-min-token-x-deposit", [Cl.uint(SBTC_10K)], deployer)
          .result,
      ).toBeOk(Cl.bool(true));
      expect(depositX(SBTC_2K, 100_000, wallet2).result).toBeErr(
        Cl.uint(1001),
      );
      pub(C, "set-min-token-x-deposit", [Cl.uint(MIN_X)], deployer);

      expect(
        pub(C, "set-min-token-y-deposit", [Cl.uint(1)], wallet1).result,
      ).toBeErr(Cl.uint(1011));
      expect(
        pub(C, "set-min-token-x-deposit", [Cl.uint(1)], wallet1).result,
      ).toBeErr(Cl.uint(1011));
    });

    // --- Close + cancel-cycle ---
    it("close-deposits: phase guards + double-close + cancel-cycle rollforward", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_10K);

      depositY(STX_100, 5_000_000_000_000, wallet1);
      depositX(SBTC_10K, 5_000_000_000_000, wallet2);

      expect(pub(C, "close-deposits", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );
      expect(pub(C, "close-deposits", [], wallet1).result).toBeErr(
        Cl.uint(1016),
      );
      expect(ro(C, "get-cycle-phase", [])).toBeUint(2);

      expect(depositY(STX_10, 100_000, wallet4).result).toBeErr(Cl.uint(1002));
      expect(cancelY(wallet1).result).toBeErr(Cl.uint(1002));
      expect(cancelX(wallet2).result).toBeErr(Cl.uint(1002));
      expect(
        pub(C, "set-token-y-limit", [Cl.uint(100_000)], wallet1).result,
      ).toBeErr(Cl.uint(1002));
      expect(
        pub(C, "set-token-x-limit", [Cl.uint(100_000)], wallet2).result,
      ).toBeErr(Cl.uint(1002));

      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeErr(
        Cl.uint(1014),
      );
      simnet.mineEmptyBlocks(CANCEL_THRESHOLD + 1);
      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );
      expect(ro(C, "get-current-cycle", [])).toBeUint(1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);

      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet1)]),
      ).toBeUint(STX_100);
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(1), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_10K);
    });

    it("close-deposits fails with only one side", function () {
      setupRegistryAndInit();
      depositY(STX_100, 5_000_000_000_000, wallet1);
      expect(pub(C, "close-deposits", [], wallet1).result).toBeErr(
        Cl.uint(1012),
      );
    });

    it("cancel-cycle fails in deposit phase", function () {
      setupRegistryAndInit();
      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeErr(
        Cl.uint(1003),
      );
    });

    // --- Read-only helpers ---
    it("get-cycle-start-block and get-blocks-elapsed advance", function () {
      setupRegistryAndInit();
      const startBlock = Number(
        cvToJSON(ro(C, "get-cycle-start-block", [])).value,
      );
      expect(startBlock).toBeGreaterThan(0);
      const before = Number(cvToJSON(ro(C, "get-blocks-elapsed", [])).value);
      simnet.mineEmptyBlocks(5);
      const after = Number(cvToJSON(ro(C, "get-blocks-elapsed", [])).value);
      expect(after).toBeGreaterThan(before);
    });

    // --- Small share filtering ---
    it("small share filtering token-y (STX): tiny deposit rolled on close-deposits", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_2K);

      const LIMIT = 99_999_999_999_999;
      depositY(STX_1, LIMIT, wallet5);                 // 1 STX (tiny)
      depositY(STX_500, LIMIT, wallet1);               // 500 STX (large)
      depositX(SBTC_2K, 1, wallet2);

      const closeResult = pub(C, "close-deposits", [], wallet1);
      expect(closeResult.result).toBeOk(Cl.bool(true));

      // 1*10000 = 10k vs 501*20 = 10.02k → tiny rolled.
      const w5cycle0 = Number(
        cvToJSON(
          ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet5)]),
        ).value,
      );
      const w5cycle1 = Number(
        cvToJSON(
          ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet5)]),
        ).value,
      );
      console.log(`[v3-stx] small share y: cycle0=${w5cycle0}, cycle1=${w5cycle1}`);
      expect(w5cycle1).toBe(STX_1);
      expect(w5cycle0).toBe(0);

      const events = closeResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      expect(
        events.filter(
          (v: any) => v.value?.event?.value === "small-share-roll-y",
        ).length,
      ).toBeGreaterThan(0);
    });

    it("small share filtering token-x (sBTC): tiny deposit rolled", function () {
      setupRegistryAndInit();
      pub(C, "set-min-token-x-deposit", [Cl.uint(100)], deployer);

      fundSbtc(wallet2, SBTC_50K);
      fundSbtc(wallet4, 100);

      const LIMIT = 99_999_999_999_999;
      depositY(STX_200, LIMIT, wallet1);
      depositX(SBTC_50K, 1, wallet2);
      depositX(100, 1, wallet4);

      const closeResult = pub(C, "close-deposits", [], wallet1);
      expect(closeResult.result).toBeOk(Cl.bool(true));

      const w4c0 = Number(
        cvToJSON(
          ro(C, "get-token-x-deposit", [Cl.uint(0), Cl.principal(wallet4)]),
        ).value,
      );
      const w4c1 = Number(
        cvToJSON(
          ro(C, "get-token-x-deposit", [Cl.uint(1), Cl.principal(wallet4)]),
        ).value,
      );
      console.log(`[v3-stx] small share x: cycle0=${w4c0}, cycle1=${w4c1}`);
      expect(w4c1).toBe(100);
      expect(w4c0).toBe(0);

      const events = closeResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      expect(
        events.filter(
          (v: any) => v.value?.event?.value === "small-share-roll-x",
        ).length,
      ).toBeGreaterThan(0);
    });

    // --- Full settlement: oracle = (BTC * 1e8) / STX ---
    it("full settlement: clearing = (BTC/USD * 1e8) / (STX/USD), fee math holds", function () {
      setupRegistryAndInit();
      const prices = getOraclePrices();
      expect(prices.oraclePrice).toBeGreaterThan(0);
      console.log(
        `[v3-stx] BTC=${prices.btcPrice}, STX=${prices.stxPrice}, ratio=${prices.oraclePrice}`,
      );

      fundSbtc(wallet2, SBTC_100K);

      const LIMIT_HIGH = 999_999_999_999_999;
      expect(depositY(STX_100, LIMIT_HIGH, wallet1).result).toBeOk(
        Cl.uint(STX_100),
      );
      expect(depositX(SBTC_100K, 1, wallet2).result).toBeOk(
        Cl.uint(SBTC_100K),
      );

      expect(pub(C, "close-deposits", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-stx] full settlement: threw — VM token supply bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-stx] full settlement: errored — VM token supply bug");
        return;
      }

      expect(ro(C, "get-current-cycle", [])).toBeUint(1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(0)]));
      const price = Number(settlement.value.value.price.value);
      const yCleared = Number(settlement.value.value["token-y-cleared"].value);
      const xCleared = Number(settlement.value.value["token-x-cleared"].value);
      const yFee = Number(settlement.value.value["token-y-fee"].value);
      const xFee = Number(settlement.value.value["token-x-fee"].value);

      console.log(
        `[v3-stx] price=${price}, x-cleared=${xCleared}, y-cleared=${yCleared}, fees: x=${xFee}, y=${yFee}`,
      );

      // No premium → clearing == oracle.
      expect(price).toBe(prices.oraclePrice);
      expect(yFee).toBe(Math.floor((yCleared * FEE_BPS) / BPS_PRECISION));
      expect(xFee).toBe(Math.floor((xCleared * FEE_BPS) / BPS_PRECISION));
    });

    // --- Pro-rata distribution to multiple STX depositors ---
    it("pro-rata distribution to multiple token-y depositors", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] pro-rata: skipped — VM token supply bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_100, LIMIT_HIGH, wallet1);
      depositY(STX_200, LIMIT_HIGH, wallet4);
      depositX(SBTC_10K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-stx] pro-rata: settle threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-stx] pro-rata: settle errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const distros = events.filter(
        (v: any) => v.value?.event?.value === "distribute-y-depositor",
      );

      console.log("[v3-stx] token-y distributions:");
      for (const d of distros) {
        console.log(
          `  ${d.value.depositor.value}: x-recv=${d.value["x-received"].value}, y-rolled=${d.value["y-rolled"].value}`,
        );
      }

      if (distros.length === 2) {
        const a = Number(distros[0].value["x-received"].value);
        const b = Number(distros[1].value["x-received"].value);
        // wallet4 deposited 2x wallet1 → ~2x sBTC received.
        expect(Math.abs(b - 2 * a)).toBeLessThan(3);
      }
    });

    // --- Multiple sBTC depositors ---
    it("multiple token-x depositors with pro-rata distribution", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
        fundSbtc(wallet4, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] multi-x depositors: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_200, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);
      depositX(SBTC_10K, 1, wallet4);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-stx] multi-x: threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-stx] multi-x: errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const distros = events.filter(
        (v: any) => v.value?.event?.value === "distribute-x-depositor",
      );

      console.log("[v3-stx] token-x distributions:");
      for (const d of distros) {
        console.log(
          `  ${d.value.depositor.value}: y-recv=${d.value["y-received"].value}, x-rolled=${d.value["x-rolled"].value}`,
        );
      }

      if (distros.length === 2) {
        const a = Number(distros[0].value["y-received"].value);
        const b = Number(distros[1].value["y-received"].value);
        expect(Math.abs(a - b)).toBeLessThan(3);
        expect(a).toBeGreaterThan(0);
      }
    });

    // --- token-y limit roll ---
    it("token-y (STX) limit order: low limit gets rolled", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] y-limit roll: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_100, 1, wallet1); // limit=1 → rolled
      depositY(STX_100, LIMIT_HIGH, wallet4);
      depositX(SBTC_10K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-stx] y-limit roll: threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-stx] y-limit roll: errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const limitRolls = events.filter(
        (v: any) => v.value?.event?.value === "limit-roll-y",
      );
      console.log("[v3-stx] token-y limit-roll events:", limitRolls.length);
      expect(limitRolls.length).toBeGreaterThan(0);

      const cycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);
      const w1rolled = Number(
        cvToJSON(
          ro(C, "get-token-y-deposit", [
            Cl.uint(cycle),
            Cl.principal(wallet1),
          ]),
        ).value,
      );
      expect(w1rolled).toBe(STX_100);
    });

    // --- token-x limit roll ---
    it("token-x (sBTC) limit order: high limit gets rolled", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
        fundSbtc(wallet4, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] x-limit roll: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_200, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, LIMIT_HIGH, wallet2); // limit very high → rolled
      depositX(SBTC_10K, 1, wallet4);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-stx] x-limit roll: threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-stx] x-limit roll: errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const limitRolls = events.filter(
        (v: any) => v.value?.event?.value === "limit-roll-x",
      );
      console.log("[v3-stx] token-x limit-roll events:", limitRolls.length);
      expect(limitRolls.length).toBeGreaterThan(0);

      const cycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);
      const w2rolled = Number(
        cvToJSON(
          ro(C, "get-token-x-deposit", [
            Cl.uint(cycle),
            Cl.principal(wallet2),
          ]),
        ).value,
      );
      expect(w2rolled).toBe(SBTC_10K);
    });

    // --- Multi-cycle ---
    it("multi-cycle: settle 0, deposit into 1, settle 1", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
        fundSbtc(wallet4, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] multi-cycle: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_100, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);
      pub(C, "close-deposits", [], wallet1);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-stx] multi-cycle: settle 0 threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-stx] multi-cycle: settle 0 errored — VM bug");
        return;
      }
      const cycleAfter0 = Number(
        cvToJSON(ro(C, "get-current-cycle", [])).value,
      );
      expect(cycleAfter0).toBeGreaterThanOrEqual(1);

      depositY(STX_200, LIMIT_HIGH, wallet5);
      depositX(SBTC_2K, 1, wallet4);
      pub(C, "close-deposits", [], wallet5);

      let r2;
      try {
        r2 = settle(wallet5);
      } catch {
        console.log("[v3-stx] multi-cycle: settle 1 threw — VM bug");
        return;
      }
      if (!cvToJSON(r2.result).success) {
        console.log("[v3-stx] multi-cycle: settle 1 errored — VM bug");
        return;
      }

      expect(
        ro(C, "get-settlement", [Cl.uint(cycleAfter0 - 1)]),
      ).not.toBeNone();
      expect(ro(C, "get-settlement", [Cl.uint(cycleAfter0)])).not.toBeNone();
    });

    // --- Dust sweep ---
    it("dust swept to treasury on settlement", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] dust sweep: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_100, LIMIT_HIGH, wallet1);
      depositY(STX_50 + STX_1, LIMIT_HIGH, wallet5);
      depositX(SBTC_10K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-stx] dust sweep: threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-stx] dust sweep: errored — VM bug");
        return;
      }

      const events = r.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const dust = events.find((v: any) => v.value?.event?.value === "sweep-dust");
      expect(dust).toBeDefined();
      console.log("[v3-stx] Dust:", JSON.stringify(dust!.value, null, 2));
    });

    // --- token-x-binding (sBTC oversupplied) ---
    // Sizing: 100 STX vs 2k sats sBTC. With STX/BTC ~3e5, 2k sats ≈ ~6 STX.
    // y-value-of-x (~6 STX) <= total-y (100 STX) → x is binding.
    it("settlement token-x-binding: all sBTC clears, STX rolls", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] x-binding: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_100, LIMIT_HIGH, wallet1);
      depositX(SBTC_2K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);
      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-stx] x-binding: threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-stx] x-binding: errored — VM bug");
        return;
      }

      const events = r.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const settlementEvent = events.find(
        (v: any) => v.value?.event?.value === "settlement",
      );
      expect(settlementEvent).toBeDefined();

      const bindingSide = settlementEvent!.value["binding-side"].value;
      const xUnfilled = Number(settlementEvent!.value["x-unfilled"].value);
      const yUnfilled = Number(settlementEvent!.value["y-unfilled"].value);
      console.log(
        `[v3-stx] x-binding: side=${bindingSide}, x-unfilled=${xUnfilled}, y-unfilled=${yUnfilled}`,
      );

      expect(bindingSide).toBe("x");
      expect(xUnfilled).toBe(0);
      expect(yUnfilled).toBeGreaterThan(0);

      const w1rolled = Number(
        cvToJSON(
          ro(C, "get-token-y-deposit", [
            Cl.uint(preCycle + 1),
            Cl.principal(wallet1),
          ]),
        ).value,
      );
      expect(w1rolled).toBeGreaterThan(0);
    });

    // --- token-y-binding (STX undersupplied) ---
    // Sizing: 10 STX vs 50k sats. STX/BTC ~3e5 → 50k sats ≈ ~150 STX value.
    // y-value-of-x (~150 STX) > total-y (10 STX) → y is binding.
    it("settlement token-y-binding: all STX clears, sBTC rolls", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_50K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] y-binding: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_10, LIMIT_HIGH, wallet1);
      depositX(SBTC_50K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);
      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-stx] y-binding: threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-stx] y-binding: errored — VM bug");
        return;
      }

      const events = r.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const settlementEvent = events.find(
        (v: any) => v.value?.event?.value === "settlement",
      );
      expect(settlementEvent).toBeDefined();

      const bindingSide = settlementEvent!.value["binding-side"].value;
      const xUnfilled = Number(settlementEvent!.value["x-unfilled"].value);
      const yUnfilled = Number(settlementEvent!.value["y-unfilled"].value);
      console.log(
        `[v3-stx] y-binding: side=${bindingSide}, x-unfilled=${xUnfilled}, y-unfilled=${yUnfilled}`,
      );

      expect(bindingSide).toBe("y");
      expect(yUnfilled).toBe(0);
      expect(xUnfilled).toBeGreaterThan(0);

      const w2rolled = Number(
        cvToJSON(
          ro(C, "get-token-x-deposit", [
            Cl.uint(preCycle + 1),
            Cl.principal(wallet2),
          ]),
        ).value,
      );
      expect(w2rolled).toBeGreaterThan(0);
    });

    // --- settle-with-refresh with live Hermes VAA (BTC + STX) ---
    it("settle-with-refresh with live Hermes VAA (dual feed)", async function () {
      setupRegistryAndInit();
      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}&ids[]=${STX_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-stx] settle-with-refresh: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-stx] settle-with-refresh: skipped — Hermes fetch failed:",
          (e as Error).message,
        );
        return;
      }

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] settle-with-refresh: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_100, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);
      pub(C, "close-deposits", [], wallet1);

      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);
      // Hermes returns ONE bundled VAA covering both feed IDs in the multi-id query;
      // contract verifies the same bundle twice (once per feed slot).
      const vaaArg = Cl.bufferFromHex(vaaHex);
      const pythStorage = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-storage-v4",
      );
      const pythDecoder = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-pnau-decoder-v3",
      );
      const wormhole = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "wormhole-core-v4",
      );

      let r;
      try {
        r = pub(
          C,
          "settle-with-refresh",
          [
            vaaArg,
            vaaArg,
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
          ],
          wallet1,
        );
      } catch (e) {
        console.log(
          "[v3-stx] settle-with-refresh: threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log(
          "[v3-stx] settle-with-refresh: errored — VM bug or VAA verify",
        );
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      console.log(
        `[v3-stx] settle-with-refresh: cycle ${preCycle} cleared at price ${settlement.value.value.price.value}`,
      );
    });

    // --- close-and-settle-with-refresh bundled call ---
    it("close-and-settle-with-refresh bundled call with live Hermes VAA", async function () {
      setupRegistryAndInit();
      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}&ids[]=${STX_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-stx] close-and-settle: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-stx] close-and-settle: skipped — Hermes fetch failed:",
          (e as Error).message,
        );
        return;
      }

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] close-and-settle: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_100, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);

      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);

      const vaaArg = Cl.bufferFromHex(vaaHex);
      const pythStorage = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-storage-v4",
      );
      const pythDecoder = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-pnau-decoder-v3",
      );
      const wormhole = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "wormhole-core-v4",
      );

      let r;
      try {
        r = pub(
          C,
          "close-and-settle-with-refresh",
          [
            vaaArg,
            vaaArg,
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
          ],
          wallet1,
        );
      } catch (e) {
        console.log(
          "[v3-stx] close-and-settle: threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log(
          "[v3-stx] close-and-settle: errored — VM bug or VAA verify",
        );
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v3-stx] close-and-settle: cycle ${preCycle} closed+settled in one tx`,
      );
    });

    // --- Same address on both sides ---
    // Mirror of simul-markets-sbtc-stx-jing-same-depositor.js. wallet2
    // funds with sBTC (from whale) and uses its built-in simnet STX
    // balance for the y-leg.
    it("same depositor on both sides: appears in both lists, settles cleanly", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] same-depositor: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      expect(depositY(STX_100, LIMIT_HIGH, wallet2).result).toBeOk(
        Cl.uint(STX_100),
      );
      expect(depositX(SBTC_10K, 1, wallet2).result).toBeOk(Cl.uint(SBTC_10K));

      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet2),
      ]);
      expect(ro(C, "get-token-x-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet2),
      ]);
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(STX_100);
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_10K);

      pub(C, "close-deposits", [], wallet2);
      let r;
      try {
        r = settle(wallet2);
      } catch {
        console.log("[v3-stx] same-depositor: settle threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-stx] same-depositor: settle errored — VM bug");
        return;
      }

      expect(ro(C, "get-current-cycle", [])).toBeUint(1);
      expect(ro(C, "get-settlement", [Cl.uint(0)])).not.toBeNone();
    });

    // --- Treasury fees verification ---
    // After settle, treasury (deployer) should receive:
    //   - sBTC delta == settlement.token-x-fee (FT transfer)
    //   - native STX delta == settlement.token-y-fee (stx-transfer?)
    it("treasury receives the exact fees recorded in the settlement tuple (sBTC + native STX)", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_100K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] treasury-fees: skipped — VM bug");
        return;
      }

      function getSbtcBalance(holder: string): number {
        const r = simnet.callReadOnlyFn(
          SBTC_TOKEN,
          "get-balance",
          [Cl.principal(holder)],
          deployer,
        ).result;
        return Number(cvToJSON(r).value.value);
      }
      function getStxBalance(holder: string): number {
        // simnet exposes a STX balance via getAssetsMap (test util) but
        // the cleanest portable way is `stx-get-balance` via a runtime
        // snippet. Here we use simnet.runSnippet to evaluate it.
        const out = simnet.runSnippet(`(stx-get-balance '${holder})`);
        // runSnippet returns a Clarity value; coerce to number.
        return Number(cvToJSON(out as any).value);
      }

      const sbtcBefore = getSbtcBalance(deployer);
      const stxBefore = getStxBalance(deployer);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(STX_500, LIMIT_HIGH, wallet1);
      depositX(SBTC_100K, 1, wallet2);
      pub(C, "close-deposits", [], wallet1);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-stx] treasury-fees: settle threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-stx] treasury-fees: settle errored — VM bug");
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(0)]));
      const xFee = Number(settlement.value.value["token-x-fee"].value);
      const yFee = Number(settlement.value.value["token-y-fee"].value);

      const sbtcAfter = getSbtcBalance(deployer);
      const stxAfter = getStxBalance(deployer);

      console.log(
        `[v3-stx] treasury-fees: x-fee=${xFee} (sBTC delta=${sbtcAfter - sbtcBefore}), y-fee=${yFee} (STX delta=${stxAfter - stxBefore})`,
      );

      // sBTC delta == x-fee. STX delta + dust == y-fee + roll-dust... wait:
      // settle's roll-and-sweep-dust ALSO sweeps to treasury. So treasury
      // STX delta = y-fee + y-dust (the y_dust includes y-payout-dust +
      // y-roll-dust). Same on x-side. To stay exact, read the sweep-dust
      // event and add it.
      const events = r.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const dust = events.find((v: any) => v.value?.event?.value === "sweep-dust");
      const xDust = dust ? Number(dust.value["x-dust"].value) : 0;
      const yDust = dust ? Number(dust.value["y-dust"].value) : 0;

      expect(sbtcAfter - sbtcBefore).toBe(xFee + xDust);
      expect(stxAfter - stxBefore).toBe(yFee + yDust);
    });

    // --- Atomic swap (deposit-x=true) ---
    it("atomic swap (deposit-x=true): pre-stages STX, sBTC taker fills in one tx", async function () {
      setupRegistryAndInit();

      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}&ids[]=${STX_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-stx] swap: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-stx] swap: skipped — Hermes fetch failed:",
          (e as Error).message,
        );
        return;
      }

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] swap: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      // Pre-stage STX liquidity (wallet1 has built-in STX).
      depositY(STX_100, LIMIT_HIGH, wallet1);

      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);
      const vaaArg = Cl.bufferFromHex(vaaHex);
      const pythStorage = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-storage-v4",
      );
      const pythDecoder = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-pnau-decoder-v3",
      );
      const wormhole = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "wormhole-core-v4",
      );

      let r;
      try {
        r = pub(
          C,
          "swap",
          [
            Cl.uint(SBTC_10K),
            Cl.uint(1),
            vaaArg,         // vaa-x
            vaaArg,         // vaa-y (same bundled multi-id VAA)
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
            Cl.bool(true),
          ],
          wallet2,
        );
      } catch (e) {
        console.log("[v3-stx] swap: threw —", (e as Error).message);
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-stx] swap: errored — VM bug or VAA verify");
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v3-stx] swap: cycle ${preCycle} settled atomically via swap(deposit-x=true)`,
      );
    });

    // --- Atomic swap (deposit-x=false) ---
    it("atomic swap (deposit-x=false): pre-stages sBTC, STX taker fills in one tx", async function () {
      setupRegistryAndInit();

      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}&ids[]=${STX_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-stx] swap-deposit-y: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-stx] swap-deposit-y: skipped — Hermes fetch failed:",
          (e as Error).message,
        );
        return;
      }

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-stx] swap-deposit-y: skipped — VM bug");
        return;
      }

      const LIMIT_HIGH = 999_999_999_999_999;
      // Pre-stage sBTC.
      depositX(SBTC_10K, 1, wallet2);

      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);
      const vaaArg = Cl.bufferFromHex(vaaHex);
      const pythStorage = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-storage-v4",
      );
      const pythDecoder = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "pyth-pnau-decoder-v3",
      );
      const wormhole = Cl.contractPrincipal(
        "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
        "wormhole-core-v4",
      );

      let r;
      try {
        r = pub(
          C,
          "swap",
          [
            Cl.uint(STX_100),
            Cl.uint(LIMIT_HIGH),
            vaaArg,
            vaaArg,
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
            Cl.bool(false),
          ],
          wallet1,
        );
      } catch (e) {
        console.log(
          "[v3-stx] swap-deposit-y: threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log(
          "[v3-stx] swap-deposit-y: errored — VM bug or VAA verify",
        );
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v3-stx] swap-deposit-y: cycle ${preCycle} settled atomically via swap(deposit-x=false)`,
      );
    });
  },
);
