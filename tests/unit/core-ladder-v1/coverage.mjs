import fs from 'node:fs';
import crypto from 'node:crypto';
const dir = 'tests/unit/core-ladder-v1', out = `${dir}/.build`;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const meta = JSON.parse(fs.readFileSync(`${out}/source.json`, 'utf8'));
for (const m of Object.values(meta.sources)) if (sha(fs.readFileSync(m.path, 'utf8')) !== m.sha256) throw Error(`${m.path} changed; rerun tests.`);
const results = JSON.parse(fs.readFileSync(`${out}/results.json`, 'utf8'));
if (!results.success || !results.numPassedTests || results.numFailedTests || results.numPendingTests || results.numTodoTests) throw Error('Report requires a complete passing run without skips.');
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.test.ts')))
  if (!results.testResults.some(r => r.name.endsWith(`/${dir}/${file}`))) throw Error(`Suite omitted: ${file}`);
const lcov = fs.readFileSync(`${out}/lcov.info`, 'utf8');
const metric = m => { const hit = [...m.values()].filter(n => n > 0).length; return {hit, total: m.size, percent: Number((hit * 100 / m.size).toFixed(2))}; };

// Source-anchored exceptions. Each must still be unhit (an unexpected hit
// fails the report) and its enclosing function must have run.
const exceptions = {
  'jing-core-v6': [{kind: 'branch', fragment: '      (- total (if (> applied total) total applied))', arm: 0, fn: 'debit',
    reason: 'Saturating arm of the aggregate debit: total-token-equity is the sum of owner equities (credit/debit change both by the same amount) and applied <= the owner equity, so applied > total cannot occur'}],
  'jing-ladder-v1': [{kind: 'line', fragment: '      (key {', after: '(define-public (retire-band', fn: 'retire-band',
    reason: 'Tuple-literal let binding of executed retire-band; the SDK reports the opening line unhit although `key` is evaluated on every call (the map lookup on the next binding uses it)'}],
};
const contracts = {};
for (const [name, m] of Object.entries(meta.sources)) {
  const functions = new Map(), lines = new Map(), branches = new Map(); let records = 0;
  for (const record of lcov.split('end_of_record')) {
    if (!record.split('\n').some(l => l.startsWith('SF:') && l.endsWith(`/${m.path}`))) continue;
    records++;
    const add = (map, k, n) => map.set(k, (map.get(k) ?? 0) + n);
    for (const line of record.split('\n')) {
      const [kind, rest] = line.split(':'); if (!rest) continue; const v = rest.split(',');
      if (kind === 'FN') functions.set(v[1], functions.get(v[1]) ?? 0);
      if (kind === 'FNDA') add(functions, v[1], Number(v[0]));
      if (kind === 'DA') add(lines, v[0], Number(v[1]));
      if (kind === 'BRDA') add(branches, v.slice(0, 3).join(','), v[3] === '-' ? 0 : Number(v[3]));
    }
  }
  const source = fs.readFileSync(m.path, 'utf8');
  const expected = [...source.matchAll(/^\(define-(?:public|read-only|private)\s+\(/gm)].length;
  if (!records || functions.size !== expected) throw Error(`Incomplete instrumentation for ${name}: ${functions.size}/${expected}`);
  const raw = {functions: metric(functions), lines: metric(lines), branches: metric(branches)};
  const excluded = [];
  for (const e of exceptions[name]) {
    const start = e.after ? source.indexOf(e.after) : 0;
    const index = source.indexOf(e.fragment, start);
    const end = e.after ? source.indexOf('\n(define-', start + 1) : source.length;
    if (start < 0 || index < 0 || index > end || (!e.after && source.indexOf(e.fragment, index + 1) >= 0)) throw Error(`Exception fragment not found or not unique: ${e.fragment}`);
    const line = source.slice(0, index).split('\n').length;
    if (!(functions.get(e.fn) > 0)) throw Error(`Enclosing function must run: ${e.fn}`);
    const key = e.kind === 'branch' ? `${line},0,${e.arm}` : String(line);
    const map = e.kind === 'branch' ? branches : lines;
    if (map.get(key) !== 0) throw Error(`Exception ${e.kind} ${key} in ${name} is no longer unhit; remove it`);
    map.delete(key); excluded.push({kind: e.kind, point: key, reason: e.reason});
  }
  contracts[name] = {path: m.path, sha256: m.sha256, raw, excluded, functions: metric(functions), lines: metric(lines), branches: metric(branches),
    uncoveredFunctions: [...functions].filter(([, n]) => !n).map(([k]) => k),
    uncoveredLines: [...lines].filter(([, n]) => !n).map(([k]) => Number(k)),
    uncoveredBranches: [...branches].filter(([, n]) => !n).map(([k]) => k)};
}
const report = {tests: results.numPassedTests, contracts};
fs.writeFileSync(`${out}/coverage.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(contracts).map(([n, c]) => [n, {raw: c.raw, functions: c.functions, lines: c.lines, branches: c.branches}])), null, 2));
const thresholds = JSON.parse(fs.readFileSync(`${dir}/coverage-thresholds.json`, 'utf8'));
for (const [name, c] of Object.entries(contracts)) for (const [kind, min] of Object.entries(thresholds))
  if (c[kind].percent < min) throw Error(`${name}: ${kind} coverage ${c[kind].percent}% is below ${min}%`);
const row = (n, c) => `| ${n} | ${c.functions.hit}/${c.functions.total} (${c.functions.percent}%) | ${c.lines.hit}/${c.lines.total} (${c.lines.percent}%) | ${c.branches.hit}/${c.branches.total} (${c.branches.percent}%) |`;
const doc = ['# jing-core-v6 and jing-ladder-v1 Clarinet coverage', '',
  `Generated by \`npm run test:core-ladder-v1\`: **${report.tests}/${report.tests} passing tests**.`, '',
  `Both contracts run on their unmodified bytes from \`contracts/\`. Gate: ${Object.entries(thresholds).map(([k, v]) => `${v}% ${k}`).join(' / ')} after the source-anchored exceptions below. See [scope](README.md).`, '',
  '| Contract | Functions | Lines | Branches |', '| --- | --- | --- | --- |', ...Object.entries(contracts).map(([n, c]) => row(n, c)), '',
  '## Raw instrumentation (before exceptions)', '', '| Contract | Functions | Lines | Branches |', '| --- | --- | --- | --- |',
  ...Object.entries(contracts).map(([n, c]) => row(n, c.raw)), '', '## Exceptions', '',
  ...Object.entries(contracts).flatMap(([n, c]) => c.excluded.map(e => `- ${n} ${e.kind} \`${e.point}\`: ${e.reason}.`)), '',
  '## Source SHA-256', '', ...Object.entries(contracts).map(([n, c]) => `- ${n}: \`${c.sha256}\`.`), '',
  '## Remaining instrumentation points', '',
  ...Object.entries(contracts).flatMap(([n, c]) => [`- ${n}: functions ${c.uncoveredFunctions.join(', ') || 'none'}; lines ${c.uncoveredLines.join(', ') || 'none'}; branches ${c.uncoveredBranches.join(', ') || 'none'}.`]), ''];
fs.writeFileSync(`${dir}/COVERAGE.md`, doc.join('\n'));
