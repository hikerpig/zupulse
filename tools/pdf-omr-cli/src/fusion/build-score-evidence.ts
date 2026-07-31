import { addRational, compareRational, normalizeRational, type ExactRational } from "../rational";
import type { OmrScoreDraft } from "../schemas";
import { scoreEvidenceSchema, type FusionDiagnostic, type ScoreEvidence, type ScoreNoteEvidence } from "./schemas";

type ScoreSource = ScoreEvidence["source"];
type Measure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];

export function buildScoreEvidence(draft: OmrScoreDraft, source: ScoreSource): ScoreEvidence {
  const diagnostics = scoreDiagnostics(draft);
  const reference = draft.parts[0]?.staves[0]?.measures ?? [];
  const writtenMeasureCount = reference.length;
  if (writtenMeasureCount === 0) {
    diagnostics.push({
      code: "FUSION_SCORE_HAS_NO_MEASURES",
      severity: "blocking",
      message: "The normalized score has no measures.",
    });
  }
  if (!repeatMarkersAreConsistent(draft, reference)) {
    diagnostics.push({
      code: "FUSION_REPEAT_MARKERS_INCONSISTENT",
      severity: "blocking",
      message: "Repeat markers differ across score parts or staves.",
    });
  }

  const hasBlockingDiagnostic = () => diagnostics.some((diagnostic) => diagnostic.severity === "blocking");
  const playbackMeasureOrder = hasBlockingDiagnostic() ? [] : expandPlaybackOrder(reference);
  const measureDurations = reference.map((_, index) => measurePlaybackDuration(draft, index));
  const writtenOffsets = cumulativeOffsets(measureDurations);
  const visits = new Map<number, number>();
  let playbackOffset: ExactRational = { numerator: 0, denominator: 1 };
  const notes: ScoreNoteEvidence[] = [];

  for (const [playbackMeasureIndex, measureIndex] of playbackMeasureOrder.entries()) {
    const playbackIteration = visits.get(measureIndex) ?? 0;
    visits.set(measureIndex, playbackIteration + 1);
    const measureNotes = collectMeasureNotes(draft, measureIndex, playbackMeasureIndex);
    for (const note of measureNotes) {
      if (note.soundingMidi === undefined) {
        diagnostics.push({
          code: "FUSION_SCORE_NOTE_MISSING_SOUNDING_PITCH",
          severity: "blocking",
          message: "A score note has no sounding MIDI pitch.",
          scoreNoteId: note.sourceNoteId,
        });
        continue;
      }
      notes.push({
        id: note.id,
        partId: note.partId,
        staffIndex: note.staffIndex,
        voice: note.voice,
        measureIndex,
        playbackMeasureIndex,
        playbackIteration,
        writtenOnset: addRational(writtenOffsets[measureIndex]!, note.onset),
        playbackOnset: addRational(playbackOffset, note.onset),
        duration: normalizeRational(note.duration),
        soundingMidi: note.soundingMidi,
        sourceNoteId: note.sourceNoteId,
      });
    }
    playbackOffset = addRational(playbackOffset, measureDurations[measureIndex]!);
  }

  return scoreEvidenceSchema.parse({
    schemaVersion: "1.0.0",
    source,
    writtenMeasureCount,
    playbackMeasureOrder,
    notes: hasBlockingDiagnostic() ? [] : notes,
    diagnostics,
  });
}

function scoreDiagnostics(draft: OmrScoreDraft): FusionDiagnostic[] {
  const counts = new Map<string, number>();
  for (const diagnostic of draft.diagnostics) {
    if (diagnostic.severity !== "blocking") continue;
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) =>
      code === "MISSING_EVENT_TIMING"
        ? {
            code: "FUSION_SCORE_EVENTS_WITHOUT_TIMING_OMITTED",
            severity: "warning" as const,
            message: "Score events without usable timing were omitted from alignment evidence.",
            context: { count },
          }
        : {
            code: "FUSION_SCORE_BLOCKING_DIAGNOSTIC",
            severity: "blocking" as const,
            message: "The normalized score contains a blocking diagnostic.",
            context: { scoreDiagnosticCode: code, count },
          },
    );
}

function repeatMarkersAreConsistent(draft: OmrScoreDraft, reference: readonly Measure[]): boolean {
  const expected = reference.map(repeatKey);
  return draft.parts.every((part) =>
    part.staves.every(
      (staff) =>
        staff.measures.length === reference.length &&
        staff.measures.every((measure, index) => repeatKey(measure) === expected[index]),
    ),
  );
}

function repeatKey(measure: Measure): string {
  return measure.repeat === undefined ? "none" : `${measure.repeat.forward}:${measure.repeat.backward}`;
}

function expandPlaybackOrder(measures: readonly Measure[]): number[] {
  const result: number[] = [];
  const repeatedBackwardMeasures = new Set<number>();
  let repeatStart = 0;
  let measureIndex = 0;
  while (measureIndex < measures.length) {
    const measure = measures[measureIndex]!;
    result.push(measureIndex);
    if (measure.repeat?.backward === true && !repeatedBackwardMeasures.has(measureIndex)) {
      repeatedBackwardMeasures.add(measureIndex);
      measureIndex = repeatStart;
      continue;
    }
    if (measure.repeat?.forward === true) repeatStart = measureIndex;
    measureIndex += 1;
  }
  return result;
}

function measurePlaybackDuration(draft: OmrScoreDraft, measureIndex: number): ExactRational {
  let maximum: ExactRational | undefined;
  let declared: ExactRational | undefined;
  for (const part of draft.parts) {
    for (const staff of part.staves) {
      const measure = staff.measures[measureIndex];
      if (measure === undefined) continue;
      declared ??= measure.duration;
      for (const voice of measure.voices) {
        for (const event of voice.events) {
          const end = addRational(event.onset, event.duration);
          if (maximum === undefined || compareRational(end, maximum) > 0) maximum = end;
        }
      }
    }
  }
  return normalizeRational(maximum ?? declared ?? { numerator: 1, denominator: 1 });
}

function cumulativeOffsets(durations: readonly ExactRational[]): ExactRational[] {
  const result: ExactRational[] = [];
  let offset: ExactRational = { numerator: 0, denominator: 1 };
  for (const duration of durations) {
    result.push(offset);
    offset = addRational(offset, duration);
  }
  return result;
}

function collectMeasureNotes(draft: OmrScoreDraft, measureIndex: number, playbackMeasureIndex: number) {
  return draft.parts
    .flatMap((part, partIndex) =>
      part.staves.flatMap((staff) => {
        const measure = staff.measures[measureIndex];
        if (measure === undefined) return [];
        return measure.voices.flatMap((voice) =>
          voice.events.flatMap((event, eventIndex) => {
            if (event.type !== "note" || event.tie === "continue" || event.tie === "end") return [];
            return [
              {
                id: `score-p${partIndex}-m${measureIndex}-s${staff.index}-v${voice.index}-e${eventIndex}-play${playbackMeasureIndex}`,
                partId: part.id,
                staffIndex: staff.index,
                voice: voice.index,
                onset: event.onset,
                duration: event.duration,
                soundingMidi: event.soundingMidi,
                sourceNoteId: event.id,
              },
            ];
          }),
        );
      }),
    )
    .sort(
      (left, right) =>
        compareRational(left.onset, right.onset) ||
        left.partId.localeCompare(right.partId) ||
        left.staffIndex - right.staffIndex ||
        left.voice - right.voice ||
        left.id.localeCompare(right.id),
    );
}
