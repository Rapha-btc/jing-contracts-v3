// Focused stxer regression for the reprice-or-swap maker-margin bypass.
// Covers both sides: no opposite book, safely outside 50 bps, inside 50 bps,
// and an actual cross that must still swap.
import fs from "node:fs";
import {
  ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV,
  standardPrincipalCV, noneCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdateAny } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = `${DEP}.jing-core-v5`;
const MY = "markets-v6-reprice-margin-y", MX = "markets-v6-reprice-margin-x";
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token");
const wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const sbtcA = stringAsciiCV("sbtc-token"), wstxA = stringAsciiCV("wstx");
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const STX_WHALE = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";
const mk = (n) => getAddressFromPrivateKey(String(n).repeat(64).slice(0, 64) + "01", "mainnet");
const Y = mk(211), AX = mk(212), X = mk(213), BY = mk(214);
const PP = 100_000_000n, BPS = 10_000n, HUGE = 999_999_999_999_999n;
const strip = (t) => t.split("\n")
  .filter((l) => !/^\s*;;/.test(l))
  .map((l) => l.replace(/^\s+/, ""))
  .filter((l) => l.length)
  .join("\n");
const src = (f) => strip(fs.readFileSync(`./contracts/${f}.clar`, "utf8"));
const decode = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; return cvToString(deserializeCV(r.Ok.result)); };

async function main() {
  const lz = await fetchLazerUpdateAny();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const mid = (lz.px * PP) / lz.py;
  const down = (bps) => (mid * (BPS - bps)) / BPS;
  const up = (bps) => (mid * (BPS + bps)) / BPS;
  console.log(`mid ${mid}; y near ${down(30n)}, y safe ${down(60n)}, x near ${up(30n)}, x safe ${up(60n)}`);

  let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const steps = [];
  const call = (sender, cid, fn, args) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, add, want) => { b = add(b); steps.push({ label, want }); };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !v.includes("ERR"));
  const marketSrc = src("markets-sbtc-stx-jing-v6");
  deploy(MY, marketSrc); deploy(MX, marketSrc);
  for (const name of [MY, MX]) {
    const cid = `${DEP}.${name}`;
    tx(`${name}: sync seats`, call(DEP, cid, "sync-seat-count", []), (v) => v.startsWith("(ok"));
    tx(`${name}: verify`, call(DEP, CORE, "set-verified-contract", [contractPrincipalCV(DEP, name)]), "(ok true)");
    tx(`${name}: initialize`, call(DEP, cid, "initialize", [contractPrincipalCV(DEP, name), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  }
  for (const who of [Y, BY]) tx(`fund STX ${who.slice(0, 6)}`, (bb) => bb.withSender(STX_WHALE).addSTXTransfer({ recipient: who, amount: 12_000_000 }), (v) => v.startsWith("(ok"));
  for (const who of [AX, X]) tx(`fund sBTC ${who.slice(0, 6)}`, call(SBTC_WHALE, SBTC, "transfer", [uintCV(5000), standardPrincipalCV(SBTC_WHALE), standardPrincipalCV(who), noneCV()]), "(ok true)");

  const yid = `${DEP}.${MY}`;
  tx("Y1 no opposite: near bid may rest", call(Y, yid, "deposit-token-y", [uintCV(6_000_000), uintCV(down(30n)), noneCV(), UPD, wstxT, wstxA]), "(ok u6000000)");
  tx("Y2 add ask live at widened-down price", call(AX, yid, "deposit-token-x", [uintCV(3000), uintCV(down(60n)), noneCV(), UPD, sbtcT, sbtcA]), "(ok u3000)");
  tx("Y3 safe bid -60 bps accepted", call(Y, yid, "reprice-or-swap-token-y", [uintCV(down(60n)), noneCV(), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => v.startsWith("(ok") && v.includes("token-x-received u0"));
  tx("Y4 near bid -30 bps rejected", call(Y, yid, "reprice-or-swap-token-y", [uintCV(down(30n)), noneCV(), UPD, sbtcT, sbtcA, wstxT, wstxA]), "(err u1016)");
  tx("Y5 actual crossing bid still swaps", call(Y, yid, "reprice-or-swap-token-y", [uintCV(HUGE), noneCV(), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => v.startsWith("(ok") && !v.includes("token-x-received u0"));

  const xid = `${DEP}.${MX}`;
  tx("X1 no opposite: near ask may rest", call(X, xid, "deposit-token-x", [uintCV(3000), uintCV(up(30n)), noneCV(), UPD, sbtcT, sbtcA]), "(ok u3000)");
  tx("X2 add non-crossing bid", call(BY, xid, "deposit-token-y", [uintCV(6_000_000), uintCV(HUGE), noneCV(), UPD, wstxT, wstxA]), "(ok u6000000)");
  tx("X3 safe ask +60 bps accepted", call(X, xid, "reprice-or-swap-token-x", [uintCV(up(60n)), noneCV(), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => v.startsWith("(ok") && v.includes("token-y-received u0"));
  tx("X4 near ask +30 bps rejected", call(X, xid, "reprice-or-swap-token-x", [uintCV(up(30n)), noneCV(), UPD, sbtcT, sbtcA, wstxT, wstxA]), "(err u1016)");
  tx("X5 actual crossing ask still swaps", call(X, xid, "reprice-or-swap-token-x", [uintCV(1), noneCV(), UPD, sbtcT, sbtcA, wstxT, wstxA]), (v) => v.startsWith("(ok") && !v.includes("token-y-received u0"));

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const out = await getSimulationResult(sid); let i = 0, pass = 0;
  for (const expected of steps) {
    while (i < out.steps.length && !out.steps[i]?.Result?.Transaction) i += 1;
    const actual = decode(out.steps[i++]);
    const ok = typeof expected.want === "function" ? expected.want(actual) : actual === expected.want;
    if (ok) pass += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${expected.label}: ${actual.slice(0, 180)}`);
  }
  console.log(`${pass}/${steps.length} checks green`);
  if (pass !== steps.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
