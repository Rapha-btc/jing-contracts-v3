import {defineConfig} from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/f01-fix/*.test.ts'],
    environment: 'node',
    testTimeout: 600000,
    pool: 'forks',
    poolOptions: {forks: {singleFork: true}},
  },
});
