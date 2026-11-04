// Deterministic replay of the RV wrappers: proves rv-arm / rv-execute /
// rv-cancel reach their success paths (the fuzz wrappers always return ok).
// Run from the repo root: node tests/btc-in-escrow/build.mjs && node tests/btc-in-escrow/rv-replay.mjs
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, cvToString } from '@stacks/transactions';
const s = await initSimnet('tests/btc-in-escrow/rv/Clarinet.toml');
const a = s.getAccounts(); const w1 = a.get('wallet_1'), w2 = a.get('wallet_2'), d = a.get('deployer');
const c = (f, args, who) => { const r = s.callPublicFn('jing-btc-in-escrow', f, args, who); return r; };
const u = Cl.uint, b = Cl.bool;
for (let i = 0; i < 6; i++) c('rv-deposit', [u(i), u(i), u(50000 + i)], i % 2 ? w2 : w1);
for (let i = 0; i < 6; i++) c('rv-arm', [b(i % 2 === 0), u(i), u(i), u(100), u(50), u(0), u(5)], i % 2 ? w2 : w1);
c('rv-arm', [b(true), u(0), u(0), u(0), u(0), u(0), u(5)], w1);
for (let i = 0; i < 4; i++) c('rv-execute', [u(i), u(i), u(i), u(10), u(5), b(false)], w1);
c('rv-execute', [u(4), u(4), u(0), u(0), u(0), b(true)], w1);
c('rv-execute', [u(0), u(0), u(0), u(0), u(0), b(false)], w1);
s.mineEmptyBlocks(12);
for (let i = 4; i < 6; i++) c('rv-cancel', [u(i), u(i)], w2);
c('rv-donate-and-sweep', [u(1234), b(true)], d);
c('rv-donate-and-sweep', [u(1), b(false)], d);
console.log(cvToString(s.callReadOnlyFn('jing-btc-in-escrow', 'rv-stats', [], d).result));
for (const f of ['invariant-parked-is-sum-of-open-net','invariant-parked-is-held','invariant-no-bad-transition','invariant-status-domain','invariant-no-stray-output'])
  console.log(f, cvToString(s.callReadOnlyFn('jing-btc-in-escrow', f, [], d).result));
