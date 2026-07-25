import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

execFileSync(
  "xcodebuild",
  [
    "-project",
    "apps/ipad-shell/Zupulse.xcodeproj",
    "-scheme",
    "Zupulse",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=iOS Simulator",
    "-derivedDataPath",
    "apps/ipad-shell/dist/DerivedData-Release",
    "build",
    "CODE_SIGNING_ALLOWED=NO",
  ],
  { cwd: repositoryRoot, stdio: "inherit" },
);
