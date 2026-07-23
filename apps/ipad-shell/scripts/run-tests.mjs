import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const forwarded = process.argv.slice(2).filter((argument) => argument !== "--");
const xcodeArguments = [
  "-project",
  "apps/ipad-shell/Zupulse.xcodeproj",
  "-scheme",
  "Zupulse",
  "-configuration",
  "Debug",
  "-destination",
  "platform=iOS Simulator,name=iPad Pro 11-inch (M5),OS=26.2",
  "-derivedDataPath",
  "apps/ipad-shell/dist/DerivedData",
  "test",
  "CODE_SIGNING_ALLOWED=NO",
];

for (let index = 0; index < forwarded.length; index += 1) {
  const argument = forwarded[index];
  if (argument === "--only-testing") {
    const testIdentifier = forwarded[index + 1];
    if (!testIdentifier) throw new Error("--only-testing requires a test identifier");
    xcodeArguments.push(`-only-testing:${testIdentifier}`);
    index += 1;
  } else {
    xcodeArguments.push(argument);
  }
}

execFileSync("xcodebuild", xcodeArguments, {
  cwd: repositoryRoot,
  stdio: "inherit",
});
