import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["functions/vitest/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
