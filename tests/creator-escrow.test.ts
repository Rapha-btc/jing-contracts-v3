import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

// ============================================================================
// creator-escrow tests against the production contract (mainnet timing
// constants). Burn-block advances are simulated via simnet.mineEmptyBurnBlocks
// so review windows, claim grace, and round-end gates can be exercised.
//
// Remote data is enabled in Clarinet.toml so the real USDCx contract is
// reachable via simnet. Tests fund the OWNER (deployer) with USDCx from a
// mainnet whale before each scenario that hits the escrow path.
// ============================================================================

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!; // OWNER (set at deploy via tx-sender)
const wallet1 = accounts.get("wallet_1")!;  // Studio Sam (creator-a)
const wallet2 = accounts.get("wallet_2")!;  // Emmexx (creator-b)
const wallet3 = accounts.get("wallet_3")!;  // outsider / non-creator

const C = "creator-escrow";

const USDCX_TOKEN = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const USDCX_WHALE = "SP2V3J7G42E8ZD1YPK6G6295EQ1EGZMPGDZQSRDWT";

// Confirm remote data is reachable. If the whale's USDCx balance is 0 the
// chainstate didn't load -- skip the suite rather than fail noisily.
const usdcxBalanceCV = cvToJSON(
  simnet.callReadOnlyFn(
    USDCX_TOKEN,
    "get-balance",
    [Cl.principal(USDCX_WHALE)],
    deployer
  ).result
);
const remoteDataEnabled = Number(usdcxBalanceCV.value?.value || 0) > 0;

// Contract constants mirrored as JS for test arithmetic.
const REVIEW_WINDOW = 288;
const CLAIM_GRACE = 288;
const ROUND_BURN_BLOCKS = 4200;

const PRICE_25 = 25_000_000;   // $25 (USDCx is 6dec)
const PRICE_30 = 30_000_000;   // $30
const NUM_VIDEOS_2 = 2;
const NUM_VIDEOS_4 = 4;
const NUM_VIDEOS_8 = 8;

// Error codes
const ERR_NOT_OWNER = 100;
const ERR_NOT_CREATOR = 101;
const ERR_NO_ROUND = 102;
const ERR_ROUND_ACTIVE = 103;
const ERR_ROUND_ENDED = 104;
const ERR_ROUND_NOT_ENDED = 105;
const ERR_DELIVERY_NOT_FOUND = 106;
const ERR_REVIEW_CLOSED = 108;
const ERR_ALREADY_RESOLVED = 109;
const ERR_INSUFFICIENT_ESCROW = 110;
const ERR_PENDING_DELIVERIES = 111;
const ERR_AMOUNT_ZERO = 112;
const ERR_ALREADY_SWEPT = 113;
const ERR_NOT_VETOED = 114;
const ERR_TERMS_NOT_ACCEPTED = 115;
const ERR_NOT_CLAIMABLE = 116;
const ERR_ROUND_LIVE = 117;
const ERR_VIDEOS_NOT_EVEN = 118;

// Status codes
const STATUS_PENDING = 0;
const STATUS_RELEASED = 1;
const STATUS_VETOED = 2;
const STATUS_AMENDED_APPROVED = 3;
const STATUS_EXPIRED = 4;

// Sample content commitments
const URI_1 = "ipfs://video-permission-vs-no-permission";
const URI_2 = "ipfs://video-bitcoin-to-usdcx-flow";
const HASH_1 = "aa".repeat(32);
const HASH_2 = "bb".repeat(32);
const HASH_AMENDED = "cc".repeat(32);

// ---- helpers ----

function pub(contract: string, fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(contract, fn, args, sender);
}

function ro(contract: string, fn: string, args: any[]) {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
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
    USDCX_WHALE
  );
  expect(result.result).toBeOk(Cl.bool(true));
}

function getUsdcxBalance(addr: string): number {
  const r = cvToJSON(
    simnet.callReadOnlyFn(
      USDCX_TOKEN,
      "get-balance",
      [Cl.principal(addr)],
      deployer
    ).result
  );
  return Number(r.value?.value || 0);
}

function startRound(
  creatorA: string,
  creatorB: string,
  perVideo: number,
  numVideos: number,
  sender: string = deployer
) {
  return pub(
    C,
    "start-round",
    [
      Cl.principal(creatorA),
      Cl.principal(creatorB),
      Cl.uint(perVideo),
      Cl.uint(numVideos),
    ],
    sender
  );
}

function submit(uri: string, hashHex: string, sender: string) {
  return pub(
    C,
    "submit-delivery",
    [Cl.stringUtf8(uri), Cl.bufferFromHex(hashHex)],
    sender
  );
}

function veto(deliveryId: number, reason: string, sender: string = deployer) {
  return pub(
    C,
    "veto",
    [Cl.uint(deliveryId), Cl.stringUtf8(reason)],
    sender
  );
}

function liftVeto(
  deliveryId: number,
  amendedHash: string | null,
  sender: string = deployer
) {
  return pub(
    C,
    "lift-veto",
    [
      Cl.uint(deliveryId),
      amendedHash === null ? Cl.none() : Cl.some(Cl.bufferFromHex(amendedHash)),
    ],
    sender
  );
}

function release(deliveryId: number, agree: boolean, sender: string) {
  return pub(
    C,
    "release",
    [Cl.uint(deliveryId), Cl.bool(agree)],
    sender
  );
}

function expire(deliveryId: number, sender: string = deployer) {
  return pub(C, "expire", [Cl.uint(deliveryId)], sender);
}

function sweep(roundId: number, sender: string = deployer) {
  return pub(C, "sweep", [Cl.uint(roundId)], sender);
}

function getRound(id: number) {
  return cvToJSON(ro(C, "get-round", [Cl.uint(id)]));
}

function getDelivery(id: number) {
  return cvToJSON(ro(C, "get-delivery", [Cl.uint(id)]));
}

function getEscrowBalance() {
  return Number(cvToJSON(ro(C, "get-escrow-balance", [])).value);
}

// ============================================================================
// Suite
// ============================================================================

describe.skipIf(!remoteDataEnabled)("creator-escrow", () => {
  // -------- happy path: full lifecycle --------
  it("happy path: start round, submit, advance review window, release, sweep", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_8);

    const balBefore = getUsdcxBalance(deployer);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_8).result).toBeOk(
      Cl.uint(1)
    );
    expect(getUsdcxBalance(deployer)).toBe(balBefore - PRICE_25 * NUM_VIDEOS_8);
    expect(getEscrowBalance()).toBe(PRICE_25 * NUM_VIDEOS_8);

    // Sam submits 2, Emmexx 1
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(submit(URI_2, HASH_2, wallet2).result).toBeOk(Cl.uint(2));
    expect(submit(URI_1, HASH_AMENDED, wallet1).result).toBeOk(Cl.uint(3));

    const round = getRound(1).value.value;
    expect(Number(round.pending.value)).toBe(3);
    expect(Number(round.deposited.value)).toBe(PRICE_25 * NUM_VIDEOS_8);
    expect(Number(round["paid-out"].value)).toBe(0);

    // Releasing while review window is still open should fail.
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));

    // Advance past review window for delivery #1 and beyond.
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);

    // Sam claims his two deliveries.
    const samBefore = getUsdcxBalance(wallet1);
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(release(3, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(getUsdcxBalance(wallet1)).toBe(samBefore + 2 * PRICE_25);

    // Emmexx claims her one.
    const emmexxBefore = getUsdcxBalance(wallet2);
    expect(release(2, true, wallet2).result).toBeOk(Cl.bool(true));
    expect(getUsdcxBalance(wallet2)).toBe(emmexxBefore + PRICE_25);

    const roundAfter = getRound(1).value.value;
    expect(Number(roundAfter.pending.value)).toBe(0);
    expect(Number(roundAfter["paid-out"].value)).toBe(3 * PRICE_25);

    // Sweep blocked while round still active.
    expect(sweep(1).result).toBeErr(Cl.uint(ERR_ROUND_NOT_ENDED));

    // Advance to round-end.
    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);

    const ownerBefore = getUsdcxBalance(deployer);
    const refund = 5 * PRICE_25; // 8 budgeted - 3 paid
    expect(sweep(1).result).toBeOk(Cl.uint(refund));
    expect(getUsdcxBalance(deployer)).toBe(ownerBefore + refund);
    expect(getEscrowBalance()).toBe(0);

    // Round 1 marked swept; double-sweep blocked.
    expect(getRound(1).value.value.swept.value).toBe(true);
    expect(sweep(1).result).toBeErr(Cl.uint(ERR_ALREADY_SWEPT));
  });

  // -------- start-round access + invariants --------
  it("start-round: only OWNER, even slot count, prev round fully resolved", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_8);

    // Non-owner cannot start a round.
    expect(
      startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4, wallet1).result
    ).toBeErr(Cl.uint(ERR_NOT_OWNER));

    // Odd slot count is rejected.
    expect(startRound(wallet1, wallet2, PRICE_25, 3).result).toBeErr(
      Cl.uint(ERR_VIDEOS_NOT_EVEN)
    );

    // Zero per-video / zero count rejected.
    expect(startRound(wallet1, wallet2, 0, NUM_VIDEOS_4).result).toBeErr(
      Cl.uint(ERR_AMOUNT_ZERO)
    );
    expect(startRound(wallet1, wallet2, PRICE_25, 0).result).toBeErr(
      Cl.uint(ERR_AMOUNT_ZERO)
    );

    // Open round 1 normally.
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeOk(
      Cl.uint(1)
    );

    // Cannot start round 2 while round 1 is still active.
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeErr(
      Cl.uint(ERR_ROUND_ACTIVE)
    );

    // Submit a delivery so round 1 has pending > 0.
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);

    // Round-end has passed but pending > 0 -> still cannot open round 2.
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeErr(
      Cl.uint(ERR_ROUND_ACTIVE)
    );

    // Once the claim grace passes, anyone can expire the orphan delivery.
    simnet.mineEmptyBurnBlocks(CLAIM_GRACE + 1);
    expect(expire(1).result).toBeOk(Cl.bool(true));

    // Now round 2 can open.
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeOk(
      Cl.uint(2)
    );
  });

  // -------- submit-delivery access + window --------
  it("submit-delivery: only registered creators, before submit cutoff", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeOk(
      Cl.uint(1)
    );

    // Outsider cannot submit.
    expect(submit(URI_1, HASH_1, wallet3).result).toBeErr(Cl.uint(ERR_NOT_CREATOR));

    // Both registered creators can submit.
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(submit(URI_2, HASH_2, wallet2).result).toBeOk(Cl.uint(2));

    // Submission is allowed exactly up to ends-at - REVIEW_WINDOW; advance
    // one block past that boundary to confirm the cutoff bites.
    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS - REVIEW_WINDOW + 1);
    expect(submit(URI_1, HASH_1, wallet1).result).toBeErr(Cl.uint(ERR_ROUND_ENDED));
  });

  // -------- veto path --------
  it("veto: owner only, only during review window, decrements pending", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeOk(
      Cl.uint(1)
    );
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    // Non-owner cannot veto.
    expect(veto(1, "bad audio", wallet1).result).toBeErr(Cl.uint(ERR_NOT_OWNER));

    // Veto succeeds during review window.
    expect(veto(1, "audio is rough, music too loud").result).toBeOk(
      Cl.bool(true)
    );

    // Vetoed delivery is no longer claimable.
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));

    // Pending decremented; can't double-veto.
    const round = getRound(1).value.value;
    expect(Number(round.pending.value)).toBe(0);
    expect(veto(1, "again", deployer).result).toBeErr(
      Cl.uint(ERR_ALREADY_RESOLVED)
    );

    // Veto can't fire after review window closes.
    expect(submit(URI_2, HASH_2, wallet2).result).toBeOk(Cl.uint(2));
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    expect(veto(2, "too late").result).toBeErr(Cl.uint(ERR_REVIEW_CLOSED));
  });

  // -------- lift-veto path: amend + claim cycle --------
  it("lift-veto: VETOED -> AMENDED_APPROVED -> creator claims with agreement", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeOk(
      Cl.uint(1)
    );
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(veto(1, "music too loud").result).toBeOk(Cl.bool(true));

    // Lift requires the delivery to be VETOED.
    expect(liftVeto(2, null).result).toBeErr(Cl.uint(ERR_DELIVERY_NOT_FOUND));

    // Non-owner cannot lift.
    expect(liftVeto(1, HASH_AMENDED, wallet1).result).toBeErr(
      Cl.uint(ERR_NOT_OWNER)
    );

    // Owner lifts with the amended content-hash recorded in the event.
    expect(liftVeto(1, HASH_AMENDED).result).toBeOk(Cl.bool(true));

    const delivery = getDelivery(1).value.value;
    expect(Number(delivery.status.value)).toBe(STATUS_AMENDED_APPROVED);
    // Original veto reason still in record (history preserved).
    expect(delivery["veto-reason"].value.value).toBe("music too loud");

    // Pending re-incremented (waiting for creator to claim).
    expect(Number(getRound(1).value.value.pending.value)).toBe(1);

    // Creator must agree to terms; passing false fails.
    expect(release(1, false, wallet1).result).toBeErr(
      Cl.uint(ERR_TERMS_NOT_ACCEPTED)
    );

    // Wrong wallet trying to claim fails (only the original creator).
    expect(release(1, true, wallet2).result).toBeErr(Cl.uint(ERR_NOT_CREATOR));

    // The amended delivery is claimable IMMEDIATELY -- no second review window.
    const samBefore = getUsdcxBalance(wallet1);
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(getUsdcxBalance(wallet1)).toBe(samBefore + PRICE_25);

    // Cannot lift twice.
    expect(liftVeto(1, null).result).toBeErr(Cl.uint(ERR_NOT_VETOED));
  });

  // -------- release access + agreement --------
  it("release: only original creator, must agree to terms, only after review", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeOk(
      Cl.uint(1)
    );
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    // Before review window expires.
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));

    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);

    // Wrong creator (Emmexx claiming Sam's delivery).
    expect(release(1, true, wallet2).result).toBeErr(Cl.uint(ERR_NOT_CREATOR));
    // Outsider.
    expect(release(1, true, wallet3).result).toBeErr(Cl.uint(ERR_NOT_CREATOR));
    // Sam without agreement.
    expect(release(1, false, wallet1).result).toBeErr(
      Cl.uint(ERR_TERMS_NOT_ACCEPTED)
    );

    // Correct creator + agreement.
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    // Cannot double-release.
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));
  });

  // -------- expire path --------
  it("expire: blocked during round + grace, allowed after, frees sweep", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_4).result).toBeOk(
      Cl.uint(1)
    );
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    // Cannot expire while round is live.
    expect(expire(1).result).toBeErr(Cl.uint(ERR_ROUND_LIVE));

    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);
    // Round ended but still in claim grace -- creator retains right to claim.
    expect(expire(1).result).toBeErr(Cl.uint(ERR_ROUND_LIVE));

    simnet.mineEmptyBurnBlocks(CLAIM_GRACE + 1);
    // Grace passed -- anyone (including a third party) can free the slot.
    expect(expire(1, wallet3).result).toBeOk(Cl.bool(true));
    expect(Number(getDelivery(1).value.value.status.value)).toBe(STATUS_EXPIRED);

    // After expiration, the creator cannot retroactively claim.
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));

    // Sweep now succeeds; full deposit refunds.
    const ownerBefore = getUsdcxBalance(deployer);
    const refund = PRICE_25 * NUM_VIDEOS_4;
    expect(sweep(1).result).toBeOk(Cl.uint(refund));
    expect(getUsdcxBalance(deployer)).toBe(ownerBefore + refund);
  });

  // -------- different per-video rate per round --------
  it("per-video rate is round-scoped: round 2 can charge a different price", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_2);
    expect(startRound(wallet1, wallet2, PRICE_25, NUM_VIDEOS_2).result).toBeOk(
      Cl.uint(1)
    );
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);
    expect(sweep(1).result).toBeOk(Cl.uint(PRICE_25)); // 1 unspent slot

    // Round 2 at a higher rate.
    fundUsdcx(deployer, PRICE_30 * NUM_VIDEOS_2);
    expect(startRound(wallet1, wallet2, PRICE_30, NUM_VIDEOS_2).result).toBeOk(
      Cl.uint(2)
    );
    expect(submit(URI_2, HASH_2, wallet1).result).toBeOk(Cl.uint(2));
    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);

    const samBefore = getUsdcxBalance(wallet1);
    expect(release(2, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(getUsdcxBalance(wallet1)).toBe(samBefore + PRICE_30); // round 2 rate
  });

  // -------- read-only sanity --------
  it("read-only surface returns expected shapes", () => {
    const config = cvToJSON(ro(C, "get-config", []));
    expect(config.value.owner.value).toBe(deployer);
    expect(config.value.usdcx.value).toBe(USDCX_TOKEN);
    expect(Number(config.value["review-window-burn-blocks"].value)).toBe(
      REVIEW_WINDOW
    );
    expect(Number(config.value["round-burn-blocks"].value)).toBe(
      ROUND_BURN_BLOCKS
    );

    const terms = cvToJSON(ro(C, "get-terms", []));
    expect(terms.value).toContain("UASU Inc.");
    expect(terms.value).toContain("perpetual");
    expect(terms.value).toContain("State of Delaware");

    expect(Number(cvToJSON(ro(C, "get-current-round-id", [])).value)).toBe(0);
  });
});
