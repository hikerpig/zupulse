import { defineConfig } from "@playwright/test";

const webPort = 41732;

export default defineConfig({
  testDir: ".",
  testMatch: "recognition.spec.ts",
  timeout: 30_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${webPort}`, locale: "zh-CN", trace: "retain-on-failure" },
  webServer: [
    {
      command: "node recognition-server.mjs",
      url: "http://127.0.0.1:4174/api/recognition/v1/capabilities",
      reuseExistingServer: false,
    },
    {
      command: `PLAYWRIGHT_TEST=1 pnpm exec rspack serve --mode development --port ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
    },
  ],
});
