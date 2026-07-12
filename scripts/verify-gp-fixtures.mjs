import { readFile } from "node:fs/promises";
import { importer, Settings } from "@coderline/alphatab";

for (const file of ["test-fixtures/gp/Treasure.gp5", "test-fixtures/gp/generated/desktop-acceptance.gp"]) {
  const bytes = new Uint8Array(await readFile(file));
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
  if (!score.tracks.length || !score.masterBars.length) {
    throw new Error(`Invalid fixture: ${file}`);
  }
  if (
    file.endsWith("desktop-acceptance.gp") &&
    (score.title !== "桌面验收谱" || score.tracks[0]?.name !== "主音吉他")
  ) {
    throw new Error("Generated fixture lost Chinese metadata");
  }
}
