import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";
import { readFileSync } from "node:fs";

// ============================================================================
// markets-sbtc-stx-jing-v2: maker/taker split over the v1 dual-feed market
// (token-x = sBTC, token-y = STX via the bitflow wstx facade, feeds =
// BTC/USD + STX/USD).
//
// Differences vs markets-sbtc-stx-jing (v1):
//   - Maker gate: public deposit-token-x/-y (and set-token-*-limit) revert
//     ERR_MUST_USE_SWAP (u1022) when the deposit would cross live resting
//     size on the other side. Role is decided by entry point: `swap` is the
//     only taker path.
//   - `swap` withholds TAKER_REBATE_BPS (20) off the deposit and pays it to
//     the opposite side's filled depositors; it is fill-or-kill:
//     ERR_NOTHING_FILLED (u1021) / ERR_PARTIAL_FILL (u1023).
//   - Pyth execution plan is hard-coded: settle-with-refresh and swap no
//     longer take storage/decoder/wormhole traits.
//   - Logs to jing-core-v3 (the 14-arg log-settlement core; the deployed
//     jing-core-v2 is arity-incompatible); carries x-rebate/y-rebate.
//
// Structural consequence the suite leans on: with the gate in place a crossed
// two-sided book CANNOT be staged with plain deposits at a static oracle
// price - any resting size that would clear at settlement is, by the same
// predicate, "live" at deposit time and blocks the other side. Two-sided
// clearing therefore only happens through `swap`, so all clearing/rebate
// coverage lives in the Hermes-gated swap tests, and the deterministic
// section covers the gate truth table, lifecycle on uncrossed books, and the
// one-sided/dead-book failure paths.
// ============================================================================

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

const C = "markets-sbtc-stx-jing-v2";
const JING_CORE = "jing-core-v3";

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

const MIN_X = 1_000; // 1k sats sBTC
const MIN_Y = 1_000_000; // 1 STX (6dec)

const SBTC_2K = 2_000;
const SBTC_10K = 10_000;

const STX_1 = 1_000_000;
const STX_2 = 2_000_000;
const STX_10 = 10_000_000;
const STX_100 = 100_000_000;
const STX_500 = 500_000_000;

const BPS_PRECISION = 10_000;
const FEE_BPS = 10;
const TAKER_REBATE_BPS = 20;

// Limits relative to any sane BTC/STX oracle price (~1e13 scaled 1e8):
// x-limits are floors (live iff price >= limit), y-limits are ceilings
// (live iff price <= limit).
const LIVE_X = 1; // always live offer
const DEAD_X = 999_999_999_999_999; // never live offer
const LIVE_Y = 999_999_999_999_999; // always live bid
const DEAD_Y = 1; // never live bid

const ERR_MUST_USE_SWAP = 1022;
const ERR_PARTIAL_FILL = 1023;

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

function sbtcBalance(who: string): number {
  const r = cvToJSON(
    simnet.callReadOnlyFn(
      SBTC_TOKEN,
      "get-balance",
      [Cl.principal(who)],
      deployer,
    ).result,
  );
  return Number(r.value?.value || 0);
}

function setupRegistryAndInit() {
  const marketArg = Cl.contractPrincipal(deployer, C);

  expect(
    pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
  ).toBeOk(Cl.bool(true));

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

// The maker gate ignores the VAA when the opposite side has no resting
// entries, so single-sided staging passes a dummy byte. Any deposit into a
// non-empty opposite book must carry a real Hermes VAA (fresh
// classification), which moves those tests into the Hermes-gated section.
const DUMMY_VAA = "00";

// Staleness-patched twin for multi-step Hermes-gated tests. Each simnet
// contract call mines a block advancing stacks-block-time by 30s, and the
// remote fork tip lags wall clock by a variable amount, so a real VAA has an
// unpredictable budget of roughly (tip-lag + MAX_STALENESS - 30s) / 30s
// calls before fresh-classification-price trips u1005. Tests whose subject
// is the maker gate / reprice / lifecycle (not freshness) therefore run
// against this twin with MAX_STALENESS disabled - same patch convention the
// stxer sims use (see simulations/README-stxer.md). The freshness gate
// itself is proven by the production-contract swap trio below and the
// *-settle-refresh sims.
const NS = "markets-sbtc-stx-jing-v2-ns";

function setupNoStaleMarket() {
  const src = readFileSync(
    "contracts/markets-sbtc-stx-jing-v2.clar",
    "utf8",
  ).replace(
    "(define-constant MAX_STALENESS u80)",
    // ~31 years. Must stay BELOW stacks-block-time (epoch seconds):
    // fresh-classification-price computes (- stacks-block-time
    // MAX_STALENESS), which underflows for larger values.
    "(define-constant MAX_STALENESS u1000000000)",
  );
  simnet.deployContract(NS, src, { clarityVersion: 5 }, deployer);
  const marketArg = Cl.contractPrincipal(deployer, NS);
  expect(
    pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
  ).toBeOk(Cl.bool(true));
  expect(
    pub(
      NS,
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

function depositX(
  amount: number,
  limit: number,
  sender: string,
  vaaHex: string = DUMMY_VAA,
  mkt: string = C,
) {
  return pub(
    mkt,
    "deposit-token-x",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      Cl.bufferFromHex(vaaHex),
      SBTC_TRAIT,
      Cl.stringAscii(SBTC_ASSET),
    ],
    sender,
  );
}

function depositY(
  amount: number,
  limit: number,
  sender: string,
  vaaHex: string = DUMMY_VAA,
  mkt: string = C,
) {
  return pub(
    mkt,
    "deposit-token-y",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      Cl.bufferFromHex(vaaHex),
      WSTX_TRAIT,
      Cl.stringAscii(WSTX_ASSET),
    ],
    sender,
  );
}

function cancelX(sender: string, mkt: string = C) {
  return pub(
    mkt,
    "cancel-token-x-deposit",
    [SBTC_TRAIT, Cl.stringAscii(SBTC_ASSET)],
    sender,
  );
}

function cancelY(sender: string, mkt: string = C) {
  return pub(
    mkt,
    "cancel-token-y-deposit",
    [WSTX_TRAIT, Cl.stringAscii(WSTX_ASSET)],
    sender,
  );
}

function swap(
  amount: number,
  limit: number,
  vaaHex: string,
  depositXSide: boolean,
  sender: string,
) {
  const vaaArg = Cl.bufferFromHex(vaaHex);
  return pub(
    C,
    "swap",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      vaaArg, // one bundled multi-id VAA covers both feeds
      SBTC_TRAIT,
      Cl.stringAscii(SBTC_ASSET),
      WSTX_TRAIT,
      Cl.stringAscii(WSTX_ASSET),
      Cl.bool(depositXSide),
    ],
    sender,
  );
}

// The FE-side computation: read both feeds and form the same ratio the
// contract classifies with. In production this comes from the Hermes payload
// whose VAA is attached; on the fork the stored prices serve as the sample.
const PYTH_STORAGE =
  "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-storage-v4";
const PRICE_PRECISION = 100_000_000;

function classificationPrice(): number {
  const btc = cvToJSON(
    simnet.callReadOnlyFn(
      PYTH_STORAGE,
      "get-price",
      [Cl.bufferFromHex(BTC_FEED)],
      deployer,
    ).result,
  );
  const stx = cvToJSON(
    simnet.callReadOnlyFn(
      PYTH_STORAGE,
      "get-price",
      [Cl.bufferFromHex(STX_FEED)],
      deployer,
    ).result,
  );
  const b = Number(btc.value?.value?.price?.value || 0);
  const s = Number(stx.value?.value?.price?.value || 0);
  return s > 0 ? Math.floor((b * PRICE_PRECISION) / s) : 0;
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
      console.log(`[v2-stx] ${tag}: skipped — no VAA`);
      return null;
    }
    return data.binary.data[0];
  } catch (e) {
    console.log(
      `[v2-stx] ${tag}: skipped — Hermes fetch failed:`,
      (e as Error).message,
    );
    return null;
  }
}

describe.skipIf(!remoteDataEnabled)(
  "markets-sbtc-stx-jing-v2 (maker/taker, FOK swap)",
  function () {
    // --- Initialization + registry ---
    it("initialize: requires verified-contract; rejects double-init and non-operator", function () {
      const marketArg = Cl.contractPrincipal(deployer, C);
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

      const nonOp = pub(
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
      expect(nonOp.result).toBeErr(Cl.uint(1011));
    });

    // --- Deposit validation (uncrossed book, gate silent) ---
    it("rejects below-minimum, zero-limit and wrong-trait deposits", function () {
      setupRegistryAndInit();
      expect(depositY(100, LIVE_Y, wallet1).result).toBeErr(Cl.uint(1001));
      expect(depositY(STX_10, 0, wallet1).result).toBeErr(Cl.uint(1017));
      const wrongY = pub(
        C,
        "deposit-token-y",
        [
          Cl.uint(STX_10),
          Cl.uint(LIVE_Y),
          Cl.bufferFromHex(DUMMY_VAA),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet1,
      );
      expect(wrongY.result).toBeErr(Cl.uint(1019));
      fundSbtc(wallet2, SBTC_2K);
      const wrongX = pub(
        C,
        "deposit-token-x",
        [
          Cl.uint(SBTC_2K),
          Cl.uint(LIVE_X),
          Cl.bufferFromHex(DUMMY_VAA),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        wallet2,
      );
      expect(wrongX.result).toBeErr(Cl.uint(1019));
    });

    // --- Gate truth table via read-onlys ---
    it("would-take-as-x/-y: full truth table against live and dead resting size", function () {
      setupRegistryAndInit();
      const p = classificationPrice();
      expect(p).toBeGreaterThan(0);

      // Empty book: nobody takes.
      expect(ro(C, "would-take-as-x", [Cl.uint(p), Cl.uint(LIVE_X)])).toBeBool(
        false,
      );
      expect(ro(C, "would-take-as-y", [Cl.uint(p), Cl.uint(LIVE_Y)])).toBeBool(
        false,
      );

      // Live bid resting: a live offer would take; a dead offer would not.
      expect(depositY(STX_10, LIVE_Y, wallet1).result).toBeOk(Cl.uint(STX_10));
      expect(ro(C, "would-take-as-x", [Cl.uint(p), Cl.uint(LIVE_X)])).toBeBool(
        true,
      );
      expect(ro(C, "would-take-as-x", [Cl.uint(p), Cl.uint(DEAD_X)])).toBeBool(
        false,
      );
      // Price u0 fails open.
      expect(ro(C, "would-take-as-x", [Cl.uint(0), Cl.uint(LIVE_X)])).toBeBool(
        false,
      );
      expect(cancelY(wallet1).result).toBeOk(Cl.uint(STX_10));

      // Dead bid resting: nothing to cross.
      expect(depositY(STX_10, DEAD_Y, wallet1).result).toBeOk(Cl.uint(STX_10));
      expect(ro(C, "would-take-as-x", [Cl.uint(p), Cl.uint(LIVE_X)])).toBeBool(
        false,
      );
      expect(cancelY(wallet1).result).toBeOk(Cl.uint(STX_10));

      // Mirror: live offer resting.
      fundSbtc(wallet2, SBTC_2K);
      expect(depositX(SBTC_2K, LIVE_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
      expect(ro(C, "would-take-as-y", [Cl.uint(p), Cl.uint(LIVE_Y)])).toBeBool(
        true,
      );
      expect(ro(C, "would-take-as-y", [Cl.uint(p), Cl.uint(DEAD_Y)])).toBeBool(
        false,
      );
    });

    // --- Maker gate (Hermes-gated: deposits into a non-empty opposite book
    // must carry a real VAA for fresh classification) ---
    it("gate ignores sub-min dust: live-priced dust on the opposite side does not classify or block", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("gate-dust");
      if (!vaaHex) return;
      const p = classificationPrice();
      // Stage roll-remainder-like dust: lower min, rest 2 micro-STX with a
      // live limit, restore min. The dust is live-priced but sub-min.
      expect(
        pub(NS, "set-min-token-y-deposit", [Cl.uint(1)], deployer).result,
      ).toBeOk(Cl.bool(true));
      expect(depositY(2, LIVE_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(2),
      );
      expect(
        pub(NS, "set-min-token-y-deposit", [Cl.uint(MIN_Y)], deployer).result,
      ).toBeOk(Cl.bool(true));

      // Invisible to the gate...
      expect(ro(NS, "would-take-as-x", [Cl.uint(p), Cl.uint(LIVE_X)])).toBeBool(
        false,
      );
      // ...so a live maker deposit opposite it is NOT blocked (fresh VAA
      // required since the y list is non-empty).
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) return;
      const r = depositX(SBTC_2K, LIVE_X, wallet2, vaaHex, NS);
      if (!cvToJSON(r.result).success) {
        console.log("[v2-stx] gate-dust: VAA verify failed — skipped");
        return;
      }
      expect(r.result).toBeOk(Cl.uint(SBTC_2K));
    });

    it("maker gate: crossing deposit reverts ERR_MUST_USE_SWAP, non-crossing variants pass", async function () {
      // Runs on the staleness-patched twin: 8 sequential calls reuse one
      // VAA, far past the ~3-call budget the production MAX_STALENESS u80
      // allows under simnet's 30s-per-block clock.
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("gate");
      if (!vaaHex) return;
      // Live bid rests first (empty book, passes with dummy VAA).
      expect(depositY(STX_10, LIVE_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_10),
      );

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) return;

      // Live offer would cross it -> blocked.
      const blocked = depositX(SBTC_2K, LIVE_X, wallet2, vaaHex, NS);
      if (
        !cvToJSON(blocked.result).success &&
        cvToJSON(blocked.result).value.value !== String(ERR_MUST_USE_SWAP)
      ) {
        console.log("[v2-stx] gate: VAA verify failed — skipped");
        return;
      }
      expect(blocked.result).toBeErr(Cl.uint(ERR_MUST_USE_SWAP));
      // Dead own limit -> allowed despite live bid.
      expect(depositX(SBTC_2K, DEAD_X, wallet2, vaaHex, NS).result).toBeOk(
        Cl.uint(SBTC_2K),
      );

      // Mirror: live offer resting blocks live bids.
      expect(cancelY(wallet1, NS).result).toBeOk(Cl.uint(STX_10));
      expect(cancelX(wallet2, NS).result).toBeOk(Cl.uint(SBTC_2K));
      expect(
        depositX(SBTC_2K, LIVE_X, wallet2, DUMMY_VAA, NS).result,
      ).toBeOk(Cl.uint(SBTC_2K));
      expect(depositY(STX_10, LIVE_Y, wallet1, vaaHex, NS).result).toBeErr(
        Cl.uint(ERR_MUST_USE_SWAP),
      );
      // Dead bid still allowed.
      expect(depositY(STX_10, DEAD_Y, wallet1, vaaHex, NS).result).toBeOk(
        Cl.uint(STX_10),
      );
    });

    it("maker gate applies to top-ups: dust seeded as maker cannot walk size in once crossed", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("gate-topup");
      if (!vaaHex) return;
      expect(depositY(STX_10, LIVE_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_10),
      );
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) return;
      const seed = depositX(SBTC_2K, DEAD_X, wallet2, vaaHex, NS);
      if (!cvToJSON(seed.result).success) {
        console.log("[v2-stx] gate-topup: VAA verify failed — skipped");
        return;
      }
      // Top-up with a live limit is a crossing deposit -> blocked.
      expect(depositX(SBTC_2K, LIVE_X, wallet2, vaaHex, NS).result).toBeErr(
        Cl.uint(ERR_MUST_USE_SWAP),
      );
      // Top-up keeping the dead limit passes.
      expect(depositX(SBTC_2K, DEAD_X, wallet2, vaaHex, NS).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
    });

    it("maker gate applies to set-token-*-limit: dead limit cannot be retargeted into the live range", async function () {
      // Staleness-patched twin: 9 sequential calls on one VAA.
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("gate-setlimit");
      if (!vaaHex) return;
      const vaaArg = Cl.bufferFromHex(vaaHex);
      const dummyArg = Cl.bufferFromHex(DUMMY_VAA);
      expect(depositY(STX_10, LIVE_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_10),
      );
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) return;
      const seed = depositX(SBTC_2K, DEAD_X, wallet2, vaaHex, NS);
      if (!cvToJSON(seed.result).success) {
        console.log("[v2-stx] gate-setlimit: VAA verify failed — skipped");
        return;
      }

      // Retargeting into the live range while a live bid rests -> blocked.
      expect(
        pub(NS, "set-token-x-limit", [Cl.uint(LIVE_X), vaaArg], wallet2)
          .result,
      ).toBeErr(Cl.uint(ERR_MUST_USE_SWAP));
      // Moving between dead limits is fine.
      expect(
        pub(NS, "set-token-x-limit", [Cl.uint(DEAD_X - 1), vaaArg], wallet2)
          .result,
      ).toBeOk(Cl.bool(true));

      // Once the bid is gone, retargeting live is fine (opposite side empty
      // again -> dummy VAA suffices).
      expect(cancelY(wallet1, NS).result).toBeOk(Cl.uint(STX_10));
      expect(
        pub(NS, "set-token-x-limit", [Cl.uint(LIVE_X), dummyArg], wallet2)
          .result,
      ).toBeOk(Cl.bool(true));

      // Mirror on y: rest a dead bid against the now-live offer, try to wake it.
      expect(depositY(STX_10, DEAD_Y, wallet1, vaaHex, NS).result).toBeOk(
        Cl.uint(STX_10),
      );
      expect(
        pub(NS, "set-token-y-limit", [Cl.uint(LIVE_Y), vaaArg], wallet1)
          .result,
      ).toBeErr(Cl.uint(ERR_MUST_USE_SWAP));
    });

    // --- Lifecycle on uncrossed books (v1 parity) ---
    it("token-y (STX): deposit, top-up, cancel, re-deposit", function () {
      setupRegistryAndInit();
      expect(depositY(STX_100, LIVE_Y, wallet1).result).toBeOk(
        Cl.uint(STX_100),
      );
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(STX_100);
      expect(depositY(STX_10, LIVE_Y, wallet1).result).toBeOk(Cl.uint(STX_10));
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(STX_100 + STX_10);
      expect(cancelY(wallet1).result).toBeOk(Cl.uint(STX_100 + STX_10));
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(0);
      expect(depositY(STX_10, LIVE_Y, wallet1).result).toBeOk(Cl.uint(STX_10));
    });

    it("token-x (sBTC): deposit, top-up, cancel, re-deposit", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_10K);
      expect(depositX(SBTC_2K, LIVE_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
      expect(depositX(SBTC_2K, LIVE_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(0), Cl.principal(wallet2)]),
      ).toBeUint(2 * SBTC_2K);
      expect(cancelX(wallet2).result).toBeOk(Cl.uint(2 * SBTC_2K));
      expect(depositX(SBTC_2K, LIVE_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
    });

    // --- Close / cancel-cycle on dead books ---
    it("close-deposits guards; settle on a dead-side book fails; cancel-cycle rolls forward", async function () {
      setupRegistryAndInit();
      const vaaHex = await fetchVaa("close-cancel");
      if (!vaaHex) return;
      // One-sided book cannot close (y total below min).
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) return;
      expect(depositX(SBTC_2K, LIVE_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
      expect(pub(C, "close-deposits", [], wallet1).result).toBeErr(
        Cl.uint(1012),
      );

      // Add a dead bid (x side non-empty -> real VAA): totals pass, close ok.
      const deadBid = depositY(STX_10, DEAD_Y, wallet1, vaaHex);
      if (!cvToJSON(deadBid.result).success) {
        console.log("[v2-stx] close-cancel: VAA verify failed — skipped");
        return;
      }
      expect(pub(C, "close-deposits", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );
      expect(pub(C, "close-deposits", [], wallet1).result).toBeErr(
        Cl.uint(1016),
      );
      expect(ro(C, "get-cycle-phase", [])).toBeUint(2);

      // Settle: the gated deposit above refreshed storage, so if the price
      // is still fresh here the limit filter rolls the dead bid and the
      // totals assert fires (1012); if enough simnet block-time elapsed the
      // freshness assert fires first (1005). Either way: a taker-free book
      // never clears.
      const r = pub(
        C,
        "settle",
        [
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        wallet1,
      );
      const rj = cvToJSON(r.result);
      expect(rj.success).toBe(false);
      expect(["1005", "1012"]).toContain(String(rj.value.value));

      // cancel-cycle too early, then succeeds after the threshold.
      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeErr(
        Cl.uint(1014),
      );
      simnet.mineEmptyBlocks(42);
      expect(pub(C, "cancel-cycle", [], wallet1).result).toBeOk(Cl.bool(true));
      expect(ro(C, "get-current-cycle", [])).toBeUint(1);
      // Deposits rolled into cycle 1.
      expect(
        ro(C, "get-token-x-deposit", [Cl.uint(1), Cl.principal(wallet2)]),
      ).toBeUint(SBTC_2K);
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet1)]),
      ).toBeUint(STX_10);
    });

    it("small-share filter: tiny live bid rolled on close-deposits", async function () {
      setupRegistryAndInit();
      const vaaHex = await fetchVaa("small-share");
      if (!vaaHex) return;
      // Whale + fish on y first (x empty -> dummy VAA), then a dead offer on
      // x (y side non-empty -> real VAA).
      expect(depositY(STX_500, LIVE_Y, wallet1).result).toBeOk(
        Cl.uint(STX_500),
      );
      expect(depositY(STX_1, LIVE_Y, wallet3).result).toBeOk(Cl.uint(STX_1));
      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) return;
      const deadOffer = depositX(SBTC_2K, DEAD_X, wallet2, vaaHex);
      if (!cvToJSON(deadOffer.result).success) {
        console.log("[v2-stx] small-share: VAA verify failed — skipped");
        return;
      }

      expect(pub(C, "close-deposits", [], wallet1).result).toBeOk(
        Cl.bool(true),
      );
      // Fish rolled to cycle 1, whale stayed.
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet3)]),
      ).toBeUint(0);
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(1), Cl.principal(wallet3)]),
      ).toBeUint(STX_1);
      expect(
        ro(C, "get-token-y-deposit", [Cl.uint(0), Cl.principal(wallet1)]),
      ).toBeUint(STX_500);
    });

    // --- Admin (v1 parity) ---
    it("admin: pause blocks deposits, operator/treasury/min setters gated", function () {
      setupRegistryAndInit();
      expect(pub(C, "set-paused", [Cl.bool(true)], wallet1).result).toBeErr(
        Cl.uint(1011),
      );
      expect(pub(C, "set-paused", [Cl.bool(true)], deployer).result).toBeOk(
        Cl.bool(true),
      );
      expect(depositY(STX_10, LIVE_Y, wallet1).result).toBeErr(Cl.uint(1010));
      expect(pub(C, "set-paused", [Cl.bool(false)], deployer).result).toBeOk(
        Cl.bool(true),
      );
      expect(
        pub(C, "set-min-token-y-deposit", [Cl.uint(2 * MIN_Y)], deployer)
          .result,
      ).toBeOk(Cl.bool(true));
      expect(depositY(MIN_Y, LIVE_Y, wallet1).result).toBeErr(Cl.uint(1001));
      expect(
        pub(C, "set-min-token-y-deposit", [Cl.uint(MIN_Y)], deployer).result,
      ).toBeOk(Cl.bool(true));
    });

    // ========================================================================
    // Hermes-gated: swap (the only taker path, and the only way to clear)
    // ========================================================================

    it("swap deposit-x=true: FOK fill, taker pays 20bps, sole maker receives net - fee + rebate", async function () {
      setupRegistryAndInit();
      const vaaHex = await fetchVaa("swap-x");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] swap-x: skipped — VM bug");
        return;
      }

      // Maker rests 100 STX (live). Taker brings 10k sats (~well under the
      // bid's value at any sane price), so x binds and the taker fully fills.
      expect(depositY(STX_100, LIVE_Y, wallet1).result).toBeOk(
        Cl.uint(STX_100),
      );
      const makerSbtcBefore = sbtcBalance(wallet1);
      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      let r;
      try {
        r = swap(SBTC_10K, LIVE_X, vaaHex, true, wallet2);
      } catch (e) {
        console.log("[v2-stx] swap-x: threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (!rj.success) {
        console.log("[v2-stx] swap-x: errored — VM bug or VAA verify");
        return;
      }

      // FOK: taker fully filled, nothing rolled.
      expect(Number(rj.value.value["token-x-rolled"].value)).toBe(0);
      expect(
        Number(rj.value.value["token-y-received"].value),
      ).toBeGreaterThan(0);

      // Sole maker on y receives the whole x pool: net - fee + rebate.
      const rebate = Math.floor((SBTC_10K * TAKER_REBATE_BPS) / BPS_PRECISION);
      const net = SBTC_10K - rebate;
      const fee = Math.floor((net * FEE_BPS) / BPS_PRECISION);
      expect(sbtcBalance(wallet1) - makerSbtcBefore).toBe(net - fee + rebate);

      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v2-stx] swap-x: cycle ${preCycle} FOK-filled, maker got ${net - fee + rebate} sats (rebate ${rebate})`,
      );
    });

    it("swap deposit-x=false: STX taker sized inside the resting offer fully fills", async function () {
      setupRegistryAndInit();
      const vaaHex = await fetchVaa("swap-y");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] swap-y: skipped — VM bug");
        return;
      }

      expect(depositX(SBTC_10K, LIVE_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_10K),
      );
      const preCycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      let r;
      try {
        // 10 STX against ~10k sats of live offer: y binds, taker fully fills.
        r = swap(STX_10, LIVE_Y, vaaHex, false, wallet1);
      } catch (e) {
        console.log("[v2-stx] swap-y: threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (!rj.success) {
        console.log("[v2-stx] swap-y: errored — VM bug or VAA verify");
        return;
      }
      expect(Number(rj.value.value["token-y-rolled"].value)).toBe(0);
      expect(
        Number(rj.value.value["token-x-received"].value),
      ).toBeGreaterThan(0);
      expect(ro(C, "get-current-cycle", [])).toBeUint(preCycle + 1);
      console.log(`[v2-stx] swap-y: cycle ${preCycle} FOK-filled`);
    });

    it("swap oversize vs resting bid reverts ERR_PARTIAL_FILL and unwinds the rebate", async function () {
      setupRegistryAndInit();
      const vaaHex = await fetchVaa("swap-partial");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] swap-partial: skipped — VM bug");
        return;
      }

      // Tiny 2 STX bid resting; the 10k-sat taker is worth far more, so the
      // taker side would only partially clear -> FOK revert.
      expect(depositY(STX_2, LIVE_Y, wallet1).result).toBeOk(Cl.uint(STX_2));
      const takerSbtcBefore = sbtcBalance(wallet2);

      let r;
      try {
        r = swap(SBTC_10K, LIVE_X, vaaHex, true, wallet2);
      } catch (e) {
        console.log("[v2-stx] swap-partial: threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (rj.success) {
        console.log(
          "[v2-stx] swap-partial: unexpectedly filled — price moved far; inspect",
        );
        return;
      }
      expect(r.result).toBeErr(Cl.uint(ERR_PARTIAL_FILL));
      // Whole tx reverted: taker keeps every sat (rebate unwound too).
      expect(sbtcBalance(wallet2)).toBe(takerSbtcBefore);
      console.log("[v2-stx] swap-partial: FOK revert, rebate unwound");
    });

    // --- reprice-or-swap: the maker's only limit-retarget path ---
    //
    // reprice-or-swap-token-{x,y} sets the caller's limit unconditionally,
    // then, iff the new limit crosses live opposite size at the fresh
    // classification price, turns taker on the spot: pulls TAKER_REBATE_BPS
    // fresh (on top of the resting size, which is what settles), closes the
    // cycle and settles FOK in the same tx. Non-crossing calls move no
    // assets and return the zeroed result tuple.

    const ERR_NOT_DEPOSIT_PHASE = 1002;
    const ERR_NOTHING_TO_WITHDRAW = 1008;
    const ERR_LIMIT_REQUIRED = 1017;
    const ERR_WRONG_TRAIT = 1019;

    function repriceX(
      limit: number,
      vaaHex: string,
      sender: string,
      mkt: string = C,
    ) {
      return pub(
        mkt,
        "reprice-or-swap-token-x",
        [
          Cl.uint(limit),
          Cl.bufferFromHex(vaaHex),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        sender,
      );
    }

    function repriceY(
      limit: number,
      vaaHex: string,
      sender: string,
      mkt: string = C,
    ) {
      return pub(
        mkt,
        "reprice-or-swap-token-y",
        [
          Cl.uint(limit),
          Cl.bufferFromHex(vaaHex),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        sender,
      );
    }

    function stxBalance(who: string): number {
      return Number(simnet.getAssetsMap().get("STX")?.get(who) ?? 0);
    }

    const ZERO_RESULT = Cl.tuple({
      "token-x-received": Cl.uint(0),
      "token-y-rolled": Cl.uint(0),
      "token-y-received": Cl.uint(0),
      "token-x-rolled": Cl.uint(0),
    });

    it("get-taker-rebate-bps exposes the mirrored constant", function () {
      expect(ro(C, "get-taker-rebate-bps", [])).toBeUint(TAKER_REBATE_BPS);
    });

    it("reprice-or-swap-token-x: plain reprice retargets the limit, moves nothing", function () {
      setupRegistryAndInit();
      fundSbtc(wallet2, SBTC_2K);
      expect(depositX(SBTC_2K, DEAD_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
      const balBefore = sbtcBalance(wallet2);
      const cycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      // Empty opposite book: the crossing predicate short-circuits before
      // the oracle, so a dummy VAA is fine and the call is deterministic.
      expect(repriceX(DEAD_X - 1, DUMMY_VAA, wallet2).result).toBeOk(
        ZERO_RESULT,
      );

      expect(ro(C, "get-token-x-limit", [Cl.principal(wallet2)])).toBeUint(
        DEAD_X - 1,
      );
      expect(sbtcBalance(wallet2)).toBe(balBefore);
      expect(
        ro(C, "get-token-x-deposit", [
          Cl.uint(cycle),
          Cl.principal(wallet2),
        ]),
      ).toBeUint(SBTC_2K);
      expect(ro(C, "get-current-cycle", [])).toBeUint(cycle);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
    });

    it("reprice-or-swap-token-y: plain reprice retargets the limit, moves nothing", function () {
      setupRegistryAndInit();
      expect(depositY(STX_10, DEAD_Y, wallet1).result).toBeOk(Cl.uint(STX_10));
      const balBefore = stxBalance(wallet1);
      const cycle = Number(cvToJSON(ro(C, "get-current-cycle", [])).value);

      // DEAD_Y = 1; 2 is equally dead (bid live iff price <= limit).
      expect(repriceY(DEAD_Y + 1, DUMMY_VAA, wallet1).result).toBeOk(
        ZERO_RESULT,
      );

      expect(ro(C, "get-token-y-limit", [Cl.principal(wallet1)])).toBeUint(
        DEAD_Y + 1,
      );
      expect(stxBalance(wallet1)).toBe(balBefore);
      expect(
        ro(C, "get-token-y-deposit", [
          Cl.uint(cycle),
          Cl.principal(wallet1),
        ]),
      ).toBeUint(STX_10);
      expect(ro(C, "get-cycle-phase", [])).toBeUint(0);
    });

    it("reprice-or-swap guards: zero limit, no resting deposit, wrong traits", function () {
      setupRegistryAndInit();

      // Limit gate fires before the deposit lookup.
      expect(repriceX(0, DUMMY_VAA, wallet2).result).toBeErr(
        Cl.uint(ERR_LIMIT_REQUIRED),
      );
      expect(repriceY(0, DUMMY_VAA, wallet1).result).toBeErr(
        Cl.uint(ERR_LIMIT_REQUIRED),
      );

      // Valid limit, no resting deposit on that side.
      expect(repriceX(DEAD_X, DUMMY_VAA, wallet2).result).toBeErr(
        Cl.uint(ERR_NOTHING_TO_WITHDRAW),
      );
      expect(repriceY(DEAD_Y, DUMMY_VAA, wallet1).result).toBeErr(
        Cl.uint(ERR_NOTHING_TO_WITHDRAW),
      );

      // Swapped traits with a real resting deposit.
      fundSbtc(wallet2, SBTC_2K);
      expect(depositX(SBTC_2K, DEAD_X, wallet2).result).toBeOk(
        Cl.uint(SBTC_2K),
      );
      const swappedTraits = pub(
        C,
        "reprice-or-swap-token-x",
        [
          Cl.uint(DEAD_X),
          Cl.bufferFromHex(DUMMY_VAA),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet2,
      );
      expect(swappedTraits.result).toBeErr(Cl.uint(ERR_WRONG_TRAIT));
    });

    it("reprice crossing (x): dead offer retargeted live converts FOK; rebate pulled fresh", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("reprice-x");
      if (!vaaHex) return;

      let funded = true;
      try {
        // The reprice rebate is pulled FRESH from the wallet, on top of the
        // resting size — a repricer whose wallet is empty after depositing
        // cannot convert (the pull fails with the token's own err u1).
        // Fund deposit + rebate headroom.
        fundSbtc(wallet2, SBTC_2K + 100);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] reprice-x: skipped — VM bug");
        return;
      }

      // Live 100 STX bid rests first (empty x book, dummy VAA fine).
      expect(depositY(STX_100, LIVE_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_100),
      );
      // Dead 2k-sat offer joins: non-crossing, passes the maker gate, but the
      // non-empty y book means classification needs the real VAA.
      let dep;
      try {
        dep = depositX(SBTC_2K, DEAD_X, wallet2, vaaHex, NS);
      } catch (e) {
        console.log("[v2-stx] reprice-x: deposit threw —", (e as Error).message);
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log("[v2-stx] reprice-x: staging deposit errored — VAA verify");
        return;
      }

      const makerSbtcBefore = sbtcBalance(wallet1);
      const repricerSbtcBefore = sbtcBalance(wallet2);
      const preCycle = Number(cvToJSON(ro(NS, "get-current-cycle", [])).value);

      let r;
      try {
        r = repriceX(LIVE_X, vaaHex, wallet2, NS);
      } catch (e) {
        console.log("[v2-stx] reprice-x: threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (!rj.success) {
        console.log("[v2-stx] reprice-x: errored — VAA verify or price moved");
        return;
      }

      // FOK: the full resting 2k sats cleared, nothing rolled.
      expect(Number(rj.value.value["token-x-rolled"].value)).toBe(0);
      expect(
        Number(rj.value.value["token-y-received"].value),
      ).toBeGreaterThan(0);

      // Rebate is charged fresh on top of the resting size: the repricer's
      // wallet is debited exactly the rebate (the 2k already sat on the
      // market), and the sole y maker receives resting - fee + rebate.
      const rebate = Math.floor((SBTC_2K * TAKER_REBATE_BPS) / BPS_PRECISION);
      const fee = Math.floor((SBTC_2K * FEE_BPS) / BPS_PRECISION);
      expect(repricerSbtcBefore - sbtcBalance(wallet2)).toBe(rebate);
      expect(sbtcBalance(wallet1) - makerSbtcBefore).toBe(
        SBTC_2K - fee + rebate,
      );

      expect(ro(NS, "get-current-cycle", [])).toBeUint(preCycle + 1);
      expect(ro(NS, "get-cycle-phase", [])).toBeUint(0);
      console.log(
        `[v2-stx] reprice-x: converted FOK, maker got ${SBTC_2K - fee + rebate} sats (rebate ${rebate})`,
      );
    });

    it("reprice crossing (y): dead bid retargeted live converts FOK; rebate in native STX", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("reprice-y");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] reprice-y: skipped — VM bug");
        return;
      }

      // Live 10k-sat offer rests first (empty y book).
      expect(
        depositX(SBTC_10K, LIVE_X, wallet2, DUMMY_VAA, NS).result,
      ).toBeOk(Cl.uint(SBTC_10K));
      // Dead 10 STX bid joins (non-crossing, real VAA for classification).
      let dep;
      try {
        dep = depositY(STX_10, DEAD_Y, wallet1, vaaHex, NS);
      } catch (e) {
        console.log("[v2-stx] reprice-y: deposit threw —", (e as Error).message);
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log("[v2-stx] reprice-y: staging deposit errored — VAA verify");
        return;
      }

      const repricerStxBefore = stxBalance(wallet1);

      let r;
      try {
        r = repriceY(LIVE_Y, vaaHex, wallet1, NS);
      } catch (e) {
        console.log("[v2-stx] reprice-y: threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (!rj.success) {
        console.log("[v2-stx] reprice-y: errored — VAA verify or price moved");
        return;
      }

      expect(Number(rj.value.value["token-y-rolled"].value)).toBe(0);
      expect(
        Number(rj.value.value["token-x-received"].value),
      ).toBeGreaterThan(0);

      // Native-STX rebate pulled fresh from the repricer.
      const rebate = Math.floor((STX_10 * TAKER_REBATE_BPS) / BPS_PRECISION);
      expect(repricerStxBefore - stxBalance(wallet1)).toBe(rebate);
      console.log(
        `[v2-stx] reprice-y: converted FOK, STX rebate ${rebate} uSTX pulled`,
      );
    });

    it("reprice crossing oversize: ERR_PARTIAL_FILL unwinds the retarget AND the rebate", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("reprice-partial");
      if (!vaaHex) return;

      let funded = true;
      try {
        // Deposit + rebate headroom (the rebate pull is fresh, on top).
        fundSbtc(wallet2, SBTC_10K + 100);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] reprice-partial: skipped — VM bug");
        return;
      }

      // Tiny 2 STX bid vs a 10k-sat dead offer: retargeting the offer live
      // can only partially clear -> FOK revert.
      expect(depositY(STX_2, LIVE_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_2),
      );
      let dep;
      try {
        dep = depositX(SBTC_10K, DEAD_X, wallet2, vaaHex, NS);
      } catch (e) {
        console.log(
          "[v2-stx] reprice-partial: deposit threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log(
          "[v2-stx] reprice-partial: staging deposit errored — VAA verify",
        );
        return;
      }

      const balBefore = sbtcBalance(wallet2);

      let r;
      try {
        r = repriceX(LIVE_X, vaaHex, wallet2, NS);
      } catch (e) {
        console.log("[v2-stx] reprice-partial: threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (rj.success) {
        console.log(
          "[v2-stx] reprice-partial: unexpectedly filled — price moved far; inspect",
        );
        return;
      }
      expect(r.result).toBeErr(Cl.uint(ERR_PARTIAL_FILL));

      // The whole tx reverted: the limit retarget itself is unwound (the
      // old dead limit stands — a failed conversion cannot leave a live
      // limit resting) and the fresh rebate is back in the wallet.
      expect(ro(NS, "get-token-x-limit", [Cl.principal(wallet2)])).toBeUint(
        DEAD_X,
      );
      expect(sbtcBalance(wallet2)).toBe(balBefore);
      console.log("[v2-stx] reprice-partial: FOK revert, limit + rebate unwound");
    });

    it("dust reprice crossing: rebate rounds to 0, conversion proceeds with no fresh pull", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("reprice-dust");
      if (!vaaHex) return;

      // Resting size below BPS_PRECISION / TAKER_REBATE_BPS = 500 units
      // floors the rebate to zero. The crossing branch then skips the
      // fresh transfer entirely — nothing is debited from the repricer, so
      // no post-condition on the caller could veto this conversion. This
      // pins the documented edge: abort-if-crossing is not emulatable via
      // PCs for dust positions.
      expect(
        pub(NS, "set-min-token-x-deposit", [Cl.uint(1)], deployer).result,
      ).toBeOk(Cl.bool(true));

      const DUST = 400; // rebate = 400 * 20 / 10000 = 0
      let funded = true;
      try {
        fundSbtc(wallet2, DUST);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] reprice-dust: skipped — VM bug");
        return;
      }

      expect(depositY(STX_2, LIVE_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_2),
      );
      let dep;
      try {
        dep = depositX(DUST, DEAD_X, wallet2, vaaHex, NS);
      } catch (e) {
        console.log(
          "[v2-stx] reprice-dust: deposit threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log(
          "[v2-stx] reprice-dust: staging deposit errored — VAA verify",
        );
        return;
      }

      const balBefore = sbtcBalance(wallet2); // 0 after depositing all dust

      let r;
      try {
        r = repriceX(LIVE_X, vaaHex, wallet2, NS);
      } catch (e) {
        console.log("[v2-stx] reprice-dust: threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (!rj.success) {
        console.log("[v2-stx] reprice-dust: errored — VAA verify or price moved");
        return;
      }

      // Converted with zero rebate debit: the repricer's sBTC balance is
      // untouched by the crossing (400 sats already rested on the market).
      expect(Number(rj.value.value["token-x-rolled"].value)).toBe(0);
      expect(
        Number(rj.value.value["token-y-received"].value),
      ).toBeGreaterThan(0);
      expect(sbtcBalance(wallet2)).toBe(balBefore);
      console.log(
        "[v2-stx] reprice-dust: converted, zero rebate pulled (documented dust edge)",
      );
    });

    it("reprice in settle phase reverts ERR_NOT_DEPOSIT_PHASE", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("reprice-phase");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] reprice-phase: skipped — VM bug");
        return;
      }

      // Uncrossed two-sided book, then close it manually.
      expect(depositY(STX_10, DEAD_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_10),
      );
      let dep;
      try {
        dep = depositX(SBTC_2K, DEAD_X, wallet2, vaaHex, NS);
      } catch (e) {
        console.log(
          "[v2-stx] reprice-phase: deposit threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log(
          "[v2-stx] reprice-phase: staging deposit errored — VAA verify",
        );
        return;
      }
      expect(pub(NS, "close-deposits", [], deployer).result).toBeOk(
        Cl.bool(true),
      );
      expect(ro(NS, "get-cycle-phase", [])).toBeUint(2);

      expect(repriceX(DEAD_X - 1, DUMMY_VAA, wallet2, NS).result).toBeErr(
        Cl.uint(ERR_NOT_DEPOSIT_PHASE),
      );
      expect(repriceY(DEAD_Y + 1, DUMMY_VAA, wallet1, NS).result).toBeErr(
        Cl.uint(ERR_NOT_DEPOSIT_PHASE),
      );
    });

    // --- v1-parity items ---

    it("get-cycle-start-block and get-blocks-elapsed advance", function () {
      setupRegistryAndInit();
      const start = Number(cvToJSON(ro(C, "get-cycle-start-block", [])).value);
      expect(start).toBeGreaterThan(0);
      const e0 = Number(cvToJSON(ro(C, "get-blocks-elapsed", [])).value);
      simnet.mineEmptyBlocks(5);
      const e1 = Number(cvToJSON(ro(C, "get-blocks-elapsed", [])).value);
      expect(e1 - e0).toBe(5);
      expect(ro(C, "get-cycle-start-block", [])).toBeUint(start);
    });

    it("regression: cancel-cycle after small-share-roll preserves rolled fish in C+1", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("cancel-after-roll");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] cancel-after-roll: skipped — VM bug");
        return;
      }

      // Whale 500 STX + 2 fish at 1 STX each (1/502 = 0.199% < 0.20%
      // MIN_SHARE_BPS): fish get rolled to C+1 at close. All dead limits,
      // staged y-first so only the final x deposit needs the real VAA.
      expect(depositY(STX_500, DEAD_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_500),
      );
      expect(depositY(STX_1, DEAD_Y, wallet3, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_1),
      );
      expect(depositY(STX_1, DEAD_Y, deployer, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_1),
      );
      let dep;
      try {
        dep = depositX(SBTC_10K, DEAD_X, wallet2, vaaHex, NS);
      } catch (e) {
        console.log(
          "[v2-stx] cancel-after-roll: deposit threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log(
          "[v2-stx] cancel-after-roll: staging deposit errored — VAA verify",
        );
        return;
      }

      const cycle = Number(cvToJSON(ro(NS, "get-current-cycle", [])).value);
      expect(pub(NS, "close-deposits", [], deployer).result).toBeOk(
        Cl.bool(true),
      );

      // Fish rolled to C+1 by the small-share filter at close.
      expect(
        ro(NS, "get-token-y-deposit", [
          Cl.uint(cycle + 1),
          Cl.principal(wallet3),
        ]),
      ).toBeUint(STX_1);

      simnet.mineEmptyBlocks(42);
      expect(pub(NS, "cancel-cycle", [], deployer).result).toBeOk(
        Cl.bool(true),
      );

      // The regression (fixed 2026-05-07 in v1, must hold in v2): C+1 keeps
      // the pre-rolled fish AND the cancel-rolled whale — merged, not
      // overwritten.
      const depositors = cvToJSON(
        ro(NS, "get-token-y-depositors", [Cl.uint(cycle + 1)]),
      ).value.map((d: any) => d.value);
      expect(depositors).toContain(wallet1);
      expect(depositors).toContain(wallet3);
      expect(depositors).toContain(deployer);
      const totals = cvToJSON(
        ro(NS, "get-cycle-totals", [Cl.uint(cycle + 1)]),
      );
      expect(Number(totals.value["total-token-y"].value)).toBe(
        STX_500 + 2 * STX_1,
      );

      // Everyone can exit cleanly from C+1 — no underflow, exact refunds.
      expect(cancelY(wallet1, NS).result).toBeOk(Cl.uint(STX_500));
      expect(cancelY(wallet3, NS).result).toBeOk(Cl.uint(STX_1));
      expect(cancelY(deployer, NS).result).toBeOk(Cl.uint(STX_1));
      expect(cancelX(wallet2, NS).result).toBeOk(Cl.uint(SBTC_10K));
      console.log(
        "[v2-stx] cancel-after-roll: merged totals preserved, all 4 exits clean",
      );
    });

    it("same depositor on both sides: appears in both lists on an uncrossed book", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("same-depositor");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet1, SBTC_2K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] same-depositor: skipped — VM bug");
        return;
      }

      expect(depositY(STX_10, DEAD_Y, wallet1, DUMMY_VAA, NS).result).toBeOk(
        Cl.uint(STX_10),
      );
      let dep;
      try {
        dep = depositX(SBTC_2K, DEAD_X, wallet1, vaaHex, NS);
      } catch (e) {
        console.log(
          "[v2-stx] same-depositor: deposit threw —",
          (e as Error).message,
        );
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log(
          "[v2-stx] same-depositor: staging deposit errored — VAA verify",
        );
        return;
      }

      const cycle = Number(cvToJSON(ro(NS, "get-current-cycle", [])).value);
      const ys = cvToJSON(
        ro(NS, "get-token-y-depositors", [Cl.uint(cycle)]),
      ).value.map((d: any) => d.value);
      const xs = cvToJSON(
        ro(NS, "get-token-x-depositors", [Cl.uint(cycle)]),
      ).value.map((d: any) => d.value);
      expect(ys).toContain(wallet1);
      expect(xs).toContain(wallet1);

      // Both positions exit independently.
      expect(cancelY(wallet1, NS).result).toBeOk(Cl.uint(STX_10));
      expect(cancelX(wallet1, NS).result).toBeOk(Cl.uint(SBTC_2K));
    });

    // --- taker-rebate economics: circumvention probe + multi-maker split ---

    it("BEHAVIOR: swap top-up of a resting position charges rebate on the FRESH amount only (not a bug)", async function () {
      // Documents an intentional, harmless asymmetry. swap's deposit-*-core
      // tops up the sender's existing same-side position and overwrites its
      // limit live; the WHOLE merged position then settles FOK. The rebate
      // is amount * 20bps on the FRESH amount alone, so converting a large
      // resting position via a tiny swap costs far less rebate than the
      // reprice path would on the same size:
      //   reprice 100k sats  -> rebate 200 sats
      //   rest 100k + swap 2k -> rebate 4 sats, same conversion.
      // This is NOT exploitable: settlement clears EVERYONE at one oracle
      // price (settle-clearing-price = oracle-price), so the resting
      // inventory converts at a fair price and the opposite-side makers get
      // the exact fill they rested for. The rebate is a small taker->maker
      // tip on top, not the makers' entitlement, so a smaller tip harms no
      // one. If anything reprice slightly over-tips on already-committed
      // inventory. Pinned here so the fresh-amount rebate basis is not later
      // mistaken for a defect.
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("rebate-circumvention");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, 102_100);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] rebate-circ: skipped — VM bug");
        return;
      }

      // 600 STX of live bids resting (both enter an empty x book).
      expect(
        depositY(STX_500, LIVE_Y, wallet1, DUMMY_VAA, NS).result,
      ).toBeOk(Cl.uint(STX_500));
      expect(
        depositY(STX_100, LIVE_Y, wallet3, DUMMY_VAA, NS).result,
      ).toBeOk(Cl.uint(STX_100));

      // 100k-sat DEAD offer rests (passes the maker gate, pays nothing).
      let dep;
      try {
        dep = depositX(100_000, DEAD_X, wallet2, vaaHex, NS);
      } catch (e) {
        console.log("[v2-stx] rebate-circ: deposit threw —", (e as Error).message);
        return;
      }
      if (!cvToJSON(dep.result).success) {
        console.log("[v2-stx] rebate-circ: staging errored — VAA verify");
        return;
      }

      const takerSbtcBefore = sbtcBalance(wallet2); // 2_100 left in wallet
      const makersSbtcBefore = sbtcBalance(wallet1) + sbtcBalance(wallet3);

      // Tiny 2k-sat swap with a live limit: merges with the 100k resting.
      let r;
      try {
        r = pub(
          NS,
          "swap",
          [
            Cl.uint(SBTC_2K),
            Cl.uint(LIVE_X),
            Cl.bufferFromHex(vaaHex),
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
            Cl.bool(true),
          ],
          wallet2,
        );
      } catch (e) {
        console.log("[v2-stx] rebate-circ: swap threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (!rj.success) {
        console.log(
          `[v2-stx] rebate-circ: swap reverted ${JSON.stringify(rj.value)} — ` +
            "merged position did NOT convert (merged position did not convert)",
        );
        return;
      }

      // The merged 102k (100k resting + 1996 net) fully converted...
      expect(Number(rj.value.value["token-x-rolled"].value)).toBe(0);
      const stxReceived = Number(rj.value.value["token-y-received"].value);
      expect(stxReceived).toBeGreaterThan(0);

      // ...and the taker's wallet was debited ONLY the fresh 2k (4 sats of
      // which are the rebate). The 100k resting slice converted rebate-free.
      const freshDebit = takerSbtcBefore - sbtcBalance(wallet2);
      const rebatePaid = Math.floor((SBTC_2K * TAKER_REBATE_BPS) / BPS_PRECISION);
      const repriceWouldCharge = Math.floor(
        (102_000 * TAKER_REBATE_BPS) / BPS_PRECISION,
      );
      expect(freshDebit).toBe(SBTC_2K);

      // Makers received the full cleared size minus fee plus ONLY the tiny
      // rebate — quantifying the shortfall vs the reprice path.
      const makersDelta =
        sbtcBalance(wallet1) + sbtcBalance(wallet3) - makersSbtcBefore;
      console.log(
        `[v2-stx] rebate-basis: converted 102k sats paying ` +
          `${rebatePaid} sats rebate (reprice would charge ${repriceWouldCharge}); ` +
          `makers received ${makersDelta} sats total, got ${stxReceived} uSTX`,
      );
    });

    it("multi-maker fill: batch settlement splits the fill AND the rebate pro-rata across makers", async function () {
      setupNoStaleMarket();
      const vaaHex = await fetchVaa("multi-maker");
      if (!vaaHex) return;

      let funded = true;
      try {
        fundSbtc(wallet2, SBTC_10K);
      } catch {
        funded = false;
      }
      if (!funded) {
        console.log("[v2-stx] multi-maker: skipped — VM bug");
        return;
      }

      // Two live bids at 2:1 size (100 + 50 STX), both entering an empty
      // x book. A batch auction has no single-counterparty matching: the
      // taker clears against BOTH, pro-rata by size.
      const STX_50 = 50_000_000;
      expect(
        depositY(STX_100, LIVE_Y, wallet1, DUMMY_VAA, NS).result,
      ).toBeOk(Cl.uint(STX_100));
      expect(
        depositY(STX_50, LIVE_Y, wallet3, DUMMY_VAA, NS).result,
      ).toBeOk(Cl.uint(STX_50));

      const m1Before = sbtcBalance(wallet1);
      const m2Before = sbtcBalance(wallet3);

      // 10k-sat taker (~54 STX worth < 150 STX resting): x binds, both
      // makers fill partially. Swap on the same staleness-patched twin the
      // makers rested on (the module `swap` helper targets production C).
      let r;
      try {
        r = pub(
          NS,
          "swap",
          [
            Cl.uint(SBTC_10K),
            Cl.uint(LIVE_X),
            Cl.bufferFromHex(vaaHex),
            SBTC_TRAIT,
            Cl.stringAscii(SBTC_ASSET),
            WSTX_TRAIT,
            Cl.stringAscii(WSTX_ASSET),
            Cl.bool(true),
          ],
          wallet2,
        );
      } catch (e) {
        console.log("[v2-stx] multi-maker: swap threw —", (e as Error).message);
        return;
      }
      const rj = cvToJSON(r.result);
      if (!rj.success) {
        console.log("[v2-stx] multi-maker: swap errored — VAA verify");
        return;
      }
      expect(Number(rj.value.value["token-x-rolled"].value)).toBe(0);

      const rebate = Math.floor((SBTC_10K * TAKER_REBATE_BPS) / BPS_PRECISION);
      const net = SBTC_10K - rebate;
      const fee = Math.floor((net * FEE_BPS) / BPS_PRECISION);
      const pool = net - fee + rebate; // total owed to the y side

      const d1 = sbtcBalance(wallet1) - m1Before;
      const d2 = sbtcBalance(wallet3) - m2Before;

      // Both makers were filled...
      expect(d1).toBeGreaterThan(0);
      expect(d2).toBeGreaterThan(0);
      // ...conserving the pool up to integer-truncation dust (swept to
      // treasury), never exceeding it...
      expect(d1 + d2).toBeLessThanOrEqual(pool);
      expect(d1 + d2).toBeGreaterThanOrEqual(pool - 4);
      // ...and split pro-rata 2:1 within rounding.
      const ratio = d1 / d2;
      expect(ratio).toBeGreaterThan(1.9);
      expect(ratio).toBeLessThan(2.1);
      console.log(
        `[v2-stx] multi-maker: pool ${pool} split ${d1}/${d2} (ratio ${ratio.toFixed(3)}), dust ${pool - d1 - d2}`,
      );
    });
  },
);
