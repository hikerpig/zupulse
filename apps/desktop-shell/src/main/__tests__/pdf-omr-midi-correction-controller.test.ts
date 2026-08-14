import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PdfOmrPipelineResult } from "@zupulse/pdf-omr-cli/pipeline";
import { PdfOmrMidiCorrectionController } from "../pdf-omr-midi-correction-controller";

describe("PdfOmrMidiCorrectionController", () => {
  it("projects path-free fusion evidence and publishes a corrected result from explicit decisions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-midi-controller-"));
    const initialPath = join(directory, "score.mxl");
    await writeFile(initialPath, "initial");
    const completed = { outputDirectory: directory, result: pipelineResult() };
    const commands = {
      fuse: vi.fn(async (options: { output: string }) => {
        await writeFusionArtifacts(options.output);
        return { compatibilityStatus: "compatible" as const };
      }),
      apply: vi.fn(async (options: { decisions: string; output: string }) => {
        const decisions = JSON.parse(await readFile(options.decisions, "utf8")) as { decisions: unknown[] };
        expect(decisions.decisions).toEqual([
          { proposalId: "proposal-1", action: "apply", writtenPitch: { step: "C", alter: 1, octave: 4 } },
        ]);
        await writeFile(join(directory, "corrected.musicxml"), "corrected");
        return {
          appliedCount: 1,
          correctedScoreArtifactPath: "corrected.musicxml",
          correctedScoreSha256: "d".repeat(64),
        };
      }),
    };
    const controller = new PdfOmrMidiCorrectionController({ getCompletedResult: () => completed }, commands);

    const analysis = await controller.analyze({
      jobId: "job-1",
      midiPath: join(directory, "reference.mid"),
      midiFileName: "reference.mid",
      outputDirectory: join(directory, "fusion"),
    });

    expect(JSON.stringify(analysis)).not.toContain(directory);
    expect(analysis).toMatchObject({
      midiFileName: "reference.mid",
      compatibility: { status: "compatible", pitchAgreement: 0.75 },
      proposals: [
        {
          id: "proposal-1",
          measureIndex: 0,
          reviewability: { status: "writeback-ready" },
          suggestedSoundingMidi: 61,
        },
      ],
    });

    const applied = await controller.apply({
      jobId: "job-1",
      decisions: [{ proposalId: "proposal-1", writtenPitch: { step: "C", alter: 1, octave: 4 } }],
      outputDirectory: join(directory, "writeback"),
    });
    expect(applied).toEqual({ appliedCount: 1 });
    expect(controller.getCorrectedResult("job-1")).toEqual({
      fileName: "score-midi-corrected.musicxml",
      path: join(directory, "writeback", "corrected.musicxml"),
      outputSha256: "d".repeat(64),
      appliedCount: 1,
    });
    expect(await readFile(initialPath, "utf8")).toBe("initial");
  });
});

async function writeFusionArtifacts(directory: string): Promise<void> {
  await import("node:fs/promises").then(({ mkdir }) => mkdir(directory));
  await writeFile(
    join(directory, "alignment.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      algorithm: {
        id: "zupulse-score-midi-frame-alignment",
        version: "1.0.0",
        parameters: { gapCost: 1, onsetWeight: 1, maxReconciliationOnsetDistance: 0.01, maxTracebackCells: 100 },
      },
      compatibility: {
        status: "compatible",
        detectedTransposition: 0,
        chromaSimilarity: 1,
        transpositionMargin: 1,
        scoreNoteCount: 4,
        midiNoteCount: 4,
        noteCountRatio: 1,
        reasons: [],
      },
      entries: [],
      summary: {
        matched: 4,
        ambiguous: 0,
        scoreOnly: 0,
        midiOnly: 0,
        scoreCoverage: 1,
        midiCoverage: 1,
        pitchAgreement: 0.75,
        frameAlignmentCost: 0,
      },
    }),
  );
  await writeFile(
    join(directory, "repair-proposals.json"),
    JSON.stringify({
      schemaVersion: "2.0.0",
      mode: "report-only",
      proposals: [
        {
          id: "proposal-1",
          type: "pitch-disagreement",
          suggestedSoundingMidi: 61,
          confidence: 0.9,
          autoApplicable: false,
          reviewability: { status: "writeback-ready", reasons: [] },
          target: {
            rootFilePath: null,
            partId: "P1",
            measureIndex: 0,
            noteIndex: 0,
            preconditionSha256: "a".repeat(64),
          },
          before: {
            writtenPitch: { step: "C", alter: 0, octave: 4 },
            voice: 1,
            staff: 1,
            durationUnits: 4,
            chord: false,
            tieTypes: [],
          },
        },
      ],
    }),
  );
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      runId: "fusion-1",
      command: "fuse",
      inputSha256: { score: "a".repeat(64), midi: "c".repeat(64) },
      fusion: { id: "zupulse-score-midi-fusion", version: "1.0.0" },
      parameters: { midiKind: "score-export", repairMode: "report-only" },
      startedAt: "2026-08-08T00:00:00.000Z",
      completedAt: "2026-08-08T00:00:01.000Z",
      status: "succeeded",
      compatibilityStatus: "compatible",
      artifactSha256: { "repair-proposals.json": "b".repeat(64) },
    }),
  );
}

function pipelineResult(): PdfOmrPipelineResult {
  return {
    schemaVersion: "1.0.0",
    status: "succeeded",
    input: {
      fileName: "source.pdf",
      inputSha256: "a".repeat(64),
      sizeBytes: 42,
      pageCount: 1,
      inputKind: "pdf",
    },
    engine: { id: "audiveris", version: "1.0.0" },
    validation: { readiness: { harmony: "ready", musicXml: "ready" }, outputSha256: "b".repeat(64) },
    outputSha256: "c".repeat(64),
    artifacts: {
      inspect: "inspect/input.json",
      recognitionDirectory: "recognition",
      validation: "validation.json",
      musicXml: "score.mxl",
      roundTrip: "round-trip.json",
    },
  };
}
