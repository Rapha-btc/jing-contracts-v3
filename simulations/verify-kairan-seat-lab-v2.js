// verify-kairan-seat-lab-v2.js
// SELF-VERIFYING stxer mainnet-fork harness for
// contracts/charity/kairan-seat-lab-ocifarsito-v2.clar (2,000 USDCx target +
// STX/sBTC reserve for LAB). Deploys the LOCAL source as chavita.btc twice:
//  A. SUCCESS: the fundraiser wallet deposits its LIVE STX + sBTC as the
//     reserve; chavita.btc (a real USDCx holder) donates its live USDCx; a
//     USDCx whale fills the rest (over-target rejected); LAB request-seat
//     (builder, repo, grant post, accepts TERMS), OWNER release-seat ->
//     2,000 USDCx + the direct USDCx + whole reserve; nothing to Ocifarsito.
//     Bounty mvllpu fixes: capped donate (overshoot gets only the remainder),
//     request-seat ok at exactly failure-at - 1008, u113 one block later,
//     release-seat (builder repo grant) u115 on a swapped receipt, sweep u116
//     before the claim, then anyone (even through a proxy) sweeps late
//     direct transfers, which only ever go to LAB.
//     Round-2 fixes: request window <=, permissionless sweep, get-donor 0
//     once nothing is owed. The partial refund on a USDCx shortfall (issuer
//     burn) has no fork step: the harness cannot burn USDCx.
//  B. FAILURE: two real USDCx holders + 248 fresh donors give (250 donors,
//     no cap), a direct USDCx transfer, a reserve; the fork advances to the
//     DEADLINE Bitcoin block; LAB claim-reserve takes the reserve + only the
//     direct USDCx; anyone refund-many in 3 calls (100, 100, 50) returns every gift
//     in full (real cost limits); a repeated batch is a no-op. The reserve is
//     deposited AFTER the DEADLINE (before the claim); sweep u116 while gifts
//     are unrefunded, ok once refund-many clears them.
//  C. LATE: no gifts; after DEADLINE LAB claims an empty reserve, then
//     deposit-reserve -> u106 and sweep -> u102 (nothing to sweep).
// Attacks: non-LAB request/claim, non-owner release, proxy contracts, release
// without approval, double claim, failure path before DEADLINE.
// Every tx asserts its exact decoded result; read-only evals assert values;
// balance deltas are checked after the run. Exits 1 on any FAIL.
//
// Run: npx tsx simulations/verify-kairan-seat-lab-v2.js
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  ClarityVersion,
  uintCV,
  boolCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  deserializeCV,
  cvToString,
  privateKeyToAddress,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { listCV } from "@stacks/transactions";
import { installChunkedSubmit } from "./_chunked-submit.js";

installChunkedSubmit(60);

// The signer box serves a full Stacks API with no rate limit (Hiro 429s).
const BOX = process.env.STACKS_API_URL || "http://77.42.3.101/stacks-api";

const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // chavita.btc (OWNER)
const NAME_A = "kairan-seat-lab-ocifarsito-v2";
const NAME_B = "kairan-seat-lab-ocifarsito-v2-fail";
const NAME_C = "kairan-seat-lab-ocifarsito-v2-late";
const A = `${DEPLOYER}.${NAME_A}`;
const B = `${DEPLOYER}.${NAME_B}`;
const C = `${DEPLOYER}.${NAME_C}`;
const LAB = "SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF";
const OCIFARSITO = "SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"; // UASU Inc.: must never receive funds
const BUILDER = "Ada Builder (@ada_btc)";
const REPO = "https://github.com/ada-btc/stacks-indexer";
const FUNDRAISER = "SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F";
const USDCX_WHALE = "SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ";
const USDCX_HOLDER = "SP3A7MGAH0SKC1ACS854PHXHVWE031FYQCBA8M51D";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const STX_WHALE = "SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR";
const ATTACKER = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const USDCX = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const PROXY = `${ATTACKER}.kairan-v2-proxy`;
const SEAT_URL = "https://letafricabuild.com/journal/kairans-seat-1-builder-repo-grant";
const POOL_URL = "https://letafricabuild.com/journal/builder-fund-pool-kairan";
const TARGET = 2_000_000_000n;
const DEADLINE = 1_025_386;
const FEE_HEADROOM = 100_000n; // 0.1 STX kept by the fundraiser for the tx fee

const seatArgs = (builder = BUILDER, repo = REPO, grant = SEAT_URL, agree = true) => [stringAsciiCV(builder), stringAsciiCV(repo), stringAsciiCV(grant), boolCV(agree)];
const receipt = (builder = BUILDER, repo = REPO, grant = SEAT_URL) => [stringAsciiCV(builder), stringAsciiCV(repo), stringAsciiCV(grant)];
const BAD_GRANT = "https://letafricabuild.com/typo";
const SEAT_WINDOW = 12_960;
const A_ADVANCE_1 = 11_900; // request-seat still ok (11,900 + 1,008 < 12,960)
const A_ADVANCE_2 = 52; // failure-at - burn = 1,008: the last block a request lands
const A_ADVANCE_3 = 1; // failure-at - burn = 1,007 -> u113; release still open
const P = (s) => (s.includes(".") ? contractPrincipalCV(...s.split(".")) : standardPrincipalCV(s));
const stxOf = (who) => `(stx-get-balance '${who})`;
const ftOf = (token, who) => `(unwrap-panic (contract-call? '${token} get-balance '${who}))`;

const PROXY_SRC = `
(define-public (proxy-request)
  (contract-call? '${A} request-seat "evil" "https://evil.example" "https://evil.example/fake-seat" true))
(define-public (proxy-release)
  (contract-call? '${A} release-seat "${BUILDER}" "${REPO}" "${SEAT_URL}"))
(define-public (proxy-release-as-contract)
  (as-contract? () (try! (contract-call? '${A} release-seat "${BUILDER}" "${REPO}" "${SEAT_URL}"))))
(define-public (proxy-sweep)
  (contract-call? '${A} sweep))
(define-public (proxy-deposit)
  (contract-call? '${A} deposit-reserve u1 u0))
(define-public (proxy-reserve)
  (contract-call? '${B} claim-reserve "https://evil.example" true))
`;

async function live(addr) {
  const r = await fetch(`${BOX}/extended/v1/address/${addr}/balances`);
  const d = await r.json();
  const f = (k) => BigInt(d.fungible_tokens[k]?.balance ?? 0);
  return {
    stx: BigInt(d.stx.balance) - BigInt(d.stx.locked),
    sats: f(`${SBTC}::sbtc-token`),
    usdcx: f(`${USDCX}::usdcx-token`),
  };
}

function donorAddress(i) {
  const key = createHash("sha256").update(`kairan-v2-usdcx-donor-${i}`).digest("hex") + "01";
  return privateKeyToAddress(key, "mainnet");
}

// ---- plan -------------------------------------------------------------------
const plan = [];
const source = fs.readFileSync("./contracts/charity/kairan-seat-lab-ocifarsito-v2.clar", "utf8");
let b;

function deploy(label, deployer, name, src) {
  b.withSender(deployer).addContractDeploy({ contract_name: name, source_code: src, clarity_version: ClarityVersion.Clarity5 });
  plan.push({ kind: "deploy", label });
}
function call(label, sender, contract, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: contract, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label, expect });
}
function stxSend(label, sender, recipient, amount) {
  b.withSender(sender).addSTXTransfer({ recipient, amount: Number(amount) });
  plan.push({ kind: "tx", label, expect: "(ok true)" });
}
const usdcxSend = (label, from, to, amount) =>
  call(label, from, USDCX, "transfer", [uintCV(amount), P(from), P(to), noneCV()], "(ok true)");
function evalc(label, code, { capture, expect, on = A } = {}) {
  b.addEvalCode(on, code);
  plan.push({ kind: "eval", label, capture, expect });
}
function advance(n) {
  b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
  plan.push({ kind: "advance", label: `advance ${n} Bitcoin blocks` });
}
const has = (...parts) => (s) => parts.every((p) => s.includes(p));
const okPrefix = (s) => s.startsWith("(ok");
const status = (label, fields, on = A) => evalc(`get-status ${label}`, "(get-status)", { expect: has(...fields), on });
const deltas = []; // [label, afterKey, beforeKey, want]
function snap(tag, who, on) {
  for (const [k, a] of Object.entries(who)) {
    evalc(`${tag}: ${k} STX`, stxOf(a), { capture: `${tag}.${k}.stx`, on });
    evalc(`${tag}: ${k} sats`, ftOf(SBTC, a), { capture: `${tag}.${k}.sats`, on });
    evalc(`${tag}: ${k} USDCx`, ftOf(USDCX, a), { capture: `${tag}.${k}.usdcx`, on });
  }
}
function delta(label, k, before, after, want) {
  for (const [asset, v] of Object.entries(want)) deltas.push([`${label}: ${k} ${asset} delta`, `${after}.${k}.${asset}`, `${before}.${k}.${asset}`, v]);
}

function build(F, O, tipBurn) {
  b = SimulationBuilder.new({ stacksNodeAPI: BOX });
  const RSTX = F.stx - FEE_HEADROOM; // fundraiser's live STX -> reserve
  const RSATS = F.sats; // fundraiser's live sBTC -> reserve
  const OWN_USDCX = O.usdcx; // chavita.btc's live USDCx -> gift
  if (OWN_USDCX >= TARGET) throw new Error("chavita holds >= target");
  const REST = TARGET - OWN_USDCX;

  deploy("deploy kairan-seat-lab-ocifarsito-v2 (A, chavita.btc, Clarity 5)", DEPLOYER, NAME_A, source);
  deploy("deploy kairan-seat-lab-ocifarsito-v2-fail (B)", DEPLOYER, NAME_B, source);
  deploy("deploy kairan-seat-lab-ocifarsito-v2-late (C)", DEPLOYER, NAME_C, source);
  deploy("deploy attack contract kairan-v2-proxy", ATTACKER, "kairan-v2-proxy", PROXY_SRC);
  evalc("fork: fundraiser STX = live read", stxOf(FUNDRAISER), { expect: `u${F.stx}` });
  evalc("fork: fundraiser sats = live read", ftOf(SBTC, FUNDRAISER), { expect: `u${F.sats}` });
  evalc("fork: chavita USDCx = live read", ftOf(USDCX, DEPLOYER), { expect: `u${O.usdcx}` });
  evalc("get-terms opens with the plain lines", "(get-terms)", { expect: has("Target: 2,000 USDCx for one Kairan's Seat, newly raised. Reserve:", "Deadline: Bitcoin block 1,025,386", "The contract enforces all of this.", "courts of Delaware.") });
  evalc("get-terms: reserve inflows, sweep power, 7-day review", "(get-terms)", { expect: has("STX or sBTC sent straight to the contract is added to the reserve.", "anyone may sweep funds sent straight to the contract after the claim to LAB.", "a gift above what is still needed to reach the target is reduced to it.", "the last refunds are paid only what is left.", "at least 7 days (1,008 Bitcoin blocks) before that window ends") });
  evalc("get-donor-terms", "(get-donor-terms)", { expect: has("not in US dollars", "501(c)(3)", "Gifts are final except for the full USDCx refund", "A gift above the amount still needed to reach the target is reduced to that amount.") });
  status("A fresh", ["(closed false)", "(total u0)", `(remaining u${TARGET})`, `(deadline u${DEADLINE})`, "(claim none)"]);

  // ===== A. SUCCESS =====
  call("ATTACK STX whale deposit-reserve -> u105", STX_WHALE, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u105)");
  call("ATTACK fundraiser signs proxy-deposit -> u105", FUNDRAISER, PROXY, "proxy-deposit", [], "(err u105)");
  call("fundraiser deposit-reserve 0 0 -> u102", FUNDRAISER, A, "deposit-reserve", [uintCV(0), uintCV(0)], "(err u102)");
  call(`fundraiser deposit-reserve ${RSTX} uSTX (live minus 0.1) + ${RSATS} sats (live, full)`, FUNDRAISER, A, "deposit-reserve", [uintCV(RSTX), uintCV(RSATS)], "(ok true)");
  call("fundraiser deposit-reserve again -> u111", FUNDRAISER, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u111)");
  status("A reserve", [`(reserve-stx u${RSTX})`, `(reserve-sats u${RSATS})`, "(unrefunded u0)"]);
  call("donate terms false -> u103", DEPLOYER, A, "donate", [uintCV(1), boolCV(false)], "(err u103)");
  call(`chavita.btc donates its live ${OWN_USDCX} USDCx`, DEPLOYER, A, "donate", [uintCV(OWN_USDCX), boolCV(true)], `(ok u${OWN_USDCX})`);
  call("LAB request-seat under target -> u109", LAB, A, "request-seat", seatArgs(), "(err u109)");
  call("LAB sweep before any claim -> u116", LAB, A, "sweep", [], "(err u116)");
  call("owner sweep before any claim -> u116", DEPLOYER, A, "sweep", [], "(err u116)");
  call("donate want 0 -> u102", USDCX_WHALE, A, "donate", [uintCV(0), boolCV(true)], "(err u102)");
  const OVER = 12_345_678n;
  snap("wpre", { whale: USDCX_WHALE, c: A }, A);
  call(`CAPPED whale donates ${REST + OVER} (remaining ${REST} + ${OVER} over) -> target reached`, USDCX_WHALE, A, "donate", [uintCV(REST + OVER), boolCV(true)], `(ok u${TARGET})`);
  snap("wpost", { whale: USDCX_WHALE, c: A }, A);
  delta("capped donate", "whale", "wpre", "wpost", { usdcx: -REST });
  delta("capped donate", "c", "wpre", "wpost", { usdcx: REST });
  evalc("capped: whale gift booked = remainder only", `(get-donor '${USDCX_WHALE})`, { expect: `(some u${REST})` });
  status("A target reached", [`(total u${TARGET})`, "(remaining u0)", `(unrefunded u${TARGET})`, "(reached-at (some u"]);
  call("whale donate 1 more (nothing remains) -> u110", USDCX_WHALE, A, "donate", [uintCV(1), boolCV(true)], "(err u110)");
  usdcxSend("DIRECT usdcx transfer 7777 (not a gift)", USDCX_WHALE, A, 7_777n);
  call("owner release-seat with no receipt -> u107", DEPLOYER, A, "release-seat", receipt(), "(err u107)");
  call("ATTACK fundraiser request-seat -> u101", FUNDRAISER, A, "request-seat", seatArgs(), "(err u101)");
  call("ATTACK owner request-seat -> u101", DEPLOYER, A, "request-seat", seatArgs(), "(err u101)");
  call("ATTACK LAB signs proxy-request -> u101", LAB, PROXY, "proxy-request", [], "(err u101)");
  call("LAB request-seat empty builder -> u104", LAB, A, "request-seat", seatArgs(""), "(err u104)");
  call("LAB request-seat empty repo -> u104", LAB, A, "request-seat", seatArgs(BUILDER, ""), "(err u104)");
  call("LAB request-seat empty grant -> u104", LAB, A, "request-seat", seatArgs(BUILDER, REPO, ""), "(err u104)");
  call("LAB request-seat (bad receipt)", LAB, A, "request-seat", seatArgs(BUILDER, REPO, BAD_GRANT), "(ok true)");
  call("LAB request-seat terms false -> u103", LAB, A, "request-seat", seatArgs(BUILDER, REPO, SEAT_URL, false), "(err u103)");
  call("LAB request-seat again (replaces, accepts TERMS)", LAB, A, "request-seat", seatArgs(), "(ok true)");
  evalc("get-seat-request = new receipt", "(get-seat-request)", { expect: has(BUILDER, REPO, SEAT_URL) });
  call("SWAP owner release-seat with the old (bad) receipt -> u115", DEPLOYER, A, "release-seat", receipt(BUILDER, REPO, BAD_GRANT), "(err u115)");
  call("SWAP owner release-seat other builder -> u115", DEPLOYER, A, "release-seat", receipt("Eve", REPO, SEAT_URL), "(err u115)");
  call("SWAP owner release-seat other repo -> u115", DEPLOYER, A, "release-seat", receipt(BUILDER, "https://github.com/eve/x", SEAT_URL), "(err u115)");
  advance(A_ADVANCE_1);
  evalc(`A: failure-at - burn = ${SEAT_WINDOW - A_ADVANCE_1} after +${A_ADVANCE_1}`, "(- (failure-at) burn-block-height)", { expect: `u${SEAT_WINDOW - A_ADVANCE_1}` });
  call("LAB request-seat outside the last 1008 blocks (same receipt) -> ok", LAB, A, "request-seat", seatArgs(), "(ok true)");
  advance(A_ADVANCE_2);
  evalc(`A: failure-at - burn = 1008 after +${A_ADVANCE_2}`, "(- (failure-at) burn-block-height)", { expect: "u1008" });
  call("BOUNDARY LAB request-seat at exactly failure-at - 1008 (same receipt) -> ok", LAB, A, "request-seat", seatArgs(), "(ok true)");
  advance(A_ADVANCE_3);
  evalc(`A: failure-at - burn = 1007 after +${A_ADVANCE_3}`, "(- (failure-at) burn-block-height)", { expect: "u1007" });
  call("LATE LAB request-seat at failure-at - 1007 -> u113", LAB, A, "request-seat", seatArgs(BUILDER, REPO, BAD_GRANT), "(err u113)");
  evalc("late request did not replace the receipt", "(get-seat-request)", { expect: has(BUILDER, REPO, SEAT_URL) });
  call("ATTACK LAB release-seat -> u100", LAB, A, "release-seat", receipt(), "(err u100)");
  call("ATTACK fundraiser release-seat -> u100", FUNDRAISER, A, "release-seat", receipt(), "(err u100)");
  call("ATTACK owner signs proxy-release -> u100", DEPLOYER, PROXY, "proxy-release", [], "(err u100)");
  call("ATTACK owner signs proxy-release-as-contract -> u100", DEPLOYER, PROXY, "proxy-release-as-contract", [], "(err u100)");
  snap("apre", { lab: LAB, oci: OCIFARSITO, owner: DEPLOYER, c: A }, A);
  call("owner release-seat (reviewed receipt): LAB gets 2,000 USDCx + direct 7777 USDCx + whole reserve", DEPLOYER, A, "release-seat", receipt(),
    `(ok (tuple (sats u${RSATS}) (stx u${RSTX}) (usdcx u${TARGET + 7_777n})))`);
  snap("apost", { lab: LAB, oci: OCIFARSITO, owner: DEPLOYER, c: A }, A);
  delta("seat", "lab", "apre", "apost", { usdcx: TARGET + 7_777n, stx: RSTX, sats: RSATS });
  delta("seat", "oci", "apre", "apost", { usdcx: 0n, stx: 0n, sats: 0n });
  delta("seat", "owner", "apre", "apost", { usdcx: 0n, sats: 0n });
  delta("seat", "c", "apre", "apost", { usdcx: -(TARGET + 7_777n), stx: -RSTX, sats: -RSATS });
  evalc("get-claim seat", "(get-claim)", { expect: has('(kind "seat")', BUILDER, REPO, SEAT_URL) });
  status("A closed", ["(closed true)", `(total u${TARGET})`]);
  evalc("get-donor after the seat release: nothing owed -> (some u0)", `(get-donor '${USDCX_WHALE})`, { expect: "(some u0)" });
  evalc("get-donor never-donor after release -> none", `(get-donor '${ATTACKER})`, { expect: "none" });
  call("ATTACK owner double release-seat -> u106", DEPLOYER, A, "release-seat", receipt(), "(err u106)");
  call("fundraiser deposit-reserve after the claim -> u111 (already deposited)", FUNDRAISER, A, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u111)");
  call("owner sweep right after release (nothing left) -> u102", DEPLOYER, A, "sweep", [], "(err u102)");
  usdcxSend("LATE direct usdcx transfer 555 after the claim", USDCX_WHALE, A, 555n);
  stxSend("LATE direct STX transfer 1 STX after the claim", STX_WHALE, A, 1_000_000n);
  call("LATE direct sBTC transfer 100 sats after the claim", SBTC_WHALE, SBTC, "transfer", [uintCV(100), P(SBTC_WHALE), P(A), noneCV()], "(ok true)");
  snap("swpre", { lab: LAB, oci: OCIFARSITO, owner: DEPLOYER, atk: ATTACKER, proxy: PROXY, c: A }, A);
  call("STRANGER attacker signs proxy-sweep: LAB (only) gets the late 555 USDCx + 1 STX + 100 sats", ATTACKER, PROXY, "proxy-sweep", [], "(ok (tuple (sats u100) (stx u1000000) (usdcx u555)))");
  snap("swpost", { lab: LAB, oci: OCIFARSITO, owner: DEPLOYER, atk: ATTACKER, proxy: PROXY, c: A }, A);
  delta("sweep", "lab", "swpre", "swpost", { usdcx: 555n, stx: 1_000_000n, sats: 100n });
  delta("sweep", "oci", "swpre", "swpost", { usdcx: 0n, stx: 0n, sats: 0n });
  delta("sweep", "owner", "swpre", "swpost", { usdcx: 0n, stx: 0n, sats: 0n });
  delta("sweep", "atk", "swpre", "swpost", { usdcx: 0n, sats: 0n });
  delta("sweep", "proxy", "swpre", "swpost", { usdcx: 0n, stx: 0n, sats: 0n });
  delta("sweep", "c", "swpre", "swpost", { usdcx: -555n, stx: -1_000_000n, sats: -100n });
  call("owner sweep again -> u102", DEPLOYER, A, "sweep", [], "(err u102)");
  call("donate after close -> u106", USDCX_WHALE, A, "donate", [uintCV(1), boolCV(true)], "(err u106)");
  call("A: claim-reserve after the seat claim -> u106", LAB, A, "claim-reserve", [stringAsciiCV(POOL_URL), boolCV(true)], "(err u106)");
  call("A: refund-many after the seat claim -> u112 (window not over) / never", USDCX_WHALE, A, "refund-many", [listCV([P(DEPLOYER)])], "(err u112)");

  // ===== B. FAILURE =====
  const HOLDER_GIFT = 100_000_000n; // 100 USDCx from a real holder
  const WHALE_GIFT = 250_000_000n; // 250 USDCx from the whale
  const fresh = Array.from({ length: 248 }, (_, i) => donorAddress(i));
  const gifts = new Map([[USDCX_HOLDER, HOLDER_GIFT], [USDCX_WHALE, WHALE_GIFT]]);
  let book = 0n;
  const give = (label, who, amt) => {
    book += amt;
    call(label, who, B, "donate", [uintCV(amt), boolCV(true)], `(ok u${book})`);
  };
  give("B: real USDCx holder donates 100 USDCx", USDCX_HOLDER, HOLDER_GIFT);
  give("B: USDCx whale donates 250 USDCx", USDCX_WHALE, WHALE_GIFT);
  for (let i = 0; i < 248; i++) stxSend(`B: fund donor ${i} with 1 STX (fees)`, STX_WHALE, fresh[i], 1_000_000n);
  for (let i = 0; i < 248; i++) usdcxSend(`B: fund donor ${i} with USDCx`, USDCX_WHALE, fresh[i], BigInt(1_000_000 + i * 10_000) + (i === 7 ? 5n : 0n));
  for (let i = 0; i < 248; i++) {
    const amt = BigInt(1_000_000 + i * 10_000);
    gifts.set(fresh[i], amt);
    give(`B: donor ${i} donates ${amt}`, fresh[i], amt);
  }
  give("B: known donor 7 gives 5 more (no cap, same entry)", fresh[7], 5n);
  gifts.set(fresh[7], gifts.get(fresh[7]) + 5n);
  status("B: 250 donors booked", [`(total u${book})`, `(unrefunded u${book})`], B);
  usdcxSend("B: DIRECT usdcx transfer 4242 (not a gift)", USDCX_WHALE, B, 4_242n);
  stxSend("B: STX whale sends the fundraiser 10 STX", STX_WHALE, FUNDRAISER, 10_000_000n);
  call("B: sBTC whale sends the fundraiser 1000 sats", SBTC_WHALE, SBTC, "transfer", [uintCV(1_000), P(SBTC_WHALE), P(FUNDRAISER), noneCV()], "(ok true)");
  const all = [USDCX_HOLDER, USDCX_WHALE, ...fresh];
  const batches = [all.slice(0, 100), all.slice(100, 200), all.slice(200, 250)];
  const L = (xs) => listCV(xs.map(P));
  call("B: LAB claim-reserve before DEADLINE -> u112", LAB, B, "claim-reserve", [stringAsciiCV(POOL_URL), boolCV(true)], "(err u112)");
  call("B: refund-many before DEADLINE -> u112", USDCX_WHALE, B, "refund-many", [L(batches[0])], "(err u112)");
  call("B: LAB request-seat under target -> u109", LAB, B, "request-seat", seatArgs(), "(err u109)");
  call("B: owner sweep before any claim -> u116", DEPLOYER, B, "sweep", [], "(err u116)");

  advance(DEADLINE - tipBurn + 3 - A_ADVANCE_1 - A_ADVANCE_2 - A_ADVANCE_3); // +3: the session may pin a slightly older tip
  evalc("B: fork at or past DEADLINE", "(>= burn-block-height u1025386)", { expect: "true", on: B });
  call("B: donate after DEADLINE -> u113", USDCX_HOLDER, B, "donate", [uintCV(1), boolCV(true)], "(err u113)");
  call("B: fundraiser deposit-reserve 10 STX + 1000 sats AFTER DEADLINE (no claim yet) -> ok", FUNDRAISER, B, "deposit-reserve", [uintCV(10_000_000), uintCV(1_000)], "(ok true)");
  status("B: reserve after DEADLINE", ["(reserve-stx u10000000)", "(reserve-sats u1000)", "(reserve-deposited true)"], B);
  call("B: ATTACK owner claim-reserve -> u101", DEPLOYER, B, "claim-reserve", [stringAsciiCV(POOL_URL), boolCV(true)], "(err u101)");
  call("B: ATTACK LAB signs proxy-reserve -> u101", LAB, PROXY, "proxy-reserve", [], "(err u101)");
  call("B: LAB claim-reserve terms false -> u103", LAB, B, "claim-reserve", [stringAsciiCV(POOL_URL), boolCV(false)], "(err u103)");
  const watch = { lab: LAB, oci: OCIFARSITO, holder: USDCX_HOLDER, d0: fresh[0], d7: fresh[7], d247: fresh[247], c: B };
  snap("bpre", watch, B);
  call("B: LAB claim-reserve: reserve + only the 4242 direct USDCx (no approval)", LAB, B, "claim-reserve", [stringAsciiCV(POOL_URL), boolCV(true)],
    "(ok (tuple (sats u1000) (stx u10000000) (usdcx u4242)))");
  call("B: LAB claim-reserve twice -> u106", LAB, B, "claim-reserve", [stringAsciiCV(POOL_URL), boolCV(true)], "(err u106)");
  usdcxSend("B: LATE direct usdcx transfer 999 after the claim", USDCX_WHALE, B, 999n);
  call("B: owner sweep while gifts are unrefunded -> u116", DEPLOYER, B, "sweep", [], "(err u116)");
  let left = book;
  batches.forEach((batch, k) => {
    const want = batch.reduce((acc, w) => acc + gifts.get(w), 0n);
    left -= want;
    call(`B: refund-many call ${k + 1} of 3 (${batch.length} donors)`, k === 1 ? SBTC_WHALE : STX_WHALE, B, "refund-many", [L(batch)], `(ok u${want})`);
    status(`B: after batch ${k + 1}`, [`(unrefunded u${left})`, `(closed ${left === 0n})`], B);
    if (k === 1) call("B: owner sweep with one batch still unrefunded -> u116", DEPLOYER, B, "sweep", [], "(err u116)");
  });
  call("B: refund-many call 1 again -> no-op", STX_WHALE, B, "refund-many", [L(batches[0])], "(ok u0)");
  call("B: refund-many donor listed twice + across calls -> no-op", STX_WHALE, B, "refund-many", [L([fresh[7], fresh[7], USDCX_HOLDER, fresh[247]])], "(ok u0)");
  call("B: refund-many unknown donors -> no-op", STX_WHALE, B, "refund-many", [L([LAB, ATTACKER])], "(ok u0)");
  snap("bpost", watch, B);
  delta("reserve", "lab", "bpre", "bpost", { stx: 10_000_000n, sats: 1_000n, usdcx: 4_242n });
  delta("none to Ocifarsito", "oci", "bpre", "bpost", { usdcx: 0n, stx: 0n, sats: 0n });
  delta("refund", "holder", "bpre", "bpost", { usdcx: HOLDER_GIFT });
  delta("refund", "d0", "bpre", "bpost", { usdcx: 1_000_000n });
  delta("refund", "d7", "bpre", "bpost", { usdcx: 1_070_005n });
  delta("refund", "d247", "bpre", "bpost", { usdcx: 3_470_000n });
  delta("refund", "c", "bpre", "bpost", { usdcx: -(book + 4_242n) + 999n, stx: -10_000_000n, sats: -1_000n });
  status("B: closed", ["(closed true)", "(unrefunded u0)", "(usdcx-balance u999)"], B);
  call("B: STRANGER STX whale sweep after refunds: LAB gets the late 999 USDCx", STX_WHALE, B, "sweep", [], "(ok (tuple (sats u0) (stx u0) (usdcx u999)))");
  snap("bsw", { lab: LAB, c: B }, B);
  delta("B sweep", "lab", "bpost", "bsw", { usdcx: 999n, stx: 0n, sats: 0n });
  delta("B sweep", "c", "bpost", "bsw", { usdcx: -999n });
  call("B: owner sweep again -> u102", DEPLOYER, B, "sweep", [], "(err u102)");

  // ===== C. LATE: deposit after a claim =====
  status("C: refunds open, nothing raised", ["(total u0)", "(refunds-open true)", "(reserve-deposited false)"], C);
  call("C: owner sweep before any claim -> u116", DEPLOYER, C, "sweep", [], "(err u116)");
  call("C: LAB claim-reserve (empty)", LAB, C, "claim-reserve", [stringAsciiCV(POOL_URL), boolCV(true)], "(ok (tuple (sats u0) (stx u0) (usdcx u0)))");
  call("C: fundraiser deposit-reserve after the claim -> u106", FUNDRAISER, C, "deposit-reserve", [uintCV(1), uintCV(0)], "(err u106)");
  status("C: no reserve", ["(reserve-stx u0)", "(reserve-deposited false)", "(closed true)"], C);
  call("C: owner sweep with nothing -> u102", DEPLOYER, C, "sweep", [], "(err u102)");
  evalc("proxy got nothing", stxOf(PROXY), { expect: "u0" });
}

// ---- decode -----------------------------------------------------------------
function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return { str: `<no tx result: ${JSON.stringify(s).slice(0, 200)}>`, events: [], cost: null };
  if ("Err" in r) return { str: `ENGINE-ERR: ${String(r.Err).slice(0, 200)}`, events: [], cost: null };
  let str;
  try { str = cvToString(deserializeCV(r.Ok.result)); } catch (e) { str = `decode-failed(${r.Ok.result})`; }
  const evs = (r.Ok.events ?? r.Ok.receipt?.events ?? []).map((e) => (typeof e === "string" ? JSON.parse(e) : e)).filter((e) => e.committed !== false);
  const events = evs.map((e) => {
    if (e.contract_event) { try { return `print ${cvToString(deserializeCV(e.contract_event.raw_value))}`; } catch { return "print <?>"; } }
    if (e.stx_transfer_event) return `stx ${e.stx_transfer_event.amount} ${e.stx_transfer_event.sender} -> ${e.stx_transfer_event.recipient}`;
    if (e.ft_transfer_event) return `ft ${e.ft_transfer_event.amount} ${e.ft_transfer_event.sender} -> ${e.ft_transfer_event.recipient}`;
    return Object.keys(e).join(",");
  });
  return { str, events, cost: r.Ok.execution_cost ?? r.Ok.cost ?? null };
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval result>";
  if (!("Ok" in r)) return `ERR: ${r.Err}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}
const U = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-999999999");
const check = (want, got) => (typeof want === "function" ? want(got) : got === want);

async function main() {
  console.log("=== kairan-seat-lab-ocifarsito-v2 SELF-VERIFYING stxer harness ===\n");
  const F = await live(FUNDRAISER);
  const O = await live(DEPLOYER);
  const tipBurn = (await (await fetch(`${BOX}/v2/info`)).json()).burn_block_height;
  console.log(`fundraiser live: ${F.stx} uSTX, ${F.sats} sats; chavita USDCx ${O.usdcx}; tip burn ${tipBurn}\n`);
  build(F, O, tipBurn);
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted ${plan.length} steps. Fetching results...\n${url}\n`);
  const res = await getSimulationResult(sessionId);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(res, null, 1));
  const cap = {};
  let pass = 0, fail = 0;
  const fails = [];
  const quiet = (label) => /fund donor|donor \d+ donates/.test(label);
  plan.forEach((p, i) => {
    const s = res.steps[i];
    if (p.kind === "deploy") {
      const r = s?.Result?.Transaction;
      const ok = r && !("Err" in r) && decodeTx(s).str.startsWith("(ok");
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label} -> ${decodeTx(s).str}`);
      ok ? pass++ : (fail++, fails.push(p.label));
    } else if (p.kind === "tx") {
      const d = decodeTx(s);
      const ok = check(p.expect, d.str);
      if (!ok || !quiet(p.label)) {
        console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}\n        got ${d.str}${ok ? "" : `  EXPECTED ${typeof p.expect === "function" ? "<predicate>" : p.expect}`}`);
        if (/refund-many call \d|release-seat:|claim-reserve:/.test(p.label) && d.cost) console.log(`          cost: ${JSON.stringify(d.cost)}`);
        if (!/refund-many/.test(p.label)) for (const e of d.events) console.log(`          ev: ${e}`);
      }
      ok ? pass++ : (fail++, fails.push(p.label));
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) cap[p.capture] = v;
      if (p.expect !== undefined) {
        const ok = check(p.expect, v);
        console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}: ${v.length > 300 ? v.slice(0, 300) + "..." : v}`);
        ok ? pass++ : (fail++, fails.push(p.label));
      }
    } else if (p.kind === "advance") {
      const ok = !!s?.Result?.AdvanceBlocks?.Ok;
      console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}${ok ? "" : ` ${JSON.stringify(s).slice(0, 200)}`}`);
      ok ? pass++ : (fail++, fails.push(p.label));
    }
  });
  console.log("\n--- balance deltas ---");
  for (const [label, a, bk, want] of deltas) {
    const got = U(cap[a]) - U(cap[bk]);
    const ok = got === want;
    console.log(`${ok ? "PASS" : "FAIL"} ${label} = ${got} (want ${want})`);
    ok ? pass++ : (fail++, fails.push(label));
  }
  console.log(`\n=== ${pass}/${pass + fail} passed, ${fail} failed ===`);
  if (fails.length) console.log("FAILED:\n  " + fails.join("\n  "));
  console.log(`View: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
