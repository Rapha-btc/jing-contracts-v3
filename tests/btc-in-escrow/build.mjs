// Builds the escrow under test for the simnet suite and the Rendezvous run.
// Only the five mainnet principals the escrow cannot reach in simnet are
// rewritten (two routers, two markets, USDCx) to local mocks; sBTC token and
// registry stay the REAL contracts (deployed from .cache at their mainnet
// addresses), so arm reads get-completed-deposit from the real registry.
// Every rewrite must hit exactly once; the source sha256 is printed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '../../contracts/btc-in/jing-btc-in-escrow-v2.clar');
const OUT = path.join(HERE, '.build');

const REWRITES = [
  ["'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-5", '.mock-router-stx'],
  ["'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-usdcx-jing-v5-5", '.mock-router-usdcx'],
  ["'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-4", '.mock-market-stx'],
  ["'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4", '.mock-market-usdcx'],
  ["'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx", '.mock-usdcx'],
];

function rewrite(text, pairs) {
  for (const [a, b] of pairs) {
    const n = text.split(a).length - 1;
    if (n !== 1) throw new Error(`rewrite ${a}: ${n} hits, want 1`);
    text = text.replace(a, b);
  }
  return text;
}

export function build() {
  // both simnet projects use the repo's devnet accounts (ignored copies)
  for (const dir of [HERE, path.join(HERE, 'rv')]) {
    fs.mkdirSync(path.join(dir, 'settings'), { recursive: true });
    fs.copyFileSync(path.join(HERE, '../../settings/Devnet.toml'), path.join(dir, 'settings/Devnet.toml'));
  }
  const src = fs.readFileSync(SRC, 'utf8');
  fs.mkdirSync(OUT, { recursive: true });
  const unit = rewrite(src, REWRITES);
  fs.writeFileSync(path.join(OUT, 'jing-btc-in-escrow.clar'), unit);
  // RV: the registry becomes a mock any account can complete deposits on,
  // and the harness (wrappers + invariants) is appended
  const rv = rewrite(unit, [["'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry", '.mock-registry']])
    + '\n\n' + fs.readFileSync(path.join(HERE, 'rv.invariants.clar'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'jing-btc-in-escrow-rv.clar'), rv);
  return crypto.createHash('sha256').update(src).digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`built from jing-btc-in-escrow-v2.clar sha256 ${build()}`);
}
