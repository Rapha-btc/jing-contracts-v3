// stxer mainnet-fork proof: jing-seat-batch seats a whole band-rung set in ONE
// call by the ladder owner, on both pairs.
//   sBTC/STX: at the live tip, markets-sbtc-stx-jing-v6-5 is initialized and
//     the 20 jing-{buy,sell}-stx-<bps>-v2 rungs are deployed (not initialized).
//     The ladder owner (the Juice multisig) calls seat(jing-ladder-v1, buy-1-v2,
//     sell-1-v2, 20 rungs, 20 spreads) once.
//   sBTC/USDCx: markets-sbtc-usdcx-jing-v6-5 + 20 jing-{buy,sell}-sbtc-<bps>-v2
//     deployed and initialized in the sim, then one seat() by that ladder's owner.
// Negatives first (all-or-nothing): outsider, length mismatch, empty, one bad
// spread inside an otherwise valid batch -> nothing changed; then the real
// batch; then a replay fails (already initialized).
// Run: node simulations/verify-seat-batch.mjs   (SEAT_SRC=<file> for deploy bytes)
import { readFileSync } from 'node:fs';
import { uintCV, noneCV, someCV, listCV, stringAsciiCV } from '@stacks/transactions';
import { SimulationBuilder } from 'stxer';
import { NODE, DEP, SBTC, P_, mk, S, check, must, show, tx, evalIn, deploy, summary, Stop, retry } from './_yg-loop-common.js';
import { strip } from './_sim-deployer.mjs';

const MULTISIG = 'SM1N7VX04M1TT23KD7YHVD6H6413QV2ZNJFTWVF9P';
const BATCH = `${DEP}.jing-seat-batch`;
const SPREADS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const OUTSIDER = mk(6);
const read = (rel) => strip(readFileSync(new URL(`../contracts/${rel}`, import.meta.url), 'utf8'));
const group = (g) => { S.group = g; console.log(`\n=== ${g} ===`); };
const isOk = (v) => v?.ok !== undefined;
const errIs = (n) => (v) => v?.err === BigInt(n);

const seatArgs = (ladder, buy, sell, rungs, spreads) => [
  P_(ladder), buy ? someCV(P_(buy)) : noneCV(), sell ? someCV(P_(sell)) : noneCV(),
  listCV(rungs.map(P_)), listCV(spreads.map((b) => uintCV(b))),
];

async function pair({ name, ladder, market, buy, sell, buyProt, sellProt }) {
  group(`${name}: before`);
  const owner = await evalIn(ladder, '(get-owner)');
  console.log(`  ladder owner ${owner}`);
  const canon0 = { b: await evalIn(ladder, '(get-canonical "buy-band")'), s: await evalIn(ladder, '(get-canonical "sel-band")') };
  const cnt0 = { b: await evalIn(ladder, '(get-band-count "buy-band")'), s: await evalIn(ladder, '(get-band-count "sel-band")') };
  console.log(`  canonicals ${show(canon0)} band counts ${show(cnt0)}`);
  const rungs = [...SPREADS.map(buy), ...SPREADS.map(sell)];
  const spreads = [...SPREADS, ...SPREADS];
  const full = seatArgs(ladder, buy(1), sell(1), rungs, spreads);

  group(`${name}: negatives (nothing changes)`);
  await tx('outsider calls seat -> err (owner check inside ladder)', OUTSIDER, BATCH, 'seat', full, (v) => v?.err !== undefined);
  await tx('length mismatch (20 rungs, 19 spreads) -> u7301', owner, BATCH, 'seat', seatArgs(ladder, buy(1), sell(1), rungs, spreads.slice(1)), errIs(7301));
  await tx('nothing to do (no canonicals, no rungs) -> u7302', owner, BATCH, 'seat', seatArgs(ladder, null, null, [], []), errIs(7302));
  const bad = [...spreads]; bad[5] = 55;
  await tx('one wrong spread inside a full batch (buy-50 at 55) -> u7009, whole batch reverts', owner, BATCH, 'seat', seatArgs(ladder, buy(1), sell(1), rungs, bad), errIs(7009));
  check('canonicals unchanged after the failed batches', show({ b: await evalIn(ladder, '(get-canonical "buy-band")'), s: await evalIn(ladder, '(get-canonical "sel-band")') }) === show(canon0));
  check(`${buy(1).split('.')[1]} still not registered`, (await evalIn(ladder, `(get-registered '${buy(1)})`)) == null);

  group(`${name}: the real batch, one call`);
  const r = await tx(`ladder owner seat(): 2 canonicals + ${rungs.length} rungs -> (ok u${rungs.length})`, owner, BATCH, 'seat', full, (v) => v?.ok === BigInt(rungs.length));
  if (r.receipt) console.log(`  receipt cost: ${JSON.stringify(r.receipt?.cost ?? r.receipt?.execution_cost ?? '').slice(0, 300)}`);
  check('buy canonical = buy 1 bps -v2', (await evalIn(ladder, '(get-canonical "buy-band")')) === buy(1));
  check('sell canonical = sell 1 bps -v2', (await evalIn(ladder, '(get-canonical "sel-band")')) === sell(1));
  for (const b of SPREADS) {
    const hb = await evalIn(ladder, `(get-rung "buy-band" u${b})`), hs = await evalIn(ladder, `(get-rung "sel-band" u${b})`);
    check(`spread ${b}: buy-band holder ${buy(b).split('.')[1]}, sel-band holder ${sell(b).split('.')[1]}`, hb === buy(b) && hs === sell(b), show({ hb, hs }));
    const pb = await evalIn(market, `(${buyProt} '${buy(b)})`), ps = await evalIn(market, `(${sellProt} '${sell(b)})`);
    check(`spread ${b}: market v6-5 holds both seats`, pb === true && ps === true, show({ pb, ps }));
  }
  const cnt1 = { b: await evalIn(ladder, '(get-band-count "buy-band")'), s: await evalIn(ladder, '(get-band-count "sel-band")') };
  check('band counts unchanged (replaced, not added)', show(cnt1) === show(cnt0), show({ cnt0, cnt1 }));

  group(`${name}: replay`);
  await tx('same batch again -> err (canonical re-set ok, rung already initialized)', owner, BATCH, 'seat', full, (v) => v?.err !== undefined);
}

try {
  // opening probe: a read that exists (startSim's get-state is not on v6-5)
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(`${DEP}.markets-sbtc-stx-jing-v6-5`, '(var-get initialized)');
  S.sid = await retry(() => b.run());
  console.log(`View: https://stxer.xyz/simulations/mainnet/${S.sid}`);
  group('deploy jing-seat-batch');
  // SEAT_SRC=<path> runs the exact deploy bytes (the faktory-dao template)
  const seatSrc = process.env.SEAT_SRC ? readFileSync(process.env.SEAT_SRC, 'utf8') : read('ladder-tools/jing-seat-batch.clar');
  console.log(`  jing-seat-batch source: ${process.env.SEAT_SRC ?? 'repo (comments stripped)'}, ${Buffer.byteLength(seatSrc)} bytes`);
  await deploy(DEP, 'jing-seat-batch', seatSrc);

  must('sBTC/STX ladder owner is the multisig', (await evalIn(`${DEP}.jing-ladder-v1`, '(get-owner)')) === MULTISIG);
  must('market v6-5 initialized on chain', (await evalIn(`${DEP}.markets-sbtc-stx-jing-v6-5`, '(var-get initialized)')) === true);
  await pair({
    name: 'sBTC/STX (live rungs)',
    ladder: `${DEP}.jing-ladder-v1`, market: `${DEP}.markets-sbtc-stx-jing-v6-5`,
    buy: (b) => `${DEP}.jing-buy-stx-${b}-v2`, sell: (b) => `${DEP}.jing-sell-stx-${b}-v2`,
    buyProt: 'is-protected-x', sellProt: 'is-protected-y',
  });

  group('sBTC/USDCx: deploy market v6-5 + 20 rungs in the sim');
  const CORE = `${DEP}.jing-core-v6`, UM = `${DEP}.markets-sbtc-usdcx-jing-v6-5`;
  const CORE_OWNER = await evalIn(CORE, '(get-contract-owner)');
  const mins = await evalIn(`${DEP}.markets-sbtc-usdcx-jing-v6-4`, '(get-min-deposits)');
  await deploy(DEP, 'markets-sbtc-usdcx-jing-v6-5', read('sbtc-usdcx/markets-sbtc-usdcx-jing-v6-5.clar'));
  await tx('core set-verified-contract', CORE_OWNER, CORE, 'set-verified-contract', [P_(UM)], isOk);
  await tx('market set-operator -> core owner', DEP, UM, 'set-operator', [P_(CORE_OWNER)], { ok: true });
  await tx('market initialize', CORE_OWNER, UM, 'initialize', [P_(UM), P_(SBTC), P_('SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx'), uintCV(mins['min-token-x']), uintCV(mins['min-token-y']), uintCV(1), uintCV(7)], { ok: true });
  const bs = read('sbtc-usdcx/jing-buy-sbtc-bps-v2.clar'), ss = read('sbtc-usdcx/jing-sell-sbtc-bps-v2.clar');
  for (const b of SPREADS) { await deploy(DEP, `jing-buy-sbtc-${b}-v2`, bs); await deploy(DEP, `jing-sell-sbtc-${b}-v2`, ss); }
  await pair({
    name: 'sBTC/USDCx',
    ladder: `${DEP}.jing-ladder-sbtc-usdcx-v1`, market: UM,
    buy: (b) => `${DEP}.jing-buy-sbtc-${b}-v2`, sell: (b) => `${DEP}.jing-sell-sbtc-${b}-v2`,
    buyProt: 'is-protected-y', sellProt: 'is-protected-x',
  });
} catch (e) {
  if (!(e instanceof Stop)) { console.error(e); S.fails.push(String(e?.message ?? e)); }
}
summary();
