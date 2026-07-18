import { DefinePlugin } from "@rspack/core";
import { createTypeScriptRule, createWebRspackConfig } from "../../tools/builder/rspack.mjs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = fileURLToPath(new URL(".", import.meta.url));
const appVersion = "0.1.0";
const rendererBuildHash = createHash("sha256").update(`${appVersion}:desktop-renderer`).digest("hex");
const buildDefinitions = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __RENDERER_BUILD_HASH__: JSON.stringify(rendererBuildHash),
};

const createConfig = (_env, argv) => {
  const mode = argv.mode ?? "production";
  const main = {
    name: "main",
    context: shellRoot,
    mode,
    target: "electron-main",
    entry: { main: "./src/main/main.ts" },
    output: {
      clean: true,
      filename: "main.cjs",
      path: join(shellRoot, "dist/main"),
      library: { type: "commonjs2" },
    },
    resolve: { extensions: [".tsx", ".ts", ".js"] },
    module: { rules: [createTypeScriptRule()] },
    plugins: [new DefinePlugin(buildDefinitions)],
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
    plugins: [new DefinePlugin(buildDefinitions)],
  });

  return [main, preload, { ...renderer, name: "renderer", target: "web" }];
};

export default createConfig;
