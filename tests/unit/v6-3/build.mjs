// Keep market logic and line numbers identical; substitute dependency principals only.
import fs from 'node:fs';
import crypto from 'node:crypto';
const dir = 'tests/unit/v6-3';
const out = `${dir}/.build`;
fs.mkdirSync(out, { recursive: true });
// A rebuilt source must never inherit reports from an earlier revision.
for (const file of ['lcov.info', 'market.lcov.info', 'coverage.json']) fs.rmSync(`${out}/${file}`, { force: true });
const sourcePath = 'contracts/markets-sbtc-stx-jing-v6-3.clar';
const source = fs.readFileSync(sourcePath, 'utf8');
const substitutions = {
  "'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait": '.sip-010-trait.sip-010-trait',
  "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle": '.oracle',
  "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1": '.oracle',
};
let market = source;
for (const [from, to] of Object.entries(substitutions)) {
  if (!market.includes(from)) throw new Error(`Missing dependency: ${from}`);
  market = market.replaceAll(from, to);
}
fs.writeFileSync(`${out}/market.clar`, market);
// Copy real logger signatures, replacing only dependency bodies with controllable responses.
const coreSource = fs.readFileSync('contracts/jing-core-v6.clar', 'utf8');
let core = `(define-constant owner tx-sender)
(define-read-only (get-contract-owner) owner)
(define-data-var fail bool false)
(define-public (set-fail (value bool)) (ok (var-set fail value)))
`;
for (const match of coreSource.matchAll(/\(define-public \((log-[a-z-]+|register)\b/g)) {
  const start = match.index;
  let end = start + '(define-public '.length;
  let depth = 0;
  do {
    if (coreSource[end] === '(') depth++;
    if (coreSource[end] === ')') depth--;
    end++;
  } while (depth > 0);
  core += coreSource.slice(start, end) + '\n(begin (asserts! (not (var-get fail)) (err u9000)) (ok true)))\n';
}
fs.writeFileSync(`${out}/core.clar`, core);
fs.writeFileSync(`${out}/ladder.clar`, fs.readFileSync('tests/rv/mock-jing-ladder.clar', 'utf8') + '\n(define-public (set-max-band (n uint)) (ok (var-set max-band n)))\n');
fs.writeFileSync(`${out}/source.json`, JSON.stringify({ sourcePath, sha256: crypto.createHash('sha256').update(source).digest('hex'), substitutions }, null, 2) + '\n');
fs.mkdirSync(`${dir}/settings`, { recursive: true });
fs.copyFileSync('settings/Devnet.toml', `${dir}/settings/Devnet.toml`);
