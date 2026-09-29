import fs from 'node:fs';
import crypto from 'node:crypto';
const dir = 'tests/unit/v6-3/.build';
const meta = JSON.parse(fs.readFileSync(`${dir}/source.json`, 'utf8'));
const source = fs.readFileSync(meta.sourcePath, 'utf8');
if (crypto.createHash('sha256').update(source).digest('hex') !== meta.sha256) throw new Error('Source changed since the suite was built; rerun tests.');
if (crypto.createHash('sha256').update(fs.readFileSync(meta.corePath)).digest('hex') !== meta.coreSha256) throw new Error('Core changed since the suite was built; rerun tests.');
let expected = source;
for (const [from, to] of Object.entries(meta.substitutions)) expected = expected.replaceAll(from, to);
if (fs.readFileSync(`${dir}/market.clar`, 'utf8') !== expected) throw new Error('Instrumented market differs beyond declared dependency substitutions.');
const functions = new Map(), lines = new Map(), branches = new Map(), locations = new Map();
let records = 0;
for (const record of fs.readFileSync(`${dir}/lcov.info`, 'utf8').split('end_of_record')) {
  if (!record.split('\n').some(l => l.startsWith('SF:') && l.endsWith(`/${dir}/market.clar`))) continue;
  records++;
  for (const line of record.split('\n')) {
    const [kind, rest] = line.split(':');
    if (!rest) continue;
    const v = rest.split(',');
    if (kind === 'FN') { locations.set(v[1], Number(v[0])); if (!functions.has(v[1])) functions.set(v[1], 0); }
    if (kind === 'FNDA') functions.set(v[1], (functions.get(v[1]) ?? 0) + Number(v[0]));
    if (kind === 'DA') lines.set(v[0], (lines.get(v[0]) ?? 0) + Number(v[1]));
    if (kind === 'BRDA') { const key = v.slice(0,3).join(','); branches.set(key, (branches.get(key) ?? 0) + (v[3] === '-' ? 0 : Number(v[3]))); }
  }
}
if (!records || functions.size !== [...source.matchAll(/\(define-(?:public|read-only|private)\s+\(/g)].length) throw new Error('Missing or incomplete market instrumentation.');
const metric = m => ({ hit: [...m.values()].filter(n => n > 0).length, total: m.size, percent: Number((100 * [...m.values()].filter(n => n > 0).length / m.size).toFixed(2)) });
const report = { source: meta.sourcePath, sha256: meta.sha256, core: {source: meta.corePath, sha256: meta.coreSha256}, records, functions: metric(functions), lines: metric(lines), branches: metric(branches), uncoveredFunctions: [...functions].filter(([,n]) => !n).map(([name]) => ({ name, line: locations.get(name) })), uncoveredLines: [...lines].filter(([,n]) => !n).map(([line]) => Number(line)), uncoveredBranches: [...branches].filter(([,n]) => !n).map(([key]) => key) };
fs.writeFileSync(`${dir}/coverage.json`, JSON.stringify(report, null, 2) + '\n');
// A single correctly merged LCOV record, mapped to the real source for viewers.
const lcov = [`TN:v6-3-unit`, `SF:${meta.sourcePath}`, ...[...locations].map(([name,line]) => `FN:${line},${name}`), ...[...functions].map(([name,n]) => `FNDA:${n},${name}`), `FNF:${functions.size}`, `FNH:${report.functions.hit}`, ...[...lines].map(([line,n]) => `DA:${line},${n}`), `LF:${lines.size}`, `LH:${report.lines.hit}`, ...[...branches].map(([key,n]) => `BRDA:${key},${n}`), `BRF:${branches.size}`, `BRH:${report.branches.hit}`, 'end_of_record', ''];
fs.writeFileSync(`${dir}/market.lcov.info`, lcov.join('\n'));
console.log(JSON.stringify({ ...report, uncoveredLines: undefined, uncoveredBranches: undefined }, null, 2));
const thresholds = JSON.parse(fs.readFileSync('tests/unit/v6-3/coverage-thresholds.json', 'utf8'));
for (const [kind, minimum] of Object.entries(thresholds)) {
  if (report[kind].percent < minimum) throw new Error(`${kind} coverage ${report[kind].percent}% is below ${minimum}%. See ${dir}/coverage.json.`);
}

await import('./path-matrix.mjs');
await import('./stxer-crosscheck.mjs');
