// verify-v6-3-keeper-settle-deployed.js
// Proof for the faktory-dao settle keeper (backend/server/utils/jing-settle-keeper.ts,
// route /api/bot/settle-jing-v6-3) on a mainnet fork of the LIVE deployed set:
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3 (initialized, empty book)
//   SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v6
// Nothing is deployed. The keeper txs are built by the SAME module the backend
// signs with: faktory-dao/backend/server/utils/jing-settle-args.ts
// (settleFnName + settleArgs), sent by the deployer (account 0 = the keeper).
//   K0  empty book: A rests an ask directly (opposite side empty -> placed now)
//   K1  S submits a bid: the ask side is live, so it escrows a PENDING deposit
//       (pending getter some, no live deposit yet)
//   K2  keeper settle-token-y-deposit(S) -> placed, pending gone, live = amount
//   K3  the same settle again -> (err u1030) ERR_NOTHING_PENDING (idempotent: a
//       second keeper, or a race, only loses its fee)
//   K4  A reprices with set-token-x-limit: the bid side is live -> (ok false), a
//       PENDING limit; keeper settle-token-x-limit(A) -> (ok true), order limit moved
//   K5  S submits a second bid while the first is live (top-up), then cancels
//       before the keeper runs: cancel returns pending + live; the keeper's settle
//       then meets (err u1030)
// Run: npx tsx simulations/verify-v6-3-keeper-settle-deployed.js
//   (PYTH_API_KEY optional: without it the update comes through the faktory-dao backend)
import {
  uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, noneCV,
  deserializeCV, cvToString, hexToCV, cvToHex,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import { fetchLazerUpdateAny, lazerFeedTimes } from "./_lazer.js";
// faktory-dao/backend is CommonJS, so tsx hands the module over as `default`.
const keeperArgs = await import("../../faktory-dao/backend/server/utils/jing-settle-args.ts");
const { settleArgs, settleFnName } = keeperArgs.settleArgs ? keeperArgs : keeperArgs.default;

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const KEEPER = DEP; // account 0 of DEPLOYER_MNEMONIC, what the backend signs with
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`;
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC whale: the ask
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX whale: the bid
const PP = 100_000_000n, BPS = 10_000n;
const AX = 20_000n;          // sats
const SY = 50_000_000n;      // 50 STX
const SY2 = 5_000_000n;      // 5 STX top-up

let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 200)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 160)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } }).filter(Boolean);
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
// The keeper module builds args with faktory-dao's own @stacks/transactions
// copy: round-trip through hex so the stxer builder gets local CV objects.
const local = (cvs) => cvs.map((cv) => hexToCV(cvToHex(cv)));

async function main() {
  console.log("=== v6-3 settle keeper on the LIVE deployed market (fork, nothing deployed) ===");
  const lz = await fetchLazerUpdateAny();
  const times = await lazerFeedTimes(lz.hex);
  const UPD = bufferCV(Buffer.from(lz.hex.replace(/^0x/, ""), "hex"));
  const MID = (lz.px * PP) / lz.py;
  console.log(`mid ${MID}, oldest feed at ${times.at} (${new Date(times.at * 1000).toISOString()})`);
  const askLimit = (MID * (BPS + 1_000n)) / BPS;   // +10%: never crosses
  const askLimit2 = (MID * (BPS + 800n)) / BPS;    // +8%
  const bidLimit = (MID * (BPS - 1_000n)) / BPS;   // -10%

  const keeperCall = (who, side, kind) => (bb) => bb.withSender(KEEPER).addContractCall({
    contract_id: MARKET, function_name: settleFnName(side, kind), function_args: local(settleArgs({ who, side, kind }, lz.hex)),
  });

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: MARKET, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want) => { b = b.addEvalCode(MARKET, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };

  ev("K0 book empty: bids", "(len (get-token-y-depositors (get-current-cycle)))", "u0");
  ev("K0 book empty: asks", "(len (get-token-x-depositors (get-current-cycle)))", "u0");
  tx("K0 A deposit-token-x placed now (no update arg)", call(A, "deposit-token-x", [uintCV(AX), uintCV(askLimit), noneCV(), sbtcT, sbtcA]), `(ok u${AX})`);
  ev("K0 A live ask", `(get-token-x-deposit (get-current-cycle) '${A})`, `u${AX}`);
  ev("K0 A no pending", `(get-token-x-pending-deposit '${A})`, "none");

  const k1 = tx("K1 S deposit-token-y -> pending", call(S, "deposit-token-y", [uintCV(SY), uintCV(bidLimit), noneCV(), wstxT, wstxA]), `(ok u${SY})`);
  ev("K1 S pending deposit", `(get-token-y-pending-deposit '${S})`, (v) => String(v).includes(`(amount u${SY})`) && String(v).includes(`(limit u${bidLimit})`));
  ev("K1 S no live bid yet", `(get-token-y-deposit (get-current-cycle) '${S})`, "u0");

  const k2 = tx("K2 keeper settle-token-y-deposit(S)", keeperCall(S, "y", "deposit"), (v) => String(v).startsWith("(ok"));
  ev("K2 S pending cleared", `(get-token-y-pending-deposit '${S})`, "none");
  ev("K2 S live bid = amount", `(get-token-y-deposit (get-current-cycle) '${S})`, `u${SY}`);
  ev("K2 S order limit", `(get-token-y-order '${S})`, (v) => String(v).includes(`(limit u${bidLimit})`));

  tx("K3 same settle again -> u1030", keeperCall(S, "y", "deposit"), "(err u1030)");

  tx("K4 A set-token-x-limit -> pending (ok false)", call(A, "set-token-x-limit", [uintCV(askLimit2), noneCV()]), "(ok false)");
  ev("K4 A pending limit", `(get-token-x-pending-limit '${A})`, (v) => String(v).includes(`(limit u${askLimit2})`));
  const k4 = tx("K4 keeper settle-token-x-limit(A)", keeperCall(A, "x", "limit"), "(ok true)");
  ev("K4 A pending limit cleared", `(get-token-x-pending-limit '${A})`, "none");
  ev("K4 A order limit moved", `(get-token-x-order '${A})`, (v) => String(v).includes(`(limit u${askLimit2})`));
  tx("K4 settle limit again -> u1030", keeperCall(A, "x", "limit"), "(err u1030)");

  tx("K5 S top-up -> pending", call(S, "deposit-token-y", [uintCV(SY2), uintCV(bidLimit), noneCV(), wstxT, wstxA]), `(ok u${SY2})`);
  ev("K5 S pending top-up", `(get-token-y-pending-deposit '${S})`, (v) => String(v).includes(`(amount u${SY2})`));
  const k5c = tx("K5 S cancel returns pending + live", call(S, "cancel-token-y-deposit", [wstxT, wstxA]), (v) => String(v).startsWith("(ok"));
  ev("K5 S pending cleared by cancel", `(get-token-y-pending-deposit '${S})`, "none");
  tx("K5 keeper settle after cancel -> u1030", keeperCall(S, "y", "deposit"), "(err u1030)");

  const id = await b.run();
  console.log(`stxer https://stxer.xyz/simulations/mainnet/${id}`);
  let res;
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`https://api.stxer.xyz/devtools/v2/simulations/${id}`);
    if (r.ok) { res = await r.json(); if ((res?.steps?.length ?? 0) >= steps.length) break; }
    await new Promise((rr) => setTimeout(rr, 2000));
  }
  const raw = res?.steps ?? [];
  steps.forEach((s, i) => { s.raw = raw[i]; s.value = s.kind === "tx" ? decodeTx(raw[i]) : decodeEval(raw[i]); check(s.label, s.value, s.want); });

  const k1p = prints(k1.raw).join(" | ");
  check("K1 print pending-deposit-y from jing-core-v6", k1p, (v) => v.includes('(event "pending-deposit-y")') && v.includes(`(submitted-at u`));
  const k2p = prints(k2.raw).join(" | ");
  check("K2 print deposit-y (placed)", k2p, (v) => v.includes('(event "deposit-y")') && v.includes(`(depositor ${S})`));
  check("K4 print limit-x", prints(k4.raw).join(" | "), (v) => v.includes('(event "limit-x")'));
  check("K5 cancel refund = pending + live", decodeTx(k5c.raw), (v) => uintOf(v) === SY + SY2);
  check("K5 print pending-refund-y reason cancel", prints(k5c.raw).join(" | "), (v) => v.includes('(event "pending-refund-y")') && v.includes('(reason "cancel")'));
  console.log(`\n${checks - failures}/${checks} checks passed  (sim ${id})`);
  if (failures) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
