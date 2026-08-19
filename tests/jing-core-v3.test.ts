import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

// ============================================================================
// jing-core-v3 admin / registry coverage.
//
// jing-core-v3 is the registry + event logger for the v2-shaped markets,
// vaults, reserve and snpl contracts. The v1 suite (tests/jing-core.test.ts)
// covers the equivalent v1 surface through the live markets. This file targets
// the surface that is NEW in v3 (or that v1 could not reach at all):
//
//   1. Two-step ownership: propose-owner / accept-owner / get-pending-owner.
//      - owner-only propose (u5001)
//      - accept with no pending owner (u5018 ERR_NO_PENDING_OWNER)
//      - accept by a non-pending principal while one IS pending (u5001)
//      - proposing does NOT move ownership until accept lands
//      - propose none clears the pending slot
//      - old owner loses authority, new owner gains it
//
//   2. pause / unpause:
//      - pause is owner-only and stamps paused-at = burn-block-height
//      - unpause when NOT paused -> u5017 ERR_NOT_PAUSED (guard added in v3)
//      - unpause before TIMELOCK_BURN_BLOCKS (144 burn blocks) -> u5008
//      - unpause after the timelock -> ok
//      - per-function pause gating: log-deposit calls check-not-paused
//        (u5016 ERR_PAUSED) while log-withdraw does NOT (exit side stays open)
//
//   3. Registry gates reached directly, not through a market:
//      - set-verified-contract owner-only (u5001) + double-set (u5003)
//      - register: u5005 NOT_VERIFIED, u5006 HASH_MISMATCH, happy path,
//        u5003 double-register, u5002 for a standard-principal caller
//      These use throwaway helper contracts deployed at runtime via
//      simnet.deployContract, which is what lets us hit register's
//      contract-caller-keyed branches that the v1 file had to defer to stxer.
//
//   4. Equity ledger through the log-* funnel: credit / debit / debit floor.
//
//   5. snpl equity debits (new in v3): log-snpl-repay and log-snpl-seize now
//      take a (token-y principal) and debit the caller's token-y equity by
//      token-y-released / token-y-seized.
//
// Style mirrors tests/jing-core.test.ts: module-level remote-data detection,
// pub()/ro() helpers, Cl.* assertion matchers, no beforeEach (the clarinet
// vitest environment resets simnet per test).
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
const deployer = accounts.get("deployer")!; // contract-owner at genesis
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const CORE = "jing-core-v3";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const USDCX_TOKEN = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";

const TIMELOCK_BURN_BLOCKS = 144;

function pub(contract: string, fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(contract, fn, args, sender).result;
}

function ro(contract: string, fn: string, args: any[]) {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
}

function num(cv: any): number {
  const j = cvToJSON(cv);
  return Number(j.value?.value ?? j.value);
}

// ---------------------------------------------------------------------------
// Runtime helper contracts.
//
// jing-core-v3.register and every log-* function key off contract-caller, so
// they are only reachable from a contract. These throwaway "vault" contracts
// forward into jing-core-v3 so we can drive those branches directly. HELPER_B
// carries a different comment, hence a different contract hash -- that is what
// makes the u5006 HASH_MISMATCH case reachable.
// ---------------------------------------------------------------------------

const HELPER_SRC = `
;; runtime test helper A
(define-public (do-register (canonical principal))
  (contract-call? .jing-core-v3 register canonical)
)
(define-public (do-log-deposit (token principal) (amount uint))
  (contract-call? .jing-core-v3 log-deposit token amount)
)
(define-public (do-log-withdraw (token principal) (amount uint))
  (contract-call? .jing-core-v3 log-withdraw token amount)
)
(define-public (do-log-snpl-repay (token-y principal) (released uint))
  (contract-call? .jing-core-v3 log-snpl-repay u1 u0 u0 u0 u0 false released tx-sender token-y)
)
(define-public (do-log-snpl-seize (token-y principal) (seized uint))
  (contract-call? .jing-core-v3 log-snpl-seize u1 seized u0 tx-sender token-y)
)
`;

// Same interface, different bytes -> different contract-hash?.
const HELPER_B_SRC = HELPER_SRC.replace(
  ";; runtime test helper A",
  ";; runtime test helper B -- deliberately different source so the hash differs",
);

function deployHelper(name: string, src = HELPER_SRC): string {
  simnet.deployContract(name, src, { clarityVersion: 5 } as any, deployer);
  return `${deployer}.${name}`;
}

// Registers a fresh helper contract as a jing-core-v3 "vault": verify its own
// canonical hash, then have it self-register.
function deployAndRegisterHelper(name = "test-vault"): string {
  const helper = deployHelper(name);
  expect(
    pub(CORE, "set-verified-contract", [Cl.principal(helper)], deployer),
  ).toBeOk(Cl.bool(true));
  expect(pub(name, "do-register", [Cl.principal(helper)], deployer)).toBeOk(
    Cl.bool(true),
  );
  return helper;
}

// mineEmptyBurnBlocks is the burn-height API in clarinet-sdk 3.x. Fall back to
// mineEmptyBlocks if a future SDK stops advancing burn height with it.
function advanceBurnBlocks(count: number) {
  const start = simnet.burnBlockHeight;
  simnet.mineEmptyBurnBlocks(count);
  const advanced = simnet.burnBlockHeight - start;
  if (advanced < count) {
    simnet.mineEmptyBlocks(count - advanced);
  }
  expect(simnet.burnBlockHeight - start).toBeGreaterThanOrEqual(count);
}

describe.skipIf(!remoteDataEnabled)("jing-core-v3 admin + registry", function () {
  // =========================================================================
  // 1. Two-step ownership
  // =========================================================================

  it("genesis state: deployer owns the contract, no pending owner", function () {
    expect(ro(CORE, "get-contract-owner", [])).toBePrincipal(deployer);
    expect(ro(CORE, "get-pending-owner", [])).toBeNone();
    expect(ro(CORE, "is-paused", [])).toBeBool(false);
  });

  it("propose-owner: owner-only (stranger -> u5001)", function () {
    expect(
      pub(CORE, "propose-owner", [Cl.some(Cl.principal(wallet2))], wallet1),
    ).toBeErr(Cl.uint(5001));
    expect(ro(CORE, "get-pending-owner", [])).toBeNone();
  });

  it("accept-owner: u5018 ERR_NO_PENDING_OWNER when nothing is pending", function () {
    expect(pub(CORE, "accept-owner", [], wallet1)).toBeErr(Cl.uint(5018));
    // Even the current owner cannot self-accept out of thin air.
    expect(pub(CORE, "accept-owner", [], deployer)).toBeErr(Cl.uint(5018));
  });

  it("full handover: propose -> pending -> wrong acceptor u5001 -> accept -> authority moves", function () {
    // Owner proposes wallet1.
    expect(
      pub(CORE, "propose-owner", [Cl.some(Cl.principal(wallet1))], deployer),
    ).toBeOk(Cl.bool(true));
    expect(ro(CORE, "get-pending-owner", [])).toBeSome(Cl.principal(wallet1));

    // A non-pending principal cannot accept while one IS pending -> u5001,
    // not u5018 (the unwrap! succeeds, the asserts! is what fires).
    expect(pub(CORE, "accept-owner", [], wallet2)).toBeErr(Cl.uint(5001));
    // The current owner is not the nominee either.
    expect(pub(CORE, "accept-owner", [], deployer)).toBeErr(Cl.uint(5001));

    // The nominee accepts.
    expect(pub(CORE, "accept-owner", [], wallet1)).toBeOk(Cl.bool(true));
    expect(ro(CORE, "get-contract-owner", [])).toBePrincipal(wallet1);
    expect(ro(CORE, "get-pending-owner", [])).toBeNone();

    // OLD owner has lost authority on every owner-gated entrypoint.
    expect(
      pub(CORE, "propose-owner", [Cl.some(Cl.principal(wallet3))], deployer),
    ).toBeErr(Cl.uint(5001));
    expect(pub(CORE, "pause", [], deployer)).toBeErr(Cl.uint(5001));
    expect(
      pub(
        CORE,
        "set-verified-contract",
        [Cl.contractPrincipal(deployer, "jing-core")],
        deployer,
      ),
    ).toBeErr(Cl.uint(5001));

    // NEW owner has it.
    expect(
      pub(CORE, "propose-owner", [Cl.some(Cl.principal(wallet3))], wallet1),
    ).toBeOk(Cl.bool(true));
    expect(ro(CORE, "get-pending-owner", [])).toBeSome(Cl.principal(wallet3));
    expect(pub(CORE, "pause", [], wallet1)).toBeOk(Cl.bool(true));
  });

  it("propose-owner none: clears the pending slot, accept then fails u5018", function () {
    expect(
      pub(CORE, "propose-owner", [Cl.some(Cl.principal(wallet1))], deployer),
    ).toBeOk(Cl.bool(true));
    expect(ro(CORE, "get-pending-owner", [])).toBeSome(Cl.principal(wallet1));

    // Owner withdraws the nomination.
    expect(pub(CORE, "propose-owner", [Cl.none()], deployer)).toBeOk(
      Cl.bool(true),
    );
    expect(ro(CORE, "get-pending-owner", [])).toBeNone();

    // The former nominee can no longer accept.
    expect(pub(CORE, "accept-owner", [], wallet1)).toBeErr(Cl.uint(5018));
    expect(ro(CORE, "get-contract-owner", [])).toBePrincipal(deployer);
  });

  it("propose-owner does not transfer authority: old owner still admin while pending", function () {
    expect(
      pub(CORE, "propose-owner", [Cl.some(Cl.principal(wallet1))], deployer),
    ).toBeOk(Cl.bool(true));

    // Ownership unchanged, so the old owner still passes owner-gated calls.
    expect(ro(CORE, "get-contract-owner", [])).toBePrincipal(deployer);
    expect(
      pub(
        CORE,
        "set-verified-contract",
        [Cl.contractPrincipal(deployer, "jing-core")],
        deployer,
      ),
    ).toBeOk(Cl.bool(true));

    // And the nominee has NO authority until they accept.
    expect(
      pub(
        CORE,
        "set-verified-contract",
        [Cl.contractPrincipal(deployer, "jing-core-v3")],
        wallet1,
      ),
    ).toBeErr(Cl.uint(5001));
  });

  // =========================================================================
  // 2. pause / unpause
  // =========================================================================

  it("pause: owner-only (u5001) and stamps paused-at / unpause-eligible-at", function () {
    expect(pub(CORE, "pause", [], wallet1)).toBeErr(Cl.uint(5001));
    expect(pub(CORE, "pause", [], wallet2)).toBeErr(Cl.uint(5001));
    expect(ro(CORE, "is-paused", [])).toBeBool(false);

    expect(pub(CORE, "pause", [], deployer)).toBeOk(Cl.bool(true));
    expect(ro(CORE, "is-paused", [])).toBeBool(true);

    const pausedAt = num(ro(CORE, "get-paused-at", []));
    expect(pausedAt).toBe(simnet.burnBlockHeight);
    expect(num(ro(CORE, "get-unpause-eligible-at", []))).toBe(
      pausedAt + TIMELOCK_BURN_BLOCKS,
    );
  });

  it("unpause when NOT paused -> u5017 ERR_NOT_PAUSED (v3 guard)", function () {
    // Never paused: the owner check passes, then the (var-get paused) assert
    // fires. Non-owners still fall out at u5001 first.
    expect(ro(CORE, "is-paused", [])).toBeBool(false);
    expect(pub(CORE, "unpause", [], wallet1)).toBeErr(Cl.uint(5001));
    expect(pub(CORE, "unpause", [], deployer)).toBeErr(Cl.uint(5017));

    // Also after a completed pause/unpause round trip: the second unpause
    // must be u5017, not a silent no-op and not u5008.
    expect(pub(CORE, "pause", [], deployer)).toBeOk(Cl.bool(true));
    advanceBurnBlocks(TIMELOCK_BURN_BLOCKS + 1);
    expect(pub(CORE, "unpause", [], deployer)).toBeOk(Cl.bool(true));
    expect(ro(CORE, "is-paused", [])).toBeBool(false);
    expect(pub(CORE, "unpause", [], deployer)).toBeErr(Cl.uint(5017));
  });

  it("unpause: u5008 before the 144 burn-block timelock, ok after", function () {
    expect(pub(CORE, "pause", [], deployer)).toBeOk(Cl.bool(true));

    // Immediately: too early.
    expect(pub(CORE, "unpause", [], deployer)).toBeErr(Cl.uint(5008));

    // One burn block short of the window: still too early.
    advanceBurnBlocks(TIMELOCK_BURN_BLOCKS - 1);
    expect(simnet.burnBlockHeight).toBeLessThan(
      num(ro(CORE, "get-unpause-eligible-at", [])),
    );
    expect(pub(CORE, "unpause", [], deployer)).toBeErr(Cl.uint(5008));

    // Exactly at the eligibility height (the check is >=): ok.
    advanceBurnBlocks(1);
    expect(simnet.burnBlockHeight).toBeGreaterThanOrEqual(
      num(ro(CORE, "get-unpause-eligible-at", [])),
    );
    expect(pub(CORE, "unpause", [], wallet1)).toBeErr(Cl.uint(5001));
    expect(pub(CORE, "unpause", [], deployer)).toBeOk(Cl.bool(true));
    expect(ro(CORE, "is-paused", [])).toBeBool(false);
  });

  it("pause: re-pausing restarts the unpause timer", function () {
    expect(pub(CORE, "pause", [], deployer)).toBeOk(Cl.bool(true));
    const firstAt = num(ro(CORE, "get-paused-at", []));

    advanceBurnBlocks(TIMELOCK_BURN_BLOCKS - 10);
    expect(pub(CORE, "pause", [], deployer)).toBeOk(Cl.bool(true));
    const secondAt = num(ro(CORE, "get-paused-at", []));
    expect(secondAt).toBeGreaterThan(firstAt);

    // The 10 remaining blocks of the FIRST window no longer help.
    advanceBurnBlocks(20);
    expect(pub(CORE, "unpause", [], deployer)).toBeErr(Cl.uint(5008));
  });

  it("paused: log-deposit reverts u5016 but log-withdraw stays open", function () {
    const helper = deployAndRegisterHelper();

    // Seed some equity while unpaused.
    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(SBTC_TOKEN), Cl.uint(1_000)], deployer),
    ).toBeOk(Cl.bool(true));

    expect(pub(CORE, "pause", [], deployer)).toBeOk(Cl.bool(true));

    // Entry side gated: log-deposit starts with (try! (check-not-paused)).
    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(SBTC_TOKEN), Cl.uint(500)], deployer),
    ).toBeErr(Cl.uint(5016));

    // Exit side open by design: log-withdraw has NO check-not-paused, so a
    // paused core never traps user funds inside a vault.
    expect(
      pub("test-vault", "do-log-withdraw", [Cl.principal(SBTC_TOKEN), Cl.uint(400)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(600);

    // snpl unwind paths are exit-side too: no pause check on repay/seize.
    expect(
      pub("test-vault", "do-log-snpl-repay", [Cl.principal(SBTC_TOKEN), Cl.uint(100)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(500);
  });

  // =========================================================================
  // 3. Registry gates
  // =========================================================================

  it("set-verified-contract: owner-only (u5001), records hash, double-set u5003", function () {
    const target = Cl.contractPrincipal(deployer, "jing-core");

    expect(pub(CORE, "set-verified-contract", [target], wallet1)).toBeErr(
      Cl.uint(5001),
    );
    expect(ro(CORE, "is-verified-contract", [target])).toBeBool(false);
    expect(ro(CORE, "get-verified-hash", [target])).toBeNone();

    expect(pub(CORE, "set-verified-contract", [target], deployer)).toBeOk(
      Cl.bool(true),
    );
    expect(ro(CORE, "is-verified-contract", [target])).toBeBool(true);
    expect(ro(CORE, "get-verified-hash", [target])).not.toBeNone();

    // Re-verifying the same principal is rejected, not silently overwritten.
    expect(pub(CORE, "set-verified-contract", [target], deployer)).toBeErr(
      Cl.uint(5003),
    );
  });

  it("register: u5005 NOT_VERIFIED when the canonical was never verified", function () {
    deployHelper("test-vault");
    // jing-core-v3 itself is a real contract but is not in verified-contracts.
    expect(
      pub(
        "test-vault",
        "do-register",
        [Cl.contractPrincipal(deployer, "jing-core-v3")],
        deployer,
      ),
    ).toBeErr(Cl.uint(5005));
    expect(
      ro(CORE, "is-registered", [Cl.contractPrincipal(deployer, "test-vault")]),
    ).toBeBool(false);
  });

  it("register: u5006 HASH_MISMATCH when the caller's bytes differ from the canonical", function () {
    const helperA = deployHelper("test-vault");
    deployHelper("test-vault-b", HELPER_B_SRC);

    expect(
      pub(CORE, "set-verified-contract", [Cl.principal(helperA)], deployer),
    ).toBeOk(Cl.bool(true));

    // helper B has the same interface but different source -> different hash.
    expect(
      pub("test-vault-b", "do-register", [Cl.principal(helperA)], deployer),
    ).toBeErr(Cl.uint(5006));
    expect(
      ro(CORE, "is-registered", [
        Cl.contractPrincipal(deployer, "test-vault-b"),
      ]),
    ).toBeBool(false);
  });

  it("register: happy path marks is-registered, double-register u5003", function () {
    const helper = deployHelper("test-vault");
    expect(
      ro(CORE, "is-registered", [Cl.principal(helper)]),
    ).toBeBool(false);

    expect(
      pub(CORE, "set-verified-contract", [Cl.principal(helper)], deployer),
    ).toBeOk(Cl.bool(true));

    // The caller's own hash equals the verified canonical hash.
    expect(pub("test-vault", "do-register", [Cl.principal(helper)], deployer)).toBeOk(
      Cl.bool(true),
    );
    expect(ro(CORE, "is-registered", [Cl.principal(helper)])).toBeBool(true);

    // Registration is one-shot per contract-caller.
    expect(pub("test-vault", "do-register", [Cl.principal(helper)], deployer)).toBeErr(
      Cl.uint(5003),
    );
  });

  it("register: standard-principal caller hits u5002 ERR_INVALID_CONTRACT_HASH", function () {
    // A wallet has no bytecode, so (contract-hash? contract-caller) is none
    // and the unwrap! fires before any verified/registered lookup.
    expect(
      pub(CORE, "register", [Cl.contractPrincipal(deployer, "jing-core")], deployer),
    ).toBeErr(Cl.uint(5002));
    expect(
      pub(CORE, "register", [Cl.contractPrincipal(deployer, "jing-core")], wallet1),
    ).toBeErr(Cl.uint(5002));
  });

  it("log-* funnel is registry-gated: unregistered contract caller -> u5001", function () {
    deployHelper("test-vault");
    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(SBTC_TOKEN), Cl.uint(1_000)], deployer),
    ).toBeErr(Cl.uint(5001));
    expect(
      pub("test-vault", "do-log-withdraw", [Cl.principal(SBTC_TOKEN), Cl.uint(1_000)], deployer),
    ).toBeErr(Cl.uint(5001));
    expect(
      pub("test-vault", "do-log-snpl-repay", [Cl.principal(SBTC_TOKEN), Cl.uint(1)], deployer),
    ).toBeErr(Cl.uint(5001));
    expect(
      pub("test-vault", "do-log-snpl-seize", [Cl.principal(SBTC_TOKEN), Cl.uint(1)], deployer),
    ).toBeErr(Cl.uint(5001));
  });

  // =========================================================================
  // 4. Equity ledger
  // =========================================================================

  it("log-deposit / log-withdraw move per-token equity, total equity and get-balance", function () {
    const helper = deployAndRegisterHelper();

    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(0);
    expect(ro(CORE, "get-balance", [Cl.principal(helper)])).toBeOk(Cl.uint(0));

    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(SBTC_TOKEN), Cl.uint(10_000)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(USDCX_TOKEN), Cl.uint(250_000)], deployer),
    ).toBeOk(Cl.bool(true));

    // Per-token buckets are independent; get-balance is the sBTC bucket.
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(10_000);
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(SBTC_TOKEN)]),
    ).toBeUint(10_000);
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(USDCX_TOKEN)]),
    ).toBeUint(250_000);
    expect(ro(CORE, "get-balance", [Cl.principal(helper)])).toBeOk(
      Cl.uint(10_000),
    );

    // Withdraw debits both the owner bucket and the token total.
    expect(
      pub("test-vault", "do-log-withdraw", [Cl.principal(SBTC_TOKEN), Cl.uint(4_000)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(6_000);
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(SBTC_TOKEN)]),
    ).toBeUint(6_000);
    expect(ro(CORE, "get-balance", [Cl.principal(helper)])).toBeOk(
      Cl.uint(6_000),
    );

    // A non-vault principal has no equity of its own.
    expect(ro(CORE, "get-balance", [Cl.principal(wallet1)])).toBeOk(Cl.uint(0));
  });

  it("debit floors at current equity: over-withdraw cannot underflow", function () {
    const helper = deployAndRegisterHelper();

    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(SBTC_TOKEN), Cl.uint(1_000)], deployer),
    ).toBeOk(Cl.bool(true));

    // debit applies min(amount, current) -- no runtime underflow abort.
    expect(
      pub("test-vault", "do-log-withdraw", [Cl.principal(SBTC_TOKEN), Cl.uint(9_999_999)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(0);
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(SBTC_TOKEN)]),
    ).toBeUint(0);

    // Debiting an already-empty bucket is still a no-op ok.
    expect(
      pub("test-vault", "do-log-withdraw", [Cl.principal(SBTC_TOKEN), Cl.uint(1)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(SBTC_TOKEN)]),
    ).toBeUint(0);
  });

  // =========================================================================
  // 5. snpl equity debits (token-y arg added in v3)
  // =========================================================================

  it("log-snpl-repay: debits the caller's token-y equity by token-y-released", function () {
    const helper = deployAndRegisterHelper();

    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(USDCX_TOKEN), Cl.uint(1_000_000)], deployer),
    ).toBeOk(Cl.bool(true));

    expect(
      pub("test-vault", "do-log-snpl-repay", [Cl.principal(USDCX_TOKEN), Cl.uint(400_000)], deployer),
    ).toBeOk(Cl.bool(true));

    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(USDCX_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(600_000);
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(USDCX_TOKEN)]),
    ).toBeUint(600_000);

    // Only the named token-y bucket moves.
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(SBTC_TOKEN)]),
    ).toBeUint(0);

    // Zero release is a no-op.
    expect(
      pub("test-vault", "do-log-snpl-repay", [Cl.principal(USDCX_TOKEN), Cl.uint(0)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(USDCX_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(600_000);
  });

  it("log-snpl-seize: debits the caller's token-y equity by token-y-seized and floors at 0", function () {
    const helper = deployAndRegisterHelper();

    expect(
      pub("test-vault", "do-log-deposit", [Cl.principal(USDCX_TOKEN), Cl.uint(500_000)], deployer),
    ).toBeOk(Cl.bool(true));

    expect(
      pub("test-vault", "do-log-snpl-seize", [Cl.principal(USDCX_TOKEN), Cl.uint(200_000)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(USDCX_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(300_000);

    // Seizing more than the recorded equity floors at 0 rather than aborting.
    expect(
      pub("test-vault", "do-log-snpl-seize", [Cl.principal(USDCX_TOKEN), Cl.uint(999_999_999)], deployer),
    ).toBeOk(Cl.bool(true));
    expect(
      ro(CORE, "get-token-equity", [
        Cl.principal(USDCX_TOKEN),
        Cl.principal(helper),
      ]),
    ).toBeUint(0);
    expect(
      ro(CORE, "get-total-token-equity", [Cl.principal(USDCX_TOKEN)]),
    ).toBeUint(0);
  });
});
