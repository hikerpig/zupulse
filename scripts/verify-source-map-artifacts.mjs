import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { TraceMap, eachMapping, originalPositionFor } from "@jridgewell/trace-mapping";

const mode = process.argv[2];
const buildId = mode === "resolve" ? process.argv[3] : undefined;
const roots = process.argv.slice(mode === "resolve" ? 4 : 3);
if (
  !mode ||
  !["require", "forbid", "resolve"].includes(mode) ||
  roots.length === 0 ||
  (mode === "resolve" && !buildId)
) {
  throw new Error(
    "Usage: node scripts/verify-source-map-artifacts.mjs <require|forbid> <directory>... | resolve <build-id> <directory>",
  );
}

const files = (await Promise.all(roots.map((root) => listFiles(path.resolve(root))))).flat();
const maps = files.filter((file) => file.endsWith(".map"));
if (mode === "forbid") {
  if (maps.length > 0) throw new Error(`Source maps must not be published: ${maps.join(", ")}`);
  process.stdout.write("source-map artifact guard passed: no maps\n");
  process.exit(0);
}

if (maps.length === 0) throw new Error(`Expected source maps under: ${roots.join(", ")}`);
let hasApplicationSource = false;
for (const mapPath of maps) {
  const map = JSON.parse(await readFile(mapPath, "utf8"));
  if (
    map.version !== 3 ||
    !Array.isArray(map.sources) ||
    map.sources.length === 0 ||
    typeof map.mappings !== "string"
  ) {
    throw new Error(`Invalid source map: ${mapPath}`);
  }
  hasApplicationSource ||= map.sources.some((source) => /(?:^|[/\\])src(?:[/\\])/.test(source));
  if (typeof map.file === "string") {
    const siblingTarget = path.join(path.dirname(mapPath), path.basename(map.file));
    await stat(siblingTarget).catch(() => {
      throw new Error(`Source map target is missing: ${mapPath} -> ${map.file}`);
    });
  }
  const serialized = JSON.stringify(map);
  if (/POSTHOG_(?:PERSONAL_API_KEY|CLI_API_KEY)|BEGIN (?:RSA|OPENSSH) PRIVATE KEY/.test(serialized)) {
    throw new Error(`Credential leaked into source map: ${mapPath}`);
  }
}
if (!hasApplicationSource) throw new Error(`Source maps contain no application source under: ${roots.join(", ")}`);
if (mode === "resolve") {
  for (const root of roots) await verifySyntheticResolution(path.resolve(root), files, maps, buildId);
}
process.stdout.write(`source-map artifact guard passed: ${maps.length} maps\n`);

async function verifySyntheticResolution(root, files, maps, expectedBuildId) {
  const expectedSource = expectedSourcePattern(root);
  if (!expectedSource) throw new Error(`Cannot infer application source for source-map root: ${root}`);
  const rootFiles = files.filter((file) => file.startsWith(`${root}${path.sep}`));
  const bundleFiles = rootFiles.filter((file) => file.endsWith(".js") || file.endsWith(".cjs"));
  const bundleText = await Promise.all(bundleFiles.map((file) => readFile(file, "utf8")));
  if (!bundleText.some((text) => text.includes(expectedBuildId))) {
    throw new Error(`Build identity is not present in source-map root: ${root}`);
  }
  let resolved = false;
  for (const mapPath of maps.filter((file) => file.startsWith(`${root}${path.sep}`))) {
    const traceMap = new TraceMap(JSON.parse(await readFile(mapPath, "utf8")));
    eachMapping(traceMap, (mapping) => {
      if (resolved || !mapping.source || !expectedSource.test(mapping.source)) return;
      const original = originalPositionFor(traceMap, {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      });
      if (original.source === mapping.source && typeof original.line === "number" && original.line > 0) {
        resolved = true;
      }
    });
    if (resolved) break;
  }
  if (!resolved) throw new Error(`Synthetic exception does not resolve to application source: ${root}`);
}

function expectedSourcePattern(root) {
  if (root.endsWith(`${path.sep}apps${path.sep}web-demo${path.sep}dist`)) return /web-demo\/(?:.*\/)?src\//;
  if (root.endsWith(`${path.sep}apps${path.sep}desktop-shell${path.sep}dist${path.sep}main`)) {
    return /desktop-shell\/(?:.*\/)?src\/main\//;
  }
  if (root.endsWith(`${path.sep}apps${path.sep}desktop-shell${path.sep}dist${path.sep}renderer`)) {
    return /desktop-shell\/(?:.*\/)?src\/renderer/;
  }
  return undefined;
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(child)));
    else files.push(child);
  }
  return files;
}
