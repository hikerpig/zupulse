import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditBenchmarkGroundTruth } from "../benchmark/audit-ground-truth";
import { generateMusicXml } from "../generate-musicxml";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";

describe("benchmark ground-truth audit", () => {
  it("records ready and unparseable ground truth without repairing either", async () => {
    const directory = await mkdtemp(join(tmpdir(), "benchmark-ground-truth-audit-"));
    await writeFile(join(directory, "ready.musicxml"), generateMusicXml(musicXmlReadyDraft(), { container: "xml" }));
    await writeFile(join(directory, "broken.musicxml"), "not MusicXML");

    const audit = await auditBenchmarkGroundTruth(
      [
        { item: { id: "ready" }, source: { groundTruthPath: "ready.musicxml" } },
        { item: { id: "broken" }, source: { groundTruthPath: "broken.musicxml" } },
      ],
      directory,
    );

    expect(audit.items[0]).toMatchObject({ itemId: "ready", ready: true });
    expect(audit.items[1]).toMatchObject({ itemId: "broken", ready: false });
  });
});
