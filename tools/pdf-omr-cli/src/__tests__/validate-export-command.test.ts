import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";
import { runPdfOmrCommand } from "../command";
import { exportMusicXmlCommand } from "../commands/export-musicxml";

describe("validate and export commands", () => {
  it("writes diagnostics and independent readiness for a blocked Draft", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-validate-"));
    const inputPath = join(directory, "draft.json");
    const outputPath = join(directory, "diagnostics.json");
    const draft = musicXmlReadyDraft();
    delete draft.parts[0]!.staves[0]!.measures[0]!.clef;
    await writeFile(inputPath, JSON.stringify(draft));

    await expect(runPdfOmrCommand(["validate", inputPath, "--output", outputPath])).rejects.toMatchObject({
      code: "DRAFT_VALIDATION_FAILED",
      context: { readiness: { harmony: "ready", musicXml: "blocked" } },
    });
    const artifact = JSON.parse(await readFile(outputPath, "utf8")) as {
      diagnostics: Array<{ code: string }>;
    };
    expect(artifact.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_CLEF" })]));
  });

  it("exports deterministic MXL and a successful current-adapter round-trip report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-export-"));
    const inputPath = join(directory, "draft.json");
    const outputPath = join(directory, "score.mxl");
    const roundTripPath = join(directory, "round-trip.json");
    await writeFile(inputPath, JSON.stringify(musicXmlReadyDraft()));

    const report = await runPdfOmrCommand([
      "export-musicxml",
      inputPath,
      "--output",
      outputPath,
      "--round-trip-report",
      roundTripPath,
    ]);

    expect(report).toMatchObject({ command: "export-musicxml", status: "succeeded" });
    expect((await readFile(outputPath)).subarray(0, 2)).toEqual(Buffer.from("PK"));
    const roundTrip = JSON.parse(await readFile(roundTripPath, "utf8")) as {
      parse: boolean;
      structural: boolean;
    };
    expect(roundTrip).toMatchObject({ parse: true, view: true, playback: true, structural: true });
  });

  it("saves structural mismatch evidence and returns export failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-export-mismatch-"));
    const inputPath = join(directory, "draft.json");
    const outputPath = join(directory, "score.mxl");
    const roundTripPath = join(directory, "round-trip.json");
    await writeFile(inputPath, JSON.stringify(musicXmlReadyDraft()));

    await expect(
      exportMusicXmlCommand(inputPath, outputPath, roundTripPath, directory, {
        compare: async () => ({
          schemaVersion: "1.0.0",
          parse: true,
          view: true,
          playback: true,
          structural: false,
          differences: [{ code: "PITCH_MISMATCH", path: "part[0].measure[0]" }],
        }),
      }),
    ).rejects.toMatchObject({ code: "PROJECTION_OR_EXPORT_FAILED" });
    await expect(access(outputPath)).rejects.toBeDefined();
    await expect(readFile(roundTripPath, "utf8")).resolves.toContain("PITCH_MISMATCH");
  });

  it("does not overwrite an existing export", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-export-existing-"));
    const inputPath = join(directory, "draft.json");
    const outputPath = join(directory, "score.mxl");
    await writeFile(inputPath, JSON.stringify(musicXmlReadyDraft()));
    await writeFile(outputPath, "keep");

    await expect(runPdfOmrCommand(["export-musicxml", inputPath, "--output", outputPath])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(readFile(outputPath, "utf8")).resolves.toBe("keep");
  });
});
