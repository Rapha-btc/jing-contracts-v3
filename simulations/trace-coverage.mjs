// trace-coverage.mjs
// REAL expression / line / branch coverage of a Clarity contract from stxer
// simulations: every simulated tx has a debug trace (GET
// /devtools/v2/simulations/{sim}/inspect/{txid}, zstd + the "stxer0" wire
// format, decoder after github.com/stxer's gist) listing every expression
// evaluated, by AST id. The same source parsed by POST /contracts:parse
// gives every expression id with its source span. Executed ids over all ids
// = coverage; an `if` / `match` / `asserts!` whose taken arm never appears
// = an uncovered branch.
//
//   node simulations/trace-coverage.mjs [--contract markets-sbtc-stx-jing-v6]
//        [--table "Full rerun 2026-09-14"] [--md] [--sims id,id,...]
// Traces are cached in $SCRATCH/traces (or ./.traces) so reruns are cheap.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getSimulationResult, parseContract } from "stxer";
import { deserializeCV, cvToString } from "@stacks/transactions";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const md = process.argv.includes("--md");
const NAME = arg("--contract", "markets-sbtc-stx-jing-v6");
const TABLE = arg("--table", "Full rerun 2026-09-14");
const API = "https://api.stxer.xyz";
const CACHE = process.env.TRACE_CACHE || path.join(process.env.TMPDIR || "/tmp", "stxer-traces");
fs.mkdirSync(CACHE, { recursive: true });

// ---- sims from the README table (or --sims) ----
let sims;
if (arg("--sims")) sims = arg("--sims").split(",");
else {
  const readme = fs.readFileSync("contracts/README-markets-v6-pegged.md", "utf8");
  const start = readme.indexOf(`## ${TABLE}`); if (start < 0) throw new Error(`table "${TABLE}" not found`);
  const end = readme.indexOf("\n## ", start + 4);
  sims = [...readme.slice(start, end < 0 ? undefined : end).matchAll(/`([0-9a-f]{32})`/g)].map((m) => m[1]);
}

// ---- the AST of the canonical source: id -> span, plus the branch nodes ----
const source = fs.readFileSync(`contracts/${NAME}.clar`, "utf8");
const ast = await parseContract({ sourceCode: source, contractId: `SP000000000000000000002Q6VF78.${NAME}`, clarityVersion: "5" });
const exprs = ast.expressions ?? ast.ast ?? ast;
const nodes = new Map(); // id -> { line, list, fn }
const listOf = (e) => e?.expr?.List ?? e?.expr?.list ?? e?.list ?? null;
const atomOf = (e) => e?.expr?.Atom ?? e?.expr?.atom ?? null;
const lineOf = (span) => { if (typeof span === "string") return Number(span.split(":")[0]); return span?.start_line ?? span?.startLine ?? null; };
function walk(e, fn) {
  if (!e || typeof e !== "object") return;
  if (e.id != null && e.span) nodes.set(String(e.id), { line: lineOf(e.span), list: listOf(e), fn });
  const l = listOf(e);
  if (l) {
    const head = atomOf(l[0]);
    const f = typeof head === "string" && /^define-/.test(head) ? atomOf(listOf(l[1])?.[0]) ?? atomOf(l[1]) ?? fn : fn;
    for (const c of l) walk(c, f);
  }
}
for (const e of exprs) walk(e, "(top)");
// coverage is counted over CALL expressions (list nodes); atoms ride with their call
const callIds = new Set([...nodes].filter(([, n]) => n.list).map(([id]) => id));
const total = callIds.size;

// ---- trace decoding (port of stxer's debug-data-parser.ts) ----
const td = new TextDecoder();
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) + BigInt(b[o + i]); return v; };
function decodeNode(b, o, out, contract) {
  const codeLen = u32(b, o); o += 4;
  const code = td.decode(b.subarray(o, o + codeLen)); o += codeLen;
  const id = u64(b, o); o += 8;
  o += 80; // two cost snapshots
  const funcLen = u32(b, o); o += 4;
  const func = td.decode(b.subarray(o, o + funcLen)); o += funcLen;
  const argsLen = u32(b, o); o += 4;
  for (let i = 0; i < argsLen; i++) { const ok = b[o] === 0; o += 1; const len = u32(b, o); o += 4; o += len; }
  const resOk = b[o] === 0; o += 1;
  const rlen = u32(b, o); o += 4;
  const resultErr = resOk ? null : td.decode(b.subarray(o, o + rlen)); o += rlen;
  const m = code.match(/^(S[PMTN][0-9A-Z]+\.[0-9a-zA-Z_-]+):/);
  if (m) contract = m[1].split(".")[1];
  if (contract) { const set = out.get(contract) || out.set(contract, new Set()).get(contract); set.add(String(id)); if (resultErr) (out.errs ||= []).push({ contract, id: String(id), func, err: resultErr.slice(0, 80) }); }
  const n = u32(b, o); o += 4;
  for (let i = 0; i < n; i++) o = decodeNode(b, o, out, contract);
  return o;
}
function decodeTrace(buf, out) {
  const raw = execFileSync("zstd", ["-d", "-c"], { input: buf, maxBuffer: 1 << 28 });
  if (td.decode(raw.subarray(0, 6)) !== "stxer0") throw new Error(`unexpected trace: ${td.decode(raw.subarray(0, 40))}`);
  decodeNode(raw, 6 + 64, out, null);
}
async function fetchTrace(sim, txid) {
  const f = path.join(CACHE, `${sim}-${txid}.bin`);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${API}/devtools/v2/simulations/${sim}/inspect/${txid}`);
    if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(f, b); return b; }
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return null;
}

// ---- walk every sim, every tx ----
const executed = new Map(); // contract name -> Set(ids)
const perSim = {};
let txs = 0, missing = 0;
for (const sim of sims) {
  const res = await getSimulationResult(sim);
  const ids = res.steps.map((s) => s.TxId).filter(Boolean);
  perSim[sim] = { txs: ids.length, before: (executed.get(NAME) || new Set()).size };
  const batches = []; for (let i = 0; i < ids.length; i += 8) batches.push(ids.slice(i, i + 8));
  for (const batch of batches) {
    const bufs = await Promise.all(batch.map((t) => fetchTrace(sim, t)));
    for (const buf of bufs) { txs += 1; if (!buf) { missing += 1; continue; } try { decodeTrace(buf, executed); } catch (e) { missing += 1; } }
  }
  perSim[sim].after = (executed.get(NAME) || new Set()).size;
  console.error(`${sim.slice(0, 8)}: ${ids.length} txs, ${NAME} ids ${perSim[sim].before} -> ${perSim[sim].after}`);
}
const hitAll = executed.get(NAME) || new Set();
const hit = new Set([...hitAll].filter((id) => callIds.has(id)));

// ---- line coverage ----
const lines = source.split("\n");
const lineTouched = new Map(); // line -> executed?
const codeLine = (i) => { const raw = lines[i - 1]; if (raw == null) return false; const t = raw.trim(); return t !== "" && !t.startsWith(";;") && t !== ")" && t !== "(" && !/^\)+$/.test(t); };
for (const [id, n] of nodes) {
  if (!n.list) continue;
  const l0 = n.line;
  if (l0 == null) continue;
  const on = hit.has(id);
  // an executed node marks its start line; a multi-line node only marks its first line (inner nodes mark theirs)
  if (on) lineTouched.set(l0, true); else if (!lineTouched.has(l0)) lineTouched.set(l0, false);
}
const codeLines = lines.map((_, i) => i + 1).filter(codeLine);
const coveredLines = codeLines.filter((l) => lineTouched.get(l) === true);
// ---- branches: if / match / asserts! whose arms never ran ----
const branches = [];
for (const [id, n] of nodes) {
  const l = n.list; if (!l) continue;
  const head = atomOf(l[0]); if (!["if", "match", "asserts!"].includes(head)) continue;
  const line = n.line;
  const arms = head === "if" ? [l[2], l[3]] : head === "match" ? [l[3], l[5] ?? l[4]] : [l[1]];
  const armHit = arms.map((a) => a && a.id != null ? hit.has(String(a.id)) : null);
  const nodeHit = hit.has(id);
  const state = !nodeHit ? "never reached" : head === "asserts!" ? "reached" : armHit.every((h) => h === true) ? "both arms" : armHit.some((h) => h === true) ? `one arm (${armHit[0] ? "then" : "else"} only)` : "arms not seen";
  branches.push({ id, line, fn: n.fn, head, state });
}
const partial = branches.filter((b) => b.state.startsWith("one arm") || b.state === "arms not seen");
const unreached = branches.filter((b) => b.state === "never reached");

// ---- uncovered lines grouped by function ----
const uncoveredByFn = {};
for (const [id, n] of nodes) { if (!n.list) continue; const l = n.line; if (!hit.has(id) && codeLine(l) && lineTouched.get(l) === false) (uncoveredByFn[n.fn] ||= new Set()).add(l); }

const out = [];
const L = (s) => out.push(s);
L(md ? `# Trace coverage: ${NAME}\n\nFrom \`simulations/trace-coverage.mjs\` on ${new Date().toISOString().slice(0, 10)}: ${sims.length} simulations, ${txs} transactions (${missing} without a trace), every evaluated expression read from the stxer debug traces.\n` : `${sims.length} sims, ${txs} txs (${missing} no trace)`);
L(md ? `| metric | value |\n|---|---|\n| expressions executed / total | ${hit.size} / ${total} (${((100 * hit.size) / total).toFixed(1)}%) |\n| code lines touched / total | ${coveredLines.length} / ${codeLines.length} (${((100 * coveredLines.length) / codeLines.length).toFixed(1)}%) |\n| branch nodes (if / match / asserts!) | ${branches.length}: ${branches.length - partial.length - unreached.length} full, ${partial.length} partial, ${unreached.length} never reached |`
  : `expressions ${hit.size}/${total} (${((100 * hit.size) / total).toFixed(1)}%), lines ${coveredLines.length}/${codeLines.length} (${((100 * coveredLines.length) / codeLines.length).toFixed(1)}%), branches ${branches.length}: ${partial.length} partial, ${unreached.length} never reached`);
L(md ? `\n## Branches with one arm never taken (${partial.length})\n\n| line | function | kind | state |\n|---|---|---|---|` : `\n== partial branches (${partial.length})`);
for (const b of partial.sort((a, c) => a.line - c.line)) L(md ? `| ${b.line} | ${b.fn} | ${b.head} | ${b.state} |` : `L${b.line} ${b.fn} ${b.head}: ${b.state}`);
L(md ? `\n## Branch nodes never reached (${unreached.length})\n\n| line | function | kind |\n|---|---|---|` : `\n== never reached (${unreached.length})`);
for (const b of unreached.sort((a, c) => a.line - c.line)) L(md ? `| ${b.line} | ${b.fn} | ${b.head} |` : `L${b.line} ${b.fn} ${b.head}`);
L(md ? `\n## Uncovered code lines by function\n\n| function | lines |\n|---|---|` : `\n== uncovered lines by function`);
for (const [fn, set] of Object.entries(uncoveredByFn).sort((a, b) => b[1].size - a[1].size)) L(md ? `| ${fn} | ${[...set].sort((a, b) => a - b).join(", ")} |` : `${fn}: ${[...set].sort((a, b) => a - b).join(", ")}`);
if (md) { L(`\n## Per simulation (cumulative executed expressions of ${NAME})\n\n| sim | txs | before | after |\n|---|---|---|---|`); for (const [s, v] of Object.entries(perSim)) L(`| \`${s.slice(0, 8)}\` | ${v.txs} | ${v.before} | ${v.after} |`); }
console.log(out.join("\n"));
