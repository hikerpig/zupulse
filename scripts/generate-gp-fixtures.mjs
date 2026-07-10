import { mkdir, readFile, writeFile } from "node:fs/promises";
import { exporter, importer, Settings } from "@coderline/alphatab";

const settings = new Settings();
const source = new Uint8Array(
  await readFile("test-fixtures/gp/Treasure.gp5"),
);
const score = importer.ScoreLoader.loadScoreFromBytes(source, settings);
score.title = "桌面验收谱";
if (!score.tracks[0]) {
  throw new Error("Treasure.gp5 must contain at least one track");
}
score.tracks[0].name = "主音吉他";
const bytes = new exporter.Gp7Exporter().export(score, settings);
await mkdir("test-fixtures/gp/generated", { recursive: true });
await writeFile("test-fixtures/gp/generated/desktop-acceptance.gp", bytes);
