import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION } from "@zupulse/web-core";
import { runPdfOmrCommand } from "../command";
import type { OmrScoreDraft } from "../schemas";

describe("analyze command", () => {
  it("writes a versioned Harmony artifact with separate OMR and algorithm provenance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-analyze-"));
    const draftPath = join(directory, "draft.json");
    const outputPath = join(directory, "harmony.json");
    await writeFile(draftPath, JSON.stringify(harmonyReadyDraft()));

    const report = await runPdfOmrCommand([
      "analyze",
      draftPath,
      "--output",
      outputPath,
      "--decision-threshold",
      "0.6",
    ]);

    expect(report).toMatchObject({ command: "analyze", status: "succeeded" });
    const artifact = JSON.parse(await readFile(outputPath, "utf8")) as {
      omr?: unknown;
      harmony: { algorithmVersion: string };
      segments: unknown[];
    };
    expect(artifact.omr).toEqual({ engine: { id: "audiveris", version: "5.10.2" } });
    expect(artifact.harmony.algorithmVersion).toBe(BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION);
    expect(Array.isArray(artifact.segments)).toBe(true);
  });

  it("distinguishes invalid thresholds from blocked Drafts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-analyze-errors-"));
    const draftPath = join(directory, "draft.json");
    await writeFile(draftPath, JSON.stringify(harmonyReadyDraft()));

    await expect(
      runPdfOmrCommand([
        "analyze",
        draftPath,
        "--output",
        join(directory, "invalid.json"),
        "--decision-threshold",
        "1.5",
      ]),
    ).rejects.toMatchObject({ code: "INVALID_CLI_ARGUMENT" });

    const blocked = harmonyReadyDraft();
    delete blocked.parts[0]!.staves[0]!.measures[0]!.timeSignature;
    await writeFile(draftPath, JSON.stringify(blocked));
    await expect(
      runPdfOmrCommand(["analyze", draftPath, "--output", join(directory, "blocked.json")]),
    ).rejects.toMatchObject({ code: "DRAFT_VALIDATION_FAILED" });
  });
});

function harmonyReadyDraft(): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    provenance: { engine: { id: "audiveris", version: "5.10.2" } },
    parts: [
      {
        id: "P1",
        name: "Piano",
        staves: [
          {
            index: 0,
            measures: [
              {
                index: 0,
                timeSignature: { numerator: 4, denominator: 4 },
                duration: { numerator: 1, denominator: 1 },
                keySignature: { fifths: 0 },
                clef: { sign: "G", line: 2 },
                voices: [
                  {
                    index: 1,
                    events: [
                      {
                        type: "note",
                        id: "C4",
                        onset: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 1 },
                        writtenPitch: { step: "C", alter: 0, octave: 4 },
                        soundingMidi: 60,
                      },
                      {
                        type: "note",
                        id: "E4",
                        onset: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 1 },
                        writtenPitch: { step: "E", alter: 0, octave: 4 },
                        soundingMidi: 64,
                      },
                      {
                        type: "note",
                        id: "G4",
                        onset: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 1 },
                        writtenPitch: { step: "G", alter: 0, octave: 4 },
                        soundingMidi: 67,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    diagnostics: [],
  };
}
