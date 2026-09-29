// Keep market logic and line numbers identical; substitute dependency principals only.
import fs from 'node:fs';
import crypto from 'node:crypto';
const dir = 'tests/unit/v6-3';
const out = `${dir}/.build`;
fs.mkdirSync(out, { recursive: true });
// A rebuilt source must never inherit reports from an earlier revision.
for (const file of ['lcov.info', 'market.lcov.info', 'coverage.json', 'path-evidence.jsonl', 'path-matrix.json', 'stxer-crosscheck.json', 'rejected-state-changes.jsonl']) fs.rmSync(`${out}/${file}`, { force: true });
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
const corePath = 'contracts/jing-core-v6.clar';
const coreSha256 = crypto.createHash('sha256').update(fs.readFileSync(corePath)).digest('hex');
fs.rmSync(`${out}/core.clar`, { force: true });
fs.writeFileSync(`${out}/ladder.clar`, fs.readFileSync('tests/rv/mock-jing-ladder.clar', 'utf8') + '\n(define-public (set-max-band (n uint)) (ok (var-set max-band n)))\n');
fs.writeFileSync(`${out}/source.json`, JSON.stringify({ corePath, coreSha256, sourcePath, sha256: crypto.createHash('sha256').update(source).digest('hex'), substitutions }, null, 2) + '\n');
fs.mkdirSync(`${dir}/settings`, { recursive: true });
fs.copyFileSync('settings/Devnet.toml', `${dir}/settings/Devnet.toml`);
