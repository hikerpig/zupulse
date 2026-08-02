import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultShellRoot = fileURLToPath(new URL("..", import.meta.url));

export function resolveDmgPaths(shellRoot, { productName, version, arch }) {
  return {
    appPath: resolve(shellRoot, `out/${productName}-darwin-${arch}/${productName}.app`),
    outputPath: resolve(shellRoot, `out/make/dmg/${arch}/${productName}-darwin-${arch}-${version}.dmg`),
  };
}

export async function createDmg({ shellRoot = defaultShellRoot, platform = process.platform } = {}) {
  if (platform !== "darwin") throw new Error("DMG creation requires macOS");

  const packageJson = JSON.parse(await readFile(join(shellRoot, "package.json"), "utf8"));
  const productName = packageJson.productName;
  const version = packageJson.version;
  if (typeof productName !== "string" || typeof version !== "string") {
    throw new Error("Desktop package metadata is incomplete");
  }

  const { appPath, outputPath } = resolveDmgPaths(shellRoot, { productName, version, arch: "arm64" });
  await access(appPath);
  await mkdir(dirname(outputPath), { recursive: true });

  const stagingRoot = await mkdtemp(join(tmpdir(), "zupulse-dmg-"));
  try {
    await cp(appPath, join(stagingRoot, `${productName}.app`), { recursive: true });
    await symlink("/Applications", join(stagingRoot, "Applications"));
    await execFileAsync("hdiutil", [
      "create",
      "-volname",
      productName,
      "-srcfolder",
      stagingRoot,
      "-ov",
      "-format",
      "UDZO",
      outputPath,
    ]);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }

  return outputPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await createDmg());
}
