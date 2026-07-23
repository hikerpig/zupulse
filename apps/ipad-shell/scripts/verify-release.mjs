import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url));

export async function verifyRelease(root = DEFAULT_ROOT) {
  const [html, plist, project] = await Promise.all([
    readFile(join(root, "web/index.html"), "utf8"),
    readFile(join(root, "app/Info.plist"), "utf8"),
    readFile(join(root, "Zupulse.xcodeproj/project.pbxproj"), "utf8"),
  ]);
  const allowedHosts = parseAllowedHosts(plist);
  assertCsp(html, allowedHosts);
  assertReleaseBuildSettings(project);
  await assertDebugFlagsAreGuarded(root);

  const builtIndex = join(root, "dist/web/index.html");
  const builtHtml = await readFile(builtIndex, "utf8").catch(() => undefined);
  if (builtHtml) assertCsp(builtHtml, allowedHosts);
}

function parseAllowedHosts(plist) {
  const match = plist.match(/<key>ZupulseAllowedHTTPSHosts<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!match) throw new Error("Missing ZupulseAllowedHTTPSHosts");
  const hosts = [...match[1].matchAll(/<string>([^<]+)<\/string>/g)].map((item) => item[1]);
  if (hosts.some((host) => !/^[a-z0-9.-]+$/.test(host))) {
    throw new Error("Invalid HTTPS allowlist host");
  }
  return hosts;
}

function assertCsp(html, allowedHosts) {
  const content = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
  if (!content) throw new Error("Missing Content-Security-Policy");
  for (const directive of [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "script-src 'self'",
  ]) {
    if (!content.includes(directive)) throw new Error(`Unsafe CSP: missing ${directive}`);
  }
  if (content.includes("'unsafe-eval'") || /<script[^>]+src=["']https?:/i.test(html)) {
    throw new Error("Release web assets must not load remote executable code");
  }
  const remoteHosts = [...content.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((match) => match[1]);
  for (const host of new Set(remoteHosts)) {
    if (!allowedHosts.includes(host)) throw new Error(`CSP host is not allowlisted: ${host}`);
  }
  for (const host of allowedHosts) {
    if (!content.includes(`https://${host}`)) throw new Error(`Allowlisted host missing from CSP: ${host}`);
  }
  if (/(localhost|127\.0\.0\.1|0\.0\.0\.0|ws:\/\/|wss:\/\/)/i.test(html)) {
    throw new Error("Release web assets contain a dev-server endpoint");
  }
}

function assertReleaseBuildSettings(project) {
  const releaseConfigurations = [
    ...project.matchAll(/\/\* Release \*\/ = \{isa = XCBuildConfiguration; buildSettings = \{([^}]*)\}/g),
  ];
  if (releaseConfigurations.length === 0) throw new Error("Missing Release build settings");
  if (
    releaseConfigurations.some(
      (match) =>
        /SWIFT_ACTIVE_COMPILATION_CONDITIONS\s*=\s*[^;]*DEBUG/.test(match[1]) ||
        /ENABLE_TESTABILITY\s*=\s*YES/.test(match[1]),
    )
  ) {
    throw new Error("Release configuration enables debug-only code");
  }
}

async function assertDebugFlagsAreGuarded(root) {
  const sourceDirectories = ["app", "audio", "bridge", "files", "webview"];
  const paths = (await Promise.all(sourceDirectories.map((directory) => listSwiftFiles(join(root, directory))))).flat();
  for (const path of paths) {
    const lines = (await readFile(path, "utf8")).split(/\r?\n/);
    let debugDepth = 0;
    for (const [index, line] of lines.entries()) {
      if (/^\s*#if\s+DEBUG\b/.test(line)) debugDepth += 1;
      if (line.includes("ZUPULSE_UI_TEST_") && debugDepth === 0) {
        throw new Error(`Unguarded UI test flag: ${path}:${index + 1}`);
      }
      if (/^\s*#endif\b/.test(line) && debugDepth > 0) debugDepth -= 1;
    }
  }
}

async function listSwiftFiles(root, directory = root) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "dist") continue;
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listSwiftFiles(root, child)));
    else if (entry.isFile() && extname(entry.name) === ".swift") files.push(child);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyRelease();
  console.log("iPad Release boundary check passed");
}
