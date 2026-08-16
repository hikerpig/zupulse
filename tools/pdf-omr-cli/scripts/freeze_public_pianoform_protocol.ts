import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { createPublicPianoformProtocol } from "../src/benchmark/freeze-public-pianoform-protocol";

const flags = parseFlags(process.argv.slice(2));
const manifestPath = requiredFlag(flags, "--manifest");
const outputPath = requiredFlag(flags, "--output");
const benchmarkCommit = requiredFlag(flags, "--benchmark-commit");
const frozenAt = requiredFlag(flags, "--frozen-at");
const audiverisVersion = requiredFlag(flags, "--audiveris-version");
const root = process.cwd();

const [manifestBytes, builderSourceBytes, legatoEnvironment, rokotEnvironment] = await Promise.all([
  readFile(resolve(root, manifestPath)),
  readFile(resolve(root, "tools/pdf-omr-cli/scripts/build_public_pianoform_benchmark.py")),
  readJson(resolve(root, "tools/pdf-omr-cli/engines/legato-environment.json")),
  readJson(resolve(root, "tools/pdf-omr-cli/engines/rokot-environment.json")),
]);
const protocol = createPublicPianoformProtocol({
  manifestBytes,
  benchmarkCommit,
  frozenAt,
  audiverisVersion,
  builderSourceBytes,
  legatoEnvironment,
  rokotEnvironment,
});
const protocolBytes = new TextEncoder().encode(canonicalJson(protocol));
const absoluteOutputPath = resolve(root, outputPath);
await mkdir(dirname(absoluteOutputPath), { recursive: true });
await writeFile(absoluteOutputPath, protocolBytes, { flag: "wx" });
console.log(
  JSON.stringify({
    outputPath: absoluteOutputPath,
    protocolSha256: sha256Bytes(protocolBytes),
    manifestSha256: protocol.manifestSha256,
  }),
);

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseFlags(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--")) {
      throw new Error("protocol freezer requires --name value arguments");
    }
    if (result.has(name)) throw new Error(`duplicate argument: ${name}`);
    result.set(name, value);
  }
  return result;
}

function requiredFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined || value.length === 0) throw new Error(`missing required argument: ${name}`);
  return value;
}
