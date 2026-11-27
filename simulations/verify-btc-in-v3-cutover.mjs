// Read-only mainnet fork: uses deployed contracts, real registry deposit and
// live venues. Funding transfers and sender impersonation occur only in stxer.
import { writeFileSync, mkdirSync } from 'node:fs';
import { uintCV, noneCV, bufferCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { NODE, DEP, SBTC, WHALE, P_, mk, S, retry, must, show, tx, evalIn, call, prints, summary, freshUpd, updCV, sbtcBal, stxBal, OK } from './_yg-loop-common.js';
process.env.STACKS_API_URL ??= NODE;
const AD = `${DEP}.jing-btc-in-adapter-v3`;
const ESC = `${DEP}.jing-btc-in-escrow-v6`;
const ROUTER = `${DEP}.swap-router-sbtc-stx-jing-v6-1`;
const USER = mk(51);
const deposit = { txid: 'a705ab967c6989005dad4c54b32dc509149ec3ca3f940a9a34daef605cdaeb61', vout: 0n, amount: 12371n, user: 'SP1RB1V65A1PAAXYT8PVFFFC6T1FN9E8RQX7HMDKC' };
const key = [bufferCV(Buffer.from(deposit.txid, 'hex')), uintCV(deposit.vout)];
try {
  const builder = SimulationBuilder.new({ stacksNodeAPI: NODE });
  builder.withSender(DEP).addEvalCode(AD, '(get-config)');
  S.sid = await retry(() => builder.run());
  console.log(`https://stxer.xyz/simulations/mainnet/${S.sid}`);
  must('live escrow keeper initialized', await evalIn(ESC, `(is-keeper '${DEP})`) === true);
  const cfg = await evalIn(AD, '(get-config)');
  must('deployed adapter owned by chavita', cfg.owner === DEP, show(cfg));
  const funding = await call(WHALE.x, SBTC, 'transfer', [uintCV(100000n + deposit.amount), P_(WHALE.x), P_(USER), noneCV()]);
  must('fork-only funding from live sBTC holder', !funding.vm && OK(funding.res), show(funding));
  await freshUpd(true);
  const beforeX = await sbtcBal(USER), beforeY = await stxBal(USER);
  const swap = await tx('adapter v3 sBTC/STX swap', USER, AD, 'swap-sbtc-for-stx', [uintCV(100000), uintCV(10), uintCV(S.MID * 95n / 100n), noneCV(), uintCV(S.MID), uintCV(1)], OK);
  must('adapter produces positive STX output', !swap.vm && swap.res?.ok?.swap?.out > 0n, show(swap.res));
  must('swap uses v6-1 router', prints(swap.receipt).some(p => p.event === 'btc-in' && p.target === ROUTER));
  must('swap debits at most amount and credits STX', beforeX - await sbtcBal(USER) <= 100000n && await stxBal(USER) > beforeY);
  const registry = await evalIn('SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-registry', `(get-completed-deposit 0x${deposit.txid} u0)`);
  must('real registry deposit recipient and amount', registry?.recipient === deposit.user && registry?.amount === deposit.amount, show(registry));
  const funded = await call(USER, SBTC, 'transfer', [uintCV(deposit.amount), P_(USER), P_(deposit.user), noneCV()]);
  must('fork funds real deposit recipient', !funded.vm && OK(funded.res));
  must('deposit unused in v6', await evalIn(ESC, `(get-order 0x${deposit.txid} u0)`) === null);
  const h = await evalIn(ESC, 'stacks-block-height');
  const parked = await evalIn(ESC, '(get-parked)');
  const arm = await tx('escrow v6 deposit-keyed arm', deposit.user, ESC, 'arm-swap-sbtc-for-stx', [...key, uintCV(10), uintCV(500), uintCV(1), uintCV(h + 1100n)], OK);
  must('arm parks exact minted amount less fee', !arm.vm && arm.res?.ok === deposit.amount - 10n && await evalIn(ESC, '(get-parked)') === parked + deposit.amount - 10n);
  const armed = await evalIn(ESC, `(get-order 0x${deposit.txid} u0)`);
  must('arm binds new router', armed?.router === ROUTER && armed?.status === 0n, show(armed));
  await freshUpd(true);
  const outputBefore = await stxBal(deposit.user);
  const execute = await tx('escrow v6 keeper execute', DEP, ESC, 'execute', [...key, updCV()], OK);
  const finalOrder = await evalIn(ESC, `(get-order 0x${deposit.txid} u0)`);
  must('execute fills rather than refunds', !execute.vm && finalOrder?.status === 1n && await stxBal(deposit.user) > outputBefore, show(execute.res));
  must('execute clears parked liability', await evalIn(ESC, '(get-parked)') === parked);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  summary();
  mkdirSync('simulations/results', { recursive: true });
  writeFileSync('simulations/results/btc-in-v3-cutover.json', JSON.stringify({ checkedAt: new Date().toISOString(), simulation: S.sid, url: `https://stxer.xyz/simulations/mainnet/${S.sid}`, checks: S.checks, passed: S.passed, failures: S.fails, success: !process.exitCode && S.checks > 0 && S.checks === S.passed }, null, 2) + '\n');
  if (S.fails.length) process.exitCode = 1;
}
