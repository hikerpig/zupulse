import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("test-fixtures/musicxml/generated");
const files = await readdir(root);
for (const required of ["single-voice.musicxml", "piano-multistaff.musicxml", "timewise.musicxml", "simple.mxl", "malformed.musicxml", "broken.mxl"]) {
  if (!files.includes(required)) throw new Error(`Missing MusicXML fixture: ${required}`);
}
for (const name of files.filter(name => name.endsWith(".musicxml") && name !== "malformed.musicxml")) {
  const source = await readFile(resolve(root, name), "utf8");
  if (!/<score-(partwise|timewise)\b/.test(source)) throw new Error(`Invalid MusicXML root: ${name}`);
}
console.log(`Verified ${files.length} deterministic MusicXML fixtures.`);
