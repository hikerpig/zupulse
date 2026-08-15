import { defineConfig } from "@playwright/test";

const e2ePort = Number(process.env.E2E_TELEMETRY_PORT ?? "41732");

export default defineConfig({
  testDir: "./telemetry",
  timeout: 45_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node ./telemetry-server.mjs ${e2ePort}`,
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
  },
});
