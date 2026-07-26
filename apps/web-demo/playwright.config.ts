import { defineConfig } from "@playwright/test";

const e2ePort = 41_731;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `PLAYWRIGHT_TEST=1 pnpm exec rspack serve --mode development --port ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
  },
});
