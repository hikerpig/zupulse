import { materializeLegatoSystemPages } from "../src/benchmark/legato-system-pages";

const args = parseArgs(process.argv.slice(2));
const result = await materializeLegatoSystemPages({
  manifestPath: args.manifest,
  outputDirectory: args.output,
});
console.log(JSON.stringify(result));

function parseArgs(input: readonly string[]): { manifest: string; output: string } {
  const flags = new Map<string, string>();
  for (let index = 0; index < input.length; index += 2) {
    const name = input[index];
    const value = input[index + 1];
    if (name === undefined || value === undefined || !["--manifest", "--output"].includes(name) || flags.has(name)) {
      throw new Error("usage: materialize-legato-system-pages --manifest <manifest.json> --output <directory>");
    }
    flags.set(name, value);
  }
  const manifest = flags.get("--manifest");
  const output = flags.get("--output");
  if (manifest === undefined || output === undefined) {
    throw new Error("usage: materialize-legato-system-pages --manifest <manifest.json> --output <directory>");
  }
  return { manifest, output };
}
