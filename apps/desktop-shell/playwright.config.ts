import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/telemetry/**",
  timeout: 45_000,
  workers: 1,
  retries: 0,
  use: { trace: "retain-on-failure" },
});
