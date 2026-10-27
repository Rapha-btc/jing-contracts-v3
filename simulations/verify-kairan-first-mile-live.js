// verify-kairan-first-mile-live.js
// stxer mainnet-fork run of the real flow on the DEPLOYED contract
// SPV9K21….kairans-first-mile-lab-ocifarsito (no deploy step):
//  1. owner release before any request -> u107; LAB requests on the empty
//     contract (ok), then replaces its description (ok).
//  2. the fundraiser deposits its live STX (minus 1 STX for fees) and all its
//     live sBTC, Deny-mode PCs pinning its exact outflow.
//  3. owner release with the old description -> u115; with LAB's current one
//     (Deny mode, contract sends at least the deposit) -> ok, LAB gets the
//     whole balance; get-claim records it; a second release -> u106.
// Run: npx tsx simulations/verify-kairan-first-mile-live.js
import {
  uintCV,
  boolCV,
  stringAsciiCV,
  deserializeCV,
  cvToString,
  deserializeTransaction,
  PostConditionMode,
  createLPList,
  postConditionToWire,
  Pc,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";

// ---- Deny-mode post-conditions: re-encode marked steps before submit -------
const pcSteps = new Map(); // plan index -> { fn, pcs }
{
  const inner = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST" && /\/devtools\/v2\/simulations\/[0-9a-f]+$/.test(String(url)) && typeof init.body === "string" && pcSteps.size) {
      const body = JSON.parse(init.body);
      if (Array.isArray(body?.steps) && body.steps.length === plan.length) {
        for (const [i, { fn, pcs }] of pcSteps) {
          const st = body.steps[i];
          const tx = deserializeTransaction(st.Transaction);
          if (tx.payload.functionName?.content !== fn) throw new Error(`PC step ${i}: expected ${fn}`);
          tx.postConditionMode = PostConditionMode.Deny;
          tx.postConditions = createLPList(pcs.map(postConditionToWire));
          st.Transaction = tx.serialize();
        }
        init = { ...init, body: JSON.stringify(body) };
      }
    }
    return inner(url, init);
  };
}

const OWNER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // chavita.btc
const C = `${OWNER}.kairans-first-mile-lab-ocifarsito`;
const LAB = "SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF";
const FUNDRAISER = "SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F";
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const FEE_HEADROOM = 1_000_000n;
const D1 = "LAB Builder Fund: first draft of how the First Mile reserve will be used";
const D2 = "LAB Builder Fund: one developer scholarship in Lagos (stipend, laptop, data), crediting ocifarsito.com";
const API = process.env.STACKS_API_URL || "https://api.hiro.so";

const stxOf = (w) => `(stx-get-balance '${w})`;
const ftOf = (w) => `(unwrap-panic (contract-call? '${SBTC} get-balance '${w}))`;
const has = (...parts) => (s) => parts.every((p) => s.includes(p));

const plan = [];
let b;
function call(label, sender, fn, args, expect, pcs) {
  if (pcs) pcSteps.set(plan.length, { fn, pcs });
  b.withSender(sender).addContractCall({ contract_id: C, function_name: fn, function_args: args });
  plan.push({ kind: "tx", label: pcs ? `[deny ${pcs.length} PC] ${label}` : label, expect });
}
function evalc(label, code, { capture, expect } = {}) {
  b.addEvalCode(C, code);
  plan.push({ kind: "eval", label, capture, expect });
}

async function live(addr) {
  const d = await (await fetch(`${API}/extended/v1/address/${addr}/balances`)).json();
  return {
    stx: BigInt(d.stx.balance) - BigInt(d.stx.locked),
    sats: BigInt(d.fungible_tokens[`${SBTC}::sbtc-token`]?.balance ?? 0),
  };
}

function build(F) {
  const STX = F.stx - FEE_HEADROOM;
  const SATS = F.sats;
  b = SimulationBuilder.new({ stacksNodeAPI: API });
  evalc("contract live and empty", "(get-status)", { expect: has("(claimed false)", "(stx u0)", "(sats u0)") });
  call("owner release before any request -> u107", OWNER, "release-reserve", [stringAsciiCV(D1)], "(err u107)");
  call("LAB requests on the EMPTY contract", LAB, "request-reserve", [stringAsciiCV(D1), boolCV(true)], "(ok true)");
  call("LAB replaces its description", LAB, "request-reserve", [stringAsciiCV(D2), boolCV(true)], "(ok true)");
  evalc("get-request = LAB's latest description", "(get-request)", { expect: (s) => s.includes(D2) });
  evalc("LAB STX before", stxOf(LAB), { capture: "lab.stx.0" });
  evalc("LAB sats before", ftOf(LAB), { capture: "lab.sats.0" });
  call(`fundraiser deposits ${STX} uSTX + ${SATS} sats`, FUNDRAISER, "deposit-reserve", [uintCV(STX), uintCV(SATS)], "(ok true)", [
    Pc.principal(FUNDRAISER).willSendEq(STX).ustx(),
    Pc.principal(FUNDRAISER).willSendEq(SATS).ft(SBTC, "sbtc-token"),
  ]);
  evalc("contract holds the deposit", "(get-status)", { expect: has(`(stx u${STX})`, `(sats u${SATS})`) });
  call("owner release with the OLD description -> u115", OWNER, "release-reserve", [stringAsciiCV(D1)], "(err u115)");
  call("owner releases with LAB's description", OWNER, "release-reserve", [stringAsciiCV(D2)], (s) => s.startsWith("(ok"), [
    Pc.principal(C).willSendGte(STX).ustx(),
    Pc.principal(C).willSendGte(SATS).ft(SBTC, "sbtc-token"),
  ]);
  evalc("LAB STX after", stxOf(LAB), { capture: "lab.stx.1" });
  evalc("LAB sats after", ftOf(LAB), { capture: "lab.sats.1" });
  evalc("contract empty", "(get-status)", { expect: has("(claimed true)", "(stx u0)", "(sats u0)") });
  evalc("get-claim: paid to LAB with that description", "(get-claim)", { expect: has(`(to ${LAB})`, `(stx u${STX})`, `(sats u${SATS})`) });
  call("second release -> u106", OWNER, "release-reserve", [stringAsciiCV(D2)], "(err u106)");
  return { STX, SATS };
}

function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return `<no tx result: ${JSON.stringify(s).slice(0, 200)}>`;
  if ("Err" in r) return `ENGINE-ERR: ${String(r.Err).slice(0, 200)}`;
  let str;
  try { str = cvToString(deserializeCV(r.Ok.result)); } catch { str = `decode-failed(${r.Ok.result})`; }
  if (r.Ok.post_condition_aborted) str = `PC-ABORT ${str}`;
  return str;
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval result>";
  if (!("Ok" in r)) return `ERR: ${r.Err}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}
const U = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");
const check = (want, got) => (typeof want === "function" ? want(got) : got === want);

async function main() {
  const F = await live(FUNDRAISER);
  console.log(`fundraiser live: ${F.stx} uSTX, ${F.sats} sats`);
  const { STX, SATS } = build(F);
  const id = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${id}`;
  console.log(url);
  const res = await getSimulationResult(id);
  const cap = {};
  let pass = 0, fail = 0;
  plan.forEach((p, i) => {
    const v = p.kind === "tx" ? decodeTx(res.steps[i]) : decodeEval(res.steps[i]);
    if (p.capture) cap[p.capture] = v;
    if (p.expect === undefined) return;
    const ok = check(p.expect, v);
    ok ? pass++ : fail++;
    console.log(`${ok ? "PASS" : "FAIL"} [${i}] ${p.label}: ${v.length > 300 ? v.slice(0, 300) + "..." : v}`);
  });
  for (const [k, want] of [["stx", STX], ["sats", SATS]]) {
    const got = U(cap[`lab.${k}.1`]) - U(cap[`lab.${k}.0`]);
    const ok = got === want;
    ok ? pass++ : fail++;
    console.log(`${ok ? "PASS" : "FAIL"} LAB ${k} delta = ${got} (want ${want})`);
  }
  console.log(`\n=== ${pass}/${pass + fail} passed ===\n${url}`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
