import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const midiDataSchema = z.number().int().min(0).max(127);
const midiChannelSchema = z.number().int().min(0).max(15);

export const midiSourceCoordinateSchema = z
  .object({
    trackIndex: nonnegativeIntegerSchema,
    eventIndex: nonnegativeIntegerSchema,
    absoluteTick: nonnegativeIntegerSchema,
  })
  .strict();

const rawEventBase = {
  trackIndex: nonnegativeIntegerSchema,
  eventIndex: nonnegativeIntegerSchema,
  deltaTick: nonnegativeIntegerSchema,
  absoluteTick: nonnegativeIntegerSchema,
};

const rawChannelEventBase = {
  ...rawEventBase,
  channel: midiChannelSchema,
  running: z.literal(true).optional(),
};

const rawNoteEventBase = {
  ...rawChannelEventBase,
  pitch: midiDataSchema,
  velocity: midiDataSchema,
  byte9: z.literal(true).optional(),
};

const rawMidiEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("note-on"), ...rawNoteEventBase }).strict(),
  z.object({ type: z.literal("note-off"), ...rawNoteEventBase }).strict(),
  z
    .object({
      type: z.literal("control-change"),
      ...rawChannelEventBase,
      controller: midiDataSchema,
      value: midiDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("program-change"),
      ...rawChannelEventBase,
      program: midiDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("polyphonic-key-pressure"),
      ...rawChannelEventBase,
      pitch: midiDataSchema,
      value: midiDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("channel-pressure"),
      ...rawChannelEventBase,
      value: midiDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("pitch-bend"),
      ...rawChannelEventBase,
      value: z.number().int().min(-8192).max(8191),
    })
    .strict(),
  z
    .object({
      type: z.literal("tempo"),
      ...rawEventBase,
      microsecondsPerQuarter: z.number().int().min(1).max(0xffffff),
    })
    .strict(),
  z
    .object({
      type: z.literal("time-signature"),
      ...rawEventBase,
      numerator: z.number().int().positive().max(255),
      denominator: z.number().int().positive().max(32768),
      metronome: midiDataSchema,
      thirtySeconds: midiDataSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("key-signature"),
      ...rawEventBase,
      fifths: z.number().int().min(-7).max(7),
      mode: z.enum(["major", "minor"]),
    })
    .strict(),
  z.object({ type: z.literal("track-name"), ...rawEventBase, text: z.string() }).strict(),
  z.object({ type: z.literal("end-of-track"), ...rawEventBase }).strict(),
  z
    .object({
      type: z.literal("sysex"),
      ...rawEventBase,
      continuation: z.boolean(),
      dataLength: nonnegativeIntegerSchema,
      dataSha256: sha256Schema,
    })
    .strict(),
  z
    .object({
      type: z.literal("meta-other"),
      ...rawEventBase,
      kind: z.string().min(1),
      metaType: midiDataSchema.optional(),
      text: z.string().optional(),
      dataLength: nonnegativeIntegerSchema,
      dataSha256: sha256Schema,
    })
    .strict(),
]);

export const rawMidiDocumentSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    header: z
      .object({
        format: z.union([z.literal(0), z.literal(1)]),
        trackCount: z.number().int().positive(),
        ticksPerQuarter: z.number().int().positive().max(0x7fff),
      })
      .strict(),
    tracks: z.array(
      z
        .object({
          trackIndex: nonnegativeIntegerSchema,
          byteLength: nonnegativeIntegerSchema,
          endTick: nonnegativeIntegerSchema,
          events: z.array(rawMidiEventSchema),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((document, context) => {
    if (document.header.trackCount !== document.tracks.length) {
      context.addIssue({ code: "custom", path: ["tracks"], message: "track count must match header" });
    }
    document.tracks.forEach((track, trackIndex) => {
      if (track.trackIndex !== trackIndex) {
        context.addIssue({
          code: "custom",
          path: ["tracks", trackIndex, "trackIndex"],
          message: "invalid track index",
        });
      }
      track.events.forEach((event, eventIndex) => {
        if (event.trackIndex !== trackIndex || event.eventIndex !== eventIndex) {
          context.addIssue({
            code: "custom",
            path: ["tracks", trackIndex, "events", eventIndex],
            message: "invalid event source coordinate",
          });
        }
        if (event.absoluteTick > track.endTick) {
          context.addIssue({
            code: "custom",
            path: ["tracks", trackIndex, "events", eventIndex, "absoluteTick"],
            message: "event exceeds track end",
          });
        }
      });
    });
  });

export const midiDiagnosticSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["info", "warning", "blocking"]),
    message: z.string().min(1),
    source: midiSourceCoordinateSchema.optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const tempoChangeSchema = z
  .object({
    tick: nonnegativeIntegerSchema,
    microsecondsPerQuarter: z.number().int().min(1).max(0xffffff),
    origin: z.enum(["midi", "default"]),
    sources: z.array(midiSourceCoordinateSchema),
  })
  .strict();

const tempoSegmentSchema = z
  .object({
    startTick: nonnegativeIntegerSchema,
    endTick: nonnegativeIntegerSchema.optional(),
    startSeconds: z.number().finite().nonnegative(),
    microsecondsPerQuarter: z.number().int().min(1).max(0xffffff),
  })
  .strict();

const timeSignatureEvidenceSchema = z
  .object({
    tick: nonnegativeIntegerSchema,
    numerator: z.number().int().positive().max(255),
    denominator: z.number().int().positive().max(32768),
    sources: z.array(midiSourceCoordinateSchema).min(1),
  })
  .strict();

const performanceTrackEvidenceSchema = z
  .object({
    trackIndex: nonnegativeIntegerSchema,
    name: z.string().optional(),
    endTick: nonnegativeIntegerSchema,
    channels: z.array(midiChannelSchema),
    programs: z.array(
      z
        .object({
          channel: midiChannelSchema,
          program: midiDataSchema,
          tick: nonnegativeIntegerSchema,
          seconds: z.number().finite().nonnegative(),
          source: midiSourceCoordinateSchema,
        })
        .strict(),
    ),
  })
  .strict();

const performanceNoteFlagSchema = z.enum([
  "overlapping-same-pitch",
  "pedal-extended",
  "simultaneous-pedal-order-ambiguous",
  "percussion-channel",
]);

const performanceNoteEvidenceSchema = z
  .object({
    id: z.string().min(1),
    trackIndex: nonnegativeIntegerSchema,
    channel: midiChannelSchema,
    noteIndex: nonnegativeIntegerSchema,
    pitch: midiDataSchema,
    velocity: midiDataSchema,
    onsetTick: nonnegativeIntegerSchema,
    keyReleaseTick: nonnegativeIntegerSchema,
    soundOffTick: nonnegativeIntegerSchema,
    onsetSeconds: z.number().finite().nonnegative(),
    keyReleaseSeconds: z.number().finite().nonnegative(),
    soundOffSeconds: z.number().finite().nonnegative(),
    source: z
      .object({
        noteOn: midiSourceCoordinateSchema,
        noteOff: midiSourceCoordinateSchema,
      })
      .strict(),
    flags: z.array(performanceNoteFlagSchema),
  })
  .strict()
  .refine(
    (note) => note.onsetTick <= note.keyReleaseTick && note.keyReleaseTick <= note.soundOffTick,
    "note ticks must be ordered",
  )
  .refine(
    (note) => note.onsetSeconds <= note.keyReleaseSeconds && note.keyReleaseSeconds <= note.soundOffSeconds,
    "note seconds must be ordered",
  );

const performanceControlEvidenceSchema = z
  .object({
    trackIndex: nonnegativeIntegerSchema,
    channel: midiChannelSchema,
    controller: midiDataSchema,
    value: midiDataSchema,
    tick: nonnegativeIntegerSchema,
    seconds: z.number().finite().nonnegative(),
    source: midiSourceCoordinateSchema,
  })
  .strict();

export const performanceEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    source: z
      .object({
        fileName: z.string().min(1),
        sha256: sha256Schema,
        sizeBytes: nonnegativeIntegerSchema,
        smfFormat: z.union([z.literal(0), z.literal(1)]),
        trackCount: z.number().int().positive(),
        ticksPerQuarter: z.number().int().positive().max(0x7fff),
      })
      .strict(),
    tempoTimeline: z
      .object({
        changes: z.array(tempoChangeSchema).min(1),
        segments: z.array(tempoSegmentSchema).min(1),
      })
      .strict(),
    timeSignatures: z.array(timeSignatureEvidenceSchema),
    tracks: z.array(performanceTrackEvidenceSchema),
    notes: z.array(performanceNoteEvidenceSchema),
    controls: z.array(performanceControlEvidenceSchema),
    diagnostics: z.array(midiDiagnosticSchema),
  })
  .strict();

export const midiImportInputReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    fileName: z.string().min(1),
    sha256: sha256Schema,
    sizeBytes: nonnegativeIntegerSchema,
    smfFormat: z.union([z.literal(0), z.literal(1)]),
    trackCount: z.number().int().positive(),
    ticksPerQuarter: z.number().int().positive().max(0x7fff),
  })
  .strict();

export const midiImportRunManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    runId: z.string().min(1),
    command: z.literal("import-midi"),
    inputSha256: sha256Schema,
    importer: z
      .object({
        id: z.literal("zupulse-midi-import"),
        version: z.string().min(1),
        parser: z.object({ name: z.literal("midi-file"), version: z.string().min(1) }).strict(),
      })
      .strict(),
    limits: z
      .object({
        maxFileBytes: z.number().int().positive(),
        maxTracks: z.number().int().positive(),
        maxEvents: z.number().int().positive(),
        maxSysexBytes: z.number().int().positive(),
      })
      .strict(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    status: z.literal("succeeded"),
    artifactSha256: z.record(z.string().min(1), sha256Schema),
  })
  .strict();

export const midiImportReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("import-midi"),
    status: z.literal("succeeded"),
    runId: z.string().min(1),
    inputSha256: sha256Schema,
    rawMidiSha256: sha256Schema,
    performanceEvidenceSha256: sha256Schema,
  })
  .strict();

export type MidiSourceCoordinate = z.infer<typeof midiSourceCoordinateSchema>;
export type RawMidiEvent = z.infer<typeof rawMidiEventSchema>;
export type RawMidiDocument = z.infer<typeof rawMidiDocumentSchema>;
export type MidiDiagnostic = z.infer<typeof midiDiagnosticSchema>;
export type PerformanceEvidence = z.infer<typeof performanceEvidenceSchema>;
export type MidiImportInputReport = z.infer<typeof midiImportInputReportSchema>;
export type MidiImportRunManifest = z.infer<typeof midiImportRunManifestSchema>;
export type MidiImportReport = z.infer<typeof midiImportReportSchema>;
