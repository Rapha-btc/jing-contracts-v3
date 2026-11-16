// _v6-5-redirect.mjs - run an unmodified v6-3 harness on the v6-5 bytes.
//   node --import ./_v6-5-redirect.mjs verify-v6-3-<suite>.js
// Preload, no harness edits:
//   1. fs.readFileSync of contracts/markets-sbtc-stx-jing-v6-3.clar returns
//      contracts/markets-sbtc-stx-jing-v6-5.clar (whole-line ;; comments
//      stripped, the deploy bytes); swap-router-sbtc-stx-jing-v5-3.clar returns
//      swap-router-sbtc-stx-jing-v5-6.clar with its hard-coded market principal
//      written back to ...-v6-3, so each harness's own name substitution
//      still binds the router to the market it deployed.
//   2. SimulationBuilder.new() pins the fork at V65_PIN. Default 9210800: the
//      block before jing-core-v6 / jing-ladder-v1 were deployed, as the v6-3
//      suites expect (they deploy both from source as SPV9, the owner).
//      V65_PIN=9296400 (2026-10-24) is the last block where SPV9 still owned
//      the live pair, for suites that drive the live set. A harness that calls
//      useBlockHeight itself keeps its own height. V65_PIN=tip disables the pin.
// Signed Lazer prints are newer than that block's time; the oracle and the
// market accept prints ahead of the block (age 0).
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { SimulationBuilder } from 'stxer';

const C = new URL('../contracts/', import.meta.url);
const read0 = fs.readFileSync;
const strip = (s) => s.split('\n').filter((l) => !/^\s*;;/.test(l)).join('\n');
const MAP = {
  'markets-sbtc-stx-jing-v6-3.clar': () => strip(read0(new URL('markets-sbtc-stx-jing-v6-5.clar', C), 'utf8')),
  'swap-router-sbtc-stx-jing-v5-3.clar': () => read0(new URL('swap-router-sbtc-stx-jing-v5-6.clar', C), 'utf8').split('markets-sbtc-stx-jing-v6-5').join('markets-sbtc-stx-jing-v6-3'),
};
const hits = new Set();
fs.readFileSync = function (p, opts) {
  const s = p instanceof URL ? p.pathname : String(p);
  const key = Object.keys(MAP).find((k) => s.endsWith(`/contracts/${k}`));
  if (key) {
    if (!hits.has(key)) { hits.add(key); console.log(`[v6-5 redirect] ${key} -> ${key.startsWith('markets') ? 'markets-sbtc-stx-jing-v6-5 (stripped)' : 'swap-router-sbtc-stx-jing-v5-6'}`); }
    const out = MAP[key]();
    const enc = typeof opts === 'string' ? opts : opts?.encoding;
    return enc ? out : Buffer.from(out, 'utf8');
  }
  return read0.apply(this, arguments);
};
syncBuiltinESMExports();

const PIN = process.env.V65_PIN ?? '9210800';
if (PIN !== 'tip') {
  const new0 = SimulationBuilder.new.bind(SimulationBuilder);
  SimulationBuilder.new = (...a) => {
    const b = new0(...a);
    if (typeof b.useBlockHeight === 'function') b.useBlockHeight(Number(PIN));
    return b;
  };
  console.log(`[v6-5 redirect] fork pinned at ${PIN} unless the harness pins its own`);
}
