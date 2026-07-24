import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyRelease } from "../verify-release.mjs";

const safeHtml = `<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; script-src 'self'; connect-src 'self' https://api.example.com">`;
const safePlist = `<key>ZupulseAllowedHTTPSHosts</key><array><string>api.example.com</string></array>`;
const safeProject = `/* Release */ = {isa = XCBuildConfiguration; buildSettings = {SWIFT_OPTIMIZATION_LEVEL = "-O";};};`;
const xcodeFormattedSafeProject = `/* Release */ = {
  isa = XCBuildConfiguration;
  buildSettings = {
    SWIFT_OPTIMIZATION_LEVEL = "-O";
  };
  name = Release;
};`;

describe("verifyRelease", () => {
  it("accepts matching allowlists and rejects remote executable code", async () => {
    const root = await fixtureRoot();
    await expect(verifyRelease(root)).resolves.toBeUndefined();
    await writeFile(join(root, "web/index.html"), `${safeHtml}<script src="https://api.example.com/app.js"></script>`);
    await expect(verifyRelease(root)).rejects.toThrow("remote executable code");
  });

  it("accepts Xcode's multiline Release build configuration", async () => {
    const root = await fixtureRoot();
    await writeFile(join(root, "Zupulse.xcodeproj/project.pbxproj"), xcodeFormattedSafeProject);

    await expect(verifyRelease(root)).resolves.toBeUndefined();
  });
});

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "zupulse-release-"));
  await mkdir(join(root, "web"), { recursive: true });
  await mkdir(join(root, "app"), { recursive: true });
  await mkdir(join(root, "Zupulse.xcodeproj"), { recursive: true });
  await writeFile(join(root, "web/index.html"), safeHtml);
  await writeFile(join(root, "app/Info.plist"), safePlist);
  await writeFile(join(root, "Zupulse.xcodeproj/project.pbxproj"), safeProject);
  await writeFile(join(root, "guarded.swift"), '#if DEBUG\nlet key = "ZUPULSE_UI_TEST_FLAG"\n#endif\n');
  return root;
}
