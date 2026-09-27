import { defineConfig } from "vitest/config";

// Root config: runs unit/integration tests of every workspace in Node.
// Browser/worker-specific suites live next to their apps.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/web"],
    passWithNoTests: true,
  },
});
