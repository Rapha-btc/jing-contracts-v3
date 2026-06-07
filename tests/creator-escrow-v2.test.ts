import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

// ============================================================================
// creator-escrow-v2 tests against the production round-2 contract (mainnet
// timing constants). Burn-block advances are simulated via
// simnet.mineEmptyBurnBlocks so review windows, claim grace, and round-end
// gates can be exercised.
//
// Round-2 changes exercised here:
//   * start-round now takes 4 principals (creator-a, creator-a-wallet,
//     creator-b, creator-b-wallet) + per-video + num-videos.
//   * release pays the SMART WALLET (creator-a-wallet / creator-b-wallet),
//     NOT the operating wallet that signs the claim.
//   * lift-veto removed; replaced by creator-driven amend-delivery (resets
//     a VETOED delivery to PENDING with a FRESH review window).
//   * owner approve fast-track: PENDING -> APPROVED, releasable immediately.
//   * expire now frees PENDING *or* APPROVED slots.
//
// Remote data is enabled in Clarinet.toml so the real USDCx contract is
// reachable via simnet. If the whale's USDCx balance is 0 the chainstate
// didn't load -- skip the suite rather than fail noisily.
// ============================================================================

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!; // OWNER (set at deploy via tx-sender)
const wallet1 = accounts.get("wallet_1")!;  // Studio Sam  (creator-a, operating)
const wallet2 = accounts.get("wallet_2")!;  // Emmexx      (creator-b, operating)
const wallet3 = accounts.get("wallet_3")!;  // Sam's payout smart wallet (creator-a-wallet)
const wallet4 = accounts.get("wallet_4")!;  // Emmexx's payout smart wallet (creator-b-wallet)
const wallet5 = accounts.get("wallet_5")!;  // outsider / non-creator

const C = "creator-escrow-v2";

const USDCX_TOKEN = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const USDCX_WHALE = "SP2V3J7G42E8ZD1YPK6G6295EQ1EGZMPGDZQSRDWT";

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
const ERR_OVER_CAPACITY = 119;

// Status codes
const STATUS_PENDING = 0;
const STATUS_RELEASED = 1;
const STATUS_VETOED = 2;
const STATUS_APPROVED = 3;
const STATUS_EXPIRED = 4;

// Sample content commitments
const URI_1 = "ipfs://video-permission-vs-no-permission";
const URI_2 = "ipfs://video-bitcoin-to-usdcx-flow";
const URI_AMENDED = "ipfs://video-permission-vs-no-permission-fixed";
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

// start-round (v2): creator-a, creator-a-wallet, creator-b, creator-b-wallet,
// per-video, num-videos. Operating wallets are wallet1/wallet2; payout smart
// wallets are wallet3/wallet4.
function startRound(
  perVideo: number,
  numVideos: number,
  sender: string = deployer,
  creatorA: string = wallet1,
  creatorAWallet: string = wallet3,
  creatorB: string = wallet2,
  creatorBWallet: string = wallet4
) {
  return pub(
    C,
    "start-round",
    [
      Cl.principal(creatorA),
      Cl.principal(creatorAWallet),
      Cl.principal(creatorB),
      Cl.principal(creatorBWallet),
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
  return pub(C, "veto", [Cl.uint(deliveryId), Cl.stringUtf8(reason)], sender);
}

function amend(
  deliveryId: number,
  uri: string,
  hashHex: string,
  sender: string
) {
  return pub(
    C,
    "amend-delivery",
    [Cl.uint(deliveryId), Cl.stringUtf8(uri), Cl.bufferFromHex(hashHex)],
    sender
  );
}

function approve(deliveryId: number, sender: string = deployer) {
  return pub(C, "approve", [Cl.uint(deliveryId)], sender);
}

function release(deliveryId: number, agree: boolean, sender: string) {
  return pub(C, "release", [Cl.uint(deliveryId), Cl.bool(agree)], sender);
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

function deliveryStatus(id: number): number {
  return Number(getDelivery(id).value.value.status.value);
}

function reviewEndsAt(id: number): number {
  return Number(getDelivery(id).value.value["review-ends-at"].value);
}

function roundField(id: number, field: string): number {
  return Number(getRound(id).value.value[field].value);
}

// ============================================================================
// Suite
// ============================================================================

describe.skipIf(!remoteDataEnabled)("creator-escrow-v2", () => {
  // -------- happy path: payout lands in SMART WALLET, not operating wallet --
  it("happy path: release pays the smart wallet, operating wallet unchanged; sweep refunds", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_8);

    const balBefore = getUsdcxBalance(deployer);
    expect(startRound(PRICE_25, NUM_VIDEOS_8).result).toBeOk(Cl.uint(1));
    expect(getUsdcxBalance(deployer)).toBe(balBefore - PRICE_25 * NUM_VIDEOS_8);
    expect(getEscrowBalance()).toBe(PRICE_25 * NUM_VIDEOS_8);

    // Confirm wallets recorded in the round.
    const round = getRound(1).value.value;
    expect(round["creator-a"].value).toBe(wallet1);
    expect(round["creator-a-wallet"].value).toBe(wallet3);
    expect(round["creator-b"].value).toBe(wallet2);
    expect(round["creator-b-wallet"].value).toBe(wallet4);

    // Sam (wallet1) submits 2, Emmexx (wallet2) submits 1.
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(submit(URI_2, HASH_2, wallet2).result).toBeOk(Cl.uint(2));
    expect(submit(URI_1, HASH_AMENDED, wallet1).result).toBeOk(Cl.uint(3));
    expect(roundField(1, "pending")).toBe(3);
    expect(roundField(1, "deposited")).toBe(PRICE_25 * NUM_VIDEOS_8);
    expect(roundField(1, "paid-out")).toBe(0);

    // Release before window elapses -> ERR_NOT_CLAIMABLE.
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));

    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);

    // Snapshot all four wallets before payouts.
    const samOpBefore = getUsdcxBalance(wallet1);
    const emmexxOpBefore = getUsdcxBalance(wallet2);
    const samPayoutBefore = getUsdcxBalance(wallet3);
    const emmexxPayoutBefore = getUsdcxBalance(wallet4);

    // Sam claims his two (signs from wallet1, funds go to wallet3).
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(release(3, true, wallet1).result).toBeOk(Cl.bool(true));
    // Emmexx claims hers (signs from wallet2, funds go to wallet4).
    expect(release(2, true, wallet2).result).toBeOk(Cl.bool(true));

    // KEY ASSERTION: payouts land in the SMART WALLETS, operating wallets
    // unchanged by the payout.
    expect(getUsdcxBalance(wallet3)).toBe(samPayoutBefore + 2 * PRICE_25);
    expect(getUsdcxBalance(wallet4)).toBe(emmexxPayoutBefore + PRICE_25);
    expect(getUsdcxBalance(wallet1)).toBe(samOpBefore);
    expect(getUsdcxBalance(wallet2)).toBe(emmexxOpBefore);

    expect(roundField(1, "pending")).toBe(0);
    expect(roundField(1, "paid-out")).toBe(3 * PRICE_25);
    expect(deliveryStatus(1)).toBe(STATUS_RELEASED);

    // Sweep blocked while round still active.
    expect(sweep(1).result).toBeErr(Cl.uint(ERR_ROUND_NOT_ENDED));

    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);

    const ownerBefore = getUsdcxBalance(deployer);
    const refund = 5 * PRICE_25; // 8 budgeted - 3 paid
    expect(sweep(1).result).toBeOk(Cl.uint(refund));
    expect(getUsdcxBalance(deployer)).toBe(ownerBefore + refund);
    expect(getEscrowBalance()).toBe(0);

    // Double-sweep blocked.
    expect(getRound(1).value.value.swept.value).toBe(true);
    expect(sweep(1).result).toBeErr(Cl.uint(ERR_ALREADY_SWEPT));
  });

  // -------- approve fast-track --------
  it("approve: owner fast-tracks PENDING -> APPROVED, creator releases immediately to smart wallet", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    // Non-owner cannot approve.
    expect(approve(1, wallet1).result).toBeErr(Cl.uint(ERR_NOT_OWNER));

    // Owner approves the still-PENDING delivery.
    expect(approve(1).result).toBeOk(Cl.bool(true));
    expect(deliveryStatus(1)).toBe(STATUS_APPROVED);

    // Approving a non-PENDING delivery -> ERR_ALREADY_RESOLVED.
    expect(approve(1).result).toBeErr(Cl.uint(ERR_ALREADY_RESOLVED));
    // Veto after approve -> ERR_ALREADY_RESOLVED (no longer PENDING).
    expect(veto(1, "too late").result).toBeErr(Cl.uint(ERR_ALREADY_RESOLVED));

    // Creator releases WITHOUT advancing any blocks; funds land in wallet3.
    const samPayoutBefore = getUsdcxBalance(wallet3);
    const samOpBefore = getUsdcxBalance(wallet1);
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(getUsdcxBalance(wallet3)).toBe(samPayoutBefore + PRICE_25);
    expect(getUsdcxBalance(wallet1)).toBe(samOpBefore);
    expect(deliveryStatus(1)).toBe(STATUS_RELEASED);
  });

  it("approve: rejected after review window elapses (ERR_REVIEW_CLOSED)", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    // Window closed: approve no longer allowed (PENDING is already claimable).
    expect(approve(1).result).toBeErr(Cl.uint(ERR_REVIEW_CLOSED));

    // The PENDING delivery is still claimable via the normal path.
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
  });

  // -------- amend flow --------
  it("amend: VETOED -> PENDING with fresh window; re-veto then advance + release", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    expect(veto(1, "wrong hash").result).toBeOk(Cl.bool(true));
    expect(deliveryStatus(1)).toBe(STATUS_VETOED);
    expect(roundField(1, "pending")).toBe(0);

    const reviewBefore = reviewEndsAt(1);
    // Advance a few burn blocks so the amend's fresh window is verifiably
    // later than the original submission's window.
    simnet.mineEmptyBurnBlocks(5);

    // Non-creator cannot amend.
    expect(amend(1, URI_AMENDED, HASH_AMENDED, wallet2).result).toBeErr(
      Cl.uint(ERR_NOT_CREATOR)
    );

    // Creator amends: status back to PENDING, fresh review window, pending++.
    expect(amend(1, URI_AMENDED, HASH_AMENDED, wallet1).result).toBeOk(
      Cl.bool(true)
    );
    expect(deliveryStatus(1)).toBe(STATUS_PENDING);
    expect(roundField(1, "pending")).toBe(1);
    expect(reviewEndsAt(1)).toBeGreaterThan(reviewBefore);
    // veto-reason cleared, content updated.
    const d = getDelivery(1).value.value;
    expect(d["veto-reason"].value).toBe(null);
    expect(d["content-uri"].value).toBe(URI_AMENDED);

    // Amending an already-PENDING (non-VETOED) delivery -> ERR_NOT_VETOED.
    expect(amend(1, URI_AMENDED, HASH_AMENDED, wallet1).result).toBeErr(
      Cl.uint(ERR_NOT_VETOED)
    );

    // Owner can re-veto within the fresh window.
    expect(veto(1, "still wrong").result).toBeOk(Cl.bool(true));
    expect(deliveryStatus(1)).toBe(STATUS_VETOED);

    // Amend again, then this time let the window pass and release.
    expect(amend(1, URI_AMENDED, HASH_AMENDED, wallet1).result).toBeOk(
      Cl.bool(true)
    );
    // Release before fresh window elapses -> not claimable.
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));

    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);
    const samPayoutBefore = getUsdcxBalance(wallet3);
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(getUsdcxBalance(wallet3)).toBe(samPayoutBefore + PRICE_25);
  });

  it("amend: rejected after sweep, and when fresh window would exceed round-end", () => {
    // --- after-sweep rejection ---
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(veto(1, "rough").result).toBeOk(Cl.bool(true));

    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);
    expect(sweep(1).result).toBeOk(Cl.uint(PRICE_25 * NUM_VIDEOS_4));
    // Amend a swept-round delivery -> ERR_ALREADY_SWEPT (cannot raid future rounds).
    expect(amend(1, URI_AMENDED, HASH_AMENDED, wallet1).result).toBeErr(
      Cl.uint(ERR_ALREADY_SWEPT)
    );

    // --- round-end cutoff rejection (round 2) ---
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(2));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(2));
    expect(veto(2, "fix it").result).toBeOk(Cl.bool(true));
    // Advance so a fresh REVIEW_WINDOW would push review-end past round end.
    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS - REVIEW_WINDOW + 1);
    expect(amend(2, URI_AMENDED, HASH_AMENDED, wallet1).result).toBeErr(
      Cl.uint(ERR_ROUND_ENDED)
    );
  });

  // -------- expire (v2 key case: APPROVED-but-abandoned doesn't lock sweep) --
  it("expire: PENDING and APPROVED slots both expirable after grace; frees sweep", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    // #1 stays PENDING and unclaimed; #2 is owner-APPROVED but never claimed.
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(submit(URI_2, HASH_2, wallet2).result).toBeOk(Cl.uint(2));
    expect(approve(2).result).toBeOk(Cl.bool(true));
    expect(deliveryStatus(2)).toBe(STATUS_APPROVED);
    expect(roundField(1, "pending")).toBe(2);

    // Cannot expire while live, or during claim grace.
    expect(expire(1).result).toBeErr(Cl.uint(ERR_ROUND_LIVE));
    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);
    expect(expire(1).result).toBeErr(Cl.uint(ERR_ROUND_LIVE));

    simnet.mineEmptyBurnBlocks(CLAIM_GRACE + 1);

    // Grace passed: expire the PENDING and the APPROVED-but-abandoned slot.
    expect(expire(1, wallet5).result).toBeOk(Cl.bool(true));
    expect(deliveryStatus(1)).toBe(STATUS_EXPIRED);
    // KEY v2 case: an APPROVED-but-never-claimed slot is expirable too.
    expect(expire(2).result).toBeOk(Cl.bool(true));
    expect(deliveryStatus(2)).toBe(STATUS_EXPIRED);
    expect(roundField(1, "pending")).toBe(0);

    // Sweep now unlocked; full deposit refunds.
    const ownerBefore = getUsdcxBalance(deployer);
    const refund = PRICE_25 * NUM_VIDEOS_4;
    expect(sweep(1).result).toBeOk(Cl.uint(refund));
    expect(getUsdcxBalance(deployer)).toBe(ownerBefore + refund);
  });

  it("expire: VETOED delivery is NOT expirable (already left pending)", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(veto(1, "rough").result).toBeOk(Cl.bool(true));

    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS + CLAIM_GRACE + 1);
    // VETOED already left pending; expire rejects it.
    expect(expire(1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));

    // Round has pending = 0 already, so sweep works directly.
    expect(sweep(1).result).toBeOk(Cl.uint(PRICE_25 * NUM_VIDEOS_4));
  });

  // -------- owner / permission errors --------
  it("start-round: only OWNER, even slot count, non-zero amounts", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);

    expect(startRound(PRICE_25, NUM_VIDEOS_4, wallet1).result).toBeErr(
      Cl.uint(ERR_NOT_OWNER)
    );
    expect(startRound(PRICE_25, 3).result).toBeErr(Cl.uint(ERR_VIDEOS_NOT_EVEN));
    expect(startRound(0, NUM_VIDEOS_4).result).toBeErr(Cl.uint(ERR_AMOUNT_ZERO));
    expect(startRound(PRICE_25, 0).result).toBeErr(Cl.uint(ERR_AMOUNT_ZERO));

    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    // Cannot start round 2 while round 1 active.
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeErr(
      Cl.uint(ERR_ROUND_ACTIVE)
    );
  });

  it("veto: owner only; submit: registered creators only; over-capacity rejected", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_2);
    expect(startRound(PRICE_25, NUM_VIDEOS_2).result).toBeOk(Cl.uint(1));

    // Outsider cannot submit.
    expect(submit(URI_1, HASH_1, wallet5).result).toBeErr(
      Cl.uint(ERR_NOT_CREATOR)
    );
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));
    expect(submit(URI_2, HASH_2, wallet2).result).toBeOk(Cl.uint(2));

    // Over-capacity: a 3rd submission on a 2-slot round.
    expect(submit(URI_1, HASH_1, wallet1).result).toBeErr(
      Cl.uint(ERR_OVER_CAPACITY)
    );

    // Non-owner cannot veto.
    expect(veto(1, "bad", wallet1).result).toBeErr(Cl.uint(ERR_NOT_OWNER));
    expect(veto(1, "rough cut").result).toBeOk(Cl.bool(true));
    // Cannot veto twice.
    expect(veto(1, "again").result).toBeErr(Cl.uint(ERR_ALREADY_RESOLVED));
  });

  // -------- sweep semantics --------
  it("sweep: blocked before round-end, with pending>0, and on double-sweep", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    // Before round-end.
    expect(sweep(1).result).toBeErr(Cl.uint(ERR_ROUND_NOT_ENDED));

    simnet.mineEmptyBurnBlocks(ROUND_BURN_BLOCKS);
    // Round ended but a delivery is still pending.
    expect(sweep(1).result).toBeErr(Cl.uint(ERR_PENDING_DELIVERIES));

    // Free the slot, then sweep, then double-sweep blocked.
    simnet.mineEmptyBurnBlocks(CLAIM_GRACE + 1);
    expect(expire(1).result).toBeOk(Cl.bool(true));
    expect(sweep(1).result).toBeOk(Cl.uint(PRICE_25 * NUM_VIDEOS_4));
    expect(sweep(1).result).toBeErr(Cl.uint(ERR_ALREADY_SWEPT));
  });

  // -------- release access + agreement --------
  it("release: only original creator, must agree to terms, no double-release", () => {
    fundUsdcx(deployer, PRICE_25 * NUM_VIDEOS_4);
    expect(startRound(PRICE_25, NUM_VIDEOS_4).result).toBeOk(Cl.uint(1));
    expect(submit(URI_1, HASH_1, wallet1).result).toBeOk(Cl.uint(1));

    simnet.mineEmptyBurnBlocks(REVIEW_WINDOW + 1);

    // Wrong creator / outsider.
    expect(release(1, true, wallet2).result).toBeErr(Cl.uint(ERR_NOT_CREATOR));
    expect(release(1, true, wallet5).result).toBeErr(Cl.uint(ERR_NOT_CREATOR));
    // No agreement.
    expect(release(1, false, wallet1).result).toBeErr(
      Cl.uint(ERR_TERMS_NOT_ACCEPTED)
    );
    // Correct creator + agreement -> ok, pays smart wallet.
    const payoutBefore = getUsdcxBalance(wallet3);
    expect(release(1, true, wallet1).result).toBeOk(Cl.bool(true));
    expect(getUsdcxBalance(wallet3)).toBe(payoutBefore + PRICE_25);
    // No double-release.
    expect(release(1, true, wallet1).result).toBeErr(Cl.uint(ERR_NOT_CLAIMABLE));
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
    expect(terms.value).toContain("State of Delaware");

    expect(Number(cvToJSON(ro(C, "get-current-round-id", [])).value)).toBe(0);
  });
});
