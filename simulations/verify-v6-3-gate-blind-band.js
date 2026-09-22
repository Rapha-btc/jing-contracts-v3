// stxer mainnet-fork regression for the v6-2 maker-margin gate blind band
// (AIBTC bounty muaqb2yb546e17c25866) and its fix in v6-3.
//
// v6-2's gate scanned the opposite book at the WIDENED mid, so a resting
// order priced between the widened mid and the real mid was invisible. An
// entrant crossing it was admitted as a maker; settlement at the real mid
// then filled both with the 10 bps fee and no taker rebate. v6-3 scans the
// book up to min(limit, mid + 0.4%) for a y entrant (max(limit, mid - 0.4%)
// for an x entrant) and refuses the same entry with ERR_MUST_USE_SWAP.
//
// Fresh copies of both sources are deployed on the fork (v6-2 source is
// byte-identical to the live contract), so the live book cannot interfere.
// Same sequence on both, both sides:
//   1. a maker rests 20 bps through the mid (inside the blind band)
//   2. an entrant deposits 5% through the mid on the other side
//      v6-2: admitted, settle clears both at the mid, maker gets no rebate
//      v6-3: refused u1016
//   3. v6-3 controls: an order that can never meet the resting one is
//      admitted (30 and 100 bps away)
//   4. Rushing Orion's case: the resting order sits 20 bps OUTSIDE the mid
//      (not willing at the mid) and the entrant overlaps it at 30 bps. A
//      0.2% move would fill both at maker cost. v6-2 admits it; v6-3 refuses.
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdateAny } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = `${DEP}.jing-core-v5`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const STX_WHALE = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const PP = 100_000_000n, BPS = 10_000n;
const src = (f) => fs.readFileSync(`./contracts/${f}.clar`, "utf8");
const decode = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; return cvToString(deserializeCV(r.Ok.result)); };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `ERR ${JSON.stringify(r.Err)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); } };
const ok = (v) => v.startsWith("(ok");

async function main() {
  const lz = await fetchLazerUpdateAny();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const mid = (lz.px * PP) / lz.py;
  const down = (bps) => (mid * (BPS - bps)) / BPS;
  const up = (bps) => (mid * (BPS + bps)) / BPS;
  console.log(`mid ${mid} (${(1e16 / Number(mid)).toFixed(2)} sats/STX)`);

  let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const steps = [];
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, add, want) => { b = add(b); steps.push({ label, want, kind: "tx" }); };
  const ev = (label, cid, code, want) => { b = b.addEvalCode(cid, code); steps.push({ label, want, kind: "eval" }); };

  // Four fresh markets: {v6-2, v6-3} x {y-side entrant, x-side entrant}.
  const M = {
    "62y": { name: "mkt-blindband-v62-y", file: "markets-sbtc-stx-jing-v6-2" },
    "63y": { name: "mkt-blindband-v63-y", file: "markets-sbtc-stx-jing-v6-3" },
    "62x": { name: "mkt-blindband-v62-x", file: "markets-sbtc-stx-jing-v6-2" },
    "63x": { name: "mkt-blindband-v63-x", file: "markets-sbtc-stx-jing-v6-3" },
    "62o": { name: "mkt-overlap-v62-y", file: "markets-sbtc-stx-jing-v6-2" },
    "63o": { name: "mkt-overlap-v63-y", file: "markets-sbtc-stx-jing-v6-3" },
    "62q": { name: "mkt-overlap-v62-x", file: "markets-sbtc-stx-jing-v6-2" },
    "63q": { name: "mkt-overlap-v63-x", file: "markets-sbtc-stx-jing-v6-3" },
    "63m": { name: "mkt-minraise-v63-y", file: "markets-sbtc-stx-jing-v6-3" },
  };
  // v6-3 reads its seats from jing-ladder-v1 (v6-2 from the live jing-ladder).
  tx("deploy jing-ladder-v1", (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: "jing-ladder-v1", source_code: src("jing-ladder-v1"), clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes("ERR"));
  for (const m of Object.values(M)) {
    m.cid = `${DEP}.${m.name}`;
    tx(`deploy ${m.name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: m.name, source_code: src(m.file), clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes("ERR"));
    tx(`${m.name}: sync seats`, call(DEP, m.cid, "sync-seat-count", []), ok);
    tx(`${m.name}: verify`, call(DEP, CORE, "set-verified-contract", [contractPrincipalCV(DEP, m.name)]), "(ok true)");
    tx(`${m.name}: initialize`, call(DEP, m.cid, "initialize", [contractPrincipalCV(DEP, m.name), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  }

  // Fresh principals per market so balances are exact (they start at zero).
  let n = 300;
  const who = () => mk(n++);
  const fundStx = (p, amt) => tx(`fund ${amt / 1e6} STX ${p.slice(0, 6)}`, (bb) => bb.withSender(STX_WHALE).addSTXTransfer({ recipient: p, amount: amt }), ok);
  const fundSbtc = (p, amt) => tx(`fund ${amt} sats ${p.slice(0, 6)}`, call(SBTC_WHALE, SBTC, "transfer", [uintCV(amt), standardPrincipalCV(SBTC_WHALE), standardPrincipalCV(p), noneCV()]), "(ok true)");
  const depX = (p, cid, amt, limit) => call(p, cid, "deposit-token-x", [uintCV(amt), uintCV(limit), noneCV(), UPD, sbtcT, sbtcA]);
  const depY = (p, cid, amt, limit) => call(p, cid, "deposit-token-y", [uintCV(amt), uintCV(limit), noneCV(), UPD, wstxT, wstxA]);
  const settle = (p, cid) => call(p, cid, "settle-with-refresh", [UPD, sbtcT, sbtcA, wstxT, wstxA]);

  // ---- Y-side entrant (pays STX) against a resting x ask 20 bps under the mid ----
  // An x order wants at least its limit (STX per BTC): 20 bps under the mid
  // means it is willing at the mid, and it sits inside (widen-down mid, mid].
  for (const key of ["62y", "63y"]) {
    const { cid, name } = M[key];
    const maker = who(), entrant = who();
    fundSbtc(maker, 3000); fundStx(entrant, 6_000_000);
    tx(`[${name}] maker rests sBTC ask 20 bps under the mid`, depX(maker, cid, 3000, down(20n)), "(ok u3000)");
    if (key === "62y") {
      tx(`[${name}] entrant bid 5% through the mid ADMITTED (bug)`, depY(entrant, cid, 6_000_000, up(500n)), "(ok u6000000)");
      tx(`[${name}] settle-with-refresh clears both at the mid`, settle(entrant, cid), ok);
      // 6 STX binds (3000 sats is worth ~7.5 STX): the maker receives
      // 6,000,000 - 6,000 fee + rebate. A taker would have paid a 12,000 rebate.
      ev(`[${name}] maker got 5,994,000 uSTX = fee only, NO rebate`, cid, `(stx-get-balance '${maker})`, "u5994000");
    } else {
      tx(`[${name}] entrant bid 5% through the mid REFUSED`, depY(entrant, cid, 6_000_000, up(500n)), "(err u1016)");
      const e2 = who(), e3 = who(); fundStx(e2, 6_000_000); fundStx(e3, 6_000_000);
      tx(`[${name}] control: bid 30 bps under (never meets the ask) admitted`, depY(e2, cid, 6_000_000, down(30n)), "(ok u6000000)");
      tx(`[${name}] control: bid 100 bps under admitted`, depY(e3, cid, 6_000_000, down(100n)), "(ok u6000000)");
    }
  }

  // ---- X-side entrant (pays sBTC) against a resting y bid 20 bps over the mid ----
  // A y order pays at most its limit: 20 bps over the mid means it is willing
  // at the mid, and it sits inside [mid, widen-up mid).
  for (const key of ["62x", "63x"]) {
    const { cid, name } = M[key];
    const maker = who(), entrant = who();
    fundStx(maker, 6_000_000); fundSbtc(entrant, 3000);
    tx(`[${name}] maker rests STX bid 20 bps over the mid`, depY(maker, cid, 6_000_000, up(20n)), "(ok u6000000)");
    if (key === "62x") {
      tx(`[${name}] entrant ask 5% through the mid ADMITTED (bug)`, depX(entrant, cid, 3000, down(500n)), "(ok u3000)");
      tx(`[${name}] settle-with-refresh clears both at the mid`, settle(entrant, cid), ok);
      // 6 STX binds: the entrant (x side) receives 6,000,000 - 6,000 fee.
      ev(`[${name}] entrant got 5,994,000 uSTX at the mid`, cid, `(stx-get-balance '${entrant})`, "u5994000");
      ev(`[${name}] maker got sBTC (printed)`, cid, `(unwrap-panic (contract-call? '${SBTC} get-balance '${maker}))`, (v) => /^u[1-9]/.test(v));
    } else {
      tx(`[${name}] entrant ask 5% through the mid REFUSED`, depX(entrant, cid, 3000, down(500n)), "(err u1016)");
      const e2 = who(), e3 = who(); fundSbtc(e2, 3000); fundSbtc(e3, 3000);
      tx(`[${name}] control: ask 30 bps over (never meets the bid) admitted`, depX(e2, cid, 3000, up(30n)), "(ok u3000)");
      tx(`[${name}] control: ask 100 bps over admitted`, depX(e3, cid, 3000, up(100n)), "(ok u3000)");
    }
  }

  // ---- Rushing Orion: resting order 20 bps OUTSIDE the mid, entrant overlaps at 30 ----
  // y entrant: resting x ask wants >= mid + 20 bps (not willing at the mid);
  // the entrant pays up to mid + 30 bps, so the two overlap.
  for (const key of ["62o", "63o"]) {
    const { cid, name } = M[key];
    const maker = who(), entrant = who();
    fundSbtc(maker, 3000); fundStx(entrant, 6_000_000);
    tx(`[${name}] maker rests sBTC ask 20 bps over the mid`, depX(maker, cid, 3000, up(20n)), "(ok u3000)");
    tx(`[${name}] entrant bid 30 bps over overlaps it: ${key === "62o" ? "ADMITTED (bug)" : "REFUSED"}`,
      depY(entrant, cid, 6_000_000, up(30n)), key === "62o" ? "(ok u6000000)" : "(err u1016)");
  }
  // x entrant mirror: resting y bid pays <= mid - 20 bps; the entrant wants
  // >= mid - 30 bps, so the two overlap.
  for (const key of ["62q", "63q"]) {
    const { cid, name } = M[key];
    const maker = who(), entrant = who();
    fundStx(maker, 6_000_000); fundSbtc(entrant, 3000);
    tx(`[${name}] maker rests STX bid 20 bps under the mid`, depY(maker, cid, 6_000_000, down(20n)), "(ok u6000000)");
    tx(`[${name}] entrant ask 30 bps under overlaps it: ${key === "62q" ? "ADMITTED (bug)" : "REFUSED"}`,
      depX(entrant, cid, 3000, down(30n)), key === "62q" ? "(ok u3000)" : "(err u1016)");
  }

  // ---- Void Kael gap 6: the owner raises the minimum after an order rests ----
  // The resting 3000-sat ask is now under the 5000-sat minimum. The taker
  // walk skips it, but the batch at the mid still fills it, so the gate must
  // still see it.
  {
    const { cid, name } = M["63m"];
    const maker = who(), entrant = who();
    fundSbtc(maker, 3000); fundStx(entrant, 6_000_000);
    tx(`[${name}] maker rests 3000-sat ask 20 bps under the mid`, depX(maker, cid, 3000, down(20n)), "(ok u3000)");
    tx(`[${name}] owner raises the sBTC minimum to 5000`, call(DEP, cid, "set-min-token-x-deposit", [uintCV(5000)]), "(ok true)");
    tx(`[${name}] entrant crossing the now-small ask still REFUSED`, depY(entrant, cid, 6_000_000, up(500n)), "(err u1016)");
  }

  // ---- jing-ladder-v1 seat cap: strictly under the market's 50 slots ----
  const LAD = `${DEP}.jing-ladder-v1`;
  tx("ladder-v1: 50 seats per side refused", call(DEP, LAD, "set-max-band-per-side", [uintCV(50)]), (v) => v.startsWith("(err"));
  tx("ladder-v1: 49 seats per side accepted", call(DEP, LAD, "set-max-band-per-side", [uintCV(49)]), "(ok true)");
  tx("v6-3: sync-seat-count prunes and reads 49", call(DEP, M["63y"].cid, "sync-seat-count", []), "(ok u49)");

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const out = await getSimulationResult(sid); let i = 0, pass = 0;
  for (const st of steps) {
    while (i < out.steps.length && !out.steps[i]?.Result?.Transaction && !out.steps[i]?.Result?.Eval) i += 1;
    const actual = st.kind === "tx" ? decode(out.steps[i++]) : decodeEval(out.steps[i++]);
    const good = typeof st.want === "function" ? st.want(actual) : actual === st.want;
    if (good) pass += 1;
    console.log(`${good ? "ok  " : "FAIL"} ${st.label}: ${actual.slice(0, 160)}`);
  }
  console.log(`${pass}/${steps.length} checks green`);
  if (pass !== steps.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
