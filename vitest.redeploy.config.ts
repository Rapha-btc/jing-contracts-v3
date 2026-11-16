import {defineConfig} from 'vitest/config';
import './tests/unit/redeploy/build.mjs';
export default defineConfig({test:{include:['tests/unit/redeploy/**/*.test.ts'],environment:'node',testTimeout:120000,pool:'forks',poolOptions:{forks:{singleFork:true}}}});
