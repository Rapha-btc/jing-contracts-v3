import {defineConfig} from 'vitest/config';
import {vitestSetupFilePath} from '@stacks/clarinet-sdk/vitest';
import './tests/unit/core-ladder-v1/build.mjs';
export default defineConfig({test: {
  include: ['tests/unit/core-ladder-v1/**/*.test.ts'],
  environment: 'clarinet', pool: 'forks', poolOptions: {forks: {singleFork: true}},
  setupFiles: [vitestSetupFilePath],
  environmentOptions: {clarinet: {
    manifestPath: './tests/unit/core-ladder-v1/Clarinet.toml', initBeforeEach: true,
    coverage: true, costs: false, coverageFilename: 'tests/unit/core-ladder-v1/.build/lcov.info',
  }},
}});
