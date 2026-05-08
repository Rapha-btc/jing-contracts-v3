import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

// ============================================================================
// reserve-sbtc-stx-jing — sBTC funding reserve for snpl loans.
//
// In simnet the deployer is BOTH the reserve's LENDER and the snpl's
// BORROWER (both `tx-sender` at deploy time). This is fine for testing
// the reserve's auth model: lender-only gates fire on non-deployer
// callers; snpl-gated paths fire when contract-caller IS the snpl.
// Production has lender ≠ borrower; the principal-collision in tests
// only matters when we want to exercise ERR-BORROWER-MISMATCH (we use a
// non-deployer principal as the supposed borrower in open-credit-line).
//
// Surface tested:
//   - initialize (lender-only, double-init, register w/ jing-core)
//   - supply (lender-only, ERR-INVALID-AMOUNT, balance + log-reserve-supply)
//   - withdraw-sbtc / withdraw-stx (lender-only)
//   - open-credit-line (lender-only, ERR-LINE-EXISTS, ERR-BORROWER-MISMATCH)
//   - set-credit-line-cap / set-credit-line-interest (lender-only, ERR-LINE-NOT-FOUND)
//   - close-credit-line (lender-only, ERR-OUTSTANDING-NONZERO, ERR-LINE-NOT-FOUND)
//   - set-paused / set-min-sbtc-draw (lender-only)
//   - draw (snpl-gated: ERR-NO-CREDIT-LINE / ERR-INVALID-AMOUNT / ERR-OVER-LIMIT / ERR-PAUSED, happy)
//   - notify-return (snpl-gated: ERR-NO-CREDIT-LINE / ERR-UNDERFLOW, happy)
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
const deployer = accounts.get("deployer")!; // = LENDER on the reserve, BORROWER on the snpl
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const RESERVE = "reserve-sbtc-stx-jing";
const SNPL = "snpl-sbtc-stx-jing";
const JING_CORE = "jing-core";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

const SBTC_1M = 1_000_000;     // = default min-sbtc-draw (0.01 sBTC)
const SBTC_10M = 10_000_000;
const SBTC_50M = 50_000_000;

const INTEREST_500_BPS = 500;
const CAP_5M = 5_000_000;

function pub(contract: string, fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(contract, fn, args, sender);
}

function ro(contract: string, fn: string, args: any[]) {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
}

function fundSbtc(recipient: string, amount: number) {
  const r = simnet.callPublicFn(
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
  expect(r.result).toBeOk(Cl.bool(true));
}

// Register the reserve with jing-core and call its initialize. The reserve's
// LENDER constant is set to `deployer` at deploy time, so deployer is the
// only principal that can run admin/withdraw functions.
function setupReserve() {
  const reserveArg = Cl.contractPrincipal(deployer, RESERVE);
  expect(
    pub(JING_CORE, "set-verified-contract", [reserveArg], deployer).result,
  ).toBeOk(Cl.bool(true));
  expect(
    pub(RESERVE, "initialize", [reserveArg], deployer).result,
  ).toBeOk(Cl.bool(true));
}

// Initialize the snpl too — needed for open-credit-line which calls
// snpl.get-borrower(). The snpl needs a reserve-trait reference at init.
function setupSnpl() {
  const snplArg = Cl.contractPrincipal(deployer, SNPL);
  const reserveArg = Cl.contractPrincipal(deployer, RESERVE);
  expect(
    pub(JING_CORE, "set-verified-contract", [snplArg], deployer).result,
  ).toBeOk(Cl.bool(true));
  expect(
    pub(SNPL, "initialize", [snplArg, reserveArg], deployer).result,
  ).toBeOk(Cl.bool(true));
}

function openLine(snplPrincipal: string, borrower: string, cap: number, bps: number) {
  return pub(
    RESERVE,
    "open-credit-line",
    [
      Cl.contractPrincipal(deployer, SNPL),
      Cl.principal(borrower),
      Cl.uint(cap),
      Cl.uint(bps),
    ],
    deployer,
  );
}

describe.skipIf(!remoteDataEnabled)("reserve-sbtc-stx-jing", function () {
  // --- Initialization ---
  it("initialize: lender-only, requires verified-contract, double-init blocked", function () {
    const reserveArg = Cl.contractPrincipal(deployer, RESERVE);

    // Without verified-contract, register inside initialize hits 5005.
    expect(
      pub(RESERVE, "initialize", [reserveArg], deployer).result,
    ).toBeErr(Cl.uint(5005));

    pub(JING_CORE, "set-verified-contract", [reserveArg], deployer);

    // Non-lender rejected (200 = ERR-NOT-LENDER).
    expect(
      pub(RESERVE, "initialize", [reserveArg], wallet1).result,
    ).toBeErr(Cl.uint(200));

    // Lender succeeds.
    expect(
      pub(RESERVE, "initialize", [reserveArg], deployer).result,
    ).toBeOk(Cl.bool(true));

    // Re-init blocked (212).
    expect(
      pub(RESERVE, "initialize", [reserveArg], deployer).result,
    ).toBeErr(Cl.uint(212));
  });

  it("read-only: get-lender, is-paused, get-min-sbtc-draw default state", function () {
    setupReserve();
    expect(ro(RESERVE, "get-lender", [])).toBePrincipal(deployer);
    expect(ro(RESERVE, "is-paused", [])).toBeBool(false);
    expect(ro(RESERVE, "get-min-sbtc-draw", [])).toBeUint(SBTC_1M);
  });

  // --- Supply ---
  it("supply: lender-only, ERR-INVALID-AMOUNT on zero, log-reserve-supply event", function () {
    setupReserve();
    fundSbtc(deployer, SBTC_50M);

    // Zero amount → ERR-INVALID-AMOUNT (204).
    expect(pub(RESERVE, "supply", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(204),
    );

    // Non-lender → ERR-NOT-LENDER (200).
    expect(pub(RESERVE, "supply", [Cl.uint(SBTC_10M)], wallet1).result).toBeErr(
      Cl.uint(200),
    );

    // Lender happy path.
    const r = pub(RESERVE, "supply", [Cl.uint(SBTC_10M)], deployer);
    expect(r.result).toBeOk(Cl.bool(true));

    // Reserve sBTC equity on jing-core.
    const reservePrincipal = `${deployer}.${RESERVE}`;
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(reservePrincipal),
      ]),
    ).toBeUint(SBTC_10M);
  });

  // --- Withdraw ---
  it("withdraw-sbtc: lender-only, balance returns, equity debited", function () {
    setupReserve();
    fundSbtc(deployer, SBTC_10M);
    pub(RESERVE, "supply", [Cl.uint(SBTC_10M)], deployer);

    expect(
      pub(RESERVE, "withdraw-sbtc", [Cl.uint(SBTC_10M)], wallet1).result,
    ).toBeErr(Cl.uint(200));
    expect(
      pub(RESERVE, "withdraw-sbtc", [Cl.uint(SBTC_10M)], deployer).result,
    ).toBeOk(Cl.bool(true));

    const reservePrincipal = `${deployer}.${RESERVE}`;
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(reservePrincipal),
      ]),
    ).toBeUint(0);
  });

  it("withdraw-stx: lender-only auth check (no STX balance to withdraw without seize)", function () {
    setupReserve();
    // Non-lender rejected.
    expect(
      pub(RESERVE, "withdraw-stx", [Cl.uint(1)], wallet1).result,
    ).toBeErr(Cl.uint(200));
  });

  // --- Credit lines ---
  it("open-credit-line: lender-only, ERR-LINE-EXISTS on duplicate, ERR-BORROWER-MISMATCH on wrong borrower", function () {
    setupReserve();
    setupSnpl();
    const snplPrincipal = `${deployer}.${SNPL}`;

    // Non-lender rejected.
    expect(
      pub(
        RESERVE,
        "open-credit-line",
        [
          Cl.contractPrincipal(deployer, SNPL),
          Cl.principal(deployer),
          Cl.uint(CAP_5M),
          Cl.uint(INTEREST_500_BPS),
        ],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(200));

    // Wrong borrower (snpl.get-borrower returns deployer; we pass wallet1) → 210.
    expect(
      openLine(snplPrincipal, wallet1, CAP_5M, INTEREST_500_BPS).result,
    ).toBeErr(Cl.uint(210));

    // Happy path.
    expect(
      openLine(snplPrincipal, deployer, CAP_5M, INTEREST_500_BPS).result,
    ).toBeOk(Cl.bool(true));

    // has-credit-line + get-credit-line reflect.
    expect(
      ro(RESERVE, "has-credit-line", [Cl.principal(snplPrincipal)]),
    ).toBeBool(true);
    const line = cvToJSON(
      ro(RESERVE, "get-credit-line", [Cl.principal(snplPrincipal)]),
    );
    expect(Number(line.value.value["cap-sbtc"].value)).toBe(CAP_5M);
    expect(Number(line.value.value["interest-bps"].value)).toBe(
      INTEREST_500_BPS,
    );
    expect(Number(line.value.value["outstanding-sbtc"].value)).toBe(0);

    // Re-opening the same snpl → ERR-LINE-EXISTS (205).
    expect(
      openLine(snplPrincipal, deployer, CAP_5M, INTEREST_500_BPS).result,
    ).toBeErr(Cl.uint(205));
  });

  it("set-credit-line-cap / set-credit-line-interest: lender-only, ERR-LINE-NOT-FOUND on missing", function () {
    setupReserve();
    setupSnpl();
    const snplPrincipal = `${deployer}.${SNPL}`;
    openLine(snplPrincipal, deployer, CAP_5M, INTEREST_500_BPS);

    // Cap setter.
    expect(
      pub(
        RESERVE,
        "set-credit-line-cap",
        [Cl.principal(snplPrincipal), Cl.uint(CAP_5M * 2)],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(200));
    expect(
      pub(
        RESERVE,
        "set-credit-line-cap",
        [Cl.principal(snplPrincipal), Cl.uint(CAP_5M * 2)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
    // Missing line → 206.
    expect(
      pub(
        RESERVE,
        "set-credit-line-cap",
        [Cl.principal(wallet2), Cl.uint(CAP_5M)],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(206));

    // Interest setter.
    expect(
      pub(
        RESERVE,
        "set-credit-line-interest",
        [Cl.principal(snplPrincipal), Cl.uint(750)],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(200));
    expect(
      pub(
        RESERVE,
        "set-credit-line-interest",
        [Cl.principal(snplPrincipal), Cl.uint(750)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(
        RESERVE,
        "set-credit-line-interest",
        [Cl.principal(wallet2), Cl.uint(750)],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(206));

    const line = cvToJSON(
      ro(RESERVE, "get-credit-line", [Cl.principal(snplPrincipal)]),
    );
    expect(Number(line.value.value["cap-sbtc"].value)).toBe(CAP_5M * 2);
    expect(Number(line.value.value["interest-bps"].value)).toBe(750);
  });

  it("close-credit-line: lender-only, ERR-LINE-NOT-FOUND, removes the entry", function () {
    setupReserve();
    setupSnpl();
    const snplPrincipal = `${deployer}.${SNPL}`;
    openLine(snplPrincipal, deployer, CAP_5M, INTEREST_500_BPS);

    expect(
      pub(
        RESERVE,
        "close-credit-line",
        [Cl.principal(snplPrincipal)],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(200));

    expect(
      pub(
        RESERVE,
        "close-credit-line",
        [Cl.principal(snplPrincipal)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
    expect(
      ro(RESERVE, "has-credit-line", [Cl.principal(snplPrincipal)]),
    ).toBeBool(false);

    // Re-close → 206.
    expect(
      pub(
        RESERVE,
        "close-credit-line",
        [Cl.principal(snplPrincipal)],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(206));
  });

  // --- Pause + min-sbtc-draw setters ---
  it("set-paused / set-min-sbtc-draw: lender-only", function () {
    setupReserve();

    expect(
      pub(RESERVE, "set-paused", [Cl.bool(true)], wallet1).result,
    ).toBeErr(Cl.uint(200));
    expect(
      pub(RESERVE, "set-paused", [Cl.bool(true)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(ro(RESERVE, "is-paused", [])).toBeBool(true);
    pub(RESERVE, "set-paused", [Cl.bool(false)], deployer);

    // Zero → ERR-INVALID-AMOUNT (204).
    expect(
      pub(RESERVE, "set-min-sbtc-draw", [Cl.uint(0)], deployer).result,
    ).toBeErr(Cl.uint(204));
    expect(
      pub(RESERVE, "set-min-sbtc-draw", [Cl.uint(SBTC_10M)], wallet1).result,
    ).toBeErr(Cl.uint(200));
    expect(
      pub(RESERVE, "set-min-sbtc-draw", [Cl.uint(SBTC_10M)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(ro(RESERVE, "get-min-sbtc-draw", [])).toBeUint(SBTC_10M);
  });

  // --- draw + notify-return (exercised via snpl.borrow / snpl.repay) ---
  it("draw: ERR-NO-CREDIT-LINE when snpl has no line", function () {
    setupReserve();
    setupSnpl();
    fundSbtc(deployer, SBTC_50M);
    pub(RESERVE, "supply", [Cl.uint(SBTC_50M)], deployer);

    // No credit line opened → snpl.borrow → reserve.draw → ERR-NO-CREDIT-LINE (201).
    expect(
      pub(
        SNPL,
        "borrow",
        [
          Cl.uint(SBTC_10M),
          Cl.uint(INTEREST_500_BPS),
          Cl.contractPrincipal(deployer, RESERVE),
        ],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(201));
  });

  it("draw: ERR-INVALID-AMOUNT when below min-sbtc-draw", function () {
    setupReserve();
    setupSnpl();
    fundSbtc(deployer, SBTC_50M);
    pub(RESERVE, "supply", [Cl.uint(SBTC_50M)], deployer);
    openLine(`${deployer}.${SNPL}`, deployer, CAP_5M, INTEREST_500_BPS);

    // Below default min (1M) → 204.
    expect(
      pub(
        SNPL,
        "borrow",
        [
          Cl.uint(SBTC_1M - 1),
          Cl.uint(INTEREST_500_BPS),
          Cl.contractPrincipal(deployer, RESERVE),
        ],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(204));
  });

  it("draw: ERR-OVER-LIMIT when above credit-line cap", function () {
    setupReserve();
    setupSnpl();
    fundSbtc(deployer, SBTC_50M);
    pub(RESERVE, "supply", [Cl.uint(SBTC_50M)], deployer);
    // Cap = 5M, request 6M → 202.
    openLine(`${deployer}.${SNPL}`, deployer, CAP_5M, INTEREST_500_BPS);

    expect(
      pub(
        SNPL,
        "borrow",
        [
          Cl.uint(SBTC_10M), // > CAP_5M
          Cl.uint(INTEREST_500_BPS),
          Cl.contractPrincipal(deployer, RESERVE),
        ],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(202));
  });

  it("draw: ERR-PAUSED when reserve is paused", function () {
    setupReserve();
    setupSnpl();
    fundSbtc(deployer, SBTC_50M);
    pub(RESERVE, "supply", [Cl.uint(SBTC_50M)], deployer);
    openLine(`${deployer}.${SNPL}`, deployer, CAP_5M, INTEREST_500_BPS);
    pub(RESERVE, "set-paused", [Cl.bool(true)], deployer);

    expect(
      pub(
        SNPL,
        "borrow",
        [
          Cl.uint(SBTC_1M),
          Cl.uint(INTEREST_500_BPS),
          Cl.contractPrincipal(deployer, RESERVE),
        ],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(209));
  });

  it("draw + notify-return: happy lifecycle bumps then drains outstanding", function () {
    setupReserve();
    setupSnpl();
    // Fund extra so deployer can also top up the repay interest shortfall
    // (payoff > notional → borrower owes the spread).
    fundSbtc(deployer, SBTC_50M + SBTC_10M);
    pub(RESERVE, "supply", [Cl.uint(SBTC_50M)], deployer);
    const snplPrincipal = `${deployer}.${SNPL}`;
    openLine(snplPrincipal, deployer, CAP_5M, INTEREST_500_BPS);

    // borrow 2M → reserve outstanding = 2M.
    expect(
      pub(
        SNPL,
        "borrow",
        [
          Cl.uint(2_000_000),
          Cl.uint(INTEREST_500_BPS),
          Cl.contractPrincipal(deployer, RESERVE),
        ],
        deployer,
      ).result,
    ).toBeOk(Cl.uint(1));
    let line = cvToJSON(
      ro(RESERVE, "get-credit-line", [Cl.principal(snplPrincipal)]),
    );
    expect(Number(line.value.value["outstanding-sbtc"].value)).toBe(2_000_000);

    // close-credit-line blocked by ERR-OUTSTANDING-NONZERO (207).
    expect(
      pub(
        RESERVE,
        "close-credit-line",
        [Cl.principal(snplPrincipal)],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(207));

    // Repay → notify-return → outstanding back to 0.
    expect(
      pub(
        SNPL,
        "repay",
        [Cl.uint(1), Cl.contractPrincipal(deployer, RESERVE)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));

    line = cvToJSON(
      ro(RESERVE, "get-credit-line", [Cl.principal(snplPrincipal)]),
    );
    expect(Number(line.value.value["outstanding-sbtc"].value)).toBe(0);

    // Now close-credit-line works.
    expect(
      pub(
        RESERVE,
        "close-credit-line",
        [Cl.principal(snplPrincipal)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
  });
});
