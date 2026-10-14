// _use-deploy-bytes.mjs - preload that makes an existing harness deploy the
// EXACT mv7dfb deploy bytes instead of the commented repo source, so its
// sims count in trace-coverage.mjs --by-source.
//   node --import ~/projects/jing-contracts-v3/simulations/_use-deploy-bytes.mjs <harness>
// Every fs.readFileSync of <repo>/contracts/.../<name>.clar (or a relative
// "contracts/.../<name>.clar") whose <name> has a file in deploy-bytes-mv7dfb/
// returns that file instead. A harness that then edits the text (a patched
// constant, a renamed binding) deploys other bytes, and coverage excludes it.
// Writes nothing; logs each substitution once to stderr.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { basename } from 'node:path';
const DIR = new URL('./deploy-bytes-mv7dfb/', import.meta.url);
const names = new Set(fs.readdirSync(DIR).filter((f) => f.endsWith('.clar')).map((f) => f.slice(0, -5)));
const real = fs.readFileSync;
const seen = new Set();
fs.readFileSync = function (p, ...rest) {
  const s = p instanceof URL ? p.pathname : typeof p === 'string' ? p : null;
  if (s && s.endsWith('.clar') && /(^|\/)contracts\//.test(s) && !/\/tests?\//.test(s) && !/deploy-bytes-mv7dfb/.test(s)) {
    const n = basename(s, '.clar');
    if (names.has(n)) {
      if (!seen.has(n)) { seen.add(n); process.stderr.write(`[deploy-bytes] ${n} <- deploy-bytes-mv7dfb/${n}.clar\n`); }
      return real.call(fs, new URL(`${n}.clar`, DIR), ...rest);
    }
  }
  return real.call(fs, p, ...rest);
};
syncBuiltinESMExports();
