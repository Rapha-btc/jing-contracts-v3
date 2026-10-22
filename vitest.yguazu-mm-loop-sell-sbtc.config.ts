import { defineConfig } from 'vitest/config';
import { vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest';

export default defineConfig({
  test: {
    include: ['tests/unit/mm-loop-sell-sbtc.test.ts'],
    environment: 'clarinet',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: {
        manifestPath: './Clarinet-yguazu-mm-loop-sell-sbtc.toml',
        initBeforeEach: true,
        coverage: true,
        coverageFilename: '.cache/mm-loop-sell-sbtc.lcov.info',
        costs: false,
      },
    },
  },
});
