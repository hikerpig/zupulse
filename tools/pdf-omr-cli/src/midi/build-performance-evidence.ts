import { buildTempoTimeline } from "./build-tempo-timeline";
import {
  performanceEvidenceSchema,
  type MidiDiagnostic,
  type MidiSourceCoordinate,
  type PerformanceEvidence,
  type RawMidiDocument,
  type RawMidiEvent,
} from "./schemas";

type NoteOnEvent = Extract<RawMidiEvent, { type: "note-on" }>;
type NoteOffEvent = Extract<RawMidiEvent, { type: "note-off" }>;
type ControlEvent = Extract<RawMidiEvent, { type: "control-change" }>;
type NoteFlag = PerformanceEvidence["notes"][number]["flags"][number];

type PendingNote = {
  noteOn: NoteOnEvent;
  flags: Set<NoteFlag>;
};

type PairedNote = PendingNote & {
  noteOff: NoteOffEvent;
};

export function buildPerformanceEvidence(
  document: RawMidiDocument,
  source: { fileName: string; sha256: string; sizeBytes: number },
): PerformanceEvidence {
  const tempo = buildTempoTimeline(document);
  const diagnostics: MidiDiagnostic[] = [...tempo.diagnostics];
  const active = new Map<string, PendingNote[]>();
  const paired: PairedNote[] = [];

  for (const track of document.tracks) {
    for (const event of track.events) {
      if (event.type === "note-on") {
        const key = noteKey(event);
        const queue = active.get(key) ?? [];
        const pending: PendingNote = { noteOn: event, flags: new Set() };
        if (queue.length > 0) {
          pending.flags.add("overlapping-same-pitch");
          for (const existing of queue) existing.flags.add("overlapping-same-pitch");
          diagnostics.push({
            code: "MIDI_OVERLAPPING_SAME_PITCH",
            severity: "warning",
            message: "A note-on occurred while the same track, channel, and pitch was already active.",
            source: sourceCoordinate(event),
            context: { pitch: event.pitch, channel: event.channel },
          });
        }
        queue.push(pending);
        active.set(key, queue);
      } else if (event.type === "note-off") {
        const key = noteKey(event);
        const queue = active.get(key) ?? [];
        const pending = queue.shift();
        if (pending === undefined) {
          diagnostics.push({
            code: "MIDI_UNMATCHED_NOTE_OFF",
            severity: "warning",
            message: "A note-off did not have a matching active note-on.",
            source: sourceCoordinate(event),
            context: { pitch: event.pitch, channel: event.channel },
          });
        } else {
          paired.push({ ...pending, noteOff: event });
        }
        if (queue.length === 0) active.delete(key);
        else active.set(key, queue);
      }
    }
  }

  for (const queue of active.values()) {
    for (const pending of queue) {
      diagnostics.push({
        code: "MIDI_DANGLING_NOTE_ON",
        severity: "warning",
        message: "A note-on remained active at the end of its track and was omitted from complete note evidence.",
        source: sourceCoordinate(pending.noteOn),
        context: { pitch: pending.noteOn.pitch, channel: pending.noteOn.channel },
      });
    }
  }

  const controls = document.tracks
    .flatMap((track) => track.events)
    .filter((event): event is ControlEvent => event.type === "control-change")
    .sort(compareSourceOrder);
  const pedalControls = controls.filter((event) => event.controller === 64);
  const playbackEndTick = Math.max(0, ...document.tracks.map((track) => track.endTick));
  const sortedPairs = paired.sort((left, right) => compareSourceOrder(left.noteOn, right.noteOn));
  const notes = sortedPairs.map((pair, noteIndex) => {
    if (pair.noteOn.channel === 9) pair.flags.add("percussion-channel");
    const pedal = projectSustain(pair, pedalControls, playbackEndTick, diagnostics);
    for (const flag of pedal.flags) pair.flags.add(flag);
    return {
      id: `midi-t${pair.noteOn.trackIndex}-e${pair.noteOn.eventIndex}`,
      trackIndex: pair.noteOn.trackIndex,
      channel: pair.noteOn.channel,
      noteIndex,
      pitch: pair.noteOn.pitch,
      velocity: pair.noteOn.velocity,
      onsetTick: pair.noteOn.absoluteTick,
      keyReleaseTick: pair.noteOff.absoluteTick,
      soundOffTick: pedal.soundOffTick,
      onsetSeconds: tempo.tickToSeconds(pair.noteOn.absoluteTick),
      keyReleaseSeconds: tempo.tickToSeconds(pair.noteOff.absoluteTick),
      soundOffSeconds: tempo.tickToSeconds(pedal.soundOffTick),
      source: {
        noteOn: sourceCoordinate(pair.noteOn),
        noteOff: sourceCoordinate(pair.noteOff),
      },
      flags: sortFlags(pair.flags),
    };
  });

  const timeSignatures = buildTimeSignatures(document, diagnostics);
  const trackEvidence = document.tracks.map((track) => {
    const name = track.events.find((event) => event.type === "track-name");
    const channels = [
      ...new Set(
        track.events
          .filter((event): event is RawMidiEvent & { channel: number } => "channel" in event)
          .map((event) => event.channel),
      ),
    ].sort((left, right) => left - right);
    const programs = track.events
      .filter((event) => event.type === "program-change")
      .map((event) => ({
        channel: event.channel,
        program: event.program,
        tick: event.absoluteTick,
        seconds: tempo.tickToSeconds(event.absoluteTick),
        source: sourceCoordinate(event),
      }));
    return {
      trackIndex: track.trackIndex,
      ...(name?.type === "track-name" ? { name: name.text } : {}),
      endTick: track.endTick,
      channels,
      programs,
    };
  });

  return performanceEvidenceSchema.parse({
    schemaVersion: "1.0.0",
    source: {
      ...source,
      smfFormat: document.header.format,
      trackCount: document.header.trackCount,
      ticksPerQuarter: document.header.ticksPerQuarter,
    },
    tempoTimeline: tempo.timeline,
    timeSignatures,
    tracks: trackEvidence,
    notes,
    controls: controls.map((event) => ({
      trackIndex: event.trackIndex,
      channel: event.channel,
      controller: event.controller,
      value: event.value,
      tick: event.absoluteTick,
      seconds: tempo.tickToSeconds(event.absoluteTick),
      source: sourceCoordinate(event),
    })),
    diagnostics: diagnostics.sort(compareDiagnostics),
  });
}

function projectSustain(
  note: PairedNote,
  controls: readonly ControlEvent[],
  playbackEndTick: number,
  diagnostics: MidiDiagnostic[],
): { soundOffTick: number; flags: NoteFlag[] } {
  const sameChannel = controls.filter((control) => control.channel === note.noteOn.channel);
  const simultaneousCrossTrack = sameChannel.some(
    (control) => control.absoluteTick === note.noteOff.absoluteTick && control.trackIndex !== note.noteOff.trackIndex,
  );
  if (simultaneousCrossTrack) {
    diagnostics.push({
      code: "MIDI_SIMULTANEOUS_PEDAL_ORDER_AMBIGUOUS",
      severity: "warning",
      message: "A cross-track sustain transition shares the note-off tick, so playback ordering is ambiguous.",
      source: sourceCoordinate(note.noteOff),
      context: { channel: note.noteOn.channel },
    });
    return {
      soundOffTick: note.noteOff.absoluteTick,
      flags: ["simultaneous-pedal-order-ambiguous"],
    };
  }

  const controlsBeforeRelease = sameChannel.filter(
    (control) =>
      control.absoluteTick < note.noteOff.absoluteTick ||
      (control.absoluteTick === note.noteOff.absoluteTick &&
        control.trackIndex === note.noteOff.trackIndex &&
        control.eventIndex < note.noteOff.eventIndex),
  );
  const pedalDown = controlsBeforeRelease.at(-1)?.value !== undefined && controlsBeforeRelease.at(-1)!.value >= 64;
  if (!pedalDown) return { soundOffTick: note.noteOff.absoluteTick, flags: [] };

  const pedalUp = sameChannel.find(
    (control) =>
      control.value < 64 &&
      (control.absoluteTick > note.noteOff.absoluteTick ||
        (control.absoluteTick === note.noteOff.absoluteTick &&
          control.trackIndex === note.noteOff.trackIndex &&
          control.eventIndex > note.noteOff.eventIndex)),
  );
  const soundOffTick = pedalUp?.absoluteTick ?? Math.max(playbackEndTick, note.noteOff.absoluteTick);
  if (pedalUp === undefined) {
    diagnostics.push({
      code: "MIDI_PEDAL_LEFT_DOWN_AT_END",
      severity: "warning",
      message: "The sustain pedal remained down at the end of the MIDI playback timeline.",
      source: sourceCoordinate(note.noteOff),
      context: { channel: note.noteOn.channel },
    });
  }
  return {
    soundOffTick,
    flags: soundOffTick > note.noteOff.absoluteTick ? ["pedal-extended"] : [],
  };
}

function buildTimeSignatures(document: RawMidiDocument, diagnostics: MidiDiagnostic[]) {
  const events = document.tracks
    .flatMap((track) => track.events)
    .filter((event) => event.type === "time-signature")
    .sort(compareSourceOrder);
  const byTick = new Map<number, typeof events>();
  for (const event of events) {
    byTick.set(event.absoluteTick, [...(byTick.get(event.absoluteTick) ?? []), event]);
  }

  const result: PerformanceEvidence["timeSignatures"] = [];
  for (const [tick, atTick] of [...byTick.entries()].sort(([left], [right]) => left - right)) {
    const bySignature = new Map<string, typeof atTick>();
    for (const event of atTick) {
      const key = `${event.numerator}/${event.denominator}`;
      bySignature.set(key, [...(bySignature.get(key) ?? []), event]);
    }
    if (bySignature.size > 1) {
      diagnostics.push({
        code: "MIDI_TIME_SIGNATURE_CONFLICT",
        severity: "warning",
        message: "Different time signatures occur at the same MIDI tick.",
        source: sourceCoordinate(atTick[0]!),
        context: { tick, signatures: [...bySignature.keys()] },
      });
    }
    for (const signature of bySignature.values()) {
      result.push({
        tick,
        numerator: signature[0]!.numerator,
        denominator: signature[0]!.denominator,
        sources: signature.map(sourceCoordinate),
      });
    }
  }
  return result;
}

function noteKey(event: { trackIndex: number; channel: number; pitch: number }): string {
  return `${event.trackIndex}:${event.channel}:${event.pitch}`;
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

function compareSourceOrder(
  left: { absoluteTick: number; trackIndex: number; eventIndex: number },
  right: { absoluteTick: number; trackIndex: number; eventIndex: number },
): number {
  return (
    left.absoluteTick - right.absoluteTick || left.trackIndex - right.trackIndex || left.eventIndex - right.eventIndex
  );
}

function sortFlags(flags: ReadonlySet<NoteFlag>): NoteFlag[] {
  const order: readonly NoteFlag[] = [
    "overlapping-same-pitch",
    "pedal-extended",
    "simultaneous-pedal-order-ambiguous",
    "percussion-channel",
  ];
  return order.filter((flag) => flags.has(flag));
}

function compareDiagnostics(left: MidiDiagnostic, right: MidiDiagnostic): number {
  const severityOrder = { blocking: 0, warning: 1, info: 2 };
  return (
    severityOrder[left.severity] - severityOrder[right.severity] ||
    left.code.localeCompare(right.code) ||
    (left.source?.absoluteTick ?? -1) - (right.source?.absoluteTick ?? -1) ||
    (left.source?.trackIndex ?? -1) - (right.source?.trackIndex ?? -1) ||
    (left.source?.eventIndex ?? -1) - (right.source?.eventIndex ?? -1)
  );
}
