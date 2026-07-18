import { CopyRspackPlugin, HtmlRspackPlugin } from "@rspack/core";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const requireFromWebCore = createRequire(new URL("../../packages/web-core/package.json", import.meta.url));

export const alphaTabDist = dirname(requireFromWebCore.resolve("@coderline/alphatab"));

export function createTypeScriptRule() {
  return {
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
}

export function createCssGeneratorOptions(mode) {
  return mode === "development" ? { localIdentName: "[name]__[local]--[hash:base64:5]" } : {};
}

export function createWebRspackConfig({ context, entry, output, mode, htmlOptions, plugins = [] }) {
  return {
    context,
    mode,
    entry,
    output,
    performance: {
      maxAssetSize: 2 * 1024 * 1024,
      maxEntrypointSize: 2 * 1024 * 1024,
    },
    externalsType: "module-import",
    externals: {
      "@coderline/alphatab": "/alphatab/alphaTab.mjs",
    },
    resolve: { extensions: [".tsx", ".ts", ".js"] },
    module: {
      rules: [createTypeScriptRule(), { test: /\.css$/, type: "css/auto" }],
      parser: {
        "css/auto": { namedExports: false },
      },
      generator: {
        "css/auto": createCssGeneratorOptions(mode),
      },
    },
    plugins: [
      ...plugins,
      new HtmlRspackPlugin(htmlOptions),
      new CopyRspackPlugin({
        patterns: [
          {
            from: join(alphaTabDist, "alphaTab*.mjs"),
            to: "alphatab/[name][ext]",
          },
          { from: join(alphaTabDist, "font"), to: "alphatab/font/" },
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
}
