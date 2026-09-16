import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      "**/.codex-design/**",
      // Hash-bound standalone assertions run through legato-candidate-fixtures.test.ts instead.
      "tasks/legato-candidate-ceiling/*.test.{ts,mjs}",
    ],
    setupFiles: ["./test/setup.ts"],
  },
});
