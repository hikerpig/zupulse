import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { fileURLToPath } from "node:url";

const macIcon = fileURLToPath(new URL("./resources/app-icon.icns", import.meta.url));
const windowsIcon = fileURLToPath(new URL("./resources/app-icon.ico", import.meta.url));

export default {
  packagerConfig: {
    asar: true,
    arch: process.platform === "darwin" ? "arm64" : "x64",
    icon: process.platform === "darwin" ? macIcon : windowsIcon,
    // Main, preload, and renderer are fully bundled by Rspack. Excluding the
    // workspace dependency tree also avoids Electron Packager trying to prune
    // pnpm's symlinked development dependencies as if they were runtime code.
    prune: false,
    ignore: [
      /^\/node_modules(?:\/|$)/,
      /^\/src(?:\/|$)/,
      /^\/e2e(?:\/|$)/,
      /^\/scripts(?:\/|$)/,
      /^\/test-results(?:\/|$)/,
      /^\/playwright-report(?:\/|$)/,
      /^\/(?:forge\.config\.mjs|playwright\.config\.ts|rspack\.config\.mjs|tsconfig\.json)$/,
    ],
  },
  makers:
    process.platform === "darwin"
      ? [new MakerZIP({}, ["darwin"])]
      : process.platform === "win32"
        ? [
            new MakerSquirrel({
              name: "Zupulse",
              authors: "Zupulse Contributors",
              description: "A local-first workspace for viewing and practicing sheet music.",
              setupIcon: windowsIcon,
            }),
          ]
        : [],
};
