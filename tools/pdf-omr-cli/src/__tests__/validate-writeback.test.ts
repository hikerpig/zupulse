import { describe, expect, it } from "vitest";
import { applyReviewedPatches } from "../fusion/apply-reviewed-patches";
import { repairProposalsSchema } from "../fusion/schemas";
import { validateWriteback } from "../fusion/validate-writeback";
import { normalizeAudiverisMusicXmlWithSourceIndex } from "../normalizers/audiveris";
import { midiFile, midiTrack, noteOff, noteOn, tempo } from "./fixtures/midi-builder";

const encode = (source: string) => new TextEncoder().encode(source);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("validateWriteback", () => {
  it("accepts an approved pitch-only correction that improves fusion", async () => {
    const source = scoreXml([60, 64, 67, 72]);
    const applied = applyFirstPitch(source, 61, { step: "C", alter: 1, octave: 4 });

    const report = await validateWriteback(
      source,
      applied.correctedBytes,
      sequentialMidi([61, 64, 67, 72]),
      applied.patchPlan,
    );

    expect(report.runtime).toEqual({ parse: true, view: true, playback: true });
    expect(report.structural.differences).toEqual([]);
    expect(report.fusion.before.summary.pitchAgreement).toBeLessThan(report.fusion.after.summary.pitchAgreement);
    expect(report.fusion.after.summary.pitchAgreement).toBe(1);
  });

  it("rejects a duration change outside the approved pitch patch", async () => {
    const source = scoreXml([60, 64, 67, 72]);
    const applied = applyFirstPitch(source, 61, { step: "C", alter: 1, octave: 4 });
    const drifted = encode(decode(applied.correctedBytes).replace("<duration>4</duration>", "<duration>8</duration>"));

    await expect(
      validateWriteback(source, drifted, sequentialMidi([61, 64, 67, 72]), applied.patchPlan),
    ).rejects.toMatchObject({
      context: expect.objectContaining({ reason: "corrected-score-structural-regression" }),
    });
  });

  it("rejects a structurally valid approved pitch that makes fusion worse", async () => {
    const source = scoreXml([60, 64, 67, 72]);
    const applied = applyFirstPitch(source, 61, { step: "C", alter: 1, octave: 4 });

    await expect(
      validateWriteback(source, applied.correctedBytes, sequentialMidi([60, 64, 67, 72]), applied.patchPlan),
    ).rejects.toMatchObject({
      context: expect.objectContaining({ reason: "corrected-score-fusion-regression" }),
    });
  });
});

function applyFirstPitch(source: Uint8Array, suggestedSoundingMidi: number, writtenPitch: WrittenPitch) {
  const sourceNote = normalizeAudiverisMusicXmlWithSourceIndex(source).sourceNotesByEventId.values().next().value!;
  const proposals = repairProposalsSchema.parse({
    schemaVersion: "2.0.0",
    mode: "report-only",
    proposals: [
      {
        id: "proposal-0",
        type: "pitch-disagreement",
        scoreNoteIds: ["score-0"],
        midiNoteIds: ["midi-0"],
        suggestedSoundingMidi,
        confidence: 0.5,
        autoApplicable: false,
        reviewability: { status: "writeback-ready", reasons: [] },
        target: sourceNote.locator,
        before: sourceNote.facts,
      },
    ],
  });
  return applyReviewedPatches(source, proposals, {
    schemaVersion: "1.0.0",
    fusionRun: {
      runId: "source-fusion",
      runManifestSha256: "a".repeat(64),
      repairProposalsSha256: "b".repeat(64),
    },
    decisions: [{ proposalId: "proposal-0", action: "apply", writtenPitch }],
  });
}

type WrittenPitch = { step: "A" | "B" | "C" | "D" | "E" | "F" | "G"; alter: number; octave: number };

function scoreXml(pitches: readonly number[]): Uint8Array {
  const notes = pitches
    .map((pitch) => {
      const value = writtenPitch(pitch);
      return `<note><pitch><step>${value.step}</step>${value.alter === 0 ? "" : `<alter>${value.alter}</alter>`}<octave>${value.octave}</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>`;
    })
    .join("");
  return encode(
    `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${notes}</measure></part></score-partwise>`,
  );
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

function writtenPitch(midi: number): WrittenPitch {
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
