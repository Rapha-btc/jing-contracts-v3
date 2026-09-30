import { defineConfig } from 'vitest/config';
import { vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest';
import './tests/unit/router-v5-3/build.mjs';
export default defineConfig({test: {
  include: ['tests/unit/router-v5-3/**/*.test.ts'],
  environment: 'clarinet', pool: 'forks', poolOptions: {forks:{singleFork:true}},
  setupFiles: [vitestSetupFilePath],
  environmentOptions: {clarinet: {
    manifestPath:'./tests/unit/router-v5-3/Clarinet.toml', initBeforeEach:true,
    coverage:true, costs:false, coverageFilename:'tests/unit/router-v5-3/.build/lcov.info',
  }},
}});
