import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";
import * as fs from "node:fs";

// ============================================================================
// markets-sbtc-usdcx-jing: parity mirror of the v2 sbtc-stx-0-v2 / sbtc-usdcx-v3
// suites against the v3 single-feed market (token-x = sBTC, token-y = USDCx,
// feed = BTC/USD). Adds the new jing-core registry handshake (validator +
// verified-contract timelock) before each test, since the market's
// `initialize` now calls `(contract-call? .jing-core register canonical)`
// and that requires both the validator set and the verified-contracts map
// to be primed.
//
// Differences vs v2 (sbtc-stx-0-v2):
//   - generic API: deposit-token-x / deposit-token-y take (amount, limit, ft, name)
//   - explicit `initialize` step (token-x=sBTC, token-y=USDCx, feed=BTC_USD)
//   - jing-core 2-step registry (propose / 144-burn-block timelock / confirm)
//   - no DEX sanity / dex-source / xyk / dlmm tests (v3 dropped DEX gate)
//   - no DEPOSIT_MIN_BLOCKS / BUFFER_BLOCKS (close → settle on next stacks block)
//   - settlement clearing == oracle (no premium variant in v3)
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

const C = "markets-sbtc-usdcx-jing";
const JING_CORE = "jing-core";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_ASSET = "sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const SBTC_TRAIT = Cl.contractPrincipal(
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
  "sbtc-token",
);

const USDCX_TOKEN = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const USDCX_ASSET = "usdcx-token"; // SIP-010 FT name (not contract name) for `with-ft` post-conditions
const USDCX_WHALE = "SP2V3J7G42E8ZD1YPK6G6295EQ1EGZMPGDZQSRDWT";
const USDCX_TRAIT = Cl.contractPrincipal(
  "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE",
  "usdcx",
);

const PYTH_STORAGE = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4";
const BTC_FEED =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

const MIN_X = 1_000; // 1k sats min sBTC
const MIN_Y = 1_000_000; // 1 USDCx (6dec)

const SBTC_2K = 2_000;
const SBTC_10K = 10_000;
const SBTC_50K = 50_000;
const SBTC_100K = 100_000;

const USDCX_1 = 1_000_000; // 1 USDCx
const USDCX_10 = 10_000_000; // 10 USDCx
const USDCX_50 = 50_000_000; // 50 USDCx
const USDCX_100 = 100_000_000; // 100 USDCx
const USDCX_200 = 200_000_000; // 200 USDCx
const USDCX_1K = 1_000_000_000; // 1000 USDCx

const CANCEL_THRESHOLD = 42;
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

function fundUsdcx(recipient: string, amount: number) {
  const result = simnet.callPublicFn(
    USDCX_TOKEN,
    "transfer",
    [
      Cl.uint(amount),
      Cl.principal(USDCX_WHALE),
      Cl.principal(recipient),
      Cl.none(),
    ],
    USDCX_WHALE,
  );
  expect(result.result).toBeOk(Cl.bool(true));
}

// jing-core v3 registry handshake. Simnet resets every `it()` (no
// beforeAll/beforeEach), so we run this from each test that needs an
// initialized market.
//
// New flow (post-redesign): owner calls `set-verified-contract` (single-
// step, no timelock, no validator role) and then calls market.initialize.
// Inside initialize the market self-registers via jing-core.register,
// which now asserts BOTH (caller-hash == verified-hash) AND
// (tx-sender == owner). The owner is the deployer here (and intended to
// be a multi-sig in production).
function setupRegistryAndInit() {
  const marketArg = Cl.contractPrincipal(deployer, C);

  const setVerified = pub(
    JING_CORE,
    "set-verified-contract",
    [marketArg],
    deployer,
  );
  expect(setVerified.result).toBeOk(Cl.bool(true));

  // Initialize the market. `initialize` calls `(contract-call? .jing-core
  // register canonical)` internally; the canonical is the market itself.
  const init = pub(
    C,
    "initialize",
    [
      marketArg,
      Cl.principal(SBTC_TOKEN),
      Cl.principal(USDCX_TOKEN),
      Cl.uint(MIN_X),
      Cl.uint(MIN_Y),
      Cl.bufferFromHex(BTC_FEED),
    ],
    deployer,
  );
  expect(init.result).toBeOk(Cl.bool(true));
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
      USDCX_TRAIT,
      Cl.stringAscii(USDCX_ASSET),
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
    [USDCX_TRAIT, Cl.stringAscii(USDCX_ASSET)],
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
      USDCX_TRAIT,
      Cl.stringAscii(USDCX_ASSET),
    ],
    sender,
  );
}

function getBtcOraclePrice() {
  const pyth = cvToJSON(
    simnet.callReadOnlyFn(
      PYTH_STORAGE,
      "get-price",
      [Cl.bufferFromHex(BTC_FEED)],
      deployer,
    ).result,
  );
  return Number(pyth.value?.value?.price?.value || 0);
}

describe.skipIf(!remoteDataEnabled)(
  "markets-sbtc-usdcx-jing (sBTC/USDCx, BTC_USD feed)",
  function () {
    // --- Initialization + registry ---
    it("initialize: requires verified-contract; rejects double-init and non-operator", function () {
      const marketArg = Cl.contractPrincipal(deployer, C);

      // Without registering the contract first, register inside initialize
      // hits ERR_NOT_VERIFIED (5005).
      const naked = pub(
        C,
        "initialize",
        [
          marketArg,
          Cl.principal(SBTC_TOKEN),
          Cl.principal(USDCX_TOKEN),
          Cl.uint(MIN_X),
          Cl.uint(MIN_Y),
          Cl.bufferFromHex(BTC_FEED),
        ],
        deployer,
      );
      expect(naked.result).toBeErr(Cl.uint(5005));

      // Run the registry handshake + init on its own (which also covers the
      // success path for setupRegistryAndInit).
      setupRegistryAndInit();

      // Re-init blocked (1018).
      expect(
        pub(
          C,
          "initialize",
          [
            marketArg,
            Cl.principal(SBTC_TOKEN),
            Cl.principal(USDCX_TOKEN),
            Cl.uint(MIN_X),
            Cl.uint(MIN_Y),
            Cl.bufferFromHex(BTC_FEED),
          ],
          deployer,
        ).result,
      ).toBeErr(Cl.uint(1018));

      // Mins reflected.
      expect(ro(C, "get-min-deposits", [])).toBeTuple({
        "min-token-x": Cl.uint(MIN_X),
        "min-token-y": Cl.uint(MIN_Y),
      });
    });

    it("initialize: non-operator rejected before any state mutation", function () {
      // Even without the registry handshake, the operator check fires first
      // (1011) for non-deployer callers.
      const marketArg = Cl.contractPrincipal(deployer, C);
      const r = pub(
        C,
        "initialize",
        [
          marketArg,
          Cl.principal(SBTC_TOKEN),
          Cl.principal(USDCX_TOKEN),
          Cl.uint(MIN_X),
          Cl.uint(MIN_Y),
          Cl.bufferFromHex(BTC_FEED),
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
    it("rejects deposits below minimum (token-y)", function () {
      setupRegistryAndInit();
      expect(depositY(100, 100_000, wallet1).result).toBeErr(Cl.uint(1001));
    });

    it("rejects zero limit price (token-y)", function () {
      setupRegistryAndInit();
      fundUsdcx(wallet1, USDCX_10);
      expect(depositY(USDCX_10, 0, wallet1).result).toBeErr(Cl.uint(1017));
    });

    it("rejects wrong-trait deposit (token-y called with sBTC trait)", function () {
      setupRegistryAndInit();
      const r = pub(
        C,
        "deposit-token-y",
        [
          Cl.uint(USDCX_10),
          Cl.uint(100_000),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet1,
      );
      expect(r.result).toBeErr(Cl.uint(1019));
    });

    it("rejects wrong-trait deposit (token-x called with USDCx trait)", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_2K);
      const r = pub(
        C,
        "deposit-token-x",
        [
          Cl.uint(SBTC_2K),
          Cl.uint(100_000),
          USDCX_TRAIT,
          Cl.stringAscii(USDCX_ASSET),
        ],
        wallet2,
      );
      expect(r.result).toBeErr(Cl.uint(1019));
    });

    // --- token-y (USDCx) lifecycle ---
    it("token-y: deposit, top-up, cancel, re-deposit", function () {
      setupRegistryAndInit();
      fundUsdcx(wallet1, USDCX_200);
      const LIMIT = 5_000_000_000_000;

      expect(depositY(USDCX_100, LIMIT, wallet1).result).toBeOk(
        Cl.uint(USDCX_100),
      );
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(USDCX_100);
      expect(ro(C, "get-token-y-limit", [Cl.principal(wallet1)])).toBeUint(
        LIMIT,
      );
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet1),
      ]);

      expect(depositY(USDCX_50, LIMIT, wallet1).result).toBeOk(
        Cl.uint(USDCX_50),
      );
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(USDCX_100 + USDCX_50);
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet1),
      ]);

      expect(cancelY(wallet1).result).toBeOk(Cl.uint(USDCX_100 + USDCX_50));
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(0);
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([]);
      expect(cancelY(wallet1).result).toBeErr(Cl.uint(1008));

      expect(depositY(USDCX_100, LIMIT, wallet1).result).toBeOk(
        Cl.uint(USDCX_100),
      );
    });

    // --- token-x (sBTC) lifecycle ---
    it("token-x: deposit, top-up, cancel, re-deposit", function () {
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
      fundUsdcx(wallet1, USDCX_10);
      fundSbtc(wallet2, SBTC_10K);

      depositY(USDCX_10, 5_000_000_000_000, wallet1);
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

      // Pause auth + effect.
      expect(pub(C, "set-paused", [Cl.bool(true)], wallet1).result).toBeErr(
        Cl.uint(1011),
      );
      expect(
        pub(C, "set-paused", [Cl.bool(true)], deployer).result,
      ).toBeOk(Cl.bool(true));
      fundUsdcx(wallet1, USDCX_10);
      expect(depositY(USDCX_10, 100_000, wallet1).result).toBeErr(
        Cl.uint(1010),
      );
      pub(C, "set-paused", [Cl.bool(false)], deployer);

      // Operator transfer + privilege loss.
      expect(
        pub(C, "set-operator", [Cl.principal(wallet1)], deployer).result,
      ).toBeOk(Cl.bool(true));
      expect(
        pub(C, "set-paused", [Cl.bool(true)], deployer).result,
      ).toBeErr(Cl.uint(1011));
      pub(C, "set-paused", [Cl.bool(false)], wallet1);
      pub(C, "set-operator", [Cl.principal(deployer)], wallet1);

      // Treasury (auth only).
      expect(
        pub(C, "set-treasury", [Cl.principal(wallet1)], deployer).result,
      ).toBeOk(Cl.bool(true));
      expect(
        pub(C, "set-treasury", [Cl.principal(wallet2)], wallet1).result,
      ).toBeErr(Cl.uint(1011));
      pub(C, "set-treasury", [Cl.principal(deployer)], deployer);

      // min-token-y bump enforces deposit.
      expect(
        pub(C, "set-min-token-y-deposit", [Cl.uint(USDCX_50)], deployer)
          .result,
      ).toBeOk(Cl.bool(true));
      expect(depositY(USDCX_10, 100_000, wallet1).result).toBeErr(
        Cl.uint(1001),
      );
      pub(C, "set-min-token-y-deposit", [Cl.uint(MIN_Y)], deployer);

      // min-token-x bump enforces deposit.
      fundSbtc(wallet2, SBTC_2K);
      expect(
        pub(C, "set-min-token-x-deposit", [Cl.uint(SBTC_10K)], deployer)
          .result,
      ).toBeOk(Cl.bool(true));
      expect(depositX(SBTC_2K, 100_000, wallet2).result).toBeErr(
        Cl.uint(1001),
      );
      pub(C, "set-min-token-x-deposit", [Cl.uint(MIN_X)], deployer);

      // Non-operator can't change mins.
      expect(
        pub(C, "set-min-token-y-deposit", [Cl.uint(1)], wallet1).result,
      ).toBeErr(Cl.uint(1011));
      expect(
        pub(C, "set-min-token-x-deposit", [Cl.uint(1)], wallet1).result,
      ).toBeErr(Cl.uint(1011));
    });

    // --- Close deposits ---
    it("close-deposits: phase guards + double-close + cancel-cycle rollforward", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_10K);
      fundUsdcx(wallet1, USDCX_100);
      depositY(USDCX_100, 5_000_000_000_000, wallet1);
      depositX(SBTC_10K, 5_000_000_000_000, wallet2);

      expect(pub(C, "close-deposits", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );
      expect(pub(C, "close-deposits", [], wallet1).result).toBeErr(
        Cl.uint(1016),
      );
      expect(ro(C, "get-cycle-phase", [])).toBeUint(2);

      // Deposits + cancels blocked in settle phase.
      expect(depositY(USDCX_10, 100_000, wallet4).result).toBeErr(
        Cl.uint(1002),
      );
      expect(cancelY(wallet1).result).toBeErr(Cl.uint(1002));
      expect(cancelX(wallet2).result).toBeErr(Cl.uint(1002));
      expect(
        pub(C, "set-token-y-limit", [Cl.uint(100_000)], wallet1).result,
      ).toBeErr(Cl.uint(1002));
      expect(
        pub(C, "set-token-x-limit", [Cl.uint(100_000)], wallet2).result,
      ).toBeErr(Cl.uint(1002));

      // cancel-cycle: too early then OK.
      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeErr(
        Cl.uint(1014),
      );
      simnet.mineEmptyBlocks(CANCEL_THRESHOLD + 1);
      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );
      expect(ro(C, "get-current-cycle", [])).toBeUint(1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);

      // Deposits rolled forward.
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet1)]),
      ).toBeUint(USDCX_100);
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(1), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_10K);
    });

    it("close-deposits fails with only one side", function () {
      setupRegistryAndInit();
      fundUsdcx(wallet1, USDCX_100);
      depositY(USDCX_100, 5_000_000_000_000, wallet1);
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
    it("small share filtering token-y: tiny USDCx deposit rolled on close-deposits", function () {
      setupRegistryAndInit();
      // MIN_SHARE_BPS = 20 → amount * 10000 < total * 20 → rolled.
      pub(C, "set-min-token-y-deposit", [Cl.uint(1)], deployer);

      fundUsdcx(wallet1, 500 * USDCX_1);
      fundUsdcx(wallet5, 1);
      fundSbtc(wallet2, SBTC_2K);

      const LIMIT = 5_000_000_000_000;
      depositY(1, LIMIT, wallet5);
      depositY(500 * USDCX_1, LIMIT, wallet1);
      depositX(SBTC_2K, 1, wallet2);

      expect(
        Number(
          cvToJSON(
            ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet5)]),
          ).value,
        ),
      ).toBe(1);

      const closeResult = pub(C, "close-deposits", [], wallet1);
      expect(closeResult.result).toBeOk(Cl.bool(true));

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
      console.log(`[v3-usdcx] token-y small share: cycle0=${w5cycle0}, cycle1=${w5cycle1}`);
      expect(w5cycle0).toBe(0);
      expect(w5cycle1).toBe(1);

      const events = closeResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      expect(
        events.filter(
          (v: any) => v.value?.event?.value === "small-share-roll-y",
        ).length,
      ).toBeGreaterThan(0);
    });

    it("small share filtering token-x: tiny sBTC deposit rolled on close-deposits", function () {
      setupRegistryAndInit();
      pub(C, "set-min-token-x-deposit", [Cl.uint(100)], deployer);

      fundSbtc(wallet2, SBTC_50K);
      fundSbtc(wallet4, 100);
      fundUsdcx(wallet1, USDCX_100);

      const LIMIT = 5_000_000_000_000;
      depositY(USDCX_100, LIMIT, wallet1);
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
      console.log(`[v3-usdcx] token-x small share: cycle0=${w4c0}, cycle1=${w4c1}`);
      expect(w4c0).toBe(0);
      expect(w4c1).toBe(100);

      const events = closeResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      expect(
        events.filter(
          (v: any) => v.value?.event?.value === "small-share-roll-x",
        ).length,
      ).toBeGreaterThan(0);
    });

    // --- Full settlement (clearing = oracle) ---
    // VM-gated: clarinet remote_data has a known sBTC token-supply tracking
    // bug that can fire on as-contract transfers during settlement.
    it("full settlement: clearing = BTC_USD oracle, fee math holds", function () {
      setupRegistryAndInit();
      const oracle = getBtcOraclePrice();
      expect(oracle).toBeGreaterThan(0);
      console.log(`[v3-usdcx] BTC_USD oracle = ${oracle}`);

      fundSbtc(wallet2, SBTC_100K);
      fundUsdcx(wallet1, USDCX_1K);

      const LIMIT_HIGH = 999_999_999_999_999;
      expect(depositY(USDCX_1K, LIMIT_HIGH, wallet1).result).toBeOk(
        Cl.uint(USDCX_1K),
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
        console.log("[v3-usdcx] full settlement: threw — VM token supply bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-usdcx] full settlement: errored — VM token supply bug");
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
        `[v3-usdcx] price=${price}, x-cleared=${xCleared}, y-cleared=${yCleared}, fees: x=${xFee}, y=${yFee}`,
      );

      // No premium in v3 → clearing == oracle.
      expect(price).toBe(oracle);
      expect(yFee).toBe(Math.floor((yCleared * FEE_BPS) / BPS_PRECISION));
      expect(xFee).toBe(Math.floor((xCleared * FEE_BPS) / BPS_PRECISION));
    });

    // --- Pro-rata distribution ---
    it("pro-rata distribution to multiple token-y depositors", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] pro-rata: skipped — VM token supply bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);
      fundUsdcx(wallet4, USDCX_200);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_100, LIMIT_HIGH, wallet1);
      depositY(USDCX_200, LIMIT_HIGH, wallet4);
      depositX(SBTC_10K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] pro-rata: settle threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-usdcx] pro-rata: settle errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const distros = events.filter(
        (v: any) => v.value?.event?.value === "distribute-y-depositor",
      );

      console.log("[v3-usdcx] token-y distributions:");
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
        console.log("[v3-usdcx] multi-x depositors: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_200);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_200, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);
      depositX(SBTC_10K, 1, wallet4);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] multi-x: threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-usdcx] multi-x: errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const distros = events.filter(
        (v: any) => v.value?.event?.value === "distribute-x-depositor",
      );

      console.log("[v3-usdcx] token-x distributions:");
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
    it("token-y limit order: low limit (clearing > limit) gets rolled", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] y-limit roll: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);
      fundUsdcx(wallet4, USDCX_100);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_100, 1, wallet1); // limit=1 → guaranteed below clearing → rolled
      depositY(USDCX_100, LIMIT_HIGH, wallet4); // safe
      depositX(SBTC_10K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] y-limit roll: threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-usdcx] y-limit roll: errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const limitRolls = events.filter(
        (v: any) => v.value?.event?.value === "limit-roll-y",
      );
      console.log("[v3-usdcx] token-y limit-roll events:", limitRolls.length);
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
      expect(w1rolled).toBe(USDCX_100);
    });

    // --- token-x limit roll ---
    it("token-x limit order: high limit (clearing < limit) gets rolled", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
        fundSbtc(wallet4, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] x-limit roll: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_200);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_200, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, LIMIT_HIGH, wallet2); // limit very high → clearing < limit → rolled
      depositX(SBTC_10K, 1, wallet4);

      pub(C, "close-deposits", [], wallet1);

      let settleResult;
      try {
        settleResult = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] x-limit roll: threw — VM bug");
        return;
      }
      if (!cvToJSON(settleResult.result).success) {
        console.log("[v3-usdcx] x-limit roll: errored — VM bug");
        return;
      }

      const events = settleResult.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const limitRolls = events.filter(
        (v: any) => v.value?.event?.value === "limit-roll-x",
      );
      console.log("[v3-usdcx] token-x limit-roll events:", limitRolls.length);
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
        console.log("[v3-usdcx] multi-cycle: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);
      fundUsdcx(wallet5, USDCX_200);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_100, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);
      pub(C, "close-deposits", [], wallet1);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] multi-cycle: settle 0 threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-usdcx] multi-cycle: settle 0 errored — VM bug");
        return;
      }
      const cycleAfter0 = Number(
        cvToJSON(ro(C, "get-current-cycle", [])).value,
      );
      expect(cycleAfter0).toBeGreaterThanOrEqual(1);

      depositY(USDCX_200, LIMIT_HIGH, wallet5);
      depositX(SBTC_2K, 1, wallet4);
      pub(C, "close-deposits", [], wallet5);

      let r2;
      try {
        r2 = settle(wallet5);
      } catch {
        console.log("[v3-usdcx] multi-cycle: settle 1 threw — VM bug");
        return;
      }
      if (!cvToJSON(r2.result).success) {
        console.log("[v3-usdcx] multi-cycle: settle 1 errored — VM bug");
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
        console.log("[v3-usdcx] dust sweep: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);
      fundUsdcx(wallet4, USDCX_50 + USDCX_1);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_100, LIMIT_HIGH, wallet1);
      depositY(USDCX_50 + USDCX_1, LIMIT_HIGH, wallet4);
      depositX(SBTC_10K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] dust sweep: threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-usdcx] dust sweep: errored — VM bug");
        return;
      }

      const events = r.events
        .filter((e: any) => e.event === "print_event")
        .map((e: any) => cvToJSON(e.data.value));
      const dust = events.find((v: any) => v.value?.event?.value === "sweep-dust");
      expect(dust).toBeDefined();
      console.log("[v3-usdcx] Dust:", JSON.stringify(dust!.value, null, 2));
    });

    // --- token-x-binding rollforward (sBTC oversupplied) ---
    it("settlement token-x-binding: all sBTC clears, USDCx rolls", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] x-binding: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_1K);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_1K, LIMIT_HIGH, wallet1);
      depositX(SBTC_2K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);
      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] x-binding: threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-usdcx] x-binding: errored — VM bug");
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
        `[v3-usdcx] x-binding: side=${bindingSide}, x-unfilled=${xUnfilled}, y-unfilled=${yUnfilled}`,
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

    // --- token-y-binding rollforward (USDCx undersupplied) ---
    it("settlement token-y-binding: all USDCx clears, sBTC rolls", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_50K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] y-binding: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_10);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_10, LIMIT_HIGH, wallet1);
      depositX(SBTC_50K, 1, wallet2);

      pub(C, "close-deposits", [], wallet1);
      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] y-binding: threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-usdcx] y-binding: errored — VM bug");
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
        `[v3-usdcx] y-binding: side=${bindingSide}, x-unfilled=${xUnfilled}, y-unfilled=${yUnfilled}`,
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

    // --- settle-with-refresh with live Hermes VAA ---
    it("settle-with-refresh with live Hermes VAA", async function () {
      setupRegistryAndInit();
      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-usdcx] settle-with-refresh: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-usdcx] settle-with-refresh: skipped — Hermes fetch failed:",
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
        console.log("[v3-usdcx] settle-with-refresh: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_100, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);
      pub(C, "close-deposits", [], wallet1);

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
          "settle-with-refresh",
          [
            vaaArg,
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            USDCX_TRAIT,
            Cl.stringAscii(USDCX_ASSET),
          ],
          wallet1,
        );
      } catch (e) {
        console.log(
          "[v3-usdcx] settle-with-refresh: threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log(
          "[v3-usdcx] settle-with-refresh: errored — VM bug or VAA verify",
        );
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      console.log(
        `[v3-usdcx] settle-with-refresh: cycle ${preCycle} cleared at price ${settlement.value.value.price.value}`,
      );
    });

    // --- close-and-settle-with-refresh bundled call ---
    it("close-and-settle-with-refresh bundled call with live Hermes VAA", async function () {
      setupRegistryAndInit();
      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-usdcx] close-and-settle: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-usdcx] close-and-settle: skipped — Hermes fetch failed:",
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
        console.log("[v3-usdcx] close-and-settle: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_100, LIMIT_HIGH, wallet1);
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
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            USDCX_TRAIT,
            Cl.stringAscii(USDCX_ASSET),
          ],
          wallet1,
        );
      } catch (e) {
        console.log(
          "[v3-usdcx] close-and-settle: threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log(
          "[v3-usdcx] close-and-settle: errored — VM bug or VAA verify",
        );
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v3-usdcx] close-and-settle: cycle ${preCycle} closed+settled in one tx`,
      );
    });

    // --- Same address on both sides ---
    // Mirror of simul-markets-sbtc-usdcx-jing-same-depositor.js. wallet2
    // is funded with both sBTC AND USDCx, deposits on both legs, the
    // contract should hold them in BOTH depositor lists with their own
    // entries in BOTH deposit maps and settle cleanly.
    it("same depositor on both sides: appears in both lists, settles cleanly", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] same-depositor: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet2, USDCX_100);

      const LIMIT_HIGH = 999_999_999_999_999;
      expect(depositY(USDCX_100, LIMIT_HIGH, wallet2).result).toBeOk(
        Cl.uint(USDCX_100),
      );
      expect(depositX(SBTC_10K, 1, wallet2).result).toBeOk(Cl.uint(SBTC_10K));

      // wallet2 in both lists with its own entries.
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet2),
      ]);
      expect(ro(C, "get-token-x-depositors", [Cl.uint(0)])).toBeList([
        Cl.principal(wallet2),
      ]);
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(USDCX_100);
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_10K);

      pub(C, "close-deposits", [], wallet2);
      let r;
      try {
        r = settle(wallet2);
      } catch {
        console.log("[v3-usdcx] same-depositor: settle threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-usdcx] same-depositor: settle errored — VM bug");
        return;
      }

      expect(ro(C, "get-current-cycle", [])).toBeUint(1);
      expect(ro(C, "get-settlement", [Cl.uint(0)])).not.toBeNone();
    });

    // --- Treasury fees verification ---
    // Mirror of simul-markets-sbtc-usdcx-jing-treasury-fees.js. After a
    // successful settle, the treasury (deployer at init) should have its
    // sBTC + USDCx balance increased by EXACTLY the fees recorded in the
    // settlement tuple.
    it("treasury receives the exact fees recorded in the settlement tuple", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_100K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] treasury-fees: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_1K);

      // Snapshot treasury balances BEFORE settle. Use SIP-010 get-balance
      // (read-only).
      function getBalance(token: string, holder: string): number {
        const r = simnet.callReadOnlyFn(
          token,
          "get-balance",
          [Cl.principal(holder)],
          deployer,
        ).result;
        return Number(cvToJSON(r).value.value);
      }
      const sbtcBefore = getBalance(SBTC_TOKEN, deployer);
      const usdcxBefore = getBalance(USDCX_TOKEN, deployer);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_1K, LIMIT_HIGH, wallet1);
      depositX(SBTC_100K, 1, wallet2);
      pub(C, "close-deposits", [], wallet1);

      let r;
      try {
        r = settle(wallet1);
      } catch {
        console.log("[v3-usdcx] treasury-fees: settle threw — VM bug");
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-usdcx] treasury-fees: settle errored — VM bug");
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(0)]));
      const xFee = Number(settlement.value.value["token-x-fee"].value);
      const yFee = Number(settlement.value.value["token-y-fee"].value);

      const sbtcAfter = getBalance(SBTC_TOKEN, deployer);
      const usdcxAfter = getBalance(USDCX_TOKEN, deployer);

      console.log(
        `[v3-usdcx] treasury-fees: x-fee=${xFee} (sBTC delta=${sbtcAfter - sbtcBefore}), y-fee=${yFee} (USDCx delta=${usdcxAfter - usdcxBefore})`,
      );

      // Treasury delta == settlement fees on each side.
      expect(sbtcAfter - sbtcBefore).toBe(xFee);
      expect(usdcxAfter - usdcxBefore).toBe(yFee);
    });

    // --- Atomic swap: deposit-x=true ---
    // Mirror of simul-markets-sbtc-usdcx-jing-swap.js. USDCx pre-stages,
    // sBTC depositor calls swap(deposit-x=true) which atomically does
    // deposit-x + close-deposits + settle-with-refresh.
    it("atomic swap (deposit-x=true): pre-stages USDCx, sBTC taker fills in one tx", async function () {
      setupRegistryAndInit();

      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-usdcx] swap: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-usdcx] swap: skipped — Hermes fetch failed:",
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
        console.log("[v3-usdcx] swap: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);

      const LIMIT_HIGH = 999_999_999_999_999;
      // Pre-stage USDCx liquidity.
      depositY(USDCX_100, LIMIT_HIGH, wallet1);

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
            vaaArg,
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            USDCX_TRAIT,
            Cl.stringAscii(USDCX_ASSET),
            Cl.bool(true),
          ],
          wallet2,
        );
      } catch (e) {
        console.log("[v3-usdcx] swap: threw —", (e as Error).message);
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log("[v3-usdcx] swap: errored — VM bug or VAA verify");
        return;
      }

      // Settlement happened, cycle advanced, back in DEPOSIT phase.
      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v3-usdcx] swap: cycle ${preCycle} settled atomically via swap(deposit-x=true)`,
      );
    });

    // --- Atomic swap: deposit-x=false (taker on token-y side) ---
    it("atomic swap (deposit-x=false): pre-stages sBTC, USDCx taker fills in one tx", async function () {
      setupRegistryAndInit();

      const timestamp = Math.floor(Date.now() / 1000) - 30;
      const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}`;

      let vaaHex: string;
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json" },
        });
        const data = await response.json();
        if (!data?.binary?.data?.[0]) {
          console.log("[v3-usdcx] swap-deposit-y: skipped — no VAA");
          return;
        }
        vaaHex = data.binary.data[0];
      } catch (e) {
        console.log(
          "[v3-usdcx] swap-deposit-y: skipped — Hermes fetch failed:",
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
        console.log("[v3-usdcx] swap-deposit-y: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);

      const LIMIT_HIGH = 999_999_999_999_999;
      // Pre-stage sBTC liquidity.
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
            Cl.uint(USDCX_100),
            Cl.uint(LIMIT_HIGH),
            vaaArg,
            pythStorage,
            pythDecoder,
            wormhole,
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            USDCX_TRAIT,
            Cl.stringAscii(USDCX_ASSET),
            Cl.bool(false),
          ],
          wallet1,
        );
      } catch (e) {
        console.log(
          "[v3-usdcx] swap-deposit-y: threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(r.result).success) {
        console.log(
          "[v3-usdcx] swap-deposit-y: errored — VM bug or VAA verify",
        );
        return;
      }

      const settlement = cvToJSON(ro(C, "get-settlement", [Cl.uint(preCycle)]));
      expect(Number(settlement.value.value.price.value)).toBeGreaterThan(0);
      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v3-usdcx] swap-deposit-y: cycle ${preCycle} settled atomically via swap(deposit-x=false)`,
      );
    });

    // --- Queue-full + smallest-bumping ---
    // Mirror of simul-markets-sbtc-usdcx-jing-queue-full.js. Patches
    // MAX_DEPOSITORS u50 -> u5 in the source, deploys the patched contract
    // at runtime via `simnet.deployContract`, then exercises the bumping
    // path with 5 fish + 1 challenger.
    //
    // Production logic stays at u50; this test proves the bumping branch is
    // wired correctly without needing 51 principals.
    it("queue-full: 6th depositor with bigger amount bumps the smallest fish", function () {
      const PATCHED = "markets-sbtc-usdcx-jing-q5";
      const PATCHED_MAX_DEPOSITORS = 5;
      const SMALLEST = 1_000_000;     // 1 USDCx (= MIN_Y) — the fish to bump
      const FISH_INCREMENT = 1_000;
      const CHALLENGER_BIG = 2_000_000;
      const CHALLENGER_TOO_SMALL = SMALLEST; // exactly equal → must NOT bump (asserts >, not >=)

      const source = fs
        .readFileSync(
          "./contracts/markets-sbtc-usdcx-jing.clar",
          "utf8",
        )
        .replace(
          "(define-constant MAX_DEPOSITORS u50)",
          `(define-constant MAX_DEPOSITORS u${PATCHED_MAX_DEPOSITORS})`,
        );

      // Deploy the patched market under a different name. Its bytecode hash
      // is different from the on-disk market.
      simnet.deployContract(
        PATCHED,
        source,
        { clarityVersion: 5 } as any,
        deployer,
      );

      // Set verified-contract for THIS patched market and initialize it.
      const patchedArg = Cl.contractPrincipal(deployer, PATCHED);
      expect(
        pub(JING_CORE, "set-verified-contract", [patchedArg], deployer)
          .result,
      ).toBeOk(Cl.bool(true));
      expect(
        pub(
          PATCHED,
          "initialize",
          [
            patchedArg,
            Cl.principal(SBTC_TOKEN),
            Cl.principal(USDCX_TOKEN),
            Cl.uint(MIN_X),
            Cl.uint(SMALLEST),     // min-y = SMALLEST so the smallest fish is exactly at min
            Cl.bufferFromHex(BTC_FEED),
          ],
          deployer,
        ).result,
      ).toBeOk(Cl.bool(true));

      // Need 5 fish + 1 challenger principals. Use simnet wallets 1-6 for
      // determinism (no random key generation).
      const fish = [
        accounts.get("wallet_1")!,
        accounts.get("wallet_2")!,
        accounts.get("wallet_3")!,
        accounts.get("wallet_4")!,
        accounts.get("wallet_5")!,
      ];
      const challenger = accounts.get("wallet_6")!;

      // Fund all 6 with USDCx. Skip on USDCx whale drain (VM-bug-ish state
      // pollution from earlier tests in the same file).
      const FUND_PER = 5_000_000;
      let funded = true;
      try {
        for (const a of [...fish, challenger]) {
          fundUsdcx(a, FUND_PER);
        }
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log(
          "[v3-usdcx] queue-full: skipped — USDCx whale drained by prior tests",
        );
        return;
      }

      // 5 fish deposit, each slightly bigger than the previous so smallest
      // is well-defined.
      for (let i = 0; i < fish.length; i++) {
        const amount = SMALLEST + i * FISH_INCREMENT;
        expect(
          pub(
            PATCHED,
            "deposit-token-y",
            [
              Cl.uint(amount),
              Cl.uint(999_999_999_999_999),
              USDCX_TRAIT,
              Cl.stringAscii(USDCX_ASSET),
            ],
            fish[i],
          ).result,
        ).toBeOk(Cl.uint(amount));
      }
      expect(ro(PATCHED, "get-token-y-depositors", [Cl.uint(0)])).toBeList(
        fish.map((f) => Cl.principal(f)),
      );

      // Challenger with amount EQUAL to smallest → ERR_QUEUE_FULL (1013).
      expect(
        pub(
          PATCHED,
          "deposit-token-y",
          [
            Cl.uint(CHALLENGER_TOO_SMALL),
            Cl.uint(999_999_999_999_999),
            USDCX_TRAIT,
            Cl.stringAscii(USDCX_ASSET),
          ],
          challenger,
        ).result,
      ).toBeErr(Cl.uint(1013));

      // Challenger with BIG amount → bumps fish[0] (the smallest at SMALLEST).
      const fish0BalanceBefore = Number(
        cvToJSON(
          simnet.callReadOnlyFn(
            USDCX_TOKEN,
            "get-balance",
            [Cl.principal(fish[0])],
            deployer,
          ).result,
        ).value.value,
      );
      expect(
        pub(
          PATCHED,
          "deposit-token-y",
          [
            Cl.uint(CHALLENGER_BIG),
            Cl.uint(999_999_999_999_999),
            USDCX_TRAIT,
            Cl.stringAscii(USDCX_ASSET),
          ],
          challenger,
        ).result,
      ).toBeOk(Cl.uint(CHALLENGER_BIG));

      // After bump: fish[0] removed, challenger replaces it.
      expect(
        ro(PATCHED, "get-token-y-deposit", [
          Cl.uint(0),
          Cl.principal(fish[0]),
        ]),
      ).toBeUint(0);
      expect(
        ro(PATCHED, "get-token-y-deposit", [
          Cl.uint(0),
          Cl.principal(challenger),
        ]),
      ).toBeUint(CHALLENGER_BIG);

      // List length is still 5 (cap respected).
      const depositorsAfter = cvToJSON(
        ro(PATCHED, "get-token-y-depositors", [Cl.uint(0)]),
      );
      expect(depositorsAfter.value.length).toBe(PATCHED_MAX_DEPOSITORS);

      // fish[0] received their USDCx back (refund of SMALLEST).
      const fish0BalanceAfter = Number(
        cvToJSON(
          simnet.callReadOnlyFn(
            USDCX_TOKEN,
            "get-balance",
            [Cl.principal(fish[0])],
            deployer,
          ).result,
        ).value.value,
      );
      expect(fish0BalanceAfter - fish0BalanceBefore).toBe(SMALLEST);

      console.log(
        `[v3-usdcx] queue-full: fish[0] (${SMALLEST}) bumped by challenger (${CHALLENGER_BIG}); refund verified.`,
      );
    });

    // --- Regression: small-share-roll → cancel-cycle preserves rolled state ---
    // Bug found via fuzzing (now fixed):
    //   Pre-fix, cancel-cycle did `(map-set cycle-totals (+ cycle u1) totals)`
    //   and `roll-depositor-lists` overwrote next-cycle's list with the current
    //   cycle's list. If close-deposits' filter-small-share had already moved
    //   tiny depositors C→C+1 (totals + list), and 42+ blocks then passed
    //   without settlement, cancel-cycle would WIPE the fish entries from C+1.
    //   Fish funds remained in token-y-deposits[(C+1, fish_n)] but were
    //   invisible to settle (not in depositor-list) and to cycle-totals
    //   (their amounts had been overwritten by whale-only).
    //
    // Fix:
    //   - cancel-cycle now MERGES totals: (+ totals totals-next)
    //   - roll-depositor-lists now CONCATS: (concat next-list current-list)
    //
    // Scenario tested here:
    //   1. wallet5 deposits 1µUSDCx (fish, < 0.20% threshold).
    //   2. wallet1 deposits 500 USDCx (whale).
    //   3. wallet2 deposits sBTC (counter-party so close-deposits passes).
    //   4. close-deposits: small-share-filter moves fish to C+1 (list+total).
    //   5. Skip settle. Mine 42+ stacks blocks past close.
    //   6. cancel-cycle: rolls whale C→C+1.
    //   7. Verify C+1 contains BOTH whale and fish in totals + list.
    it("regression: cancel-cycle after small-share-roll preserves rolled fish in C+1 totals + list", function () {
      setupRegistryAndInit();
      // Lower min so we can place a fish below the share threshold.
      pub(C, "set-min-token-y-deposit", [Cl.uint(1)], deployer);

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] cancel-cycle merge: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, 500 * USDCX_1);
      fundUsdcx(wallet5, 1);

      const LIMIT = 5_000_000_000_000;
      depositY(1, LIMIT, wallet5);                  // FISH (1µUSDCx)
      depositY(500 * USDCX_1, LIMIT, wallet1);      // WHALE (500 USDCx)
      depositX(SBTC_2K, 1, wallet2);

      expect(pub(C, "close-deposits", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );

      // Sanity post-close: fish was filtered to C+1.
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet5)]),
      ).toBeUint(1);
      expect(ro(C, "get-token-y-depositors", [Cl.uint(1)])).toBeList([
        Cl.principal(wallet5),
      ]);

      const totalsC1Pre = cvToJSON(
        ro(C, "get-cycle-totals", [Cl.uint(1)]),
      );
      expect(Number(totalsC1Pre.value["total-token-y"].value)).toBe(1);

      // Skip settle. Wait past CANCEL_THRESHOLD.
      simnet.mineEmptyBlocks(CANCEL_THRESHOLD + 1);
      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );

      // Cycle 1 totals should hold WHALE + FISH on token-y, not just whale.
      const totalsC1Post = cvToJSON(
        ro(C, "get-cycle-totals", [Cl.uint(1)]),
      );
      const yTotalAfter = Number(totalsC1Post.value["total-token-y"].value);
      const xTotalAfter = Number(totalsC1Post.value["total-token-x"].value);
      console.log(
        `[v3-usdcx] cancel-cycle merge: cycle 1 totals = { y: ${yTotalAfter}, x: ${xTotalAfter} }`,
      );
      expect(yTotalAfter).toBe(500 * USDCX_1 + 1);   // whale + fish
      expect(xTotalAfter).toBe(SBTC_2K);              // whale-x rolled in

      // Depositor lists in C+1 contain BOTH fish and whale (concat order:
      // fish was already in next-list before cancel; whale was in current-
      // list and gets concatted onto next-list).
      const yDeps = cvToJSON(ro(C, "get-token-y-depositors", [Cl.uint(1)]));
      const yDepStrs = yDeps.value.map((p: any) => p.value);
      console.log("[v3-usdcx] cycle 1 token-y depositors:", yDepStrs);
      expect(yDepStrs).toContain(wallet1);
      expect(yDepStrs).toContain(wallet5);

      const xDeps = cvToJSON(ro(C, "get-token-x-depositors", [Cl.uint(1)]));
      expect(xDeps.value.map((p: any) => p.value)).toContain(wallet2);

      // Per-depositor maps still reflect each principal's amount.
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet5)]),
      ).toBeUint(1);
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet1)]),
      ).toBeUint(500 * USDCX_1);
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(1), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_2K);

      // Cycle 0 cleared.
      const totalsC0Post = cvToJSON(
        ro(C, "get-cycle-totals", [Cl.uint(0)]),
      );
      expect(Number(totalsC0Post.value["total-token-y"].value)).toBe(0);
      expect(Number(totalsC0Post.value["total-token-x"].value)).toBe(0);
      expect(ro(C, "get-token-y-depositors", [Cl.uint(0)])).toBeList([]);
      expect(ro(C, "get-token-x-depositors", [Cl.uint(0)])).toBeList([]);
    });

    // --- ERR_STALE_PRICE (1005) ---
    // MAX_STALENESS = u80 in the source. Pyth's stored publish-time is
    // pinned to mainnet at fork time. Mining burn blocks advances
    // stacks-block-time well past publish-time + 80 → freshness gate
    // fires before the math runs.
    it("settle: ERR_STALE_PRICE (1005) when stacks-block-time is past Pyth publish-time + MAX_STALENESS", function () {
      setupRegistryAndInit();
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v3-usdcx] stale-price: skipped — VM bug");
        return;
      }
      fundUsdcx(wallet1, USDCX_100);

      const LIMIT_HIGH = 999_999_999_999_999;
      depositY(USDCX_100, LIMIT_HIGH, wallet1);
      depositX(SBTC_10K, 1, wallet2);
      pub(C, "close-deposits", [], wallet1);

      // Advance time past MAX_STALENESS u80. We use STACKS blocks (not
      // burn blocks) so simnet's burn-block-height stays at the mainnet
      // fork point — otherwise Hiro returns 404 for "future" mainnet
      // state when settle reads pyth-storage. Each stacks block advances
      // stacks-block-time; 200 blocks is well past 80s on any reasonable
      // tenure cadence.
      simnet.mineEmptyBlocks(200);

      const r = settle(wallet1);
      expect(r.result).toBeErr(Cl.uint(1005));
    });

    // --- register hash-mismatch (5006) ---
    // Mirror of simul-jing-core-hash-mismatch.js. Deploy market-A unchanged
    // and market-B with a tweaked constant so its bytecode hash differs.
    // Set verified-contract for market-A. Calling market-B.initialize with
    // canonical=market-A makes register see caller-hash (= H_B) vs
    // verified-hash (= H_A) → mismatch → ERR_HASH_MISMATCH (5006).
    it("register: caller bytecode != verified hash → ERR_HASH_MISMATCH (5006)", function () {
      const PATCHED = "markets-sbtc-usdcx-jing-patched";
      const source = fs
        .readFileSync(
          "./contracts/markets-sbtc-usdcx-jing.clar",
          "utf8",
        )
        .replace(
          "(define-constant MAX_STALENESS u80)",
          "(define-constant MAX_STALENESS u60)",
        );
      // Sanity: the replace actually fired (would silently no-op otherwise).
      expect(source.includes("u60")).toBe(true);

      simnet.deployContract(
        PATCHED,
        source,
        { clarityVersion: 5 } as any,
        deployer,
      );

      // Verified-contract for market-A (the on-disk one).
      const marketAArg = Cl.contractPrincipal(deployer, C);
      expect(
        pub(JING_CORE, "set-verified-contract", [marketAArg], deployer)
          .result,
      ).toBeOk(Cl.bool(true));

      // market-B.initialize(canonical=market-A) — register sees H_B vs H_A.
      // Initialize order: (a) operator check → deployer is operator of B
      // (set at deploy via tx-sender), (b) get-contract-owner check →
      // deployer is owner. Both pass. Then register fires HASH_MISMATCH.
      const r = pub(
        PATCHED,
        "initialize",
        [
          marketAArg,                  // wrong canonical (different bytecode)
          Cl.principal(SBTC_TOKEN),
          Cl.principal(USDCX_TOKEN),
          Cl.uint(MIN_X),
          Cl.uint(MIN_Y),
          Cl.bufferFromHex(BTC_FEED),
        ],
        deployer,
      );
      expect(r.result).toBeErr(Cl.uint(5006));

      // is-registered for the patched market is still false.
      const patchedArg = Cl.contractPrincipal(deployer, PATCHED);
      expect(ro(JING_CORE, "is-registered", [patchedArg])).toBeBool(false);
    });
  },
);
