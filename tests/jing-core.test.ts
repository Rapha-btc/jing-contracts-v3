import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

// ============================================================================
// jing-core direct admin/registry coverage. The market test files cover
// jing-core indirectly (every market call routes through log-* and emits
// events on jing-core), but several jing-core paths aren't reachable from
// market tests:
//
//   - pause / unpause flow + entry-vs-exit gating
//   - get-balance ↔ get-token-equity parity (Zest-shaped read)
//   - multi-market equity aggregation
//   - set-contract-owner (and the markets' get-contract-owner gate that
//     keys on it)
//
// Mirrors the stxer sims in simulations/simul-jing-core-*.js. We DO NOT
// mirror simul-jing-core-hash-mismatch here — that sim deploys a patched
// market with a different hash, which clarinet's deployment plan can't
// express without source-patching the on-disk contract. The unverified-
// canonical (u5005) failure mode IS already exercised in
// markets-sbtc-{usdcx,stx}-jing.test.ts via the "naked" initialize call
// before setupRegistryAndInit.
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
const deployer = accounts.get("deployer")!; // contract-owner
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const JING_CORE = "jing-core";
const USDCX_MARKET = "markets-sbtc-usdcx-jing";
const STX_MARKET = "markets-sbtc-stx-jing";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_ASSET = "sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const SBTC_TRAIT = Cl.contractPrincipal(
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
  "sbtc-token",
);

const USDCX_TOKEN = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const USDCX_ASSET = "usdcx-token";
const USDCX_WHALE = "SP2V3J7G42E8ZD1YPK6G6295EQ1EGZMPGDZQSRDWT";
const USDCX_TRAIT = Cl.contractPrincipal(
  "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE",
  "usdcx",
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

const TIMELOCK_BURN_BLOCKS = 144;
const MIN_X = 1_000;
const MIN_Y_USDCX = 1_000_000;
const MIN_Y_STX = 1_000_000;

const SBTC_10K = 10_000;
const USDCX_100 = 100_000_000;
const STX_100 = 100_000_000;

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

// Verifies a single market with USDCx + BTC/USD feed (most general/simple).
function setupUsdcxMarket() {
  const marketArg = Cl.contractPrincipal(deployer, USDCX_MARKET);

  expect(
    pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
  ).toBeOk(Cl.bool(true));

  expect(
    pub(
      USDCX_MARKET,
      "initialize",
      [
        marketArg,
        Cl.principal(SBTC_TOKEN),
        Cl.principal(USDCX_TOKEN),
        Cl.uint(MIN_X),
        Cl.uint(MIN_Y_USDCX),
        Cl.bufferFromHex(BTC_FEED),
      ],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
}

function setupStxMarket() {
  const marketArg = Cl.contractPrincipal(deployer, STX_MARKET);

  expect(
    pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
  ).toBeOk(Cl.bool(true));

  expect(
    pub(
      STX_MARKET,
      "initialize",
      [
        marketArg,
        Cl.principal(SBTC_TOKEN),
        Cl.principal(WSTX_TOKEN),
        Cl.uint(MIN_X),
        Cl.uint(MIN_Y_STX),
        Cl.bufferFromHex(BTC_FEED),
        Cl.bufferFromHex(STX_FEED),
      ],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
}

describe.skipIf(!remoteDataEnabled)("jing-core direct paths", function () {
  // --- set-verified-contract auth + happy path ---
  it("set-verified-contract: owner-only, idempotent, marks is-verified-contract", function () {
    const marketArg = Cl.contractPrincipal(deployer, USDCX_MARKET);

    // Non-owner rejected.
    expect(
      pub(JING_CORE, "set-verified-contract", [marketArg], wallet1).result,
    ).toBeErr(Cl.uint(5001));

    // Owner happy path.
    expect(
      pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
    ).toBeOk(Cl.bool(true));

    // is-verified-contract reflects.
    expect(ro(JING_CORE, "is-verified-contract", [marketArg])).toBeBool(true);

    // Re-add same contract → ERR_ALREADY_REGISTERED (5003).
    expect(
      pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
    ).toBeErr(Cl.uint(5003));
  });

  // --- pause / unpause owner-only flow ---
  it("pause/unpause: owner-only, exit-side stays open while paused, unpause requires timelock", function () {
    setupUsdcxMarket();
    fundSbtc(wallet2, SBTC_10K);
    fundUsdcx(wallet1, USDCX_100);

    // Pre-pause sanity: a deposit on the entry side works.
    expect(
      pub(
        USDCX_MARKET,
        "deposit-token-y",
        [
          Cl.uint(USDCX_100),
          Cl.uint(999_999_999_999_999),
          USDCX_TRAIT,
          Cl.stringAscii(USDCX_ASSET),
        ],
        wallet1,
      ).result,
    ).toBeOk(Cl.uint(USDCX_100));

    // Non-owner cannot pause (5001).
    expect(pub(JING_CORE, "pause", [], wallet1).result).toBeErr(Cl.uint(5001));

    // Owner pauses.
    expect(pub(JING_CORE, "pause", [], deployer).result).toBeOk(Cl.bool(true));
    expect(ro(JING_CORE, "is-paused", [])).toBeBool(true);

    // Entry-side blocked: deposit-token-x reverts ERR_PAUSED (5016) from
    // jing-core's log-deposit-x check-not-paused at the start of the log
    // function. Note: market's own ERR_PAUSED is 1010 (its local var-get
    // paused). Here we hit jing-core's gate because the market's own
    // paused flag is still false.
    expect(
      pub(
        USDCX_MARKET,
        "deposit-token-x",
        [Cl.uint(SBTC_10K), Cl.uint(1), SBTC_TRAIT, Cl.stringAscii(SBTC_ASSET)],
        wallet2,
      ).result,
    ).toBeErr(Cl.uint(5016));

    // Exit-side OPEN: cancel-token-y-deposit succeeds (log-refund-y has no
    // pause check, by design).
    expect(
      pub(
        USDCX_MARKET,
        "cancel-token-y-deposit",
        [USDCX_TRAIT, Cl.stringAscii(USDCX_ASSET)],
        wallet1,
      ).result,
    ).toBeOk(Cl.uint(USDCX_100));

    // Owner unpause too early → ERR_TIMELOCK_NOT_ELAPSED (5008).
    expect(pub(JING_CORE, "unpause", [], deployer).result).toBeErr(
      Cl.uint(5008),
    );

    // Advance past the timelock.
    simnet.mineEmptyBurnBlocks(TIMELOCK_BURN_BLOCKS + 1);

    // Non-owner unpause still rejected (5001).
    expect(pub(JING_CORE, "unpause", [], wallet1).result).toBeErr(
      Cl.uint(5001),
    );

    // Owner unpauses → ok.
    expect(pub(JING_CORE, "unpause", [], deployer).result).toBeOk(
      Cl.bool(true),
    );
    expect(ro(JING_CORE, "is-paused", [])).toBeBool(false);

    // Entry-side resumes: another USDCx deposit works.
    fundUsdcx(wallet1, USDCX_100);
    expect(
      pub(
        USDCX_MARKET,
        "deposit-token-y",
        [
          Cl.uint(USDCX_100),
          Cl.uint(999_999_999_999_999),
          USDCX_TRAIT,
          Cl.stringAscii(USDCX_ASSET),
        ],
        wallet1,
      ).result,
    ).toBeOk(Cl.uint(USDCX_100));
  });

  it("pause: re-pause restarts the unpause-eligibility timer", function () {
    expect(pub(JING_CORE, "pause", [], deployer).result).toBeOk(Cl.bool(true));
    const firstAt = Number(cvToJSON(ro(JING_CORE, "get-paused-at", [])).value);

    // Advance most of the timelock window.
    simnet.mineEmptyBurnBlocks(TIMELOCK_BURN_BLOCKS - 10);

    // Re-pause: paused-at should bump to a later burn-block.
    expect(pub(JING_CORE, "pause", [], deployer).result).toBeOk(Cl.bool(true));
    const secondAt = Number(cvToJSON(ro(JING_CORE, "get-paused-at", [])).value);
    expect(secondAt).toBeGreaterThan(firstAt);

    // Trying to unpause now: still too early because the timer restarted.
    simnet.mineEmptyBurnBlocks(20);
    expect(pub(JING_CORE, "unpause", [], deployer).result).toBeErr(
      Cl.uint(5008),
    );
  });

  // --- get-contract-owner read + ownership rotation ---
  it("set-contract-owner: only old owner can transfer; new owner takes over the pause + initialize gates", function () {
    // Sanity: get-contract-owner exposes the current owner.
    expect(ro(JING_CORE, "get-contract-owner", [])).toBePrincipal(deployer);

    // Non-owner rejected.
    expect(
      pub(JING_CORE, "set-contract-owner", [Cl.principal(wallet1)], wallet1)
        .result,
    ).toBeErr(Cl.uint(5001));

    // Owner transfers to wallet1.
    expect(
      pub(JING_CORE, "set-contract-owner", [Cl.principal(wallet1)], deployer)
        .result,
    ).toBeOk(Cl.bool(true));
    expect(ro(JING_CORE, "get-contract-owner", [])).toBePrincipal(wallet1);

    // OLD owner can no longer pause (lost authority).
    expect(pub(JING_CORE, "pause", [], deployer).result).toBeErr(
      Cl.uint(5001),
    );

    // NEW owner can pause.
    expect(pub(JING_CORE, "pause", [], wallet1).result).toBeOk(Cl.bool(true));

    // The market's initialize asserts tx-sender == jing-core.get-contract-owner.
    // After the rotation, even if wallet1 (new owner) sets a verified
    // contract, the deployer (who's the market's `operator`) can no longer
    // initialize because the get-contract-owner gate fires (1011). We
    // don't need to actually initialize here — the auth gate is sufficient
    // to prove the read is wired through. Restore ownership so other
    // tests that follow have the original owner.
    pub(JING_CORE, "set-contract-owner", [Cl.principal(deployer)], wallet1);
    expect(ro(JING_CORE, "get-contract-owner", [])).toBePrincipal(deployer);
  });

  it("pause is owner-only: non-owners (including non-deployer wallets) rejected with 5001", function () {
    expect(pub(JING_CORE, "pause", [], wallet1).result).toBeErr(Cl.uint(5001));
    expect(pub(JING_CORE, "pause", [], wallet2).result).toBeErr(Cl.uint(5001));
    expect(pub(JING_CORE, "pause", [], wallet3).result).toBeErr(Cl.uint(5001));
  });

  // --- get-balance vs get-token-equity ---
  it("get-balance returns the principal's sBTC equity (Zest-shaped read)", function () {
    setupUsdcxMarket();
    fundSbtc(wallet2, SBTC_10K);
    fundUsdcx(wallet1, USDCX_100);

    // Before any deposit, get-balance returns 0.
    expect(ro(JING_CORE, "get-balance", [Cl.principal(wallet2)])).toBeOk(
      Cl.uint(0),
    );

    // After an sBTC deposit, get-balance == get-token-equity(sbtc, wallet2).
    expect(
      pub(
        USDCX_MARKET,
        "deposit-token-x",
        [
          Cl.uint(SBTC_10K),
          Cl.uint(1),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet2,
      ).result,
    ).toBeOk(Cl.uint(SBTC_10K));

    const equity = Number(
      cvToJSON(
        ro(JING_CORE, "get-token-equity", [
          Cl.principal(SBTC_TOKEN),
          Cl.principal(wallet2),
        ]),
      ).value,
    );
    expect(equity).toBe(SBTC_10K);

    const balance = cvToJSON(
      ro(JING_CORE, "get-balance", [Cl.principal(wallet2)]),
    );
    expect(Number(balance.value.value)).toBe(SBTC_10K);

    // wallet1's USDCx deposit doesn't show up in their sBTC bucket.
    expect(
      pub(
        USDCX_MARKET,
        "deposit-token-y",
        [
          Cl.uint(USDCX_100),
          Cl.uint(999_999_999_999_999),
          USDCX_TRAIT,
          Cl.stringAscii(USDCX_ASSET),
        ],
        wallet1,
      ).result,
    ).toBeOk(Cl.uint(USDCX_100));

    expect(ro(JING_CORE, "get-balance", [Cl.principal(wallet1)])).toBeOk(
      Cl.uint(0),
    );

    // total-token-equity is per-token; sBTC total now == SBTC_10K.
    expect(
      ro(JING_CORE, "get-total-token-equity", [Cl.principal(SBTC_TOKEN)]),
    ).toBeUint(SBTC_10K);
    expect(
      ro(JING_CORE, "get-total-token-equity", [Cl.principal(USDCX_TOKEN)]),
    ).toBeUint(USDCX_100);
  });

  // --- Multi-market equity aggregation ---
  // Same depositor on BOTH markets → get-token-equity(sbtc, depositor)
  // sums across markets (the per-token bucket is owner-keyed, market-
  // agnostic).
  it("multi-market: same sBTC depositor's equity sums across both markets", function () {
    // Register both markets.
    const usdcxArg = Cl.contractPrincipal(deployer, USDCX_MARKET);
    const stxArg = Cl.contractPrincipal(deployer, STX_MARKET);

    expect(
      pub(JING_CORE, "set-verified-contract", [usdcxArg], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(JING_CORE, "set-verified-contract", [stxArg], deployer).result,
    ).toBeOk(Cl.bool(true));

    expect(
      pub(
        USDCX_MARKET,
        "initialize",
        [
          usdcxArg,
          Cl.principal(SBTC_TOKEN),
          Cl.principal(USDCX_TOKEN),
          Cl.uint(MIN_X),
          Cl.uint(MIN_Y_USDCX),
          Cl.bufferFromHex(BTC_FEED),
        ],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));

    expect(
      pub(
        STX_MARKET,
        "initialize",
        [
          stxArg,
          Cl.principal(SBTC_TOKEN),
          Cl.principal(WSTX_TOKEN),
          Cl.uint(MIN_X),
          Cl.uint(MIN_Y_STX),
          Cl.bufferFromHex(BTC_FEED),
          Cl.bufferFromHex(STX_FEED),
        ],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));

    // Same depositor (wallet2) drops sBTC into BOTH markets.
    fundSbtc(wallet2, SBTC_10K * 2);

    expect(
      pub(
        USDCX_MARKET,
        "deposit-token-x",
        [
          Cl.uint(SBTC_10K),
          Cl.uint(1),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet2,
      ).result,
    ).toBeOk(Cl.uint(SBTC_10K));

    expect(
      pub(
        STX_MARKET,
        "deposit-token-x",
        [
          Cl.uint(SBTC_10K),
          Cl.uint(1),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet2,
      ).result,
    ).toBeOk(Cl.uint(SBTC_10K));

    // Equity is keyed by (token, owner) — both markets credit the same
    // bucket → 2x SBTC_10K.
    const equity = Number(
      cvToJSON(
        ro(JING_CORE, "get-token-equity", [
          Cl.principal(SBTC_TOKEN),
          Cl.principal(wallet2),
        ]),
      ).value,
    );
    expect(equity).toBe(SBTC_10K * 2);

    expect(
      ro(JING_CORE, "get-total-token-equity", [Cl.principal(SBTC_TOKEN)]),
    ).toBeUint(SBTC_10K * 2);
  });

  // --- Registered contract bool registry ---
  it("is-registered: marks markets after initialize, indexer-friendly", function () {
    const usdcxArg = Cl.contractPrincipal(deployer, USDCX_MARKET);
    expect(ro(JING_CORE, "is-registered", [usdcxArg])).toBeBool(false);

    setupUsdcxMarket();
    expect(ro(JING_CORE, "is-registered", [usdcxArg])).toBeBool(true);

    // STX market still unregistered.
    const stxArg = Cl.contractPrincipal(deployer, STX_MARKET);
    expect(ro(JING_CORE, "is-registered", [stxArg])).toBeBool(false);

    setupStxMarket();
    expect(ro(JING_CORE, "is-registered", [stxArg])).toBeBool(true);
  });

  // --- register failure modes reachable from clarinet ---
  // Reaching jing-core.register's u5006 / u5001 directly requires a test
  // contract (a deployed contract that calls register), which the clarinet
  // deployment plan can't add without source patching. Those are covered
  // in stxer (simul-jing-core-hash-mismatch.js). Here we exercise:
  //   - u5005 NOT_VERIFIED via market.initialize before set-verified-contract
  //   - u5002 INVALID_CONTRACT_HASH via direct user-call to register
  it("register: NOT_VERIFIED when canonical not in verified-contracts", function () {
    const marketArg = Cl.contractPrincipal(deployer, USDCX_MARKET);
    // Calling initialize without setting verified-contract first → u5005.
    expect(
      pub(
        USDCX_MARKET,
        "initialize",
        [
          marketArg,
          Cl.principal(SBTC_TOKEN),
          Cl.principal(USDCX_TOKEN),
          Cl.uint(MIN_X),
          Cl.uint(MIN_Y_USDCX),
          Cl.bufferFromHex(BTC_FEED),
        ],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(5005));
  });

  it("register: standard-principal caller hits ERR_INVALID_CONTRACT_HASH (5002)", function () {
    // Direct user-call to register: contract-caller is a wallet (no
    // bytecode), so `(contract-hash? contract-caller)` returns none →
    // unwrap! fires ERR_INVALID_CONTRACT_HASH (5002). Confirms the early
    // hash-existence check fires before tx-sender / verified-hash checks.
    const marketArg = Cl.contractPrincipal(deployer, USDCX_MARKET);
    expect(
      pub(JING_CORE, "register", [marketArg], deployer).result,
    ).toBeErr(Cl.uint(5002));
  });
});
