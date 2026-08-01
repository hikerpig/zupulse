import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../canonical-json";
import { runPdfOmrCommand } from "../command";
import { midiFile, midiTrack, noteOff, noteOn, tempo } from "./fixtures/midi-builder";

describe("apply-fusion command", () => {
  it("publishes a validated corrected score from reviewed fusion decisions", async () => {
    const context = await fusionRun();
    const output = join(context.directory, "writeback");
    const decisionsPath = await writeDecisions(context);

    const report = await runPdfOmrCommand([
      "apply-fusion",
      "--run",
      context.runDirectory,
      "--decisions",
      decisionsPath,
      "--output",
      output,
    ]);

    expect(report).toMatchObject({
      command: "apply-fusion",
      status: "succeeded",
      appliedCount: 1,
      correctedScoreSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const corrected = await readFile(join(output, "corrected/score.musicxml"), "utf8");
    expect(corrected).toContain("<step>C</step><alter>1</alter><octave>4</octave>");
    const after = JSON.parse(await readFile(join(output, "validation/fusion-after.json"), "utf8")) as {
      summary: { pitchAgreement: number };
    };
    expect(after.summary.pitchAgreement).toBe(1);
    expect(await readFile(context.scorePath, "utf8")).toContain("<step>C</step><octave>4</octave>");
  });

  it("rejects a tampered fusion run before publishing output", async () => {
    const context = await fusionRun();
    const decisionsPath = await writeDecisions(context);
    const output = join(context.directory, "writeback");
    await writeFile(join(context.runDirectory, "repair-proposals.json"), '{"tampered":true}\n');

    await expect(
      runPdfOmrCommand([
        "apply-fusion",
        "--run",
        context.runDirectory,
        "--decisions",
        decisionsPath,
        "--output",
        output,
      ]),
    ).rejects.toMatchObject({
      context: expect.objectContaining({ reason: "fusion-run-integrity-failed" }),
    });
    await expect(access(output)).rejects.toBeDefined();
  });
});

async function fusionRun() {
  const directory = await mkdtemp(join(tmpdir(), "pdf-omr-apply-fusion-"));
  const scorePath = join(directory, "score.musicxml");
  const midiPath = join(directory, "score.mid");
  const runDirectory = join(directory, "fusion");
  await writeFile(scorePath, scoreMusicXml([60, 64, 67, 72]));
  await writeFile(midiPath, sequentialMidi([61, 64, 67, 72]));
  await runPdfOmrCommand(["fuse", "--musicxml", scorePath, "--midi", midiPath, "--output", runDirectory]);
  return { directory, scorePath, runDirectory };
}

async function writeDecisions(context: Awaited<ReturnType<typeof fusionRun>>): Promise<string> {
  const runBytes = await readFile(join(context.runDirectory, "run.json"));
  const run = JSON.parse(runBytes.toString("utf8")) as {
    runId: string;
    artifactSha256: Record<string, string>;
  };
  const proposals = JSON.parse(await readFile(join(context.runDirectory, "repair-proposals.json"), "utf8")) as {
    proposals: Array<{ id: string; reviewability: { status: string }; suggestedSoundingMidi: number }>;
  };
  const proposal = proposals.proposals.find((candidate) => candidate.reviewability.status === "writeback-ready");
  if (proposal === undefined) throw new Error("writeback-ready-proposal-required");
  const decisionsPath = join(context.directory, "decisions.json");
  await writeFile(
    decisionsPath,
    JSON.stringify({
      schemaVersion: "1.0.0",
      fusionRun: {
        runId: run.runId,
        runManifestSha256: sha256Bytes(runBytes),
        repairProposalsSha256: run.artifactSha256["repair-proposals.json"],
      },
      decisions: [
        {
          proposalId: proposal.id,
          action: "apply",
          writtenPitch: { step: "C", alter: 1, octave: 4 },
        },
      ],
    }),
  );
  return decisionsPath;
}

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
      return `<note><pitch><step>${value.step}</step>${value.alter === 0 ? "" : `<alter>${value.alter}</alter>`}<octave>${value.octave}</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>`;
    })
    .join("");
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${notes}</measure></part></score-partwise>`;
}

function writtenPitch(midi: number) {
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
  const [step, alter] = values[((midi % 12) + 12) % 12]!;
  return { step, alter, octave: Math.floor(midi / 12) - 1 };
}
