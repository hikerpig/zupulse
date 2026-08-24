import { defineConfig } from "@playwright/test";

const e2ePort = Number(process.env.E2E_PORT ?? "41731");

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/telemetry/**", "**/recognition.spec.ts"],
  timeout: 45_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "RECOGNITION_E2E_DISABLED=1 node e2e/recognition-server.mjs",
      url: "http://127.0.0.1:4174/api/recognition/v1/capabilities",
      reuseExistingServer: false,
    },
    {
      command: `PLAYWRIGHT_TEST=1 pnpm exec rspack serve --mode development --port ${e2ePort}`,
      url: `http://127.0.0.1:${e2ePort}`,
      reuseExistingServer: false,
    },
  ],
});
