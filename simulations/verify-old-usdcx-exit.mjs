// verify-old-usdcx-exit.mjs - the /withdraw (jingswap) and /m/jing-withdraw
// (fak.fun) exits from the RETIRED sBTC/USDCx v6-4 set, on a mainnet fork at
// tip, signed as the REAL holders (probe-old-usdcx-holders.mjs):
//   rungs   jing-ladder-dispatch-sbtc-usdcx claim-buy / withdraw-buy over the
//           old jing-buy-sbtc-{1,10,20} (rest USDCx) with amount 1e18
//           (FULL_EXIT), update none first, then a Lazer [1,7] update if needed
//   market  markets-sbtc-usdcx-jing-v6-4 cancel-token-y-deposit (USDCx trait,
//           "usdcx-token") / cancel-token-x-deposit (sBTC, "sbtc-token"):
//           no human holds a market order, so whales submit one on the fork
//           and cancel it (the exact args the pages sign).
// Run: node simulations/verify-old-usdcx-exit.mjs
import { uintCV, noneCV, someCV, listCV, tupleCV, bufferCV, stringAsciiCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { S, P_, retry, check, show, tx, evalIn, call, summary } from './_yg-loop-common.js';
import { fetchLazerUpdateAny } from './_lazer.js';

const NODE = process.env.STACKS_NODE || 'http://77.42.3.101/stacks-api';
const D = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const DISPATCH = `${D}.jing-ladder-dispatch-sbtc-usdcx`;
const MARKET = `${D}.markets-sbtc-usdcx-jing-v6-4`;
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const FULL_EXIT = 10n ** 18n;
const HOLDERS = ['SP1YT273ZNW9Q1Q3Q6JH4S6K2ZHAH0YBW19RAWMDP', 'SP2WRKMXSS8P7NPTH1NSX5HCGPK8R4WGBR5FQG8MF', 'SP3NFPMB1SRQHA8SGPX4KDDX4EC6XXDRJ9Z3CGJ7E'];
const RUNGS = [1, 10, 20].map((b) => `${D}.jing-buy-sbtc-${b}`);
const bal = async (tok, who) => (await evalIn(tok, `(get-balance '${who})`)).ok;
const pos = (r, w) => evalIn(r, `(get-position '${w})`);
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(D).addEvalCode(MARKET, '(get-current-cycle)');
  S.sid = await retry(() => b.run());
  console.log(`=== old sBTC/USDCx v6-4 exits, real holders ===\nView: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  group('0 state');
  console.log('  market paused?', show(await evalIn(MARKET, '(var-get paused)').catch((e) => e.message)));
  for (const r of RUNGS) console.log(`  ${r.split('.')[1]} state`, show(await evalIn(r, '(get-state)')));
  let upd = null;

  for (const [i, H] of HOLDERS.entries()) {
    group(`${i + 1} holder ${H}`);
    // claim first for holder 1: claim syncs the rung, so a fill not yet folded
    // into get-position becomes proceeds (paid) and the resting input shrinks
    if (i === 0) await tx('claim-buy over the 3 old rungs -> ok', H, DISPATCH, 'claim-buy', [listCV(RUNGS.map(P_))], (v) => v?.ok !== undefined);
    const before = await Promise.all(RUNGS.map((r) => pos(r, H)));
    before.forEach((p, k) => console.log(`  ${RUNGS[k].split('.')[1]}`, show(p)));
    const owed = before.reduce((a, p) => a + p.stx, 0n), owedSats = before.reduce((a, p) => a + p.sbtc, 0n);
    const u0 = await bal(USDCX, H), s0 = await bal(SBTC, H);
    const req = listCV(RUNGS.map((r) => tupleCV({ amount: uintCV(FULL_EXIT), rung: P_(r) })));
    let r = await call(H, DISPATCH, 'withdraw-buy', [req, noneCV()]);
    if (r.vm || r.res?.ok === undefined) {
      console.log(`  withdraw-buy update=none -> ${show(r.res ?? r.vm)}; retrying with a Lazer [1,7] update`);
      upd ??= await fetchLazerUpdateAny([1, 7]);
      r = await call(H, DISPATCH, 'withdraw-buy', [req, someCV(bufferCV(Buffer.from(upd.hex.replace(/^0x/, ''), 'hex')))]);
    }
    check(`withdraw-buy FULL_EXIT x3 -> ok`, !r.vm && r.res?.ok !== undefined, show(r.res ?? r.vm));
    const after = await Promise.all(RUNGS.map((r) => pos(r, H)));
    check('positions zero on all 3 rungs', after.every((p) => p.shares === 0n && p.stx === 0n && p.sbtc === 0n), show(after));
    const du = (await bal(USDCX, H)) - u0, ds = (await bal(SBTC, H)) - s0;
    check(`USDCx delta ${du} >= owed ${owed} - 3 (rounding), sBTC delta ${ds} >= ${owedSats}`, du >= owed - 3n && du > 0n && ds >= owedSats, `owed ${owed}`);
    await tx('withdraw-buy again -> err (no position)', H, DISPATCH, 'withdraw-buy', [req, noneCV()], (v) => v?.err !== undefined);
  }
  for (const r of RUNGS) console.log(`  ${r.split('.')[1]} state after`, show(await evalIn(r, '(get-state)')));

  group('4 market cancel (whale submits on the fork, then cancels)');
  {
    const cyc = await evalIn(MARKET, '(get-current-cycle)');
    const u0 = await bal(USDCX, USDC_WHALE);
    const d = await call(USDC_WHALE, MARKET, 'deposit-token-y', [uintCV(5_000_000n), uintCV(1n), noneCV(), P_(USDCX), stringAsciiCV('usdcx-token')]);
    console.log('  deposit-token-y 5 USDCx ->', show(d.res ?? d.vm));
    const pd = await evalIn(MARKET, `(get-token-y-pending-deposit '${USDC_WHALE})`), live = await evalIn(MARKET, `(get-token-y-deposit u${cyc} '${USDC_WHALE})`);
    console.log('  pending', show(pd), 'live', show(live));
    await tx('cancel-token-y-deposit (usdcx, "usdcx-token") -> ok', USDC_WHALE, MARKET, 'cancel-token-y-deposit', [P_(USDCX), stringAsciiCV('usdcx-token')], (v) => v?.ok !== undefined);
    check('whale USDCx back to start', (await bal(USDCX, USDC_WHALE)) === u0);
    await tx('cancel-token-y-deposit again -> err (nothing)', USDC_WHALE, MARKET, 'cancel-token-y-deposit', [P_(USDCX), stringAsciiCV('usdcx-token')], (v) => v?.err !== undefined);
    const s0 = await bal(SBTC, SBTC_WHALE);
    const dx = await call(SBTC_WHALE, MARKET, 'deposit-token-x', [uintCV(5000n), uintCV(10n ** 15n), noneCV(), P_(SBTC), stringAsciiCV('sbtc-token')]);
    console.log('  deposit-token-x 5000 sats ->', show(dx.res ?? dx.vm));
    await tx('cancel-token-x-deposit (sbtc, "sbtc-token") -> ok', SBTC_WHALE, MARKET, 'cancel-token-x-deposit', [P_(SBTC), stringAsciiCV('sbtc-token')], (v) => v?.ok !== undefined);
    check('whale sBTC back to start', (await bal(SBTC, SBTC_WHALE)) === s0);
  }
} catch (e) { console.error(e); S.fails.push(`STOP: ${e.message}`); }
summary();
if (S.fails.length) process.exitCode = 1;
