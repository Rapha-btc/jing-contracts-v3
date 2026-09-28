// failure-arm coverage: every asserts!/unwrap!/unwrap-err!/try! node of the contract,
// hit = some trace recorded it returning EarlyReturn (its failure arm ran).
// trace-coverage.mjs cannot see these arms (they return plain constants).
//   node simulations/failure-arms.mjs <sim,sim,...> [--alias '^(markets-sbtc-stx-jing-v6-3|err-admin-)'] [--rev HEAD]
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
import { getSimulationResult, parseContract } from 'stxer';
const REPO = process.cwd();
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const NAME = 'markets-sbtc-stx-jing-v6-3';
const ALIAS = new RegExp(arg('--alias', '^(markets-sbtc-stx-jing-v6-3|err-admin-)'));
const sims = process.argv[2].split(',');
const source = execFileSync('git', ['-C', REPO, 'show', `${arg('--rev', 'HEAD')}:contracts/${NAME}.clar`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const lines = source.split('\n');
const ast = await parseContract({ sourceCode: source, contractId: `SP000000000000000000002Q6VF78.${NAME}`, clarityVersion: '5' });
const exprs = ast.expressions ?? ast.ast ?? ast;
const listOf = (e) => e?.expr?.List ?? e?.expr?.list ?? e?.list ?? null;
const atomOf = (e) => e?.expr?.Atom ?? e?.expr?.atom ?? null;
const lineOf = (span) => typeof span === 'string' ? Number(span.split(':')[0]) : span?.start_line ?? null;
const arms = new Map(); const fnKind = {};
function walk(e, fn) {
  const l = listOf(e); if (!l) return;
  const head = atomOf(l[0]);
  let f = fn;
  if (typeof head === 'string' && /^define-(public|private|read-only)$/.test(head)) { f = atomOf(listOf(l[1])[0]); fnKind[f] = head.slice(7); }
  if (['asserts!', 'unwrap!', 'unwrap-err!', 'try!'].includes(head)) {
    const errArm = head === 'try!' ? '' : (atomOf(l[2]) ?? lines[lineOf(l[2]?.span) - 1]?.trim());
    arms.set(String(e.id), { fn: f, line: lineOf(e.span), head, text: (lines[lineOf(e.span) - 1] || '').trim().slice(0, 90), err: errArm });
  }
  l.forEach((c) => walk(c, f));
}
for (const e of exprs) walk(e, '(top)');
const td = new TextDecoder();
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) + BigInt(b[o + i]); return v; };
const hit = new Map();
function node(b, o, contract) {
  const cl = u32(b, o); o += 4; const code = td.decode(b.subarray(o, o + cl)); o += cl;
  const id = String(u64(b, o)); o += 8; o += 80;
  const fl = u32(b, o); o += 4; o += fl;
  const al = u32(b, o); o += 4; for (let i = 0; i < al; i++) { o += 1; const l = u32(b, o); o += 4 + l; }
  const rok = b[o] === 0; o += 1; const rl = u32(b, o); o += 4; const res = td.decode(b.subarray(o, o + rl)); o += rl;
  const m = code.match(/^(S[PMTN][0-9A-Z]+\.[0-9a-zA-Z_-]+):/); if (m) contract = m[1].split('.')[1];
  if (contract && ALIAS.test(contract) && !rok && /EarlyReturn/.test(res) && arms.has(id)) { const c = res.match(/UInt\((\d+)\)/); hit.set(id, (hit.get(id) || new Set()).add(c ? `u${c[1]}` : res.slice(0, 40))); }
  const n = u32(b, o); o += 4; for (let i = 0; i < n; i++) o = node(b, o, contract); return o;
}
const CACHE = process.env.TRACE_CACHE || '/tmp/stxer-traces';
for (const sim of sims) {
  const res = await getSimulationResult(sim);
  for (const s of res.steps) { if (!s.TxId) continue; const f = `${CACHE}/${sim}-${s.TxId}.bin`; if (!fs.existsSync(f)) continue; try { node(execFileSync('zstd', ['-d', '-c'], { input: fs.readFileSync(f), maxBuffer: 1 << 28 }), 70, null); } catch {} }
}
const byFn = {};
for (const [id, a] of arms) (byFn[a.fn] ||= []).push({ id, ...a, hit: hit.get(id) });
let tot = 0, h = 0;
for (const [fn, list] of Object.entries(byFn).sort((a, b) => a[1][0].line - b[1][0].line)) {
  for (const a of list.sort((x, y) => x.line - y.line)) { tot++; if (a.hit) h++;
    console.log(`${a.hit ? 'HIT ' : '----'} ${fnKind[fn]?.padEnd(9)} ${fn.padEnd(34)} L${a.line} ${a.head.padEnd(8)} ${a.hit ? [...a.hit].join(',') : ''}  | ${a.err || a.text}`); }
}
console.log(`${h}/${tot} failure arms hit`);
