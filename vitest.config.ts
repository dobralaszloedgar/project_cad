import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Full plant geometry fixtures take longer than Vitest's five-second default.
    testTimeout: 30000,
  },
});
