import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**", "**/.codex-design/**"],
    setupFiles: ["./test/setup.ts"],
  },
});
