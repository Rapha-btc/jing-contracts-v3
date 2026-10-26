import { defineConfig } from 'vitest/config';
import { vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest';

export default defineConfig({
  test: {
    include: ['tests/unit/kairan-seat-lab-v3.test.ts'],
    testTimeout: 900000,
    environment: 'clarinet',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: {
        manifestPath: './Clarinet-kairan-seat-lab-v3.toml',
        initBeforeEach: true,
        coverage: true,
        coverageFilename: '.cache/kairan-seat-lab-v3.lcov.info',
        costs: false,
      },
    },
  },
});
