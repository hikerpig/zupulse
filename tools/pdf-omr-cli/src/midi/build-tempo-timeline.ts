import { PdfOmrError } from "../errors";
import type { MidiDiagnostic, MidiSourceCoordinate, PerformanceEvidence, RawMidiDocument } from "./schemas";

type TempoTimeline = PerformanceEvidence["tempoTimeline"];

export type TempoTimelineResult = {
  timeline: TempoTimeline;
  diagnostics: MidiDiagnostic[];
  tickToSeconds(tick: number): number;
};

export function buildTempoTimeline(document: RawMidiDocument): TempoTimelineResult {
  const tempoEvents = document.tracks
    .flatMap((track) => track.events)
    .filter((event) => event.type === "tempo")
    .sort(compareSourceOrder);
  const grouped = new Map<number, typeof tempoEvents>();
  for (const event of tempoEvents) {
    grouped.set(event.absoluteTick, [...(grouped.get(event.absoluteTick) ?? []), event]);
  }

  const changes: TempoTimeline["changes"] = [];
  for (const [tick, events] of [...grouped.entries()].sort(([left], [right]) => left - right)) {
    const tempos = [...new Set(events.map((event) => event.microsecondsPerQuarter))];
    if (tempos.length !== 1) {
      throw new PdfOmrError("INVALID_INPUT", "MIDI has conflicting tempo events at the same tick", {
        context: { reason: "conflicting-tempo-at-tick", tick, tempos },
      });
    }
    changes.push({
      tick,
      microsecondsPerQuarter: tempos[0]!,
      origin: "midi",
      sources: events.map(sourceCoordinate),
    });
  }

  const diagnostics: MidiDiagnostic[] = [];
  if (changes[0]?.tick !== 0) {
    changes.unshift({ tick: 0, microsecondsPerQuarter: 500_000, origin: "default", sources: [] });
    diagnostics.push({
      code: "MIDI_DEFAULT_TEMPO_ASSUMED",
      severity: "info",
      message: "No tempo was present at tick zero; using the Standard MIDI File default of 120 BPM.",
      context: { microsecondsPerQuarter: 500_000 },
    });
  }

  let elapsedSeconds = 0;
  const segments: TempoTimeline["segments"] = changes.map((change, index) => {
    const next = changes[index + 1];
    const segment = {
      startTick: change.tick,
      ...(next === undefined ? {} : { endTick: next.tick }),
      startSeconds: elapsedSeconds,
      microsecondsPerQuarter: change.microsecondsPerQuarter,
    };
    if (next !== undefined) {
      elapsedSeconds +=
        ((next.tick - change.tick) * change.microsecondsPerQuarter) / document.header.ticksPerQuarter / 1_000_000;
    }
    return segment;
  });

  return {
    timeline: { changes, segments },
    diagnostics,
    tickToSeconds(tick) {
      if (!Number.isSafeInteger(tick) || tick < 0) {
        throw new PdfOmrError("INVALID_INPUT", "MIDI tick must be a nonnegative safe integer", {
          context: { reason: "invalid-midi-tick", tick },
        });
      }
      let segment = segments[0]!;
      for (const candidate of segments) {
        if (candidate.startTick > tick) break;
        segment = candidate;
      }
      return (
        segment.startSeconds +
        ((tick - segment.startTick) * segment.microsecondsPerQuarter) / document.header.ticksPerQuarter / 1_000_000
      );
    },
  };
}

function compareSourceOrder(
  left: { absoluteTick: number; trackIndex: number; eventIndex: number },
  right: { absoluteTick: number; trackIndex: number; eventIndex: number },
): number {
  return (
    left.absoluteTick - right.absoluteTick || left.trackIndex - right.trackIndex || left.eventIndex - right.eventIndex
  );
}

function sourceCoordinate(event: {
  trackIndex: number;
  eventIndex: number;
  absoluteTick: number;
}): MidiSourceCoordinate {
  return {
    trackIndex: event.trackIndex,
    eventIndex: event.eventIndex,
    absoluteTick: event.absoluteTick,
  };
}
