// _sim-deployer.mjs - run a deploy set under a fresh sim deployer when the
// repo names are already taken on mainnet by the Jing deployer (stxer: a
// second deploy of the same name fails "Duplicate contract").
// SIM_DEP deploys its own jing-core-v6 (+ jing-rung-deposit-trait) so the
// `.jing-core-v6` / `.jing-rung-deposit-trait` refs resolve, and every
// hard-coded 'SPV9K21...' principal in a source is rebased onto SIM_DEP.
// Names stay identical, so the rungs' own-name checks still pass.
// SIM_DEP=<addr> overrides the default (mk(41)); SIM_DEP=live keeps the Jing
// deployer (only works on a fork tip where the names are still free).
import { readFileSync } from 'node:fs';
import { getAddressFromPrivateKey } from '@stacks/transactions';

export const LIVE_DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const fresh = getAddressFromPrivateKey('41'.repeat(32) + '01', 'mainnet');
export const SIM_DEP = process.env.SIM_DEP === 'live' ? LIVE_DEP : (process.env.SIM_DEP || fresh);
export const rebase = (src) => src.split(LIVE_DEP).join(SIM_DEP);
// whole-line ;; comments stripped (the 100,000-byte deploy limit)
export const strip = (src) => src.split('\n').filter((l) => !/^\s*;;/.test(l)).join('\n');
export const repoSrc = (rel) => readFileSync(new URL(`../contracts/${rel}`, import.meta.url), 'utf8');

// deploy jing-core-v6 + jing-rung-deposit-trait under SIM_DEP (no-op when live)
export async function deployCoreForSim(deploy) {
  if (SIM_DEP === LIVE_DEP) return;
  await deploy(SIM_DEP, 'jing-rung-deposit-trait', repoSrc('jing-rung-deposit-trait.clar'));
  await deploy(SIM_DEP, 'jing-core-v6', repoSrc('jing-core-v6.clar'));
}
