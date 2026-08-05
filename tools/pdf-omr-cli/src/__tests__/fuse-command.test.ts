import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runPdfOmrCommand } from "../command";
import { midiFile, midiTrack, noteOff, noteOn, tempo } from "./fixtures/midi-builder";

describe("fuse command", () => {
  it("writes immutable sources, evidence, alignment, report-only proposals, diagnostics, and a manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-fuse-"));
    const scorePath = join(directory, "score.musicxml");
    const midiPath = join(directory, "score.mid");
    const outputPath = join(directory, "run");
    await writeFile(scorePath, scoreMusicXml([60, 64, 67, 72]));
    await writeFile(midiPath, sequentialMidi([60, 64, 67, 72]));

    const report = await runPdfOmrCommand([
      "fuse",
      "--musicxml",
      scorePath,
      "--midi",
      midiPath,
      "--output",
      outputPath,
    ]);

    expect(report).toMatchObject({
      command: "fuse",
      status: "succeeded",
      compatibilityStatus: "compatible",
      alignmentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const manifest = JSON.parse(await readFile(join(outputPath, "run.json"), "utf8")) as {
      command: string;
      parameters: { midiKind: string; repairMode: string };
      artifactSha256: Record<string, string>;
    };
    expect(manifest).toMatchObject({
      command: "fuse",
      parameters: { midiKind: "score-export", repairMode: "report-only" },
    });
    expect(Object.keys(manifest.artifactSha256).sort()).toEqual([
      "alignment.json",
      "diagnostics.json",
      "input.json",
      "input/midi.mid",
      "input/score.musicxml",
      "performance-evidence.json",
      "repair-proposals.json",
      "score-evidence.json",
    ]);
    const alignment = JSON.parse(await readFile(join(outputPath, "alignment.json"), "utf8")) as {
      summary: { matched: number; scoreCoverage: number; midiCoverage: number };
    };
    expect(alignment.summary).toMatchObject({ matched: 4, scoreCoverage: 1, midiCoverage: 1 });
    const proposals = JSON.parse(await readFile(join(outputPath, "repair-proposals.json"), "utf8")) as {
      mode: string;
      proposals: unknown[];
    };
    expect(proposals).toEqual({ schemaVersion: "2.0.0", mode: "report-only", proposals: [] });
    expect(await readFile(join(outputPath, "input/score.musicxml"))).toEqual(
      Buffer.from(scoreMusicXml([60, 64, 67, 72])),
    );
  });

  it("produces identical canonical fusion artifacts for repeated runs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-fuse-repeat-"));
    const scorePath = join(directory, "score.musicxml");
    const midiPath = join(directory, "score.mid");
    await writeFile(scorePath, scoreMusicXml([60, 64, 67]));
    await writeFile(midiPath, sequentialMidi([60, 64, 67]));
    const args = ["--musicxml", scorePath, "--midi", midiPath] as const;

    await runPdfOmrCommand(["fuse", ...args, "--output", join(directory, "first")]);
    await runPdfOmrCommand(["fuse", ...args, "--output", join(directory, "second")]);

    for (const artifact of [
      "input/score.musicxml",
      "input/midi.mid",
      "input.json",
      "score-evidence.json",
      "performance-evidence.json",
      "alignment.json",
      "repair-proposals.json",
      "diagnostics.json",
    ]) {
      expect(await readFile(join(directory, "first", artifact))).toEqual(
        await readFile(join(directory, "second", artifact)),
      );
    }
  });

  it("reports incompatible inputs without creating repair proposals", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-fuse-incompatible-"));
    const scorePath = join(directory, "score.musicxml");
    const midiPath = join(directory, "score.mid");
    const outputPath = join(directory, "run");
    await writeFile(scorePath, scoreMusicXml([60, 64, 67, 72]));
    await writeFile(midiPath, sequentialMidi([61]));

    const report = await runPdfOmrCommand([
      "fuse",
      "--musicxml",
      scorePath,
      "--midi",
      midiPath,
      "--output",
      outputPath,
    ]);

    expect(report).toMatchObject({ compatibilityStatus: "incompatible" });
    const proposals = JSON.parse(await readFile(join(outputPath, "repair-proposals.json"), "utf8")) as {
      proposals: unknown[];
    };
    expect(proposals.proposals).toEqual([]);
  });

  it("rejects unsupported modes and unreadable inputs before creating an output directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-fuse-invalid-"));
    const scorePath = join(directory, "score.musicxml");
    const midiPath = join(directory, "score.mid");
    await writeFile(scorePath, scoreMusicXml([60]));
    await writeFile(midiPath, sequentialMidi([60]));
    const unsupportedOutput = join(directory, "unsupported");

    await expect(
      runPdfOmrCommand([
        "fuse",
        "--musicxml",
        scorePath,
        "--midi",
        midiPath,
        "--output",
        unsupportedOutput,
        "--repair-mode",
        "high-confidence",
      ]),
    ).rejects.toMatchObject({ code: "INVALID_CLI_ARGUMENT" });
    await expect(access(unsupportedOutput)).rejects.toBeDefined();

    const missingOutput = join(directory, "missing");
    await expect(
      runPdfOmrCommand([
        "fuse",
        "--musicxml",
        join(directory, "missing.musicxml"),
        "--midi",
        midiPath,
        "--output",
        missingOutput,
      ]),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      context: expect.objectContaining({ reason: "unreadable-musicxml" }),
    });
    await expect(access(missingOutput)).rejects.toBeDefined();
  });

  it("runs the K331 derived-controlled upper-bound evaluation", async () => {
    const scorePath = fileURLToPath(new URL("../../../../test-fixtures/musicxml/K331-3_reviewed.mxl", import.meta.url));
    const midiPath = fileURLToPath(new URL("../../../../test-fixtures/musicxml/K331-3_reviewed.mid", import.meta.url));
    const directory = await mkdtemp(join(tmpdir(), "pdf-omr-fuse-k331-"));
    const outputPath = join(directory, "run");

    const report = await runPdfOmrCommand([
      "fuse",
      "--musicxml",
      scorePath,
      "--midi",
      midiPath,
      "--output",
      outputPath,
    ]);
    const alignment = JSON.parse(await readFile(join(outputPath, "alignment.json"), "utf8")) as {
      compatibility: { detectedTransposition: number };
      summary: { scoreCoverage: number; midiCoverage: number; pitchAgreement: number };
    };
    const proposals = JSON.parse(await readFile(join(outputPath, "repair-proposals.json"), "utf8")) as {
      proposals: Array<{ autoApplicable: boolean }>;
    };

    expect(report).toMatchObject({ compatibilityStatus: "compatible" });
    expect(alignment.compatibility.detectedTransposition).toBe(0);
    expect(alignment.summary.scoreCoverage).toBeGreaterThan(0.99);
    expect(alignment.summary.midiCoverage).toBeGreaterThan(0.99);
    expect(alignment.summary.pitchAgreement).toBe(1);
    expect(proposals.proposals.every((proposal) => proposal.autoApplicable === false)).toBe(true);
  });
});

function sequentialMidi(pitches: readonly number[]): Uint8Array {
  return midiFile({
    tracks: [
      midiTrack(
        tempo(0, 500_000),
        ...pitches.flatMap((pitch, index) => [noteOn(index === 0 ? 0 : 480, 0, pitch, 96), noteOff(240, 0, pitch)]),
      ),
    ],
  });
}

function scoreMusicXml(pitches: readonly number[]): string {
  const notes = pitches
    .map((pitch) => {
      const value = writtenPitch(pitch);
      return `<note><pitch><step>${value.step}</step><alter>${value.alter}</alter><octave>${value.octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>${notes}</measure></part></score-partwise>`;
}

function writtenPitch(midi: number): { step: string; alter: number; octave: number } {
  const pitchClass = ((midi % 12) + 12) % 12;
  const values = [
    ["C", 0],
    ["C", 1],
    ["D", 0],
    ["D", 1],
    ["E", 0],
    ["F", 0],
    ["F", 1],
    ["G", 0],
    ["G", 1],
    ["A", 0],
    ["A", 1],
    ["B", 0],
  ] as const;
  const [step, alter] = values[pitchClass]!;
  return { step, alter, octave: Math.floor(midi / 12) - 1 };
}
