import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.rls.test.ts'], testTimeout: 60_000, hookTimeout: 120_000 },
});
