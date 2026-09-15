// sim-coverage.mjs
// EXECUTED coverage from the stxer results themselves: for every sim id in
// the README's latest rerun table, fetch the result and collect (a) every
// error code a step returned, (b) every `event` name printed by the
// market, the core, the ladder or a rung, (c) tx counts. Then compare with
// the codes and events defined in the sources: what no run ever produced
// is what no harness ever reached.
//
// Run: node simulations/sim-coverage.mjs [--md] [--table "Full rerun 2026-09-14"]
import fs from "node:fs";
import { getSimulationResult } from "stxer";
import { deserializeCV, cvToString } from "@stacks/transactions";

const md = process.argv.includes("--md");
const ti = process.argv.indexOf("--table");
const TABLE = ti > 0 ? process.argv[ti + 1] : "Full rerun 2026-09-14";
const readme = fs.readFileSync("contracts/README-markets-v6-pegged.md", "utf8");
const start = readme.indexOf(`## ${TABLE}`);
if (start < 0) throw new Error(`table "${TABLE}" not found`);
const end = readme.indexOf("\n## ", start + 4);
const block = readme.slice(start, end < 0 ? undefined : end);
const sims = [...block.matchAll(/`([0-9a-f]{32})`/g)].map((m) => m[1]);
const rows = [...block.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({ name: m[1].trim(), result: m[2].trim(), ids: [...m[3].matchAll(/`([0-9a-f]{32})`/g)].map((x) => x[1]) }));

const SOURCES = {
  "markets-sbtc-stx-jing-v6": "contracts/markets-sbtc-stx-jing-v6.clar",
  "jing-core-v5": "contracts/jing-core-v5.clar",
  "jing-ladder": "contracts/jing-ladder.clar",
  "jing-buy-stx-core-spread": "contracts/jing-buy-stx-core-spread.clar",
  "jing-sell-stx-core-spread": "contracts/jing-sell-stx-core-spread.clar",
  "jing-buy-stx": "contracts/jing-buy-stx.clar",
  "jing-buy-stx-market-spread": "contracts/jing-buy-stx-market-spread.clar",
  "swap-router-sbtc-stx-jing-v5": "contracts/swap-router-sbtc-stx-jing-v5.clar",
  "vault-sbtc-stx-v6": "contracts/vault-sbtc-stx-v6.clar",
};
const defined = {};
for (const [n, f] of Object.entries(SOURCES)) {
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, "utf8");
  defined[n] = {
    codes: [...s.matchAll(/\(define-constant (ERR_[A-Z_0-9]+) \(err (u\d+)\)\)/g)].map((m) => ({ name: m[1], code: m[2] })),
    events: [...new Set([...s.matchAll(/event: "([a-z0-9-]+)"/g)].map((m) => m[1]))],
  };
}
// core events reachable from the market / ladder / rungs only
const coreCalls = new Set();
for (const f of ["contracts/markets-sbtc-stx-jing-v6.clar", "contracts/swap-router-sbtc-stx-jing-v5.clar", "contracts/vault-sbtc-stx-v6.clar"]) if (fs.existsSync(f)) for (const m of fs.readFileSync(f, "utf8").matchAll(/jing-core-v5 (log-[a-z0-9-]+)/g)) coreCalls.add(m[1]);
{
  const s = fs.readFileSync(SOURCES["jing-core-v5"], "utf8");
  const reachable = [];
  for (const fn of s.matchAll(/\(define-public \((log-[a-z0-9-]+)[\s\S]*?event: "([a-z0-9-]+)"/g)) if (coreCalls.has(fn[1])) reachable.push(fn[2]);
  defined["jing-core-v5"].events = [...new Set(reachable)];
}

const seenCodes = {}, seenEvents = {}, perSim = {};
let txs = 0, errs = 0;
for (const id of sims) {
  const res = await getSimulationResult(id);
  perSim[id] = { steps: res.steps.length, codes: new Set(), events: new Set() };
  for (const st of res.steps) {
    const t = st?.Result?.Transaction?.Ok; if (!t) continue;
    txs += 1;
    try {
      const r = cvToString(deserializeCV(t.result));
      const m = r.match(/^\(err (u\d+)\)$/);
      if (m) { errs += 1; (seenCodes[m[1]] ||= new Set()).add(id); perSim[id].codes.add(m[1]); }
    } catch {}
    if (!t.events) continue;
    let evs = [];
    try { evs = JSON.parse("[" + t.events + "]"); } catch { continue; }
    for (const e of evs) {
      const ce = e.contract_event; if (!ce?.raw_value) continue;
      try {
        const v = deserializeCV(ce.raw_value);
        const name = v?.value?.event?.value ?? v?.data?.event?.data;
        if (typeof name === "string") { const c = ce.contract_identifier.split(".")[1]; (seenEvents[`${c}:${name}`] ||= new Set()).add(id); perSim[id].events.add(`${c}:${name}`); }
      } catch {}
    }
  }
}
const out = [];
const L = (s) => out.push(s);
L(md ? `# Executed coverage from the stxer results (${TABLE})\n\nFrom \`simulations/sim-coverage.mjs\` on ${new Date().toISOString().slice(0, 10)}: ${sims.length} simulations, ${txs} transactions, ${errs} error returns. "Produced" means a step returned that code or a print carried that event, in at least one of the listed sims.\n` : `${sims.length} sims, ${txs} txs, ${errs} err returns`);
const missing = [];
for (const [n, d] of Object.entries(defined)) {
  if (!d.codes.length && !d.events.length) continue;
  L(md ? `\n## ${n}\n` : `\n== ${n}`);
  if (d.codes.length) {
    L(md ? `| code | name | produced in |\n|---|---|---|` : "-- codes");
    for (const { name, code } of d.codes) {
      const ids = [...(seenCodes[code] || [])];
      if (!ids.length) missing.push(`${n} ${name} ${code}`);
      L(md ? `| \`${code}\` | ${name} | ${ids.length ? ids.map((i) => i.slice(0, 8)).join(", ") : "**none**"} |` : `${code.padEnd(7)} ${name.padEnd(28)} ${ids.length ? ids.length + " sims" : "NONE"}`);
    }
  }
  if (d.events.length) {
    L(md ? `\n| event | produced in |\n|---|---|` : "-- events");
    for (const e of d.events) {
      const ids = [...(seenEvents[`${n}:${e}`] || [])];
      if (!ids.length) missing.push(`${n} event ${e}`);
      L(md ? `| \`${e}\` | ${ids.length ? ids.map((i) => i.slice(0, 8)).join(", ") : "**none**"} |` : `${e.padEnd(28)} ${ids.length ? ids.length + " sims" : "NONE"}`);
    }
  }
}
// Known unreachable or defensive, with the reason; listed apart so the gap
// list above stays actionable.
const KNOWN = {
  "markets-sbtc-stx-jing-v6 ERR_ALREADY_SETTLED u1002": "defensive: settlement bumps current-cycle, so the settlements map can never already hold the current cycle",
  "markets-sbtc-stx-jing-v6 ERR_STALE_PRICE u1003": "shadowed: the market passes MAX_STALENESS to the Lazer oracle, which refuses a stale update first (its u1002; gaps G7)",
  "markets-sbtc-stx-jing-v6 ERR_ZERO_PRICE u1006": "needs a signed Lazer update with a zero price: not forgeable on a fork",
  "markets-sbtc-stx-jing-v6 ERR_EXPO_MISMATCH u1014": "needs a signed Lazer update whose two feeds carry different exponents: not forgeable on a fork",
  "markets-sbtc-stx-jing-v6 ERR_NOTHING_FILLED u1015": "dead constant: defined, never raised",
  "jing-ladder ERR_ALREADY_REGISTERED u6005": "needs a byte-identical rung to call register twice; initialize is once, so only a rung's own code could, and the canonical code does not",
  "jing-buy-stx-core-spread ERR_INSUFFICIENT u7007": "a member whose shares round to zero sats after fills: dust-level rounding, not reached by the fill sizes in the harnesses",
  "jing-sell-stx-core-spread ERR_INSUFFICIENT u7007": "same as the buy rung",
  "jing-buy-stx ERR_INSUFFICIENT u7007": "same as the buy rung",
  "jing-buy-stx-market-spread ERR_INSUFFICIENT u7007": "same as the buy rung",
  "vault-sbtc-stx-v6 ERR_REBATE_MISMATCH u6023": "defensive: the v6 market's taker rebate is a constant (20 bps), so a vault bound to it can never see a mismatch; the guard is for a future market with a different rebate",
};
const open = missing.filter((m) => !KNOWN[m]), known = missing.filter((m) => KNOWN[m]);
L(md ? `\n## Never produced by any run, open (${open.length})\n` : `\n== never produced, open (${open.length})`);
for (const m of open) L(md ? `- ${m}` : m);
L(md ? `\n## Never produced, known unreachable or defensive (${known.length})\n` : `\n== known unreachable / defensive (${known.length})`);
for (const m of known) L(md ? `- ${m}: ${KNOWN[m]}` : `${m}: ${KNOWN[m]}`);
if (md) { L(`\n## Sims read\n\n| harness | result | sim | steps | distinct codes | distinct events |\n|---|---|---|---|---|---|`); for (const r of rows) for (const id of r.ids) L(`| ${r.name} | ${r.result} | \`${id.slice(0, 8)}\` | ${perSim[id]?.steps ?? "?"} | ${perSim[id]?.codes.size ?? "?"} | ${perSim[id]?.events.size ?? "?"} |`); }
console.log(out.join("\n"));
