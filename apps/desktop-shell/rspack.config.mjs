import { CopyRspackPlugin, DefinePlugin } from "@rspack/core";
import { createTypeScriptRule, createWebRspackConfig } from "../../tools/builder/rspack.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = fileURLToPath(new URL(".", import.meta.url));
const appVersion = "0.1.0";
const telemetryE2e = process.env.TELEMETRY_E2E === "1";
const rendererBuildHash =
  process.env.TELEMETRY_BUILD_ID ?? createHash("sha256").update(`${appVersion}:desktop-renderer`).digest("hex");
const buildDefinitions = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __RENDERER_BUILD_HASH__: JSON.stringify(rendererBuildHash),
  __TELEMETRY_RELEASE_CHANNEL__: JSON.stringify(
    telemetryE2e ? "alpha" : (process.env.TELEMETRY_RELEASE_CHANNEL ?? "development"),
  ),
  __POSTHOG_PROJECT_TOKEN__: JSON.stringify(
    telemetryE2e ? "phc_telemetry_e2e" : (process.env.POSTHOG_PROJECT_TOKEN ?? ""),
  ),
  __POSTHOG_API_HOST__: JSON.stringify(process.env.POSTHOG_API_HOST ?? "https://us.i.posthog.com"),
  __ALPHATAB_WEBPACK__: "true",
};
const bundledSampleBase64 = readFileSync(
  fileURLToPath(new URL("../../product-assets/samples/cannon-in-d.mxl", import.meta.url)),
).toString("base64");
const emitSourceMaps = process.env.TELEMETRY_SOURCE_MAPS === "1";

const createConfig = (env, argv) => {
  const mode = argv.mode ?? "production";
  const pdfOmrRuntimeSmoke = env.pdfOmrRuntimeSmoke === "1";
  const main = {
    name: "main",
    context: shellRoot,
    mode,
    target: "electron-main",
    entry: {
      main: "./src/main/main.ts",
      ...(pdfOmrRuntimeSmoke
        ? { "pdf-omr-packaged-smoke-entry": "./src/main/recognition/pdf-omr-packaged-smoke-entry.ts" }
        : {}),
    },
    output: {
      clean: true,
      filename: "[name].cjs",
      path: join(shellRoot, "dist/main"),
      library: { type: "commonjs2" },
    },
    devtool: emitSourceMaps ? "source-map" : false,
    resolve: { extensions: [".tsx", ".ts", ".js"] },
    module: { rules: [createTypeScriptRule()] },
    plugins: [
      new DefinePlugin(buildDefinitions),
      new CopyRspackPlugin({
        patterns: [
          {
            from: fileURLToPath(new URL("../../node_modules/pdfjs-dist/standard_fonts", import.meta.url)),
            to: "pdfjs-standard-fonts",
          },
          {
            from: fileURLToPath(new URL("../../node_modules/pdfjs-dist/wasm", import.meta.url)),
            to: "pdfjs-wasm",
          },
          {
            from: fileURLToPath(new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url)),
            to: "pdf.worker.mjs",
          },
        ],
      }),
    ],
  };

  const preload = {
    name: "preload",
    context: shellRoot,
    mode,
    target: "electron-preload",
    entry: { preload: "./src/preload.ts" },
    output: {
      clean: true,
      filename: "preload.cjs",
      path: join(shellRoot, "dist/preload"),
      library: { type: "commonjs2" },
    },
    devtool: emitSourceMaps ? "source-map" : false,
    resolve: { extensions: [".tsx", ".ts", ".js"] },
    module: { rules: [createTypeScriptRule()] },
  };

  const renderer = {
    ...createWebRspackConfig({
      context: shellRoot,
      mode,
      entry: { renderer: "./src/renderer.ts" },
      output: {
        clean: true,
        filename: "assets/[name].[contenthash].js",
        path: join(shellRoot, "dist/renderer"),
      },
      htmlOptions: { template: "./index.html" },
      plugins: [
        new DefinePlugin({
          ...buildDefinitions,
          __BUNDLED_SAMPLE_BASE64__: JSON.stringify(bundledSampleBase64),
        }),
      ],
    }),
    devtool: emitSourceMaps ? "source-map" : false,
  };

  return [main, preload, { ...renderer, name: "renderer", target: "web" }];
};

export default createConfig;
