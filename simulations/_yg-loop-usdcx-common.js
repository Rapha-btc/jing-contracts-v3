// _yg-loop-usdcx-common.js - stxer plumbing for the sBTC/USDCx MM loop vaults
// (verify-yguazu-mm-loop-sell-usdcx.js, verify-yguazu-mm-loop-sell-sbtc-usdcx.js).
// Reuses the generic helpers of _yg-loop-common.js (sim session, checks,
// calls, prints, deploy) and swaps in the USDCx market: token x = sBTC (8 dp),
// token y = USDCx (6 dp, asset usdcx-token), Pyth Lazer feeds 1 (BTC/USD) and
// 7 (USDC/USD), fetched keyless from the faktory-dao backend (pair=sbtc-usdcx).
import { uintCV, bufferCV, stringAsciiCV, noneCV } from '@stacks/transactions';
import {
  DEP, SBTC, BANDS, BPS, EDGE, SCALE, P_, mk, Stop, S, show, setGroup, check, must, note, sleep, retry,
  evalIn, call, tx, E, OK, prints, matches, stxTransfer, sbtcTransfer, deploy, sbtcBal, summary,
} from './_yg-loop-common.js';
import { SimulationBuilder } from 'stxer';
import { lazerFeedTimes } from './_lazer.js';

export {
  DEP, SBTC, BANDS, BPS, EDGE, SCALE, P_, mk, Stop, S, show, setGroup, check, must, note, sleep, retry,
  evalIn, call, tx, E, OK, prints, matches, stxTransfer, sbtcTransfer, deploy, sbtcBal, summary,
};

export const NODE = process.env.STACKS_NODE || 'http://77.42.3.101/stacks-api';
export const MARKET = `${DEP}.markets-sbtc-usdcx-jing-v6-4`;
export const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
// x = sBTC whale, y = USDCx whale, stx = STX whale (tx fees are 0 on stxer; STX only funds accounts)
export const WHALE = { x: 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2', y: 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ', stx: 'SP354663MXNWN2B6HKNBYD8JBNJK2ZNBZE764X1RR' };
export const T = { x: P_(SBTC), y: P_(USDCX) };
export const A = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('usdcx-token') };

export async function startSim(probeCid) {
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(probeCid, '(get-state)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);
}
export const usdcxBal = async (who) => (await evalIn(USDCX, `(get-balance '${who})`)).ok;
export const stxBal = async (who) => await evalIn(MARKET, `(stx-get-balance '${who})`);
export async function usdcxTransfer(from, to, amount) {
  const r = await call(from, USDCX, 'transfer', [uintCV(amount), P_(from), P_(to), noneCV()]);
  must(`fund ${to.slice(0, 10)}${to.includes('.') ? '.' + to.split('.')[1] : ''} with ${amount} uUSDCx`, !r.vm && r.res?.ok === true, show(r.res ?? r.vm));
}
export const blockTime = async () => Number(await evalIn(MARKET, 'stacks-block-time'));
export const curCycle = async () => await evalIn(MARKET, '(get-current-cycle)');

async function fetchUsdcx() {
  const key = process.env.FAKTORY_API_KEY || 'jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01';
  const base = process.env.FAKTORY_API_URL || 'https://faktory-dao-backend.vercel.app';
  const r = await fetch(`${base}/api/auction/pyth-lazer-update?pair=sbtc-usdcx`, { headers: { 'x-api-key': key } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()).data;
  if (String(d.feedIds) !== '1,7') throw new Error(`feeds ${d.feedIds}`);
  return { hex: d.hex, px: BigInt(d.priceX), py: BigInt(d.priceY) };
}
// A [1,7] Lazer update strictly newer than the sim's stacks-block-time.
// MID = the market price that update yields (uUSDCx per sat x 1e10).
export async function freshUpd(force = false) {
  const bt = await blockTime();
  if (!force && S.UPD && S.UPD.at > bt && Date.now() - S.UPD.fetched < 20000) return S.UPD;
  for (let i = 0; i < 40; i++) {
    const u = await retry(fetchUsdcx), t = await retry(() => lazerFeedTimes(u.hex, [1, 7]));
    if (t.at > bt) {
      S.UPD = { ...u, at: t.at, fetched: Date.now() };
      S.MID = u.px * 100000000n / u.py;
      console.log(`  lazer update at ${t.at} (block time ${bt}), mid ${S.MID}`);
      return S.UPD;
    }
    await sleep(3000);
  }
  throw new Error('no [1,7] Lazer update newer than the sim block time');
}
export const updCV = () => bufferCV(Buffer.from(S.UPD.hex.replace(/^0x/, ''), 'hex'));
