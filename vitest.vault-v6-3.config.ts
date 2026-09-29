import {defineConfig} from 'vitest/config';
import {vitestSetupFilePath} from '@stacks/clarinet-sdk/vitest';
import './tests/unit/vault-v6-3/build.mjs';
export default defineConfig({test:{
 include:['tests/unit/vault-v6-3/**/*.test.ts'],
 environment:'clarinet',pool:'forks',poolOptions:{forks:{singleFork:true}},
 setupFiles:[vitestSetupFilePath],
 environmentOptions:{clarinet:{manifestPath:'tests/unit/vault-v6-3/Clarinet.toml',initBeforeEach:true}},
}});
