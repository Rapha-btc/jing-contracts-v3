// _rungs-sbtc-usdcx.mjs - shared setup for the v6 rung suites ported to the
// sBTC/USDCx v6-5 set (verify-v6-rungs-*-sbtc-usdcx.mjs).
// Fork at tip on the LIVE jing-core-v6 / jing-ladder-sbtc-usdcx-v1 /
// jing-ladder-dispatch-sbtc-usdcx; owner calls come from the owners read on
// the fork. Market + rungs are the faktory-dao template bytes (hash-checked in
// _sbtc-usdcx-v6-5-common.mjs), the market deployed by DEP under its real name
// (the rungs are bound to it). Live ladder: 10 band seats per side (bps 1,
// 10..90) all held by the live v1 rungs, max-band 10, so a v2 rung is seated
// on one of those bps and REPLACES the live holder.
// Plumbing (check / tx / evalIn / call / deploy / S) is _yg-loop-common.js.
import { uintCV, noneCV, boolCV, stringAsciiCV, bufferCV } from '@stacks/transactions';
import { SimulationBuilder, getSimulationTip, submitSimulationSteps } from 'stxer';
import { S, P_, retry, sleep, check, must, show, tx, evalIn, call, deploy } from './_yg-loop-common.js';
import {
  DEP, NODE, SBTC, USDCX, SBTC_WHALE, USDC_WHALE, CORE, LADDER, DISPATCH, MARKET, NAMES,
  bytes, printHashes, fetchUsdcxUpdate, usdcxFeedTimes, midOf, rungName,
} from './_sbtc-usdcx-v6-5-common.mjs';

export { DEP, NODE, SBTC, USDCX, CORE, LADDER, DISPATCH, MARKET, rungName };
export const TR = { x: P_(SBTC), y: P_(USDCX) };
export const AS = { x: stringAsciiCV('sbtc-token'), y: stringAsciiCV('usdcx-token') };
// USDCx holders with spendable balance at the 2026-11 tip (standard principals)
export const USDC_WHALES = [USDC_WHALE, 'SP3A7MGAH0SKC1ACS854PHXHVWE031FYQCBA8M51D', 'SP1H07DSRT0T5X8YWHPVYPNWVPA2DZ1NNNNF879JN'];
export const MIN_X = 1000n, MIN_Y = 1_000_000n; // live v6-4 minimums (1000 sats / 1 USDCx)
export const ok = (v) => v?.ok !== undefined;
export const err = (n) => (v) => v?.err === BigInt(n);
export const tokenOf = (side) => (side === 'x' ? SBTC : USDCX);
export const bal = async (side, who) => (await evalIn(tokenOf(side), `(get-balance '${who})`)).ok;
export const balExpr = (side, who) => `(unwrap-panic (contract-call? '${tokenOf(side)} get-balance '${who}))`;
export const rid = (side, bps) => `${DEP}.${rungName(side, bps)}`;

// markets-sbtc-usdcx-jing-v6-5 went live at 9504103 (same bytes, SHA-256
// matches the template): the fork is pinned at the block before, where every
// name of the set is still free. USDCX_PIN=<height> overrides, tip = no pin.
export const PIN = process.env.USDCX_PIN ?? '9504102';
export async function startFork(title) {
  printHashes();
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (PIN !== 'tip') b.useBlockHeight(Number(PIN));
  b.withSender(DEP).addEvalCode(SBTC, '(get-total-supply)');
  S.sid = await retry(() => b.run());
  console.log(`${title}\nView: https://stxer.xyz/simulations/mainnet/${S.sid}`);
  return S.sid;
}

export async function fundX(who, amount, from = SBTC_WHALE) {
  const r = await call(from, SBTC, 'transfer', [uintCV(amount), P_(from), P_(who), noneCV()]);
  must(`fund ${who.slice(0, 10)}${who.includes('.') ? '.' + who.split('.')[1] : ''} ${amount} sats`, !r.vm && r.res?.ok === true, show(r.res ?? r.vm));
}
export async function fundY(who, amount) {
  let left = BigInt(amount);
  for (const w of USDC_WHALES) {
    if (left === 0n) break;
    const have = (await evalIn(USDCX, `(get-balance '${w})`)).ok;
    const amt = have < left ? have : left;
    if (amt === 0n) continue;
    const r = await call(w, USDCX, 'transfer', [uintCV(amt), P_(w), P_(who), noneCV()]);
    if (r.vm || r.res?.ok !== true) throw new Error(`USDCx transfer ${w} -> ${who} ${amt}: ${show(r.res ?? r.vm)}`);
    left -= amt;
  }
  must(`fund ${who.slice(0, 10)}${who.includes('.') ? '.' + who.split('.')[1] : ''} ${amount} uUSDCx`, left === 0n, `short ${left}`);
}
export const fund = (side, who, amount) => (side === 'x' ? fundX(who, amount) : fundY(who, amount));

// deploy the v6-5 market, verify + initialize (mins 1000 sats / 1 USDCx, feeds 1/7)
export async function setupMarket() {
  const coreOwner = await evalIn(CORE, '(get-contract-owner)');
  const ladderOwner = await evalIn(LADDER, '(get-owner)');
  console.log(`  core owner ${coreOwner}, ladder owner ${ladderOwner}`);
  await deploy(DEP, NAMES.market, bytes('market'));
  await tx('core set-verified-contract(market v6-5)', coreOwner, CORE, 'set-verified-contract', [P_(MARKET)], ok);
  await tx('market set-operator -> core owner', DEP, MARKET, 'set-operator', [P_(coreOwner)], { ok: true });
  await tx('market initialize(sbtc, usdcx, 1000 sats, 1 USDCx, feeds 1/7)', coreOwner, MARKET, 'initialize',
    [P_(MARKET), TR.x, TR.y, uintCV(MIN_X), uintCV(MIN_Y), uintCV(1), uintCV(7)], { ok: true });
  await tx('market set-operator -> DEP', coreOwner, MARKET, 'set-operator', [P_(DEP)], { ok: true });
  await tx('market sync-seat-count = ladder max-band', DEP, MARKET, 'sync-seat-count', [], ok);
  return { coreOwner, ladderOwner };
}

// deploy jing-{sell,buy}-sbtc-<bps>-v2 (template bytes) as DEP
export async function deployRung(side, bps, deployer = DEP) {
  await deploy(deployer, rungName(side, bps), bytes(side === 'x' ? 'sell' : 'buy'));
  return `${deployer}.${rungName(side, bps)}`;
}

// a [1,7] update strictly newer than the fork clock (prev reused when it still is)
export async function freshUpd(prev) {
  const bt = Number(await evalIn(CORE, 'stacks-block-time'));
  if (prev && prev.at > bt) return prev;
  for (let i = 0; i < 40; i++) {
    const u = await retry(fetchUsdcxUpdate), t = await retry(() => usdcxFeedTimes(u.hex));
    if (t.at > bt) return { ...u, at: t.at, mid: midOf(u), cv: bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex')) };
    await sleep(3000);
  }
  throw new Error('no [1,7] update newer than the fork clock');
}
export const updCV = (u) => bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));

// jump the fork clock forward to at least `target` (unix s) with one
// AdvanceBlocks; returns the new stacks-block-time
export async function advanceTo(target) {
  const tip = await retry(() => getSimulationTip(S.sid));
  const secs = Math.max(1, Number(target) - Number(tip.burn_block_time));
  await retry(() => submitSimulationSteps(S.sid, { steps: [{ AdvanceBlocks: { bitcoin_blocks: 1, stacks_blocks_per_bitcoin: 1, bitcoin_interval_secs: secs } }] }));
  const now = Number(await evalIn(CORE, 'stacks-block-time'));
  console.log(`  fork clock advanced to ${now} (target ${target})`);
  return now;
}
export const field = (o, k) => o?.[k];
export { prints } from './_yg-loop-common.js';
export { S, P_, retry, sleep, check, must, show, tx, evalIn, call, deploy, uintCV, noneCV, boolCV, stringAsciiCV };
