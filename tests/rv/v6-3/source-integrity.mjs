import fs from 'node:fs';
import crypto from 'node:crypto';

export const hashInputs = paths => Object.fromEntries(paths.map(path =>
  [path, crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));

export function assertInputsUnchanged(hashes) {
  for (const [path, expected] of Object.entries(hashes)) {
    if (hashInputs([path])[path] !== expected) {
      throw Error(`RV input changed during testing: ${path}. Rebuild and rerun; no current-source report can be published.`);
    }
  }
}

export function assertProductionPrefix(fullBook) {
  const meta = JSON.parse(fs.readFileSync('tests/rv/.build/v6-3/source.json', 'utf8'));
  if (meta.fullBook !== fullBook || hashInputs([meta.source])[meta.source] !== meta.sha256) {
    throw Error('Wrong profile or stale RV source; rebuild and rerun.');
  }
  if (hashInputs([meta.coreSource])[meta.coreSource] !== meta.coreSha256) throw Error('Real core changed; rebuild RV.');
  const manifest = fs.readFileSync('tests/rv/v6-3/Clarinet.toml', 'utf8');
  if (!manifest.includes('[contracts.jing-core-v6]\npath = "../../../contracts/jing-core-v6.clar"') || manifest.includes('mock-jing-core')) throw Error('RV must load the real core directly.');
  let prefix = fs.readFileSync(meta.source, 'utf8');
  for (const [from, to] of Object.entries(meta.dependencySubstitutions)) prefix = prefix.replaceAll(from, to);
  if (!fs.readFileSync('tests/rv/.build/v6-3/market.clar', 'utf8').startsWith(prefix + '\n')) {
    throw Error('RV production prefix differs beyond dependency substitutions.');
  }
}

export const sharedInputs = [
  'contracts/markets-sbtc-stx-jing-v6-3.clar',
  'tests/rv/v6-3/Clarinet.toml', 'tests/rv/v6-3/properties.clar',
  'tests/rv/v6-3/build.py', 'tests/rv/v6-3/strict-ft.clar',
  'tests/rv/v6-3/source-integrity.mjs', 'tests/rv/sip-010-trait.clar',
  'tests/rv/mock-lazer-oracle.clar', 'tests/rv/mock-jing-ladder.clar',
  'tests/rv/.build/v6-3/source.json', 'contracts/jing-core-v6.clar', 'tests/rv/v6-3/runtime.mjs',
  'tests/rv/.build/v6-3/ladder.clar', 'tests/rv/.build/v6-3/market.clar',
];
