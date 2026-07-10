import { HtmlRspackPlugin } from "@rspack/core";
import { fileURLToPath } from "node:url";

const demoRoot = fileURLToPath(new URL(".", import.meta.url));

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
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "builtin:swc-loader",
        options: {
          jsc: {
            parser: {
              syntax: "typescript",
            },
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
        directory: fileURLToPath(
          new URL("../node_modules/@coderline/alphatab/dist/", import.meta.url),
        ),
        publicPath: "/alphatab/",
      },
    ],
  },
  plugins: [
    new HtmlRspackPlugin({
      template: "./index.html",
    }),
  ],
};

export default config;
