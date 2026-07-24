import { CopyRspackPlugin } from "@rspack/core";
import { alphaTabDist, createWebRspackConfig } from "../../tools/builder/rspack.mjs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const demoRoot = fileURLToPath(new URL(".", import.meta.url));
const isE2e = process.env.PLAYWRIGHT_TEST === "1";

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
      new CopyRspackPlugin({
        patterns: [{ from: join(demoRoot, "public"), to: "." }],
      }),
    ],
  }),
  ...(isE2e ? { lazyCompilation: false } : {}),
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
