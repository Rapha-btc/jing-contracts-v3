// stxer mainnet-fork proof: markets-sbtc-stx-jing-v6-4 (repo bytes, no logic
// change) deployed as markets-sbtc-usdcx-jing-v6-4 and run on sBTC/USDCx with
// Lazer feeds 1 (BTC/USD) + 7 (USDC/USD). Self-verify in jing-core-v6,
// initialize, one sBTC maker + one USDCx maker, settle both pendings with a
// keyless [1,7] update, clear the cycle, check the price and the decimals.
// Negative: an sbtc-stx [1,45] update must fail ERR_FEED_MISSING (u1023).
// Run: node simulations/verify-sbtc-usdcx-v6-4.mjs
import { readFileSync } from 'node:fs';
import { boolCV, uintCV, noneCV, bufferCV, stringAsciiCV, contractPrincipalCV, deserializeCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';
import { NODE, DEP, SBTC, WHALE, P_, mk, S, retry, sleep, check, must, show, tx, evalIn, call, deploy, prints, summary, Stop, plain } from './_yg-loop-common.js';

const NAME = 'markets-sbtc-usdcx-jing-v6-4';
const MKT = `${DEP}.${NAME}`;
const CORE = `${DEP}.jing-core-v6`;
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDC_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ'; // ~138.8k USDCx, standard principal
const SRC = readFileSync(new URL('../contracts/sbtc-usdcx/markets-sbtc-usdcx-jing-v6-4.clar', import.meta.url), 'utf8');
const TX = P_(SBTC), TY = P_(USDCX), AX = stringAsciiCV('sbtc-token'), AY = stringAsciiCV('usdcx-token');
const X_AMT = 100_000n;        // 0.001 sBTC
const Y_AMT = 100_000_000n;    // 100 USDCx
const MIN_X = 1_000n, MIN_Y = 1_000_000n;
const FEE_BPS = 10n;

async function fetchUsdcx() {
  const r = await fetch('https://faktory-dao-backend.vercel.app/api/auction/pyth-lazer-update?pair=sbtc-usdcx', { headers: { 'x-api-key': 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01' } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}`);
  const d = (await r.json()).data;
  if (String(d.feedIds) !== '1,7') throw new Error(`feeds ${d.feedIds}`);
  return { hex: d.hex.replace(/^0x/, ''), px: BigInt(d.priceX), py: BigInt(d.priceY), expo: d.exponent };
}
const blockTime = async () => Number(await evalIn(MKT, 'stacks-block-time'));
let U = null;
async function fresh() {
  const bt = await blockTime();
  for (let i = 0; i < 40; i++) {
    const u = await retry(fetchUsdcx); const t = await retry(() => lazerFeedTimes(u.hex, [1, 7]));
    if (t.at > bt) { U = { ...u, at: t.at, mid: u.px * 100000000n / u.py }; console.log(`  lazer [1,7] at ${t.at} (block ${bt}) BTC ${u.px} USDC ${u.py} expo ${u.expo} mid ${U.mid}`); return U; }
    await sleep(3000);
  }
  throw new Error('no fresh [1,7] update');
}
const upd = () => bufferCV(Buffer.from(U.hex, 'hex'));
const bal = async (tok, who) => (await evalIn(tok, `(get-balance '${who})`)).ok;

try {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);

  S.group = 'setup';
  await deploy(DEP, NAME, SRC);
  const owner = await evalIn(CORE, '(get-contract-owner)');
  check('jing-core-v6 owner == DEP', owner === DEP, owner);
  const OWNER = owner;
  await tx('core set-verified-contract(new market)', OWNER, CORE, 'set-verified-contract', [P_(MKT)], (v) => v?.ok !== undefined);
  await tx('initialize(sbtc, usdcx, feeds 1/7)', DEP, MKT, 'initialize',
    [P_(MKT), TX, TY, uintCV(MIN_X), uintCV(MIN_Y), uintCV(1), uintCV(7)], { ok: true });
  { const st = await evalIn(MKT, '{ x: (var-get feed-id-x), y: (var-get feed-id-y), tx: (var-get token-x), ty: (var-get token-y) }'); check('feed ids + tokens stored', st.x === 1n && st.y === 7n && st.tx === SBTC && st.ty === USDCX, show(st)); }

  S.group = 'makers';
  const SCALE = 10_000_000_000n, BPS = 10_000n;
  const TAKER = mk(7); // fresh address, funded below
  const mkt = async () => ({ sb: await bal(SBTC, MKT), us: await bal(USDCX, MKT) });
  const pre = { x: { sb: await bal(SBTC, WHALE.x), us: await bal(USDCX, WHALE.x) }, y: { sb: await bal(SBTC, USDC_WHALE), us: await bal(USDCX, USDC_WHALE) } };
  console.log(`  pre: sBTC maker ${show(pre.x)} USDCx maker ${show(pre.y)} market ${show(await mkt())}`);
  await fresh();
  const MID = U.mid;
  const ASK = MID * (BPS + 10n) / BPS, BID = MID * (BPS - 10n) / BPS;
  await tx('x maker deposit 0.001 sBTC, ask mid+10bps', WHALE.x, MKT, 'deposit-token-x', [uintCV(X_AMT), uintCV(ASK), noneCV(), TX, AX], (v) => v?.ok !== undefined);
  await tx('y maker deposit 100 USDCx, bid mid-10bps', USDC_WHALE, MKT, 'deposit-token-y', [uintCV(Y_AMT), uintCV(BID), noneCV(), TY, AY], (v) => v?.ok !== undefined);
  const m1 = await mkt();
  check('USDCx moved maker -> market (100.000000)', pre.y.us - (await bal(USDCX, USDC_WHALE)) === Y_AMT && m1.us === Y_AMT, show(m1));

  S.group = 'negative [1,45]';
  const stxUpd = await retry(() => fetchLazerUpdateAny([1, 45]));
  await tx('settle-with-refresh with sbtc-stx [1,45] -> u1023', DEP, MKT, 'settle-with-refresh',
    [bufferCV(Buffer.from(stxUpd.hex.replace(/^0x/, ''), 'hex')), TX, AX, TY, AY], { err: 1023n });

  S.group = 'settle pendings [1,7]';
  await fresh();
  if (await evalIn(MKT, `(get-token-x-pending-deposit '${WHALE.x})`)) await tx('settle x pending', DEP, MKT, 'settle-token-x-deposit', [P_(WHALE.x), upd(), TX, AX], (v) => v?.ok !== undefined);
  if (await evalIn(MKT, `(get-token-y-pending-deposit '${USDC_WHALE})`)) await tx('settle y pending', DEP, MKT, 'settle-token-y-deposit', [P_(USDC_WHALE), upd(), TY, AY], (v) => v?.ok !== undefined);
  const cyc = await evalIn(MKT, '(get-current-cycle)');
  const lx = await evalIn(MKT, `(get-token-x-deposit u${cyc} '${WHALE.x})`), ly = await evalIn(MKT, `(get-token-y-deposit u${cyc} '${USDC_WHALE})`);
  const askAt = await evalIn(MKT, `(token-x-limit-at '${WHALE.x} u${MID})`), bidAt = await evalIn(MKT, `(token-y-limit-at '${USDC_WHALE} u${MID})`);
  must('both makers rest', lx === X_AMT && ly === Y_AMT, show({ lx, ly }));
  console.log(`  ask ${askAt} bid ${bidAt} mid ${MID} (BTC/USDC $${Number(MID) / 1e8})`);

  S.group = 'USDCx taker buys sBTC';
  const gross = X_AMT * askAt / SCALE * 98n / 100n; // 98% of the ask, in uUSDCx
  const fund = await call(USDC_WHALE, USDCX, 'transfer', [uintCV(gross + 5_000_000n), P_(USDC_WHALE), P_(TAKER), noneCV()]);
  must('fund taker with USDCx', fund.res?.ok === true, show(fund.res ?? fund.vm));
  const t0 = { sb: await bal(SBTC, TAKER), us: await bal(USDCX, TAKER) }, mk0 = { us: await bal(USDCX, WHALE.x) };
  await fresh();
  const sw = await tx(`taker swap ${gross} uUSDCx -> sBTC, limit = ask`, TAKER, MKT, 'swap', [uintCV(gross), uintCV(askAt), upd(), TX, AX, TY, AY, boolCV(false)], (v) => v?.ok !== undefined);
  const t1 = { sb: await bal(SBTC, TAKER), us: await bal(USDCX, TAKER) };
  const gotSats = t1.sb - t0.sb, paid = t0.us - t1.us;
  console.log(`  taker paid ${paid} uUSDCx, got ${gotSats} sats -> $${(Number(paid) / 1e6 / (Number(gotSats) / 1e8)).toFixed(2)}/BTC`);
  check('taker USDCx debited ~gross', paid > 0n && paid <= gross, `${paid} vs ${gross}`);
  check('taker got sBTC (8 dp): ~0.00098 BTC', gotSats > 90_000n && gotSats < 100_000n, gotSats);
  const px = paid * SCALE / gotSats;
  check('fill price within 0.5% of mid', px * BPS / MID > 9950n && px * BPS / MID < 10050n, `px ${px} mid ${MID}`);
  const lx2 = await evalIn(MKT, `(get-token-x-deposit (get-current-cycle) '${WHALE.x})`);
  check('x maker ask reduced', lx2 < lx, `${lx} -> ${lx2}`);
  const mkUs = (await bal(USDCX, WHALE.x)) - mk0.us;
  console.log(`  x maker USDCx delta now ${mkUs}; market ${show(await mkt())}; prints ${show(prints(sw.receipt).map((p) => p.event))}`);

  S.group = 'sBTC taker sells into USDCx bid';
  const sats = Y_AMT * SCALE / bidAt * 98n / 100n;
  const f2 = await call(WHALE.x, SBTC, 'transfer', [uintCV(sats + 1000n), P_(WHALE.x), P_(TAKER), noneCV()]);
  must('fund taker with sBTC', f2.res?.ok === true, show(f2.res ?? f2.vm));
  const u0 = { sb: await bal(SBTC, TAKER), us: await bal(USDCX, TAKER) };
  await fresh();
  await tx(`taker swap ${sats} sats -> USDCx, limit = bid`, TAKER, MKT, 'swap', [uintCV(sats), uintCV(bidAt), upd(), TX, AX, TY, AY, boolCV(true)], (v) => v?.ok !== undefined);
  const u1 = { sb: await bal(SBTC, TAKER), us: await bal(USDCX, TAKER) };
  const sold = u0.sb - u1.sb, got = u1.us - u0.us;
  console.log(`  taker sold ${sold} sats, got ${got} uUSDCx -> $${(Number(got) / 1e6 / (Number(sold) / 1e8)).toFixed(2)}/BTC`);
  check('taker got USDCx (6 dp) ~ $78-80', got > 70_000_000n && got < 100_000_000n, got);
  const px2 = got * SCALE / sold;
  check('fill price within 0.5% of mid', px2 * BPS / MID > 9950n && px2 * BPS / MID < 10050n, `px ${px2} mid ${MID}`);

  S.group = 'cancel refunds USDCx';
  const ly3 = await evalIn(MKT, `(get-token-y-deposit (get-current-cycle) '${USDC_WHALE})`);
  const c0 = await bal(USDCX, USDC_WHALE);
  if (ly3 > 0n) {
    await tx('y maker cancels rest', USDC_WHALE, MKT, 'cancel-token-y-deposit', [TY, AY], (v) => v?.ok !== undefined);
    check('USDCx refunded to maker', (await bal(USDCX, USDC_WHALE)) - c0 === ly3, `${(await bal(USDCX, USDC_WHALE)) - c0} vs ${ly3}`);
  } else check('y fully filled, nothing to withdraw', true);
  console.log(`  end: market ${show(await mkt())}; x maker ${show({ sb: await bal(SBTC, WHALE.x), us: await bal(USDCX, WHALE.x) })}; y maker ${show({ sb: await bal(SBTC, USDC_WHALE), us: await bal(USDCX, USDC_WHALE) })}`);
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); check('harness error', false, String(e?.message ?? e)); }
}
summary();
