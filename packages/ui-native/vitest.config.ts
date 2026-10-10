import { defineConfig } from 'vitest/config';

// Only pure helpers are unit-tested here; components are covered by Maestro flows in the apps.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
