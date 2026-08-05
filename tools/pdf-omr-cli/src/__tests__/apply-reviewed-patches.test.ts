import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { applyReviewedPatches } from "../fusion/apply-reviewed-patches";
import { repairProposalsSchema } from "../fusion/schemas";
import { normalizeAudiverisMusicXmlWithSourceIndex } from "../normalizers/audiveris";

const encode = (source: string) => new TextEncoder().encode(source);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("applyReviewedPatches", () => {
  it("changes only the reviewed pitch in plain MusicXML", () => {
    const source = scoreXml();
    const sourceNote = firstSourceNote(source);
    const proposals = pitchProposals(sourceNote);

    const result = applyReviewedPatches(source, proposals, decisions("proposal-0", { step: "C", alter: 1, octave: 4 }));
    const corrected = decode(result.correctedBytes);

    expect(corrected).toContain("<step>C</step><alter>1</alter><octave>4</octave>");
    expect(corrected).toContain('<!-- keep --><direction data-vendor="keep"/>');
    expect(decode(source)).toContain("<step>C</step><octave>4</octave>");
    expect(result.patchPlan.entries).toEqual([
      expect.objectContaining({
        proposalId: "proposal-0",
        decision: "applied",
        before: expect.objectContaining({ writtenPitch: { step: "C", alter: 0, octave: 4 } }),
        after: expect.objectContaining({ writtenPitch: { step: "C", alter: 1, octave: 4 } }),
      }),
    ]);
  });

  it("rewrites only the MXL root entry", () => {
    const plain = scoreXml();
    const mxl = zipSync({
      "META-INF/container.xml": encode(
        '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>',
      ),
      "score.musicxml": plain,
      "attachments/layout.xml": encode('<layout vendor="keep"/>'),
    });
    const sourceNote = firstSourceNote(mxl);

    const result = applyReviewedPatches(
      mxl,
      pitchProposals(sourceNote),
      decisions("proposal-0", { step: "D", alter: -1, octave: 4 }),
    );
    const before = unzipSync(mxl);
    const after = unzipSync(result.correctedBytes);

    expect(decode(after["score.musicxml"]!)).toContain("<step>D</step><alter>-1</alter><octave>4</octave>");
    expect(after["META-INF/container.xml"]).toEqual(before["META-INF/container.xml"]);
    expect(after["attachments/layout.xml"]).toEqual(before["attachments/layout.xml"]);
  });

  it("fails closed on a stale precondition or an unsupported apply decision", () => {
    const source = scoreXml();
    const sourceNote = firstSourceNote(source);
    const stale = pitchProposals({
      ...sourceNote,
      locator: { ...sourceNote.locator, preconditionSha256: "f".repeat(64) },
    });
    const unsupported = repairProposalsSchema.parse({
      schemaVersion: "2.0.0",
      mode: "report-only",
      proposals: [
        {
          id: "proposal-0",
          type: "midi-supported-missing-note",
          midiNoteIds: ["midi-0"],
          suggestedSoundingMidi: 61,
          confidence: 0.6,
          autoApplicable: false,
          reviewability: {
            status: "review-only",
            reasons: ["missing-note-notation-underdetermined"],
          },
        },
      ],
    });
    const apply = decisions("proposal-0", { step: "C", alter: 1, octave: 4 });

    expect(() => applyReviewedPatches(source, stale, apply)).toThrow(
      expect.objectContaining({ context: expect.objectContaining({ reason: "source-note-precondition-failed" }) }),
    );
    expect(() => applyReviewedPatches(source, unsupported, apply)).toThrow(
      expect.objectContaining({ context: expect.objectContaining({ reason: "proposal-not-writeback-ready" }) }),
    );
  });

  it("rejects two approved proposals that target the same source note", () => {
    const source = scoreXml();
    const sourceNote = firstSourceNote(source);
    const first = pitchProposals(sourceNote).proposals[0]!;
    const proposals = repairProposalsSchema.parse({
      schemaVersion: "2.0.0",
      mode: "report-only",
      proposals: [first, { ...first, id: "proposal-1", scoreNoteIds: ["score-1"], midiNoteIds: ["midi-1"] }],
    });
    const decisionSet = {
      ...decisions("proposal-0", { step: "C", alter: 1, octave: 4 }),
      decisions: [
        { proposalId: "proposal-0", action: "apply", writtenPitch: { step: "C", alter: 1, octave: 4 } },
        { proposalId: "proposal-1", action: "apply", writtenPitch: { step: "C", alter: 1, octave: 4 } },
      ],
    };

    expect(() => applyReviewedPatches(source, proposals, decisionSet)).toThrow(
      expect.objectContaining({ context: expect.objectContaining({ reason: "conflicting-source-note-patches" }) }),
    );
  });
});

function scoreXml(): Uint8Array {
  return encode(
    '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><!-- keep --><direction data-vendor="keep"/><note color="#123456"><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>',
  );
}

function firstSourceNote(bytes: Uint8Array) {
  const sourceNote = normalizeAudiverisMusicXmlWithSourceIndex(bytes).sourceNotesByEventId.values().next().value;
  if (sourceNote === undefined) throw new Error("source-note-required");
  return sourceNote;
}

function pitchProposals(sourceNote: ReturnType<typeof firstSourceNote>) {
  return repairProposalsSchema.parse({
    schemaVersion: "2.0.0",
    mode: "report-only",
    proposals: [
      {
        id: "proposal-0",
        type: "pitch-disagreement",
        scoreNoteIds: ["score-0"],
        midiNoteIds: ["midi-0"],
        suggestedSoundingMidi: 61,
        confidence: 0.5,
        autoApplicable: false,
        reviewability: { status: "writeback-ready", reasons: [] },
        target: sourceNote.locator,
        before: sourceNote.facts,
      },
    ],
  });
}

function decisions(proposalId: string, writtenPitch: { step: string; alter: number; octave: number }) {
  return {
    schemaVersion: "1.0.0",
    fusionRun: {
      runId: "source-fusion",
      runManifestSha256: "a".repeat(64),
      repairProposalsSha256: "b".repeat(64),
    },
    decisions: [{ proposalId, action: "apply", writtenPitch }],
  };
}
