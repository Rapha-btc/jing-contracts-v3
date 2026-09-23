// stxer mainnet-fork check of the EXACT deploy bytes for the v6-3 set, read
// from the current repository (or --templates for the external Faktory source), deployed under their real names from the real deployer:
//   jing-ladder-v1 -> markets-sbtc-stx-jing-v6-3 -> swap-router-sbtc-stx-jing-v5-3
// Then: verify + initialize the market, crossing maker escrow is refunded
// at settle (the bounty fix), and a taker swap through router v5-3 fills against a
// resting maker (the router is bound to v6-3 and works end to end).
//
// Run: node simulations/verify-v6-3-deploy-bytes.js
import { runCurrentPlan, FRESH_UPDATE } from "./_v6-submit-settle.js";
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, someCV, tupleCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdateAny } from "./_lazer.js";

// Default is the current repository's exact deploy bytes. --templates retains
// the original external-template check; those templates must be updated separately.
const tpl = (f) => {
  if (!process.argv.includes('--templates')) return fs.readFileSync(`contracts/${f}.clar`, 'utf8');
  const t=fs.readFileSync(`../faktory-dao/backend/server/utils/${f}-template.ts`,'utf8');
  return t.slice(t.indexOf('= `')+3,t.lastIndexOf('`'));
};

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = `${DEP}.jing-core-v6`;
const LADDER = "jing-ladder-v1", MARKET = "markets-sbtc-stx-jing-v6-3", ROUTER = "swap-router-sbtc-stx-jing-v5-3";
const MID_ = `${DEP}.${MARKET}`, RID = `${DEP}.${ROUTER}`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const STX_WHALE = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const PP = 100_000_000n, BPS = 10_000n, HUGE = 999_999_999_999_999n;
const decode = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; return cvToString(deserializeCV(r.Ok.result)); };
const ok = (v) => v.startsWith("(ok");

async function main() {
  const src = { "jing-core-v6": tpl("jing-core-v6"), [LADDER]: tpl("jing-ladder-v1"), [MARKET]: tpl("markets-sbtc-stx-jing-v6-3"), [ROUTER]: tpl("swap-router-sbtc-stx-jing-v5-3") };
  for (const [n, s] of Object.entries(src)) console.log(`${n}: ${s.length} bytes`);
  const lz = await fetchLazerUpdateAny();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const mid = (lz.px * PP) / lz.py;
  const down = (bps) => (mid * (BPS - bps)) / BPS;
  const up = (bps) => (mid * (BPS + bps)) / BPS;

  let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const steps = [];
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, add, want) => { b = add(b); steps.push({ label, want }); };
  for (const n of ["jing-core-v6", LADDER, MARKET, ROUTER]) {
    tx(`deploy ${n} (exact deploy bytes)`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: n, source_code: src[n], clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes("ERR"));
    if (n === MARKET) {
      tx("market: sync-seat-count", call(DEP, MID_, "sync-seat-count", []), ok);
      tx("core-v6: set-verified-contract", call(DEP, CORE, "set-verified-contract", [contractPrincipalCV(DEP, MARKET)]), "(ok true)");
      tx("market: initialize (u1000 u1000000 u1 u45)", call(DEP, MID_, "initialize", [contractPrincipalCV(DEP, MARKET), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
    }
  }
  const maker = mk(501), crosser = mk(502), taker = mk(503);
  tx("fund maker 3000 sats", call(SBTC_WHALE, SBTC, "transfer", [uintCV(3000), standardPrincipalCV(SBTC_WHALE), standardPrincipalCV(maker), noneCV()]), "(ok true)");
  for (const p of [crosser, taker]) tx(`fund ${p.slice(0, 6)} 10 STX`, (bb) => bb.withSender(STX_WHALE).addSTXTransfer({ recipient: p, amount: 10_000_000 }), ok);
  tx("maker rests sBTC ask 20 bps under the mid", call(maker, MID_, "deposit-token-x", [uintCV(3000), uintCV(down(20n)), noneCV(), sbtcT, sbtcA]), "(ok u3000)");
  tx("gate: crossing submit escrows before classification", call(crosser, MID_, "deposit-token-y", [uintCV(6_000_000), uintCV(up(500n)), noneCV(), wstxT, wstxA]), "(ok u6000000)");
  tx("gate: crossing settle refunds escrow",call(mk(504),MID_,"settle-token-y-deposit",[standardPrincipalCV(crosser),FRESH_UPDATE,wstxT,wstxA]),"(ok u6000000)");
  const ev=(label,code,want)=>{b.addEvalCode(MID_,code);steps.push({label,want,eval:true});};
  ev("gate: pending cleared",`(get-token-y-pending-deposit '${crosser})`,"none");
  ev("gate: full refund restores exactly 10 STX",`(stx-get-balance '${crosser})`,"u10000000");
  ev("gate: crossing deposit never live",`(get-token-y-deposit (get-current-cycle) '${crosser})`,"u0");
  const zero = tupleCV({ dlmm: uintCV(0), xyk: uintCV(0), velar: uintCV(0) });
  tx("router v5-3: taker swaps 5 STX for sBTC against the book", call(taker, RID, "swap-stx-for-sbtc",
    [uintCV(5_000_000), uintCV(5_000_000), uintCV(HUGE), someCV(UPD), noneCV(), zero, zero, uintCV(1)]),
    (v) => ok(v) && !/sbtc-out u0\b|received u0\b/.test(v));

  const {sid,result:out} = await runCurrentPlan(b);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  let i = 0, pass = 0;
  for (const st of steps) {
    while (i < out.steps.length && !out.steps[i]?.Result?.Transaction && !out.steps[i]?.Result?.Eval) i += 1;
    const raw=out.steps[i++];
    const actual = st.eval ? cvToString(deserializeCV(raw.Result.Eval.Ok)) : decode(raw);
    const good = typeof st.want === "function" ? st.want(actual) : actual === st.want;
    if (good) pass += 1;
    console.log(`${good ? "ok  " : "FAIL"} ${st.label}: ${actual.slice(0, 200)}`);
  }
  console.log(`${pass}/${steps.length} checks green`);
  if (pass !== steps.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
