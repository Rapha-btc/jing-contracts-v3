import { defineConfig } from 'vitest/config';
import { vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest';

export default defineConfig({
  test: {
    include: ['tests/unit/short/**/*.test.ts'],
    testTimeout: 900000,
    environment: 'clarinet',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: {
        manifestPath: './Clarinet-short.toml',
        initBeforeEach: true,
        coverage: false,
        costs: false,
      },
    },
  },
});
