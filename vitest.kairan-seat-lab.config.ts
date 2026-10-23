import { defineConfig } from 'vitest/config';
import { vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest';

export default defineConfig({
  test: {
    include: ['tests/unit/kairan-seat-lab.test.ts'],
    environment: 'clarinet',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: {
        manifestPath: './Clarinet-kairan-seat-lab.toml',
        initBeforeEach: true,
        coverage: true,
        coverageFilename: '.cache/kairan-seat-lab.lcov.info',
        costs: false,
      },
    },
  },
});
