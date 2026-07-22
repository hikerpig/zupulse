import { alphaTabDist, createWebRspackConfig } from "../../tools/builder/rspack.mjs";
import { fileURLToPath } from "node:url";

const shellRoot = fileURLToPath(new URL(".", import.meta.url));

const createConfig = (_env, argv) => {
  const mode = argv.mode ?? "production";
  return {
    ...createWebRspackConfig({
      context: shellRoot,
      mode,
      entry: { main: "./web/src/main.ts" },
      output: {
        clean: true,
        filename: "assets/[name].[contenthash].js",
        module: true,
        path: fileURLToPath(new URL("./dist/web/", import.meta.url)),
      },
      htmlOptions: { template: "./web/index.html", scriptLoading: "module" },
    }),
    experiments: { outputModule: true },
    watchOptions: {
      ignored: ["**/node_modules/**", "**/dist/**"],
      poll: 1000,
    },
    devServer: {
      host: "127.0.0.1",
      port: 5174,
      static: [{ directory: alphaTabDist, publicPath: "/alphatab/" }],
    },
  };
};

export default createConfig;
