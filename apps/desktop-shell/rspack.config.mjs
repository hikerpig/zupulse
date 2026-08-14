import { CopyRspackPlugin, DefinePlugin } from "@rspack/core";
import { createTypeScriptRule, createWebRspackConfig } from "../../tools/builder/rspack.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = fileURLToPath(new URL(".", import.meta.url));
const appVersion = "0.1.0";
const rendererBuildHash = createHash("sha256").update(`${appVersion}:desktop-renderer`).digest("hex");
const buildDefinitions = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __RENDERER_BUILD_HASH__: JSON.stringify(rendererBuildHash),
  __ALPHATAB_WEBPACK__: "true",
};
const bundledSampleBase64 = readFileSync(
  fileURLToPath(new URL("../../product-assets/samples/cannon-in-d.mxl", import.meta.url)),
).toString("base64");

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
      ...(pdfOmrRuntimeSmoke ? { "pdf-omr-packaged-smoke-entry": "./src/main/pdf-omr-packaged-smoke-entry.ts" } : {}),
    },
    output: {
      clean: true,
      filename: "[name].cjs",
      path: join(shellRoot, "dist/main"),
      library: { type: "commonjs2" },
    },
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
    resolve: { extensions: [".tsx", ".ts", ".js"] },
    module: { rules: [createTypeScriptRule()] },
  };

  const renderer = createWebRspackConfig({
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
  });

  return [main, preload, { ...renderer, name: "renderer", target: "web" }];
};

export default createConfig;
