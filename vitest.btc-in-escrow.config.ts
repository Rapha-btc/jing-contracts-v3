import { defineConfig } from 'vitest/config';
import { vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest';

// Escrow v2 (deploys as jing-btc-in-escrow-v4) against the REAL sBTC
// token / registry / deposit, mock routers + markets. Build first:
//   node tests/btc-in-escrow/build.mjs
export default defineConfig({
  test: {
    include: ['tests/btc-in-escrow/**/*.test.ts'],
    testTimeout: 300000,
    environment: 'clarinet',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: {
        manifestPath: './tests/btc-in-escrow/Clarinet.toml',
        initBeforeEach: true,
        coverage: false,
        costs: false,
      },
    },
  },
});
