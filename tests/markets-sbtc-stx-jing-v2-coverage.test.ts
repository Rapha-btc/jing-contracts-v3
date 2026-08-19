import { describe, expect, it } from "vitest";
import { Cl, cvToJSON, getAddressFromPrivateKey } from "@stacks/transactions";

// ============================================================================
// markets-sbtc-stx-jing-v2: deterministic branch-coverage suite.
//
// Companion to markets-sbtc-stx-jing-v2.test.ts. That suite proves the
// maker/taker mechanism; this one exists to drive the branches the mechanism
// tests never reach - queue eviction at MAX_OFFERS, sub-min rolls at close,
// operator admin, dead-entry classification folds, cancel-cycle rolls - all
// WITHOUT Hermes: every scenario here stages one-sided books (dummy VAA) or
// pure reads, so it is fully deterministic and network-free.
//
// Everything runs against the canonical manifest contract so clarinet's
// coverage instrumentation counts it (the no-staleness twin the Hermes tests
// use is runtime-deployed and invisible to lcov).
// ============================================================================

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

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

const MIN_X = 1_000;
const MIN_Y = 1_000_000;
const DEAD_X = 999_999_999_999_999; // ask far above any price: never live
const DEAD_Y = 1; // bid far below any price: never live
const DUMMY_VAA = "00";
const CANCEL_THRESHOLD = 42;
const MAX_OFFERS = 50;

const ERR_NOTHING_TO_WITHDRAW = 1008;
const ERR_NOT_AUTHORIZED = 1011;
const ERR_QUEUE_FULL = 1013;
const ERR_LIMIT_REQUIRED = 1017;
const ERR_HAS_RESTING_POSITION = 1024;

function pub(contract: string, fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(contract, fn, args, sender);
}
function ro(contract: string, fn: string, args: any[]) {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
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

function depositX(amount: number, limit: number, sender: string) {
  return pub(
    C,
    "deposit-token-x",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      Cl.bufferFromHex(DUMMY_VAA),
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
      Cl.bufferFromHex(DUMMY_VAA),
      WSTX_TRAIT,
      Cl.stringAscii(WSTX_ASSET),
    ],
    sender,
  );
}

function fundSbtc(recipient: string, amount: number) {
  expect(
    pub(
      SBTC_TOKEN,
      "transfer",
      [
        Cl.uint(amount),
        Cl.principal(SBTC_WHALE),
        Cl.principal(recipient),
        Cl.none(),
      ],
      SBTC_WHALE,
    ).result,
  ).toBeOk(Cl.bool(true));
}

// Deterministic throwaway senders: address i is derived from the private key
// whose hex is i, so the set is stable across runs.
function throwaway(i: number): string {
  const key = `${(i + 1).toString(16).padStart(64, "0")}01`;
  return getAddressFromPrivateKey(key, "testnet");
}

function yDeposit(cycle: number, who: string): number {
  return Number(
    cvToJSON(
      ro(C, "get-token-y-deposit", [Cl.uint(cycle), Cl.principal(who)]),
    ).value,
  );
}
function xDeposit(cycle: number, who: string): number {
  return Number(
    cvToJSON(
      ro(C, "get-token-x-deposit", [Cl.uint(cycle), Cl.principal(who)]),
    ).value,
  );
}
function depositorCount(side: "x" | "y", cycle: number): number {
  return cvToJSON(
    ro(C, `get-token-${side}-depositors`, [Cl.uint(cycle)]),
  ).value.length;
}

describe("markets-sbtc-stx-jing-v2 deterministic coverage", function () {
  // --- read-onlys never touched by the mechanism suite ---------------------

  it("get-settlement returns none pre-settlement; get-min-deposits reports config", function () {
    setupRegistryAndInit();
    expect(cvToJSON(ro(C, "get-settlement", [Cl.uint(0)])).value).toBeNull();
    const mins = cvToJSON(ro(C, "get-min-deposits", [])).value;
    expect(Number(mins["min-token-x"].value)).toBe(MIN_X);
    expect(Number(mins["min-token-y"].value)).toBe(MIN_Y);
  });

  // --- operator admin -------------------------------------------------------

  it("operator setters: success by operator, ERR_NOT_AUTHORIZED otherwise", function () {
    setupRegistryAndInit();
    // non-operator rejected on every setter
    for (const [fn, arg] of [
      ["set-treasury", Cl.principal(wallet2)],
      ["set-operator", Cl.principal(wallet2)],
      ["set-min-token-y-deposit", Cl.uint(1)],
      ["set-min-token-x-deposit", Cl.uint(1)],
    ] as const) {
      expect(pub(C, fn, [arg], wallet1).result).toBeErr(
        Cl.uint(ERR_NOT_AUTHORIZED),
      );
    }
    // operator succeeds
    expect(pub(C, "set-treasury", [Cl.principal(wallet2)], deployer).result)
      .toBeOk(Cl.bool(true));
    expect(
      pub(C, "set-min-token-y-deposit", [Cl.uint(MIN_Y * 2)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(C, "set-min-token-x-deposit", [Cl.uint(MIN_X * 2)], deployer).result,
    ).toBeOk(Cl.bool(true));
    // hand the operator role over and verify it moved
    expect(pub(C, "set-operator", [Cl.principal(wallet1)], deployer).result)
      .toBeOk(Cl.bool(true));
    expect(pub(C, "set-treasury", [Cl.principal(wallet2)], deployer).result)
      .toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
    expect(pub(C, "set-treasury", [Cl.principal(wallet2)], wallet1).result)
      .toBeOk(Cl.bool(true));
  });

  it("initialize: operator who is not the jing-core owner is rejected", function () {
    // Hand the operator role to wallet1 BEFORE initialize: wallet1 then
    // passes the operator assert but fails the core-owner assert.
    expect(pub(C, "set-operator", [Cl.principal(wallet1)], deployer).result)
      .toBeOk(Cl.bool(true));
    const marketArg = Cl.contractPrincipal(deployer, C);
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
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(ERR_NOT_AUTHORIZED));
  });

  // --- classification folds over dead entries -------------------------------

  it("would-take-as-x ignores a dead resting bid", function () {
    setupRegistryAndInit();
    expect(depositY(MIN_Y, DEAD_Y, wallet1).result).toBeOk(Cl.uint(MIN_Y));
    // price 1M >= limit 1, but the only bid rests at limit 1 < price: dead.
    expect(
      ro(C, "would-take-as-x", [Cl.uint(1_000_000), Cl.uint(1)]),
    ).toBeBool(false);
  });

  it("would-take-as-y ignores a dead resting offer", function () {
    setupRegistryAndInit();
    fundSbtc(wallet1, MIN_X);
    expect(depositX(MIN_X, DEAD_X, wallet1).result).toBeOk(Cl.uint(MIN_X));
    // price 1M <= limit DEAD_X? the taker limit admits, but the resting ask
    // sits at DEAD_X > price: dead.
    expect(
      ro(C, "would-take-as-y", [Cl.uint(1_000_000), Cl.uint(DEAD_X)]),
    ).toBeBool(false);
  });

  it("would-take folds early-exit once a live entry is found", function () {
    setupRegistryAndInit();
    // Two y bids: the first live at a high limit, the second dead. The fold
    // finds the first and must skip the second through the early-exit arm.
    expect(depositY(MIN_Y, 5_000_000_000_000, wallet1).result).toBeOk(
      Cl.uint(MIN_Y),
    );
    expect(depositY(MIN_Y, DEAD_Y, wallet2).result).toBeOk(Cl.uint(MIN_Y));
    expect(
      ro(C, "would-take-as-x", [Cl.uint(1_000_000), Cl.uint(1)]),
    ).toBeBool(true);
  });

  it("would-take-as-y early-exits after the first live offer", function () {
    setupRegistryAndInit();
    fundSbtc(wallet1, MIN_X);
    fundSbtc(wallet2, MIN_X);
    expect(depositX(MIN_X, 1, wallet1).result).toBeOk(Cl.uint(MIN_X));
    expect(depositX(MIN_X, DEAD_X, wallet2).result).toBeOk(Cl.uint(MIN_X));
    expect(
      ro(C, "would-take-as-y", [Cl.uint(1_000_000), Cl.uint(DEAD_X)]),
    ).toBeBool(true);
  });

  it("close-and-settle-with-refresh runs the close leg before settling", function () {
    setupRegistryAndInit();
    // Empty book, mins dropped to zero: the close leg succeeds, then the
    // settle leg fails on the dummy VAA - proving the wrapper sequences
    // close before settle. The whole call reverts, so the phase is intact.
    expect(
      pub(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(C, "set-min-token-x-deposit", [Cl.uint(0)], deployer).result,
    ).toBeOk(Cl.bool(true));
    const r = pub(
      C,
      "close-and-settle-with-refresh",
      [
        Cl.bufferFromHex(DUMMY_VAA),
        SBTC_TRAIT,
        Cl.stringAscii(SBTC_ASSET),
        WSTX_TRAIT,
        Cl.stringAscii(WSTX_ASSET),
      ],
      deployer,
    );
    expect(cvToJSON(r.result).success).toBe(false);
    // reverted atomically: still in the deposit phase
    expect(Number(cvToJSON(ro(C, "get-cycle-phase", [])).value)).toBe(0);
  });

  // --- queue eviction at MAX_OFFERS -----------------------------------------

  it("y book at 50: smaller deposit hits ERR_QUEUE_FULL, larger evicts the smallest", function () {
    setupRegistryAndInit();
    const cycle = 0;
    for (let i = 0; i < MAX_OFFERS; i++) {
      const who = throwaway(i);
      simnet.transferSTX(MIN_Y + i + 1_000_000, who, deployer);
      expect(depositY(MIN_Y + i, DEAD_Y, who).result).toBeOk(Cl.uint(MIN_Y + i));
    }
    expect(depositorCount("y", cycle)).toBe(MAX_OFFERS);

    // equal to the smallest resting amount: rejected, book unchanged
    const late = throwaway(90);
    simnet.transferSTX(MIN_Y * 10, late, deployer);
    expect(depositY(MIN_Y, DEAD_Y, late).result).toBeErr(
      Cl.uint(ERR_QUEUE_FULL),
    );
    expect(depositorCount("y", cycle)).toBe(MAX_OFFERS);

    // strictly larger: evicts and refunds the smallest (throwaway(0))
    const smallest = throwaway(0);
    expect(depositY(MIN_Y * 5, DEAD_Y, late).result).toBeOk(Cl.uint(MIN_Y * 5));
    expect(depositorCount("y", cycle)).toBe(MAX_OFFERS);
    expect(yDeposit(cycle, smallest)).toBe(0);
    expect(yDeposit(cycle, late)).toBe(MIN_Y * 5);
  });

  it("x book at 50: smaller deposit hits ERR_QUEUE_FULL, larger evicts the smallest", function () {
    setupRegistryAndInit();
    const cycle = 0;
    for (let i = 0; i < MAX_OFFERS; i++) {
      const who = throwaway(100 + i);
      fundSbtc(who, MIN_X + i);
      expect(depositX(MIN_X + i, DEAD_X, who).result).toBeOk(Cl.uint(MIN_X + i));
    }
    expect(depositorCount("x", cycle)).toBe(MAX_OFFERS);

    const late = throwaway(190);
    fundSbtc(late, MIN_X * 10);
    expect(depositX(MIN_X, DEAD_X, late).result).toBeErr(
      Cl.uint(ERR_QUEUE_FULL),
    );
    expect(depositorCount("x", cycle)).toBe(MAX_OFFERS);

    const smallest = throwaway(100);
    expect(depositX(MIN_X * 5, DEAD_X, late).result).toBeOk(Cl.uint(MIN_X * 5));
    expect(depositorCount("x", cycle)).toBe(MAX_OFFERS);
    expect(xDeposit(cycle, smallest)).toBe(0);
    expect(xDeposit(cycle, late)).toBe(MIN_X * 5);
  });

  // --- close-deposits rolls sub-min depositors after a min raise ------------

  it("close-deposits rolls an x depositor whose share falls under MIN_SHARE_BPS", function () {
    setupRegistryAndInit();
    const cycle = 0;
    // MIN_SHARE_BPS is 20 (0.2% of the side's total). wallet1's 1k sats
    // against wallet2's 1M sats is ~0.1%: rolled at close. Both rest dead on
    // the same side, so dummy VAAs stage cleanly (y book stays empty).
    const whaleAmount = MIN_X * 1000;
    fundSbtc(wallet1, MIN_X);
    fundSbtc(wallet2, whaleAmount);
    expect(depositX(MIN_X, DEAD_X, wallet1).result).toBeOk(Cl.uint(MIN_X));
    expect(depositX(whaleAmount, DEAD_X, wallet2).result).toBeOk(
      Cl.uint(whaleAmount),
    );

    // Drop min-y so the empty y side does not block the close.
    expect(
      pub(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer).result,
    ).toBeOk(Cl.bool(true));

    expect(pub(C, "close-deposits", [], deployer).result).toBeOk(
      Cl.bool(true),
    );

    // wallet1's dust share rolled into the next cycle; wallet2 stayed.
    expect(xDeposit(cycle, wallet1)).toBe(0);
    expect(xDeposit(cycle + 1, wallet1)).toBe(MIN_X);
    expect(xDeposit(cycle, wallet2)).toBe(whaleAmount);
    expect(depositorCount("x", cycle + 1)).toBe(1);
  });

  // --- cancel-cycle rolls the whole book -------------------------------------

  it("cancel-cycle after the threshold rolls resting depositors to the next cycle", function () {
    setupRegistryAndInit();
    const cycle = 0;
    // One-sided staging only: any deposit into a non-empty opposite book
    // needs a real Hermes VAA, so both resters sit on the x side.
    fundSbtc(wallet1, MIN_X * 3);
    fundSbtc(wallet2, MIN_X * 2);
    expect(depositX(MIN_X * 3, DEAD_X, wallet1).result).toBeOk(Cl.uint(MIN_X * 3));
    expect(depositX(MIN_X * 2, DEAD_X, wallet2).result).toBeOk(Cl.uint(MIN_X * 2));

    // Drop min-y so the empty y side does not block the close.
    expect(
      pub(C, "set-min-token-y-deposit", [Cl.uint(0)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(pub(C, "close-deposits", [], deployer).result).toBeOk(
      Cl.bool(true),
    );

    simnet.mineEmptyBlocks(CANCEL_THRESHOLD + 1);
    expect(pub(C, "cancel-cycle", [], wallet2).result).toBeOk(Cl.bool(true));

    expect(Number(cvToJSON(ro(C, "get-current-cycle", [])).value)).toBe(
      cycle + 1,
    );
    expect(xDeposit(cycle + 1, wallet1)).toBe(MIN_X * 3);
    expect(xDeposit(cycle + 1, wallet2)).toBe(MIN_X * 2);
  });

  // --- set-token-*-limit: deterministic paths --------------------------------

  it("set-token-y-limit: zero limit, no position, then success on an uncrossed book", function () {
    setupRegistryAndInit();
    const vaa = Cl.bufferFromHex(DUMMY_VAA);
    expect(
      pub(C, "set-token-y-limit", [Cl.uint(0), vaa], wallet1).result,
    ).toBeErr(Cl.uint(ERR_LIMIT_REQUIRED));
    expect(
      pub(C, "set-token-y-limit", [Cl.uint(DEAD_Y), vaa], wallet1).result,
    ).toBeErr(Cl.uint(ERR_NOTHING_TO_WITHDRAW));

    expect(depositY(MIN_Y, DEAD_Y, wallet1).result).toBeOk(Cl.uint(MIN_Y));
    // x book empty: the gate short-circuits, dummy VAA suffices.
    expect(
      pub(C, "set-token-y-limit", [Cl.uint(DEAD_Y + 1), vaa], wallet1).result,
    ).toBeOk(Cl.bool(true));
    expect(
      Number(
        cvToJSON(ro(C, "get-token-y-limit", [Cl.principal(wallet1)])).value,
      ),
    ).toBe(DEAD_Y + 1);
  });

  it("set-token-x-limit: zero limit, no position, then success on an uncrossed book", function () {
    setupRegistryAndInit();
    const vaa = Cl.bufferFromHex(DUMMY_VAA);
    expect(
      pub(C, "set-token-x-limit", [Cl.uint(0), vaa], wallet1).result,
    ).toBeErr(Cl.uint(ERR_LIMIT_REQUIRED));
    expect(
      pub(C, "set-token-x-limit", [Cl.uint(DEAD_X), vaa], wallet1).result,
    ).toBeErr(Cl.uint(ERR_NOTHING_TO_WITHDRAW));

    fundSbtc(wallet1, MIN_X);
    expect(depositX(MIN_X, DEAD_X, wallet1).result).toBeOk(Cl.uint(MIN_X));
    expect(
      pub(C, "set-token-x-limit", [Cl.uint(DEAD_X - 1), vaa], wallet1).result,
    ).toBeOk(Cl.bool(true));
    expect(
      Number(
        cvToJSON(ro(C, "get-token-x-limit", [Cl.principal(wallet1)])).value,
      ),
    ).toBe(DEAD_X - 1);
  });

  // --- swap guards -----------------------------------------------------------

  it("swap: ERR_HAS_RESTING_POSITION fires before any pricing", function () {
    setupRegistryAndInit();
    fundSbtc(wallet1, MIN_X * 20);
    expect(depositX(MIN_X, DEAD_X, wallet1).result).toBeOk(Cl.uint(MIN_X));
    // Same sender now tries the taker path on the same side: refused before
    // the VAA is ever touched, so a dummy byte suffices.
    expect(
      pub(
        C,
        "swap",
        [
          Cl.uint(MIN_X * 10),
          Cl.uint(DEAD_X),
          Cl.bufferFromHex(DUMMY_VAA),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
          Cl.bool(true),
        ],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(ERR_HAS_RESTING_POSITION));
  });
});
