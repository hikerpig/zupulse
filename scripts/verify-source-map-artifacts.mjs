import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];
const roots = process.argv.slice(3);
if (!mode || !["require", "forbid"].includes(mode) || roots.length === 0) {
  throw new Error("Usage: node scripts/verify-source-map-artifacts.mjs <require|forbid> <directory>...");
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
process.stdout.write(`source-map artifact guard passed: ${maps.length} maps\n`);

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
