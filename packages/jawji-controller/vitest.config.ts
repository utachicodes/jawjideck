// vitest.config.ts
// systeminformation calls (processes/metrics) can take ~7s on Windows, well
// past vitest's 5s default — raise the per-test timeout so the suite is
// deterministic across platforms.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
