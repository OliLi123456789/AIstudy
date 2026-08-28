import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "shared/**/*.test.mjs"],
    setupFiles: [],
    environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
    },
  },
});
