// _use-router-v5-5-bytes.mjs - preload for the router v5-3 harnesses: the
// other contracts come from deploy-bytes-mv7dfb/ (via _use-deploy-bytes.mjs)
// and every read of contracts/swap-router-sbtc-stx-jing-v5-3.clar returns the
// v5-5 deploy bytes retargeted to markets-sbtc-stx-jing-v6-3 (the market the
// harnesses deploy; v5-5 differs from v5-4 only by the XYK status gate, and
// v5-4 from v5-3 only by that market id).
//   node --import ./simulations/_use-router-v5-5-bytes.mjs simulations/verify-router-v5-3-smart.js
import './_use-deploy-bytes.mjs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { routerV55Bytes, sha256 } from './_router-v5-5-bytes.mjs';

const BYTES = routerV55Bytes('v6-3');
const prev = fs.readFileSync;
let logged = false;
fs.readFileSync = function (p, ...rest) {
  const s = p instanceof URL ? p.pathname : typeof p === 'string' ? p : null;
  if (s && /(^|\/)contracts\/swap-router-sbtc-stx-jing-v5-3\.clar$/.test(s)) {
    if (!logged) { logged = true; process.stderr.write(`[router-v5-5] swap-router-sbtc-stx-jing-v5-3 <- v5-5 bytes on v6-3 (${Buffer.byteLength(BYTES)} B, sha256 ${sha256(BYTES)})\n`); }
    const enc = rest[0];
    return enc ? BYTES : Buffer.from(BYTES);
  }
  return prev.call(fs, p, ...rest);
};
syncBuiltinESMExports();
