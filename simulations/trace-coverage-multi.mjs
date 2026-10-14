// trace-coverage-multi.mjs - trace-coverage.mjs --by-source for MANY contracts
// in one pass: each sim result is read once, each tx trace is decoded once,
// and every expression is credited to the measured contract whose bytes the
// executing deployment carries (sha256 of the deploy body). Same AST, line
// and branch rules as trace-coverage.mjs; writes the same report shape.
//   node simulations/trace-coverage-multi.mjs --sims-file <file> --out <prefix> name:clarity:path ...
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getSimulationResult, parseContract } from "stxer";
import { deserializeTransaction } from "@stacks/transactions";
import { sha256 } from "./_sim-source.mjs";
import { createRequire } from "node:module";
const { c32address } = createRequire(import.meta.url)("c32check");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const specs = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const simsFile = arg("--sims-file");
const OUT = arg("--out", "simulations/TRACE-COVERAGE-mv7dfb-");
const sims = [...new Set(fs.readFileSync(simsFile, "utf8").split("\n").map((l) => (l.match(/^([0-9a-f]{32})/) || [])[1]).filter(Boolean))];
const CACHE = process.env.TRACE_CACHE || path.join(process.env.TMPDIR || "/tmp", "stxer-traces");
fs.mkdirSync(CACHE, { recursive: true });
const RCACHE = path.join(CACHE, "results"); fs.mkdirSync(RCACHE, { recursive: true });

// ---- measured contracts ----
const listOf = (e) => e?.expr?.List ?? e?.expr?.list ?? e?.list ?? null;
const atomOf = (e) => e?.expr?.Atom ?? e?.expr?.atom ?? null;
const lineOf = (span) => { if (typeof span === "string") return Number(span.split(":")[0]); return span?.start_line ?? span?.startLine ?? null; };
const C = [];
for (const s of specs) {
  const [name, clarity, file] = s.split(":");
  const source = fs.readFileSync(file, "utf8");
  const ast = await parseContract({ sourceCode: source, contractId: `SP000000000000000000002Q6VF78.${name}`, clarityVersion: clarity });
  const exprs = ast.expressions ?? ast.ast ?? ast;
  const nodes = new Map(), sigLines = new Set();
  const markSig = (e) => { if (!e || typeof e !== "object") return; if (e.span) sigLines.add(lineOf(e.span)); const l = listOf(e); if (l) for (const c of l) markSig(c); };
  const walk = (e, fn, inSig = false) => {
    if (!e || typeof e !== "object") return;
    if (e.id != null && e.span && !inSig) nodes.set(String(e.id), { line: lineOf(e.span), list: listOf(e), fn });
    const l = listOf(e);
    if (l) {
      const head = atomOf(l[0]);
      const isDefFn = typeof head === "string" && /^define-(public|private|read-only)$/.test(head);
      const f = typeof head === "string" && /^define-/.test(head) ? atomOf(listOf(l[1])?.[0]) ?? atomOf(l[1]) ?? fn : fn;
      if (isDefFn) markSig(l[1]);
      l.forEach((c, k) => walk(c, f, inSig || (isDefFn && k === 1)));
    }
  };
  for (const e of exprs) walk(e, "(top)");
  const publics = new Set(), privates = new Set();
  for (const e of exprs) { const l = listOf(e); const h = l && atomOf(l[0]); if (h === "define-public" || h === "define-read-only" || h === "define-private") (h === "define-private" ? privates : publics).add(`${h === "define-read-only" ? "ro:" : ""}${atomOf(listOf(l[1])?.[0])}`); }
  C.push({ name, clarity, file, source, hash: sha256(source), nodes, sigLines, publics, hit: new Set(), counts: new Map(), sims: new Set(), calls: new Map() });
}
const byHash = new Map(C.map((c) => [c.hash, c]));

// ---- trace decoding (same wire format as trace-coverage.mjs) ----
const td = new TextDecoder();
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) + BigInt(b[o + i]); return v; };
function decodeNode(b, o, inst, cur) {
  const codeLen = u32(b, o); o += 4;
  const code = td.decode(b.subarray(o, o + codeLen)); o += codeLen;
  const id = u64(b, o); o += 8;
  o += 80;
  const funcLen = u32(b, o); o += 4; o += funcLen;
  const argsLen = u32(b, o); o += 4;
  for (let i = 0; i < argsLen; i++) { o += 1; const len = u32(b, o); o += 4; o += len; }
  o += 1; const rlen = u32(b, o); o += 4; o += rlen;
  const m = code.match(/^(S[PMTN][0-9A-Z]+\.[0-9a-zA-Z_-]+):/);
  if (m) cur = inst.get(m[1]) ?? null;
  if (cur) { cur.hit.add(String(id)); const k = String(id); cur.counts.set(k, (cur.counts.get(k) || 0) + 1); }
  const n = u32(b, o); o += 4;
  for (let i = 0; i < n; i++) o = decodeNode(b, o, inst, cur);
  return o;
}
async function fetchTrace(sim, txid) {
  const f = path.join(CACHE, `${sim}-${txid}.bin`);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  if (fs.existsSync(`${f}.none`)) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://api.stxer.xyz/devtools/v2/simulations/${sim}/inspect/${txid}`);
    if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(f, b); return b; }
    if (r.status === 404 && attempt === 3) fs.writeFileSync(`${f}.none`, "");
    await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
  }
  return null;
}
async function result(sim) {
  const f = path.join(RCACHE, `${sim}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const r = await getSimulationResult(sim);
  const slim = { steps: r.steps.map((s) => ({ TxId: s.TxId, Transaction: s.Transaction })) };
  fs.writeFileSync(f, JSON.stringify(slim));
  return slim;
}
const str = (v) => (typeof v === "string" ? v : v?.content ?? v?.data ?? String(v));
let txs = 0, noTrace = 0;
for (const sim of sims) {
  const res = await result(sim);
  const inst = new Map(); // deployed contract id -> measured contract
  const target = new Map(); // txid -> measured contract it calls (for function tallies)
  for (const s of res.steps) {
    if (!s.Transaction) continue;
    let tx; try { tx = deserializeTransaction(s.Transaction); } catch { continue; }
    const p = tx.payload;
    if (p.codeBody !== undefined) {
      const c = byHash.get(sha256(str(p.codeBody)));
      if (c) { inst.set(`${addrOf(tx)}.${str(p.contractName)}`, c); c.sims.add(sim); }
    } else if (p.functionName !== undefined && s.TxId) target.set(s.TxId, { id: `${addrStr(p.contractAddress)}.${str(p.contractName)}`, fn: str(p.functionName) });
  }
  if (!inst.size) continue;
  for (const [t, v] of target) { const c = inst.get(v.id); if (c) c.calls.set(v.fn, (c.calls.get(v.fn) || 0) + 1); }
  const ids = res.steps.map((s) => s.TxId).filter(Boolean);
  for (let i = 0; i < ids.length; i += 8) {
    const bufs = await Promise.all(ids.slice(i, i + 8).map((t) => fetchTrace(sim, t)));
    for (const buf of bufs) {
      txs++;
      if (!buf) { noTrace++; continue; }
      try {
        const raw = execFileSync("zstd", ["-d", "-c"], { input: buf, maxBuffer: 1 << 28 });
        decodeNode(raw, 6 + 64, inst, null);
      } catch { noTrace++; }
    }
  }
  console.error(`${sim.slice(0, 8)}: ${ids.length} txs, instances ${[...new Set(inst.values())].map((c) => c.name).join(" ")}`);
}
function addrStr(a) { return typeof a === "string" ? a : c32address(a.version, a.hash160); }
function addrOf(tx) {
  const sc = tx.auth.spendingCondition;
  // hash modes 0 (P2PKH) and 2 (P2WPKH) are single-sig: mainnet version 22 (SP), else 20 (SM)
  return c32address(sc.hashMode === 0 || sc.hashMode === 2 ? 22 : 20, sc.signer);
}

// ---- reports ----
const summary = [];
for (const c of C) {
  const callIds = new Set([...c.nodes].filter(([, n]) => n.list).map(([id]) => id));
  const hit = new Set([...c.hit].filter((id) => callIds.has(id)));
  const branches = [];
  const cnt = (i) => c.counts.get(String(i)) || 0;
  for (const [id, n] of c.nodes) {
    const l = n.list; if (!l) continue;
    const head = atomOf(l[0]); if (!["if", "match", "asserts!"].includes(head)) continue;
    const arms = head === "if" ? [l[2], l[3]] : head === "match" ? [l[3], l[5] ?? l[4]] : [l[1]];
    const nodeHit = c.hit.has(id);
    const armHit = arms.map((a) => {
      if (!a || a.id == null) return null;
      if (listOf(a)) return c.hit.has(String(a.id));
      const others = arms.filter((o) => o && o !== a && listOf(o)).reduce((acc, o) => acc + cnt(o.id), 0);
      return nodeHit && cnt(id) > others;
    });
    const state = !nodeHit ? "never reached" : head === "asserts!" ? "reached" : armHit.every((h) => h === true) ? "both arms" : armHit.some((h) => h === true) ? `one arm (${armHit[0] ? "then" : "else"} only)` : "arms not seen";
    branches.push({ line: n.line, fn: n.fn, head, state });
  }
  const partial = branches.filter((b) => b.state.startsWith("one arm") || b.state === "arms not seen");
  const never = branches.filter((b) => b.state === "never reached");
  const fnHit = new Map();
  for (const [id, n] of c.nodes) if (n.list && n.fn !== "(top)") { const e = fnHit.get(n.fn) || { hit: 0, all: 0 }; e.all++; if (hit.has(id)) e.hit++; fnHit.set(n.fn, e); }
  const pubs = [...c.publics].filter((p) => !p.startsWith("ro:"));
  const ros = [...c.publics].filter((p) => p.startsWith("ro:")).map((p) => p.slice(3));
  const reachedPub = pubs.filter((p) => (fnHit.get(p)?.hit ?? 0) > 0);
  const md = [`# Trace coverage: ${c.name}`, "",
    `From \`simulations/trace-coverage-multi.mjs\` on ${new Date().toISOString().slice(0, 10)}: final deploy bytes \`${c.file}\` (sha256 \`${c.hash}\`), counted only where a sim deployed these exact bytes (${c.sims.size} sims).`, "",
    "| metric | value |", "|---|---|",
    `| expressions executed / total | ${hit.size} / ${callIds.size} (${((100 * hit.size) / callIds.size).toFixed(1)}%) |`,
    `| public functions reached | ${reachedPub.length} / ${pubs.length} |`,
    `| branch nodes (if / match / asserts!) | ${branches.length}: ${branches.length - partial.length - never.length} full, ${partial.length} partial, ${never.length} never reached |`, "",
    `## Public functions never reached (${pubs.length - reachedPub.length})`, "", ...pubs.filter((p) => !reachedPub.includes(p)).map((p) => `- ${p}`), "",
    `## Read-only functions with no traced expression (${ros.filter((p) => !(fnHit.get(p)?.hit)).length}; read-only calls from Eval steps leave no trace)`, "", ros.filter((p) => !(fnHit.get(p)?.hit)).join(", "), "",
    `## Branches with one arm never taken (${partial.length})`, "", "| line | function | kind | state |", "|---|---|---|---|", ...partial.sort((a, b) => a.line - b.line).map((b) => `| ${b.line} | ${b.fn} | ${b.head} | ${b.state} |`), "",
    `## Branch nodes never reached (${never.length})`, "", "| line | function | kind |", "|---|---|---|", ...never.sort((a, b) => a.line - b.line).map((b) => `| ${b.line} | ${b.fn} | ${b.head} |`), "",
    "## Function bodies (expressions hit / total)", "", "| function | hit / total |", "|---|---|", ...[...fnHit].sort((a, b) => a[1].hit / a[1].all - b[1].hit / b[1].all).map(([f, e]) => `| ${f} | ${e.hit} / ${e.all} |`), "",
    `## Sims counted (${c.sims.size})`, "", [...c.sims].map((s) => `\`${s.slice(0, 8)}\``).join(" "), ""];
  fs.writeFileSync(`${OUT}${c.name}.md`, md.join("\n"));
  const row = { name: c.name, expr: `${hit.size}/${callIds.size}`, pub: `${reachedPub.length}/${pubs.length}`, branches: branches.length, full: branches.length - partial.length - never.length, partial: partial.length, never: never.length, sims: c.sims.size };
  summary.push(row);
  console.log(`${c.name} | expr ${row.expr} | public ${row.pub} | branches ${row.branches}: ${row.full} full, ${row.partial} partial, ${row.never} never | ${row.sims} sims`);
}
fs.writeFileSync(`${OUT}summary.json`, JSON.stringify({ date: new Date().toISOString(), sims: sims.length, txs, noTrace, summary }, null, 2) + "\n");
