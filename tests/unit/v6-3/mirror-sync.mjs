// The deployed market is the de-indented markets-sbtc-stx-jing-v6-3.clar.
// Its -formatted and -followAll copies must be the same program: same token
// stream once comments, whitespace and tuple trailing commas are ignored.
// Prints the first divergence per copy (with line numbers) and exits 1 if any.
//   node tests/unit/v6-3/mirror-sync.mjs
import fs from 'node:fs';
const base = 'contracts/markets-sbtc-stx-jing-v6-3';
function tokens(path) {
  const s = fs.readFileSync(path, 'utf8'), out = [];
  let i = 0, line = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === ';') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '(' || c === ')' || c === '{' || c === '}') { out.push([c, line]); i++; continue; }
    if (c === '"') { let j = i + 1; while (s[j] !== '"') j += s[j] === '\\' ? 2 : 1; out.push([s.slice(i, j + 1), line]); i = j + 1; continue; }
    let j = i; while (j < s.length && !/[\s(){}";]/.test(s[j])) j++;
    const t = s.slice(i, j).replace(/,+$/, '');
    if (t) out.push([t, line]);
    i = j;
  }
  return out;
}
const reference = tokens(`${base}.clar`);
let failed = false;
for (const copy of ['-formatted', '-followAll']) {
  const other = tokens(`${base}${copy}.clar`);
  const n = Math.min(reference.length, other.length);
  let k = 0; while (k < n && reference[k][0] === other[k][0]) k++;
  if (k === n && reference.length === other.length) { console.log(`${copy}: in sync (${reference.length} tokens)`); continue; }
  failed = true;
  const show = (t, at) => t.slice(at, at + 12).map(x => x[0]).join(' ');
  console.log(`${copy}: DIVERGES at token ${k}: deploy copy line ${reference[k]?.[1]} vs ${copy} line ${other[k]?.[1]}`);
  console.log(`  deploy:  ${show(reference, k)}`);
  console.log(`  ${copy}: ${show(other, k)}`);
}
process.exit(failed ? 1 : 0);
