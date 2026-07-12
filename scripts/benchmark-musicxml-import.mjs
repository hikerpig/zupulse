import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const file = resolve(process.argv[2] ?? "test-fixtures/musicxml/generated/large-score.musicxml");
const samples = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  const bytes = await readFile(file);
  const source = new TextDecoder().decode(bytes);
  if (!/<score-(partwise|timewise)\b/.test(source)) throw new Error("Unsupported benchmark fixture");
  source.match(/<note\b/g); source.match(/<part\b/g); source.match(/<measure\b/g);
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ file, samples: samples.length, preflightP95Ms: Number(samples[Math.ceil(samples.length * .95) - 1].toFixed(2)) }, null, 2));
