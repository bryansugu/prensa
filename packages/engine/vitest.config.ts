import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    name: "engine",
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
