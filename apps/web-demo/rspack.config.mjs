import { CopyRspackPlugin, DefinePlugin } from "@rspack/core";
import { createHash } from "node:crypto";
import { alphaTabDist, createWebRspackConfig } from "../../tools/builder/rspack.mjs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const demoRoot = fileURLToPath(new URL(".", import.meta.url));
const isE2e = process.env.PLAYWRIGHT_TEST === "1";
const telemetryE2e = process.env.TELEMETRY_E2E === "1";
const emitSourceMaps = process.env.TELEMETRY_SOURCE_MAPS === "1";
const appVersion = "0.1.0";
const buildId = createHash("sha256").update(`${appVersion}:browser`).digest("hex");

const createConfig = (_env, argv) => ({
  ...createWebRspackConfig({
    context: demoRoot,
    mode: argv.mode ?? "production",
    entry: { main: "./src/main.ts" },
    output: {
      clean: true,
      filename: "[name].[contenthash].js",
      module: true,
      path: fileURLToPath(new URL("./dist/", import.meta.url)),
    },
    htmlOptions: { template: "./index.html", scriptLoading: "module" },
    plugins: [
      new DefinePlugin({
        __APP_VERSION__: JSON.stringify(appVersion),
        __BROWSER_BUILD_ID__: JSON.stringify(buildId),
        __TELEMETRY_RELEASE_CHANNEL__: JSON.stringify(
          telemetryE2e ? "alpha" : argv.mode === "production" && !isE2e ? "production" : "development",
        ),
        __POSTHOG_PROJECT_TOKEN__: JSON.stringify(
          telemetryE2e ? "phc_telemetry_e2e" : (process.env.POSTHOG_PROJECT_TOKEN ?? ""),
        ),
        __POSTHOG_API_HOST__: JSON.stringify(process.env.POSTHOG_API_HOST ?? "https://us.i.posthog.com"),
      }),
      new CopyRspackPlugin({
        patterns: [
          { from: join(demoRoot, "public"), to: "." },
          { from: join(demoRoot, "../../product-assets/samples"), to: "samples" },
        ],
      }),
    ],
  }),
  lazyCompilation: false,
  devtool: emitSourceMaps ? "source-map" : false,
  experiments: { outputModule: true },
  watchOptions: {
    ignored: ["**/node_modules/**", "**/dist/**"],
    poll: 1000,
  },
  devServer: {
    host: "127.0.0.1",
    port: 5173,
    ...(isE2e ? { hot: false, liveReload: false } : {}),
    static: [
      {
        directory: alphaTabDist,
        publicPath: "/alphatab/",
      },
    ],
  },
});

export default createConfig;
