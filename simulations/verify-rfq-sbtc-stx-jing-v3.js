// verify-rfq-sbtc-stx-jing-v3.js
// SELF-VERIFYING stxer mainnet-fork harness for rfq-sbtc-stx-jing-v3 (no
// on-chain oracle): client-signed quoted-out +/- 20bps drift, client-set
// min-stx-out, TCA reference benchmark (fresh <120s), MM whitelist. The
// fat-finger screen lives in the signing frontend, so unlike v2 there is NO
// price band: a deep-discount or overpaid quote the client signed goes
// through (documented below as positive cases).
//
// Run: npx tsx simulations/verify-rfq-sbtc-stx-jing-v3.js
import {
  uintCV,
  bufferCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  trueCV,
  falseCV,
  deserializeCV,
  cvToString,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import fs from "node:fs";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1,
  SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN, USDCX_FQN,
  buildRfqAuthHashHexV3, signIntent,
  TEST_INTENT_PRIVKEY, WRONG_INTENT_PRIVKEY,
} from "./_setup.js";

const OWNER_PRIVKEY = "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");

const CORE = "jing-core-v2";
const MARKET = "rfq-sbtc-stx-jing-v3";
const CID = `${DEPLOYER}.${MARKET}`;
const CORE_ID = `${DEPLOYER}.${CORE}`;
const marketCV = contractPrincipalCV(DEPLOYER, MARKET);

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");
const MM = STX_DEPOSITOR_1;              // winning MM: STX whale, impersonated
const mmCV = standardPrincipalCV(MM);

const SBTC_IN = 200_000n;                // 0.002 BTC
const MAX_PREMIUM_BPS = 2000n;           // signed tolerance (recorded, not banded)
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";
// v3 has no on-chain price source; this is only used to size test quotes to
// realistic magnitudes (~280k STX/BTC as of 2026-07). Nothing checks it.
const REF_PRICE = 28_000_000_000_000n;

const coreSrc = fs.readFileSync(new URL(`../contracts/rfq/deploying/${CORE}.clar`, import.meta.url), "utf8");
const mktSrc = fs.readFileSync(new URL(`../contracts/rfq/${MARKET}.clar`, import.meta.url), "utf8");

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const balStx = (a) => `(stx-get-balance '${a})`;
const balSbtc = (a) => `(contract-call? '${SBTC_FQN} get-balance '${a})`;
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}

// ---------- phase 1: probe the tip time (for ref freshness windows) ----------
async function probe() {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
    .withSender(DEPLOYER)
    .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
    .addContractDeploy({ contract_name: MARKET, source_code: mktSrc });
  pb.addEvalCode(CID, "stacks-block-time");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const tipTime = uintFrom(decodeEval(res.steps[2]));
  if (tipTime <= 0n) throw new Error(`probe failed: tipTime=${tipTime}`);
  return { tipTime };
}

async function main() {
  console.log("=== rfq-sbtc-stx-jing-v3 SELF-VERIFYING stxer harness ===\n");
  console.log(`client (synthetic) = ${CLIENT}`);
  console.log(`mm (winner)        = ${MM}\n`);

  const { tipTime } = await probe();
  console.log(`probe: tip time=${tipTime}\n`);

  // Quote sizing off the fixed reference (nothing on-chain bands it).
  const mid = (SBTC_IN * REF_PRICE) / 10_000_000_000n;     // uSTX
  const cOk = (mid * 9950n) / 10000n;                      // 0.5% under mid
  const cLow = (mid * 7500n) / 10000n;                     // 25% under: v3 accepts if signed
  const cHigh = (mid * 12500n) / 10000n;                   // 25% over: v3 accepts if signed
  const cDriftLow = (cOk * 9900n) / 10000n;                // 100bps under quote
  const cDriftHigh = (cOk * 10100n) / 10000n;              // 100bps over quote
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  const refOk = tipTime - 30n;                             // fresh
  const refStale = tipTime - 400n;                         // > MAX_REF_STALENESS 120
  const refFuture = tipTime + 3600n;                       // future
  console.log(`mid=${mid} cOk=${cOk} fee=${fee} net=${clientReceives} refOk=${refOk}\n`);

  // Signatures: tuple binds rfq-id, winner, quoted-out, ref fields, premium, expiry.
  const sig = (rfqId, quotedOut, over = {}) => signIntent(
    buildRfqAuthHashHexV3({
      market: marketCV, rfqId, winner: mmCV, quotedOut,
      refPrice: over.refPrice ?? REF_PRICE, refTimestamp: over.refTs ?? refOk,
      refVenue: REF_VENUE, maxPremiumBps: over.premium ?? MAX_PREMIUM_BPS,
      authExpiry: over.expiry ?? AUTH_BIG,
    }, CHAIN),
    over.key ?? TEST_INTENT_PRIVKEY
  );
  const hashOk = buildRfqAuthHashHexV3({
    market: marketCV, rfqId: 0, winner: mmCV, quotedOut: cOk,
    refPrice: REF_PRICE, refTimestamp: refOk, refVenue: REF_VENUE,
    maxPremiumBps: MAX_PREMIUM_BPS, authExpiry: AUTH_BIG,
  }, CHAIN);
  const sigOk = signIntent(hashOk, TEST_INTENT_PRIVKEY);
  const sigWrong = signIntent(hashOk, WRONG_INTENT_PRIVKEY);
  const sigExp = sig(0, cOk, { expiry: 1 });
  const sigFat = sig(0, cOk, { premium: 2001 });
  const sigOk2 = sig(2, cOk);
  const sigOk3 = sig(3, cOk);
  const sigZero4 = sig(4, 0);
  const sigLow6 = sig(5, cLow);   // "rfq6" label opens as on-chain id 5
  const sigHigh7 = sig(6, cHigh); // "rfq7" label opens as on-chain id 6
  const sigOk8 = sig(7, cOk);     // "rfq8" label opens as on-chain id 7

  // ---------- build the main run ----------
  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  function call(label, sender, fn, args, expect) {
    b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  }
  function callExt(label, sender, cid, fn, args, expect) {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  }
  function evalc(label, code, capture) {
    b.addEvalCode(CID, code);
    plan.push({ kind: "eval", label, capture });
  }
  function advance(n) {
    b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: 1 });
    plan.push({ kind: "advance", label: `advance ${n} burn blocks` });
  }
  // fix-price v3: same 9 args as v2 (signature shape unchanged)
  function fixArgs(id, committed, quoted, sigHex, over = {}) {
    return [uintCV(id), uintCV(committed), uintCV(quoted),
      uintCV(over.refPrice ?? REF_PRICE), uintCV(over.refTs ?? refOk),
      stringAsciiCV(over.venue ?? REF_VENUE),
      uintCV(over.premium ?? MAX_PREMIUM_BPS), uintCV(over.expiry ?? AUTH_BIG), bv(sigHex)];
  }
  const openArgs = (mo) => [uintCV(SBTC_IN), uintCV(mo ?? minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const ffArgs = (id) => [uintCV(id), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];

  // ---- registry prelude (both Clarity 5) ----
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc });
  plan.push({ kind: "deploy", label: `deploy ${CORE}` });
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc });
  plan.push({ kind: "deploy", label: `deploy ${MARKET}` });
  callExt("jing-core-v2.set-verified-contract", DEPLOYER, CORE_ID, "set-verified-contract", [marketCV], null);
  call("initialize", DEPLOYER, "initialize",
    [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0)], null);

  // ---- parity: on-chain build-auth-hash == JS mirror ----
  evalc("build-auth-hash parity",
    `(build-auth-hash u0 '${MM} u${cOk} u${REF_PRICE} u${refOk} "${REF_VENUE}" u${MAX_PREMIUM_BPS} u${AUTH_BIG})`,
    "PARITY");

  // ---- fund client ----
  callExt("fund client sBTC", SBTC_DEPOSITOR_1, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(CLIENT), noneCV()], null);

  // ============ rfq 0: reverts then happy path ============
  call("open rfq0", CLIENT, "open-rfq", openArgs(), "(ok u0)");

  // ---- whitelist gate (rfq must exist: the map unwrap fires before the
  //      whitelist assert, so a missing rfq is u2001 not u2015) ----
  call("fix missing rfq -> ERR_RFQ_NOT_FOUND", MM, "fix-price", fixArgs(999, cOk, cOk, sigOk), "(err u2001)");
  call("fix before whitelist -> ERR_NOT_WHITELISTED", MM, "fix-price", fixArgs(0, cOk, cOk, sigOk), "(err u2015)");
  call("set-mm-whitelist by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-mm-whitelist",
    [mmCV, trueCV()], "(err u1011)");
  call("set-mm-whitelist MM true -> ok", DEPLOYER, "set-mm-whitelist", [mmCV, trueCV()], "(ok true)");
  evalc("is-whitelisted-mm", `(is-whitelisted-mm '${MM})`, "WL");

  call("fix expired-auth -> ERR_AUTH_EXPIRED", MM, "fix-price", fixArgs(0, cOk, cOk, sigExp, { expiry: 1 }), "(err u2008)");
  call("fix premium > cap -> ERR_PREMIUM_TOO_HIGH", MM, "fix-price", fixArgs(0, cOk, cOk, sigFat, { premium: 2001 }), "(err u2005)");
  call("fix ref-price 0 -> ERR_BAD_REFERENCE", MM, "fix-price", fixArgs(0, cOk, cOk, sigOk, { refPrice: 0 }), "(err u2016)");
  call("fix empty ref-venue -> ERR_BAD_REFERENCE", MM, "fix-price", fixArgs(0, cOk, cOk, sigOk, { venue: "" }), "(err u2016)");
  call("fix ref future -> ERR_BAD_REFERENCE", MM, "fix-price", fixArgs(0, cOk, cOk, sigOk, { refTs: refFuture }), "(err u2016)");
  call("fix ref stale -> ERR_STALE_PRICE", MM, "fix-price", fixArgs(0, cOk, cOk, sigOk, { refTs: refStale }), "(err u1005)");
  call("fix bad-sig -> ERR_BAD_AUTH", MM, "fix-price", fixArgs(0, cOk, cOk, sigWrong), "(err u2007)");
  call("fix drift-low -> ERR_QUOTE_DRIFT", MM, "fix-price", fixArgs(0, cDriftLow, cOk, sigOk), "(err u2014)");
  call("fix drift-high -> ERR_QUOTE_DRIFT", MM, "fix-price", fixArgs(0, cDriftHigh, cOk, sigOk), "(err u2014)");

  evalc("client STX before", balStx(CLIENT), "C_STX_0");
  evalc("mm sBTC before", balSbtc(MM), "M_SBTC_0");
  evalc("treasury STX before", balStx(DEPLOYER), "T_STX_0");

  call("fix-price valid -> ok", MM, "fix-price", fixArgs(0, cOk, cOk, sigOk), null);
  call("fulfill wrong-winner -> ERR_NOT_WINNER", DEPLOYER, "fulfill", ffArgs(0), "(err u2013)");
  call("fulfill -> ok", MM, "fulfill", ffArgs(0), null);

  evalc("client STX after", balStx(CLIENT), "C_STX_1");
  evalc("mm sBTC after", balSbtc(MM), "M_SBTC_1");
  evalc("treasury STX after", balStx(DEPLOYER), "T_STX_1");

  // ============ rfq 1: reclaim path ============
  call("open rfq1 (for reclaim)", CLIENT, "open-rfq", openArgs(), "(ok u1)");
  call("reclaim before expiry -> ERR_NOT_EXPIRED", DEPLOYER, "reclaim", ffArgs(1), "(err u2004)");

  // ============ rfq 2: already-fixed guard ============
  call("open rfq2", CLIENT, "open-rfq", openArgs(), "(ok u2)");
  call("fix rfq2 valid -> ok", MM, "fix-price", fixArgs(2, cOk, cOk, sigOk2), null);
  call("fix rfq2 again -> ERR_ALREADY_FIXED", MM, "fix-price", fixArgs(2, cOk, cOk, sigOk2), "(err u2011)");

  // ============ rfq 3: min-stx-out guard (opened at min-out == mid) ============
  call("open rfq3 (min-out = mid)", CLIENT, "open-rfq", openArgs(mid), "(ok u3)");
  call("fix rfq3 under min-out -> ERR_BELOW_MIN_OUT", MM, "fix-price", fixArgs(3, cOk, cOk, sigOk3), "(err u2006)");

  // ============ rfq 4: quoted-out 0 now dies at min-stx-out (v2: native floor) ============
  call("open rfq4", CLIENT, "open-rfq", openArgs(), "(ok u4)");
  call("fix quoted 0 -> ERR_BELOW_MIN_OUT", MM, "fix-price", fixArgs(4, 0, 0, sigZero4), "(err u2006)");

  // ============ rfq 6/7: NO BAND -- signed off-market quotes go through ============
  // This is the v3 design decision made explicit: the client's signature (plus
  // the FE screen that produced it) is the only price protection. A 25%-under
  // or 25%-over quote the client signed fixes fine.
  call("open rfq6 (deep discount)", CLIENT, "open-rfq", openArgs(), "(ok u5)");
  call("open rfq7 (overpay)", CLIENT, "open-rfq", openArgs(), "(ok u6)");

  // ============ de-whitelist blocks new fixes ============
  call("set-mm-whitelist MM false -> ok", DEPLOYER, "set-mm-whitelist", [mmCV, falseCV()], "(ok true)");
  call("fix rfq4 de-whitelisted -> ERR_NOT_WHITELISTED", MM, "fix-price", fixArgs(4, cOk, cOk, sigZero4), "(err u2015)");
  call("re-whitelist MM -> ok", DEPLOYER, "set-mm-whitelist", [mmCV, trueCV()], "(ok true)");

  // ============ admin + guard reverts ============
  call("set-treasury by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-treasury",
    [standardPrincipalCV(CLIENT)], "(err u1011)");
  call("set-paused by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-paused", [trueCV()], "(err u1011)");
  call("set-operator by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-operator",
    [standardPrincipalCV(CLIENT)], "(err u1011)");
  call("set-min-sbtc-in by non-op -> ERR_NOT_AUTHORIZED", CLIENT, "set-min-sbtc-in", [uintCV(1)], "(err u1011)");

  call("initialize again -> ERR_ALREADY_INITIALIZED", DEPLOYER, "initialize",
    [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0)], "(err u1018)");
  call("fulfill missing rfq -> ERR_RFQ_NOT_FOUND", MM, "fulfill", ffArgs(999), "(err u2001)");
  call("reclaim fulfilled rfq0 -> ERR_RFQ_CLOSED", DEPLOYER, "reclaim", ffArgs(0), "(err u2002)");
  call("fulfill rfq4 before fix -> ERR_NOT_FIXED", MM, "fulfill", ffArgs(4), "(err u2012)");

  call("set-paused true -> ok", DEPLOYER, "set-paused", [trueCV()], null);
  call("open while paused -> ERR_PAUSED", CLIENT, "open-rfq", openArgs(), "(err u1010)");
  call("fix while paused -> ERR_PAUSED", MM, "fix-price", fixArgs(4, cOk, cOk, sigZero4), "(err u1010)");
  call("set-paused false -> ok", DEPLOYER, "set-paused", [falseCV()], null);

  // no-band positive cases (fixed while un-paused, before expiry)
  call("fix rfq6 25% UNDER mid -> ok (no floor in v3)", MM, "fix-price", fixArgs(5, cLow, cLow, sigLow6), null);
  call("fix rfq7 25% OVER mid -> ok (no ceiling in v3)", MM, "fix-price", fixArgs(6, cHigh, cHigh, sigHigh7), null);

  call("set-min-sbtc-in 250000 -> ok", DEPLOYER, "set-min-sbtc-in", [uintCV(250_000)], null);
  call("open below min-sbtc-in -> ERR_AMOUNT_TOO_SMALL", CLIENT, "open-rfq", openArgs(), "(err u1001)");
  call("set-min-sbtc-in 0 -> ok", DEPLOYER, "set-min-sbtc-in", [uintCV(0)], null);
  call("open zero min-out -> ERR_AMOUNT_TOO_SMALL", CLIENT, "open-rfq", openArgs(0n), "(err u1001)");
  call("open wrong-trait -> ERR_WRONG_TRAIT", CLIENT, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(USDCX_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(err u1019)");

  // ============ open-expiry: fix dies, reclaim works ============
  call("open rfq8 (for expired)", CLIENT, "open-rfq", openArgs(), "(ok u7)");
  advance(7);
  call("fix after open-expiry -> ERR_EXPIRED", MM, "fix-price", fixArgs(7, cOk, cOk, sigOk8), "(err u2003)");
  call("reclaim rfq1 after expiry -> ok", DEPLOYER, "reclaim", ffArgs(1), `(ok u${SBTC_IN})`);
  // rfq2 is FIXED but never fulfilled: client can still reclaim after expiry
  // (the MM who fixed and walked eats their own orphaned hedge)
  call("reclaim FIXED-unfulfilled rfq2 -> ok", DEPLOYER, "reclaim", ffArgs(2), `(ok u${SBTC_IN})`);
  call("reclaim rfq3 after expiry -> ok", DEPLOYER, "reclaim", ffArgs(3), `(ok u${SBTC_IN})`);
  call("reclaim rfq4 after expiry -> ok", DEPLOYER, "reclaim", ffArgs(4), `(ok u${SBTC_IN})`);
  call("reclaim FIXED-unfulfilled rfq6 -> ok", DEPLOYER, "reclaim", ffArgs(5), `(ok u${SBTC_IN})`);
  call("reclaim FIXED-unfulfilled rfq7 -> ok", DEPLOYER, "reclaim", ffArgs(6), `(ok u${SBTC_IN})`);
  call("reclaim rfq8 after expiry -> ok", DEPLOYER, "reclaim", ffArgs(7), `(ok u${SBTC_IN})`);
  evalc("contract sBTC after full drain", balSbtc(CID), "CONTRACT_SBTC");

  // ============ run + verify ============
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;

  res.steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      if (p.expect === null) {
        const ok = got.startsWith("(ok");
        console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${got}`); ok ? pass++ : fail++;
      } else {
        const ok = got === p.expect;
        console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
      }
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    } else if (p.kind === "advance") {
      console.log(`⏩ [${i}] ${p.label}`);
    }
  });

  console.log("\n--- assertions ---");
  const assert = (label, ok, detail = "") => {
    console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` ${detail}` : ""}`); ok ? pass++ : fail++;
  };

  assert("build-auth-hash parity", String(cap.PARITY).toLowerCase() === `0x${hashOk}`.toLowerCase(),
    `(js=0x${hashOk} chain=${cap.PARITY})`);
  assert("is-whitelisted-mm true", String(cap.WL) === "true");

  const deltas = [
    ["client STX +net", cap.C_STX_1, cap.C_STX_0, clientReceives],
    ["mm sBTC +sbtc-in", cap.M_SBTC_1, cap.M_SBTC_0, SBTC_IN],
    ["treasury STX +fee", cap.T_STX_1, cap.T_STX_0, fee],
  ];
  for (const [label, after, before, want] of deltas) {
    const got = uintFrom(after) - uintFrom(before);
    assert(`${label} delta=${got}`, got === want, `(want ${want})`);
  }
  assert("no sBTC stuck in contract after full drain", uintFrom(cap.CONTRACT_SBTC) === 0n,
    `(${cap.CONTRACT_SBTC})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
