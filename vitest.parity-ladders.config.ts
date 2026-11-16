import {defineConfig} from 'vitest/config';
import {vitestSetupFilePath} from '@stacks/clarinet-sdk/vitest';
const pair=process.env.PARITY_PAIR??'sbtc-usdcx';
if(!['sbtc-usdcx','stx-usdcx'].includes(pair))throw Error('unknown pair');
if(pair==='sbtc-usdcx')await import('./tests/unit/parity-sbtc-usdcx-ladder/build.mjs');
else await import('./tests/unit/parity-stx-usdcx-ladder/build.mjs');
const dir=`tests/unit/parity-${pair}-ladder`;
export default defineConfig({test: {
  include: [`${dir}/**/*.test.ts`],
  environment: 'clarinet', pool: 'forks', poolOptions: {forks: {singleFork: true}},
  setupFiles: [vitestSetupFilePath],
  environmentOptions: {clarinet: {
    manifestPath: `${dir}/Clarinet.toml`, initBeforeEach: true,
    coverage: true, costs: false, coverageFilename: `${dir}/.build/lcov.info`,
  }},
}});
