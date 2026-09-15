// branch-inventory.mjs
// Every decision point in a Clarity source, numbered, with its line and the
// enclosing function: (asserts! ...) with its error, (if ...), (match ...),
// (unwrap! ... ERR), (unwrap-panic ...), (try! ...). The list IS the set of
// scenarios a harness has to reach. Tag harness steps "[B<n>]" and the
// matrix script reports which numbers no harness carries.
//
// Run: node simulations/branch-inventory.mjs contracts/markets-sbtc-stx-jing-v6.clar [--md]
import fs from "node:fs";
const file = process.argv[2] || "contracts/markets-sbtc-stx-jing-v6.clar";
const md = process.argv.includes("--md");
const lines = fs.readFileSync(file, "utf8").split("\n");
let fn = "", n = 0;
const rows = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const def = l.match(/^\(define-(?:public|private|read-only) \(([a-z0-9?!-]+)/);
  if (def) fn = def[1];
  const t = l.trim();
  if (t.startsWith(";;")) continue;
  let kind = null, detail = "";
  let m;
  if ((m = t.match(/\(asserts! (.*?) (ERR_[A-Z_0-9]+)\)?\s*$/))) { kind = "asserts!"; detail = `${m[2]}: ${m[1].slice(0, 70)}`; }
  else if ((m = t.match(/\(asserts!\s*$/)) || (m = t.match(/^\(asserts! (.*)$/))) { kind = "asserts!"; detail = (m[1] || "(multi-line)").slice(0, 80); }
  else if ((m = t.match(/\(unwrap! (.*?) (ERR_[A-Z_0-9]+)\)/))) { kind = "unwrap!"; detail = `${m[2]}: ${m[1].slice(0, 60)}`; }
  else if (t.includes("(unwrap-panic ")) { kind = "unwrap-panic"; detail = t.slice(0, 80); }
  else if ((m = t.match(/^\(?(if|match) (.*)$/)) || (m = t.match(/\((if|match) (.*)$/))) { kind = m[1]; detail = m[2].slice(0, 80); }
  else if (t.includes("(try! ")) { kind = "try!"; detail = t.slice(0, 80); }
  if (!kind) continue;
  n += 1;
  rows.push({ n, line: i + 1, fn, kind, detail: detail.replace(/\|/g, "\\|") });
}
if (md) {
  console.log(`# Branch inventory: ${file}\n\n${rows.length} decision points. Tag harness steps \`[B<n>]\`.\n\n| B | line | function | kind | detail |\n|---|---|---|---|---|`);
  for (const r of rows) console.log(`| B${r.n} | ${r.line} | ${r.fn} | ${r.kind} | \`${r.detail}\` |`);
} else {
  for (const r of rows) console.log(`B${String(r.n).padEnd(4)} L${String(r.line).padEnd(5)} ${r.fn.padEnd(30)} ${r.kind.padEnd(12)} ${r.detail}`);
  const byKind = rows.reduce((a, r) => (a[r.kind] = (a[r.kind] || 0) + 1, a), {});
  console.error(`${rows.length} decision points`, byKind);
}
