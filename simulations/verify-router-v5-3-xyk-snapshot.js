// Fork only. Run: node simulations/verify-router-v5-3-xyk-snapshot.js
// (no oracle print needed: every router call here has update none)
//
// Differential for the XYK pool-snapshot change (Blazing Haven, bounty
// muqchqnaa54e769598a4, submission muzipzref76939675f71). Two stxer sessions
// at the same pinned block: REF deploys the working-tree router with the
// change reversed (tests/unit/router-v5-3/xyk-ref.mjs: xyk-keep, xyk-reserves
// and xyk-swap each read XYK_POOL get-pool), NEW the working-tree router (one
// read per smart CP stage, `xyk-quote`). Both run the same calls with the
// same accounts: smart sales in both directions at loose / tight / no-room
// limits (DLMM + XYK + Velar, CP split pro rata or capped), a dust amount,
// manual XYK legs. Per call: result and every committed event must be
// identical; the execution cost of each call is reported REF -> NEW.
import {
  ROUTER, NODE, H, check, tx, fund, deployAll, mk, source, shas, printsOf,
  manualArgs, manualFn, smartArgs, smartFn,
} from './_router-v5-3-harness.js';
import { getSimulationResult } from 'stxer';
import { hexToCV, cvToJSON } from '@stacks/transactions';
import { xykRef } from '../tests/unit/router-v5-3/xyk-ref.mjs';

const ROUTER_NAME = 'swap-router-sbtc-stx-jing-v5-3';
const P = 10_000_000_000n; // limits are uSTX per sat x 1e10

async function session(tag, routerSource, mid) {
  await deployAll([], { [ROUTER_NAME]: routerSource });
  const TX = mk(871), TY = mk(872);
  await fund('x', TX, 10_000_000n);
  await fund('y', TY, 20_000_000_000n);
  // limits around the fork's own price `mid` (uSTX per sat x 1e10)
  const calls = [
    ['smart sBTC sale, loose limit', TX, smartFn(true), smartArgs({ amount: 200_000n, limit: mid * 8n / 10n, mid })],
    ['smart sBTC sale, tight limit', TX, smartFn(true), smartArgs({ amount: 2_000_000n, limit: mid * 995n / 1000n, mid })],
    ['smart sBTC sale, no room', TX, smartFn(true), smartArgs({ amount: 200_000n, limit: mid * 2n, mid })],
    ['smart sBTC sale, dust', TX, smartFn(true), smartArgs({ amount: 1n, limit: mid * 8n / 10n, mid })],
    ['smart STX sale, loose limit', TY, smartFn(false), smartArgs({ amount: 300_000_000n, limit: mid * 12n / 10n, mid })],
    ['smart STX sale, tight limit', TY, smartFn(false), smartArgs({ amount: 3_000_000_000n, limit: mid * 1005n / 1000n, mid })],
    ['smart STX sale, no room', TY, smartFn(false), smartArgs({ amount: 300_000_000n, limit: mid / 2n, mid })],
    // past the DLMM's bins near the price: XYK and Velar both take part
    ['smart sBTC sale, wide limit, large', TX, smartFn(true), smartArgs({ amount: 5_000_000n, limit: mid * 97n / 100n, mid })],
    ['smart STX sale, wide limit, large', TY, smartFn(false), smartArgs({ amount: 10_000_000_000n, limit: mid * 103n / 100n, mid })],
    ['manual XYK sBTC leg', TX, manualFn(true), manualArgs({ amount: 50_000n, a: [0n, 50_000n, 0n] })],
    ['manual XYK STX leg', TY, manualFn(false), manualArgs({ amount: 100_000_000n, a: [0n, 100_000_000n, 0n] })],
  ];
  const out = [];
  for (const [label, who, fn, args] of calls) {
    const r = await tx(`${tag} ${label}`, who, ROUTER, fn, args, (v) => String(v).startsWith('(ok'));
    out.push({ label, result: r.result, events: JSON.stringify(printsOf(r)) });
  }
  const res = await getSimulationResult(H.sid);
  const costs = res.steps.map((s) => s.Result?.Transaction?.Ok).filter((t) => t && t.execution_cost).map((t) => t.execution_cost);
  // the last calls.length transactions are the router calls, in order
  const mine = costs.slice(-calls.length);
  mine.forEach((c, i) => { out[i].cost = c; });
  console.log(`${tag}: https://stxer.xyz/simulations/mainnet/${H.sid}`);
  return { sid: H.sid, out };
}

async function main() {
  const sha0 = shas();
  const info = await (await fetch(`${NODE}/v2/info`)).json();
  process.env.ROUTER_FORK_HEIGHT = String(info.stacks_tip_height - 3);
  console.log(`pinned block ${process.env.ROUTER_FORK_HEIGHT}`);
  const now = source(ROUTER_NAME), ref = xykRef(now);
  check('reference differs from the working tree only by the reversed hunks', String(ref !== now), 'true');
  // the price from the XYK pool at the tip (x = sBTC, y = STX): limits
  // are set around it; `mid` is only the book's sizing hint (update none)
  const pool = await (await fetch(`${NODE}/v2/contracts/call-read/SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR/xyk-pool-sbtc-stx-v-1-1/get-pool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sender: 'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR', arguments: [] }) })).json();
  const pv = cvToJSON(hexToCV(pool.result)).value.value;
  const mid = BigInt(pv['y-balance'].value) * P / BigInt(pv['x-balance'].value);
  console.log(`XYK spot ${mid} (uSTX per sat x 1e10)`);
  const a = await session('REF', ref, mid);
  const sidRef = a.sid;
  const b = await session('NEW', now, mid);
  let dr = 0, dl = 0, dt = 0;
  for (let i = 0; i < a.out.length; i++) {
    const x = a.out[i], y = b.out[i];
    check(`${x.label}: result identical`, y.result, x.result);
    check(`${x.label}: committed events identical`, y.events, x.events);
    const d = (k) => (y.cost?.[k] ?? 0) - (x.cost?.[k] ?? 0);
    console.log(`  cost ${x.label}: read_count ${x.cost?.read_count} -> ${y.cost?.read_count} (${d('read_count')}), read_length ${d('read_length')}, runtime ${x.cost?.runtime} -> ${y.cost?.runtime} (${d('runtime')}), write_count ${d('write_count')}`);
    check(`${x.label}: writes unchanged`, `${d('write_count')} ${d('write_length')}`, '0 0');
    dr += d('read_count'); dl += d('read_length'); dt += d('runtime');
  }
  for (const dir of ['sBTC', 'STX']) check(`a smart ${dir} sale ran an XYK swap`, String(b.out.some((o) => o.label.startsWith(`smart ${dir}`) && !/\(xyk-in u0\)/.test(o.result))), 'true');
  console.log(`total over ${a.out.length} calls: read_count ${dr}, read_length ${dl}, runtime ${dt}`);
  check('sources unchanged during the run', JSON.stringify(shas()), JSON.stringify(sha0));
  console.log(`${H.passed}/${H.checks} checks green`);
  console.log(`REF https://stxer.xyz/simulations/mainnet/${sidRef}`);
  console.log(`NEW https://stxer.xyz/simulations/mainnet/${b.sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
