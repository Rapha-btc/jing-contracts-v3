// stxer mainnet-fork check for bounty mwofjt42 #5 (Valiant Brio F-01): how many
// sats can Zest dust bins make a vault router-swap lose against its floor?
//
// The vaults (fastpool-swap-vault, ccd016-swap-vault-mia-v2) sell through
// smart-swap-sbtc-for-stx at limit = floor-of(mid) = mid - 1%, then assert
//   out >= floor-out(sold - ROUTER_SLACK_SATS, limit)
// Router v6 walks up to 32 Zest bins with min 0, and each bin rounds against
// the seller. Here: Zest pool u3 is created on the fork (wstx / sbtc, bin step
// 100, ZEST_FEE, default 0.3% = pool 1), an LP puts DUST uSTX in each of the 32
// STX bins below tick(mid) (the bins a sell walks), and router v6 (repo bytes,
// deployed as ROUTER_AS since v6 is live) sells vault-sized amounts at the
// vault floor. For each sale: need = sold - floor(out * 1e10 / limit), the
// smallest ROUTER_SLACK_SATS that passes the vault check.
// Run: node simulations/verify-zest-dust-slack.mjs   (DUST=100 ZEST_FEE=300000)
import { readFileSync } from 'node:fs';
import { uintCV, intCV, noneCV, tupleCV, listCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { NODE, DEP, WHALE, P_, mk, S, retry, check, must, show, tx, evalIn, call, deploy, summary, Stop, stxTransfer, SBTC } from './_yg-loop-common.js';

const ZPOOL = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1';
const ZROUTER = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1';
const ZEXEC = 'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.executor-dao';
const ZWSTX = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx';
const ZID = 3;
const DLMM_CORE = 'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1';
const DPOOLS = [1, 2, 3].map((n) => `SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-${n}-bps-15`);
const AS = process.env.ROUTER_AS || 'swap-router-sbtc-stx-jing-v6-dust';
const ZFEE = process.env.ZEST_FEE || '300000';
const DUST = BigInt(process.env.DUST || '100');
const SLACK = 72n;
const ROUTER = `${DEP}.${AS}`;
const UMAX = 340282366920938463463374607431768211455n;
const L2W = 100_000_000n, PS = 10_000_000_000n;
const TAKER = mk(6), LP = mk(7);
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(ZEXEC, `(as-contract? () (try! (contract-call? '${ZPOOL} create-pool '${ZWSTX} '${SBTC} u100 u${ZFEE} u${ZFEE} u80000000)))`);
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('setup');
  must('get-pool-count = 3', (await evalIn(ZPOOL, '(get-pool-count)')) === 3n);
  const pool = await evalIn(ZPOOL, `(get-pool u${ZID})`);
  must(`pool 3 = wstx / sbtc, bin step 100, fee ${ZFEE}`, pool?.['token-x'] === ZWSTX && pool?.['token-y'] === SBTC && pool?.['bin-step'] === 100n && pool?.['fee-rate-y'] === BigInt(ZFEE), show(pool));
  await deploy(DEP, AS, readFileSync(new URL('../contracts/sbtc-stx/swap-router-sbtc-stx-jing-v6.clar', import.meta.url), 'utf8'));

  // live DLMM mid (deepest pool), as the router harness
  let deep = null;
  for (const P of DPOOLS) {
    const i = (await evalIn(P, '(get-pool)')).ok;
    const p = (await evalIn(DLMM_CORE, `(get-bin-price u${i['initial-price']} u${i['bin-step']} ${i['active-bin-id']})`)).ok;
    const d = await evalIn(SBTC, `(stx-get-balance '${P})`);
    if (!deep || d > deep.d) deep = { p, d };
  }
  const mid = PS * 100_000_000n / deep.p, midwad = mid * L2W;
  console.log(`  mid ${mid} (${Number(mid) / 1e10} uSTX/sat)`);
  const tm = Number(await evalIn(ROUTER, `(zest-tick u${midwad})`));
  const ticks = Array.from({ length: 32 }, (_, i) => tm - 1 - i); // STX bins a sBTC sale walks
  await stxTransfer(WHALE.y, LP, DUST * 40n + 10_000_000n);
  const pos = (t) => tupleCV({ tick: intCV(t), 'max-x': uintCV(DUST), 'max-y': uintCV(0), 'min-price': uintCV(0), 'max-price': uintCV(UMAX), 'min-shares': uintCV(1) });
  await tx(`LP puts ${DUST} uSTX in each of the 32 bins ${ticks[0]}..${ticks[31]}`, LP, ZROUTER, 'add-to-positions-many',
    [P_(ZWSTX), P_(SBTC), uintCV(ZID), listCV(ticks.map(pos))], (v) => v?.ok?.length === 32);
  const { sbtcTransfer } = await import('./_yg-loop-common.js');
  // the vault floor is mid x (1 - slippage-bps); the vaults cap slippage-bps at u1000 (10%)
  const SLIPS = [100n, 500n, 1000n];
  const AMTS = process.env.AMTS ? process.env.AMTS.split(',').map(BigInt) : [80n, 200n, 1_000n, 10_000n, 1_000_000n];
  // every sale sells from the same taker: fund the whole sweep (was a flat 2M sats, short of 3 x 1M)
  await sbtcTransfer(WHALE.x, TAKER, BigInt(SLIPS.length) * AMTS.reduce((a, x) => a + x, 0n) + 10_000n);
  const rows = [];
  for (const slip of SLIPS) {
    group(`vault-sized smart swaps at slippage-bps u${slip}`);
    const limit = (mid * (10_000n - slip)) / 10_000n;
    for (const amt of AMTS) {
      const r = await call(TAKER, ROUTER, 'smart-swap-sbtc-for-stx', [uintCV(amt), uintCV(limit), noneCV(), uintCV(mid), uintCV(0)]);
      const k = r?.res?.ok;
      if (!k) { check(`u${slip} sell ${amt} sats: ok`, false, show(r?.res)); continue; }
      const sold = amt - k.unsold;
      const need = sold - (k.out * PS) / limit; // smallest slack with out >= floor-out(sold - slack, limit)
      rows.push({ slip, amt, zin: k['zest-in'], zout: k['zest-out'], din: k['dlmm-in'], sold, out: k.out, need });
      check(`u${slip} sell ${amt} sats: Zest ${k['zest-in']} sats -> ${k['zest-out']} uSTX; slack needed ${need} <= ${SLACK}`, need <= SLACK, show({ sold, out: k.out, need }));
    }
  }
  console.log('\n  slip   amount   zest-in  zest-out(uSTX)  dlmm-in  sold     out(uSTX)      slack-needed');
  for (const x of rows) console.log(`  u${String(x.slip).padEnd(5)} ${String(x.amt).padEnd(8)} ${String(x.zin).padEnd(8)} ${String(x.zout).padEnd(15)} ${String(x.din).padEnd(8)} ${String(x.sold).padEnd(8)} ${String(x.out).padEnd(14)} ${x.need}`);
  const worst = rows.reduce((m, x) => (x.need > m ? x.need : m), 0n);
  check(`worst slack needed ${worst} sats fits ROUTER_SLACK_SATS ${SLACK} (old u8: ${worst <= 8n ? 'fits' : 'reverts'})`, worst <= SLACK);
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(`crash: ${e.message}`); }
}
summary();
