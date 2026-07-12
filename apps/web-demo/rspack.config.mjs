import { CopyRspackPlugin, HtmlRspackPlugin } from "@rspack/core";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const demoRoot = fileURLToPath(new URL(".", import.meta.url));
const requireFromWebCore = createRequire(new URL("../../packages/web-core/package.json", import.meta.url));
const alphaTabDist = dirname(requireFromWebCore.resolve("@coderline/alphatab"));

/** @type {import("@rspack/core").Configuration} */
const config = {
  context: demoRoot,
  entry: {
    main: "./src/main.ts",
  },
  output: {
    clean: true,
    filename: "[name].[contenthash].js",
    path: fileURLToPath(new URL("./dist/", import.meta.url)),
  },
  performance: {
    maxAssetSize: 2 * 1024 * 1024,
    maxEntrypointSize: 2 * 1024 * 1024,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  externalsType: "module-import",
  externals: {
    "@coderline/alphatab": "/alphatab/alphaTab.mjs",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: {
              syntax: "typescript",
              tsx: true,
            },
            transform: { react: { runtime: "automatic" } },
          },
        },
        type: "javascript/auto",
      },
      {
        test: /\.css$/,
        type: "css",
      },
    ],
  },
  watchOptions: {
    ignored: ["**/node_modules/**", "**/dist/**"],
    poll: 1000,
  },
  devServer: {
    host: "127.0.0.1",
    port: 5173,
    static: [
      {
        directory: alphaTabDist,
        publicPath: "/alphatab/",
      },
    ],
  },
  plugins: [
    new HtmlRspackPlugin({
      template: "./index.html",
    }),
    new CopyRspackPlugin({
      patterns: [
        {
          from: join(alphaTabDist, "alphaTab*.mjs"),
          to: "alphatab/[name][ext]",
        },
        {
          from: join(alphaTabDist, "font"),
          to: "alphatab/font/",
        },
        {
          from: join(alphaTabDist, "soundfont/sonivox.sf3"),
          to: "alphatab/soundfont/sonivox.sf3",
        },
        {
          from: join(alphaTabDist, "soundfont/LICENSE"),
          to: "alphatab/soundfont/LICENSE",
          toType: "file",
        },
      ],
    }),
  ],
};

export default config;
