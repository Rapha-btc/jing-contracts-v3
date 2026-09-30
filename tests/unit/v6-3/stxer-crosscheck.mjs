// Compare the published Stxer gaps to source-matched Clarinet evidence. This
// does not combine the tools' different coverage denominators.
import fs from 'node:fs';
const dir = 'tests/unit/v6-3';
const matrix = JSON.parse(fs.readFileSync(`${dir}/.build/path-matrix.json`));
const stxer = {reportCommit: 'f2386cf', sourceSha256: '7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74'};
const reviewedRefundFix = '43ed3bf012ee04b332244c79aca6af8371f9812b4d266589c4ec360d0d294971';
const reviewedMakerFix = '3c44b9bfbc90c6b74f49a58b37e88749c5fe2020a8d2a7b96c27f2e3c3697c6e';
const reviewedSettleRefundFix = 'd1e3bbad46de1ba752507502b1caaca87b03e0b0abb344028636a57fc350cca9';
const reviewedCancelFix = 'f52942b8f31d3da3bacbfdc97ae3d02e925f547ff3f0ae6599b51da3b37183ae';
const reviewedRebateFix = '5c08412fc5990a8bf0db3a0cbbec3fa4c859d4185d0caf1cd16ae0c78f851bfb';
const reviewedCapacityAgeFix = 'ed046155b017d6acad569c6769da050747f4c69db7f627e4767fe0cafea41848';
const ageAwareCapacity = matrix.summary.sha256 === reviewedCapacityAgeFix;
const netBasedRebate = matrix.summary.sha256 === reviewedRebateFix || ageAwareCapacity;
if (![stxer.sourceSha256, reviewedRefundFix, reviewedMakerFix, reviewedCancelFix, reviewedSettleRefundFix, reviewedRebateFix, reviewedCapacityAgeFix].includes(matrix.summary.sha256)) throw Error('Market changed; review the Stxer cross-check source locations.');
// The reviewed fix adds three lines at old L3283 and three at old L3350.
// The maker-accounting fix only changes the log-match argument line, with
// no added source lines. Cancellation and pending settlement replace twelve try! wrappers
// with is-ok on the same lines. Commit 34bbe18 adds three swap lines at
// baseline L2653 and replaces the old gross-up decrement entirely. The other
// compared gap expressions are unchanged and all precede gross-up.
// The age-aware quote extracts feed-age before L1069 (+6 lines) and replaces
// the inline age expression ending at L1093 (-3 lines). All mapped validation
// and defensive expressions are unchanged. New quote parsing is tested separately.
const currentLine = old => {
  const prior = matrix.summary.sha256 === stxer.sourceSha256 ? old
    : old + (old >= 3350 ? 6 : old >= 3283 ? 3 : 0) + (netBasedRebate && old >= 2653 ? 3 : 0);
  return prior + (ageAwareCapacity ? (prior >= 1094 ? 3 : prior >= 1069 ? 6 : 0) : 0);
};
const oracleSites = [
  [1065, 'Malformed y-feed shape'], [1083, 'Stale y feed during classification'],
  [1084, 'Non-positive x classification price'], [1085, 'Non-positive y classification price'],
  [3401, 'Zero x settlement price'], [3402, 'Zero y settlement price'],
  [3404, 'Stale y feed during settlement'], [3405, 'x confidence at threshold'],
  [3408, 'y confidence at threshold'], [3411, 'Mismatched exponents'],
  [3413, 'Cross-price rounds to zero'],
];
const oracle = oracleSites.map(([baselineLine, description]) => {
  const line = currentLine(baselineLine);
  const arm = matrix.arms.find(a => a.line === line);
  if (!arm?.failed.length) throw Error(`Missing Clarinet rejection witness for Stxer oracle gap L${line}`);
  return {baselineLine, line, description, witness: matrix.tests[arm.failed[0].test], testId: arm.failed[0].test, method: arm.failed[0].method};
});
const lcov = fs.readFileSync(`${dir}/.build/market.lcov.info`, 'utf8');
const branches = new Map([...lcov.matchAll(/^BRDA:(\d+,\d+,\d+),(\d+)$/gm)].map(m => [m[1], Number(m[2])]));
const partials = [
  [13, '14,0,0', 'Age >= 80 cap', 'rebate age 80 / 1000 gives 70 bps'],
  [2936, '2961,0,1', 'x-book failed accumulator', 'walk-x-book-step propagates a failed fold accumulator'],
  [2977, '3002,0,1', 'y-book failed accumulator', 'walk-y-book-step propagates a failed fold accumulator'],
  [3526, '3528,0,1', 'Empty y distribution: payout denominator', 'handles an empty y distribution'],
  [3530, '3534,0,1', 'Empty y distribution: unfilled denominator', 'handles an empty y distribution'],
  [3621, '3623,0,1', 'Empty x distribution: payout denominator', 'handles an empty x distribution'],
  [3625, '3629,0,1', 'Empty x distribution: unfilled denominator', 'handles an empty x distribution'],
  [3928, '3929,0,0', 'Gross-up decrement', 'Arithmetic proof; no test claims this arm executes'],
].filter(([baselineLine]) => !netBasedRebate || baselineLine !== 3928).map(([baselineLine, baselineKey, description, evidence]) => {
  const line = currentLine(baselineLine);
  const [operandLine, block, arm] = baselineKey.split(',');
  const key = `${currentLine(Number(operandLine))},${block},${arm}`;
  if (!branches.has(key)) throw Error(`Missing branch instrumentation ${key}`);
  const hits = branches.get(key);
  if (baselineLine !== 3928 && !hits) throw Error(`Private helper branch regressed: ${key}`);
  if (baselineLine === 3928 && hits) throw Error('Gross-up decrement executed; reassess the arithmetic proof.');
  return {baselineLine, line, clarinetBranch: key, description, hits, evidence, context: baselineLine === 3928 ? 'unreachable arithmetic arm' : 'isolated private-helper test; not public-path coverage'};
});
// The historical decrement is absent, not covered. Independently require
// both outcomes of the replacement zero-capacity guard in the current source.
const grossUp = netBasedRebate ? (ageAwareCapacity ? ['3954,0,0', '3955,0,1'] : ['3935,0,0', '3936,0,1']).map(key => {
  const hits = branches.get(key);
  if (!hits) throw Error(`Missing new gross-up outcome: ${key}`);
  return {clarinetBranch: key, hits};
}) : [];
const functionHits = new Map([...lcov.matchAll(/^FNDA:(\d+),(.+)$/gm)].map(m => [m[2], Number(m[1])]));
const getters = ['get-token-x-limit', 'get-token-y-limit', 'get-seated-x', 'get-seated-y', 'is-protected-x', 'is-protected-y', 'get-token-x-pending-readmit', 'get-token-y-pending-readmit'].map(name => {
  const hits = functionHits.get(name) ?? 0;
  if (!hits) throw Error(`Missing getter execution: ${name}`);
  return {name, hits};
});
fs.writeFileSync(`${dir}/.build/stxer-crosscheck.json`, JSON.stringify({stxer, currentMarketSha256: matrix.summary.sha256, core: matrix.summary.core, oracle, partials, grossUp, removedBaselineBranches: netBasedRebate ? [{line: 3928, reason: '34bbe18 replaced gross-up; historical decrement no longer exists'}] : [], getters}, null, 2) + '\n');
const sourceLink = line => `[${line}](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L${line})`;
const lines = [
  '# Stxer gaps cross-checked against Clarinet', '',
  `Baseline: [Stxer report at ${stxer.reportCommit}](https://github.com/Rapha-btc/jing-contracts-v3/blob/${stxer.reportCommit}/simulations/README-v6-3-coverage.md). Stxer market SHA-256: \`${stxer.sourceSha256}\`.`, '',
  `Clarinet market SHA-256: \`${matrix.summary.sha256}\`. The refund, registered-maker, refund logging, net-based rebate and age-aware capacity fixes change the source. The pinned Stxer runs do **not** validate this patched source; the table only maps their unchanged gap expressions to current Clarinet locations. RV results have separate source-hashed evidence in the [RV report](../../rv/v6-3/README.md).`, '',
  'This report is generated after the full Clarinet suite and coverage thresholds pass. It checks the source locations listed by Stxer; it does not add or average the two tools’ coverage percentages.', '',
  '## Eleven oracle error paths', '',
  '**All 11 have Clarinet rejection witnesses through public market calls.** The market and core are real code. Decoded oracle fields are controlled by the existing local oracle fixture, so these cases establish market validation, not signed-Pyth reachability or signature verification.', '',
  '| Stxer baseline line | Current market line | Validation | Clarinet witness |', '| ---: | ---: | --- | --- |',
  ...oracle.map(a => `| ${a.baselineLine} | ${sourceLink(a.line)} | ${a.description} | [${a.testId}](PATHS.md#${a.testId.toLowerCase()}) |`), '',
  'The added boundary suite checks confidence one unit below, exactly at, and one unit above 2% independently on each feed; it also checks feed ages 79, 80 and 81 seconds on each side during funded settlement. Rejected calls preserve market storage, core equity and asset balances. A corrected feed then settles the same book with exact payouts and zero remaining custody.', '',
  '## Eight historical partial branches', '',
  'Seven execute in isolated tests of the actual private helpers. Those tests deliberately supply a boundary context and do not show that the context can arise through public transactions. ' + (netBasedRebate ? 'The eighth, the old gross-up decrement, was removed by 34bbe18. Both outcomes of its replacement zero-capacity guard execute; the removed branch is not claimed as covered.' : 'The remaining gross-up arm stays unhit and stays in the denominator.'), '',
  '| Stxer node line | Current node line | Missing outcome | Clarinet operand branch | Evidence |', '| ---: | ---: | --- | --- | --- |',
  ...partials.map(a => `| ${a.baselineLine} | ${sourceLink(a.line)} | ${a.description} | \`${a.clarinetBranch}\`: ${a.hits > 0 ? 'hit' : 'unhit'} | ${a.evidence} |`), '',
  'The helper tests are in [market.test.ts](market.test.ts), under “pure private arithmetic boundaries”, “walk rounding and error propagation”, and “isolated defensive helper cases”. ' + (netBasedRebate ? 'For positive net capacity, gross-up returns `floor(((net + 1) * (10000 + bps) - 1) / 10000)`; fixed-rate cases use 20 bps. Boundary tests check zero capacity and maximality; [rebate-capacity.test.ts](rebate-capacity.test.ts) also swaps gross-cap and gross-cap + 1 on both sides and verifies the latter exceeds net capacity by one and refunds that dust. The capacity-age suite checks age-dependent quotes and exact-cap fills through public calls.' : 'For gross-up, `g = floor(net * 10000 / 9980)` implies `g - floor(g * 20 / 10000) <= net`; therefore the decrement condition cannot hold for non-overflowing inputs. This proof is separate from sampled boundary tests.'), '',
  'The walk-error reachability argument in the Stxer report depends on its custody and dependency assumptions. Private-helper coverage is not a formal proof that production transfers can never fail.', '',
  '## Getters listed as untested in Stxer', '',
  'All eight already execute in Clarinet: `' + getters.map(g => g.name).join('`, `') + '`. Their expected values are checked by the maker lifecycle, protected seats, and readmission tests in [market.test.ts](market.test.ts).', '',
  '## Scope left separate', '',
  'The Stxer agent owns stale-seat readmission append scenarios (lines 1960 and 2029) and additional fork getter calls. This cross-check makes no new coverage claim for those append errors. The 145 unhit Stxer error paths are not 145 missing Clarinet tests, nor are they all proved unreachable: oracle-fixture limits, private-helper boundaries and conditional escrow arguments remain distinct.', '',
  'Run `npm run test:v6-3` to regenerate this report. Machine-readable witnesses are in `.build/stxer-crosscheck.json`.', '',
];
fs.writeFileSync(`${dir}/STXER-CROSSCHECK.md`, lines.join('\n'));
console.log('Stxer cross-check: 11/11 oracle witnesses; 7 historical partial arms exercised privately; ' + (netBasedRebate ? 'old gross-up arm removed, both replacement outcomes hit' : '1 arithmetic arm unreachable') + '; 8/8 getters executed.');
