// Compare the published Stxer gaps to source-matched Clarinet evidence. This
// does not combine the tools' different coverage denominators.
import fs from 'node:fs';
const dir = 'tests/unit/v6-3';
const matrix = JSON.parse(fs.readFileSync(`${dir}/.build/path-matrix.json`));
const stxer = {reportCommit: 'f2386cf', sourceSha256: '7f7bc5cce3c6f01c92c2e69c8ffe5652d3dc038a7394a816e2740dd4490cdd74'};
const reviewedRefundFix = '43ed3bf012ee04b332244c79aca6af8371f9812b4d266589c4ec360d0d294971';
if (![stxer.sourceSha256, reviewedRefundFix].includes(matrix.summary.sha256)) throw Error('Market changed; review the Stxer cross-check source locations.');
// The reviewed fix adds three lines at old L3283 and three at old L3350.
// All compared validation/branch expressions below are unchanged.
const currentLine = old => matrix.summary.sha256 === reviewedRefundFix ? old + (old >= 3350 ? 6 : old >= 3283 ? 3 : 0) : old;
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
].map(([baselineLine, baselineKey, description, evidence]) => {
  const line = currentLine(baselineLine);
  const [operandLine, block, arm] = baselineKey.split(',');
  const key = `${currentLine(Number(operandLine))},${block},${arm}`;
  if (!branches.has(key)) throw Error(`Missing branch instrumentation ${key}`);
  const hits = branches.get(key);
  if (baselineLine !== 3928 && !hits) throw Error(`Private helper branch regressed: ${key}`);
  if (baselineLine === 3928 && hits) throw Error('Gross-up decrement executed; reassess the arithmetic proof.');
  return {baselineLine, line, clarinetBranch: key, description, hits, evidence, context: baselineLine === 3928 ? 'unreachable arithmetic arm' : 'isolated private-helper test; not public-path coverage'};
});
const functionHits = new Map([...lcov.matchAll(/^FNDA:(\d+),(.+)$/gm)].map(m => [m[2], Number(m[1])]));
const getters = ['get-token-x-limit', 'get-token-y-limit', 'get-seated-x', 'get-seated-y', 'is-protected-x', 'is-protected-y', 'get-token-x-pending-readmit', 'get-token-y-pending-readmit'].map(name => {
  const hits = functionHits.get(name) ?? 0;
  if (!hits) throw Error(`Missing getter execution: ${name}`);
  return {name, hits};
});
fs.writeFileSync(`${dir}/.build/stxer-crosscheck.json`, JSON.stringify({stxer, currentMarketSha256: matrix.summary.sha256, core: matrix.summary.core, oracle, partials, getters}, null, 2) + '\n');
const sourceLink = line => `[${line}](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L${line})`;
const lines = [
  '# Stxer gaps cross-checked against Clarinet', '',
  `Baseline: [Stxer report at ${stxer.reportCommit}](https://github.com/Rapha-btc/jing-contracts-v3/blob/${stxer.reportCommit}/simulations/README-v6-3-coverage.md). Stxer market SHA-256: \`${stxer.sourceSha256}\`.`, '',
  `Clarinet market SHA-256: \`${matrix.summary.sha256}\`. The refund-accounting fix changes the source. Historical Stxer runs and RV reports do **not** validate this patched source; the table only maps their unchanged gap expressions to current Clarinet locations.`, '',
  'This report is generated after the full Clarinet suite and coverage thresholds pass. It checks the source locations listed by Stxer; it does not add or average the two tools’ coverage percentages.', '',
  '## Eleven oracle error paths', '',
  '**All 11 have Clarinet rejection witnesses through public market calls.** The market and core are real code. Decoded oracle fields are controlled by the existing local oracle fixture, so these cases establish market validation, not signed-Pyth reachability or signature verification.', '',
  '| Stxer baseline line | Current market line | Validation | Clarinet witness |', '| ---: | ---: | --- | --- |',
  ...oracle.map(a => `| ${a.baselineLine} | ${sourceLink(a.line)} | ${a.description} | [${a.testId}](PATHS.md#${a.testId.toLowerCase()}) |`), '',
  'The added boundary suite checks confidence one unit below, exactly at, and one unit above 2% independently on each feed; it also checks feed ages 79, 80 and 81 seconds on each side during funded settlement. Rejected calls preserve market storage, core equity and asset balances. A corrected feed then settles the same book with exact payouts and zero remaining custody.', '',
  '## Eight partial branches', '',
  'Seven execute in isolated tests of the actual private helpers. Those tests deliberately supply a boundary context and do not show that the context can arise through public transactions. The remaining gross-up arm stays unhit and stays in the denominator.', '',
  '| Stxer node line | Current node line | Missing outcome | Clarinet operand branch | Evidence |', '| ---: | ---: | --- | --- | --- |',
  ...partials.map(a => `| ${a.baselineLine} | ${sourceLink(a.line)} | ${a.description} | \`${a.clarinetBranch}\`: ${a.hits > 0 ? 'hit' : 'unhit'} | ${a.evidence} |`), '',
  'The helper tests are in [market.test.ts](market.test.ts), under “pure private arithmetic boundaries”, “walk rounding and error propagation”, and “isolated defensive helper cases”. For gross-up, `g = floor(net * 10000 / 9980)` implies `g - floor(g * 20 / 10000) <= net`; therefore the decrement condition cannot hold for non-overflowing inputs. This proof is separate from sampled boundary tests.', '',
  'The walk-error reachability argument in the Stxer report depends on its custody and dependency assumptions. Private-helper coverage is not a formal proof that production transfers can never fail.', '',
  '## Getters listed as untested in Stxer', '',
  'All eight already execute in Clarinet: `' + getters.map(g => g.name).join('`, `') + '`. Their expected values are checked by the maker lifecycle, protected seats, and readmission tests in [market.test.ts](market.test.ts).', '',
  '## Scope left separate', '',
  'The Stxer agent owns stale-seat readmission append scenarios (lines 1960 and 2029) and additional fork getter calls. This cross-check makes no new coverage claim for those append errors. The 145 unhit Stxer error paths are not 145 missing Clarinet tests, nor are they all proved unreachable: oracle-fixture limits, private-helper boundaries and conditional escrow arguments remain distinct.', '',
  'Run `npm run test:v6-3` to regenerate this report. Machine-readable witnesses are in `.build/stxer-crosscheck.json`.', '',
];
fs.writeFileSync(`${dir}/STXER-CROSSCHECK.md`, lines.join('\n'));
console.log('Stxer cross-check: 11/11 oracle witnesses; 7/8 partial arms exercised privately; 1 arithmetic arm unreachable; 8/8 getters executed.');
