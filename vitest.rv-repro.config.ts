import { defineConfig } from 'vitest/config';
import { vitestSetupFilePath } from '@stacks/clarinet-sdk/vitest';
import './tests/unit/router-v5-3/build.mjs';
// Plain Clarinet SDK reproductions of RV counterexamples (tests/rv-repro-*.test.ts),
// on the router unit stack: real router v5-3, market v6-3 and jing-core-v6.
export default defineConfig({test: {
  include: ['tests/rv-repro-*.test.ts'],
  environment: 'clarinet', pool: 'forks', poolOptions: {forks:{singleFork:true}},
  setupFiles: [vitestSetupFilePath],
  environmentOptions: {clarinet: {
    manifestPath:'./tests/unit/router-v5-3/Clarinet.toml', initBeforeEach:true,
    coverage:false, costs:false,
  }},
}});
