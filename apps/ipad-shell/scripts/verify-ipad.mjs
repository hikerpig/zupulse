import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outputDirectory = join(repositoryRoot, "apps/ipad-shell/dist");

run("pnpm", ["exec", "vite-node", "scripts/generate-bridge-contract.mjs", "--check"]);
run("node", ["apps/ipad-shell/scripts/build-web-assets.mjs"]);
run("node", ["apps/ipad-shell/scripts/verify-web-assets.mjs"]);
run("node", ["apps/ipad-shell/scripts/verify-release.mjs"]);
run("node", ["apps/ipad-shell/scripts/run-xcode-tests.mjs"]);

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  join(outputDirectory, "ipad-validation-summary.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      simulator: {
        device: "iPad Pro 11-inch (M5)",
        runtime: "iOS 26.2",
        contract: "passed",
        webAssets: "passed",
        releaseBoundary: "passed",
        swiftAndUiTests: "passed",
      },
      physicalDevice: {
        device: "11-inch iPad Pro (M5)",
        runtime: "iPadOS 26.5.2",
        status: "partial-device-evidence",
        reason: "Resource origin and initial import/playback verified; full manual quality gate deferred for prototype",
      },
    },
    null,
    2,
  )}\n`,
);
console.log("iPad verification passed; full physical-device quality gate remains deferred for prototype");

function run(command, arguments_) {
  execFileSync(command, arguments_, { cwd: repositoryRoot, stdio: "inherit" });
}
