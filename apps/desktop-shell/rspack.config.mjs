import { CopyRspackPlugin, DefinePlugin, HtmlRspackPlugin } from "@rspack/core";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = fileURLToPath(new URL(".", import.meta.url));
const requireFromWebCore = createRequire(
  new URL("../../packages/web-core/package.json", import.meta.url),
);
const alphaTabDist = dirname(requireFromWebCore.resolve("@coderline/alphatab"));
const appVersion = "0.1.0";
const rendererBuildHash = createHash("sha256")
  .update(`${appVersion}:desktop-renderer`)
  .digest("hex");
const buildDefinitions = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __RENDERER_BUILD_HASH__: JSON.stringify(rendererBuildHash),
};

const swcRule = {
  test: /\.tsx?$/,
  loader: "builtin:swc-loader",
  options: {
    jsc: {
      parser: { syntax: "typescript", tsx: true },
      transform: { react: { runtime: "automatic" } },
    },
  },
  type: "javascript/auto",
};

const main = {
  name: "main",
  context: shellRoot,
  target: "electron-main",
  entry: { main: "./src/main/main.ts" },
  output: {
    clean: true,
    filename: "main.cjs",
    path: join(shellRoot, "dist/main"),
    library: { type: "commonjs2" },
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: { rules: [swcRule] },
  plugins: [new DefinePlugin(buildDefinitions)],
};

const preload = {
  name: "preload",
  context: shellRoot,
  target: "electron-preload",
  entry: { preload: "./src/preload.ts" },
  output: {
    clean: true,
    filename: "preload.cjs",
    path: join(shellRoot, "dist/preload"),
    library: { type: "commonjs2" },
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: { rules: [swcRule] },
};

const renderer = {
  name: "renderer",
  context: shellRoot,
  target: "web",
  entry: { renderer: "./src/renderer.ts" },
  output: {
    clean: true,
    filename: "assets/[name].[contenthash].js",
    path: join(shellRoot, "dist/renderer"),
  },
  performance: {
    maxAssetSize: 2 * 1024 * 1024,
    maxEntrypointSize: 2 * 1024 * 1024,
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [swcRule, { test: /\.css$/, type: "css" }],
  },
  plugins: [
    new DefinePlugin(buildDefinitions),
    new HtmlRspackPlugin({ template: "./index.html" }),
    new CopyRspackPlugin({
      patterns: [
        { from: join(alphaTabDist, "alphaTab.mjs"), to: "alphatab/alphaTab.mjs" },
        { from: join(alphaTabDist, "font"), to: "alphatab/font/" },
        { from: join(alphaTabDist, "soundfont/sonivox.sf3"), to: "alphatab/soundfont/sonivox.sf3" },
        { from: join(alphaTabDist, "soundfont/LICENSE"), to: "alphatab/soundfont/LICENSE", toType: "file" },
      ],
    }),
  ],
};

export default [main, preload, renderer];
