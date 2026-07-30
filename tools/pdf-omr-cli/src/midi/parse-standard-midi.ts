import { parseMidi, type MidiEvent } from "midi-file";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { rawMidiDocumentSchema, type RawMidiDocument, type RawMidiEvent } from "./schemas";

export type MidiImportLimits = {
  maxFileBytes: number;
  maxTracks: number;
  maxEvents: number;
  maxSysexBytes: number;
};

export const DEFAULT_MIDI_IMPORT_LIMITS: Readonly<MidiImportLimits> = {
  maxFileBytes: 64 * 1024 * 1024,
  maxTracks: 256,
  maxEvents: 5_000_000,
  maxSysexBytes: 16 * 1024 * 1024,
};

export function parseStandardMidi(bytes: Uint8Array, limitOverrides: Partial<MidiImportLimits> = {}): RawMidiDocument {
  const limits = { ...DEFAULT_MIDI_IMPORT_LIMITS, ...limitOverrides };
  const framing = preflightMidi(bytes, limits);
  let parsed: ReturnType<typeof parseMidi>;
  try {
    parsed = parseMidi(bytes);
  } catch (error) {
    throw invalidMidi("invalid-midi-data", error);
  }

  try {
    if (
      parsed.header.format !== framing.format ||
      parsed.header.numTracks !== framing.trackCount ||
      parsed.header.ticksPerBeat !== framing.ticksPerQuarter ||
      parsed.tracks.length !== framing.trackCount
    ) {
      throw invalidMidi("invalid-midi-header");
    }

    let eventCount = 0;
    let sysexBytes = 0;
    const tracks = parsed.tracks.map((track, trackIndex) => {
      let absoluteTick = 0;
      const events = track.map((event, eventIndex) => {
        eventCount += 1;
        if (eventCount > limits.maxEvents) resourceLimit("events", limits.maxEvents);
        assertNonnegativeSafeInteger(event.deltaTime, "invalid-event-delta");
        absoluteTick = safeTickSum(absoluteTick, event.deltaTime);
        if (event.type === "sysEx" || event.type === "endSysEx") {
          sysexBytes += event.data.length;
          if (sysexBytes > limits.maxSysexBytes) resourceLimit("sysexBytes", limits.maxSysexBytes);
        }
        return projectEvent(event, { trackIndex, eventIndex, deltaTick: event.deltaTime, absoluteTick });
      });
      return {
        trackIndex,
        byteLength: framing.trackByteLengths[trackIndex]!,
        endTick: absoluteTick,
        events,
      };
    });

    return rawMidiDocumentSchema.parse({
      schemaVersion: "1.0.0",
      header: {
        format: framing.format,
        trackCount: framing.trackCount,
        ticksPerQuarter: framing.ticksPerQuarter,
      },
      tracks,
    });
  } catch (error) {
    if (error instanceof PdfOmrError) throw error;
    throw invalidMidi("invalid-midi-data", error);
  }
}

function preflightMidi(bytes: Uint8Array, limits: MidiImportLimits) {
  if (bytes.length > limits.maxFileBytes) resourceLimit("fileBytes", limits.maxFileBytes);
  if (bytes.length < 14 || readAscii(bytes, 0, 4) !== "MThd") throw invalidMidi("invalid-midi-header");
  const headerLength = readUint32(bytes, 4);
  if (headerLength !== 6 || 8 + headerLength > bytes.length) throw invalidMidi("invalid-midi-header");
  const rawFormat = readUint16(bytes, 8);
  if (rawFormat !== 0 && rawFormat !== 1) throw invalidMidi("unsupported-midi-format");
  const trackCount = readUint16(bytes, 10);
  if (trackCount === 0 || (rawFormat === 0 && trackCount !== 1)) throw invalidMidi("invalid-midi-header");
  if (trackCount > limits.maxTracks) resourceLimit("tracks", limits.maxTracks);
  const division = readUint16(bytes, 12);
  if ((division & 0x8000) !== 0) throw invalidMidi("unsupported-smpte-division");
  if (division === 0) throw invalidMidi("invalid-midi-header");

  let offset = 14;
  const trackByteLengths: number[] = [];
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (offset + 8 > bytes.length || readAscii(bytes, offset, 4) !== "MTrk") {
      throw invalidMidi("invalid-track-chunk");
    }
    const byteLength = readUint32(bytes, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = offset + 8 + byteLength;
    if (trackEnd > bytes.length) throw invalidMidi("chunk-out-of-bounds");
    validateTrackFraming(bytes, trackStart, trackEnd);
    trackByteLengths.push(byteLength);
    offset = trackEnd;
  }
  if (offset !== bytes.length) throw invalidMidi("invalid-track-chunk");

  return {
    format: rawFormat,
    trackCount,
    ticksPerQuarter: division,
    trackByteLengths,
  } as const;
}

function validateTrackFraming(bytes: Uint8Array, trackStart: number, trackEnd: number): void {
  let offset = trackStart;
  let runningStatus: number | undefined;
  while (offset < trackEnd) {
    offset = readVariableLength(bytes, offset, trackEnd).nextOffset;
    if (offset >= trackEnd) throw invalidMidi("invalid-event-data");

    let status = bytes[offset]!;
    if (status < 0x80) {
      if (runningStatus === undefined) throw invalidMidi("invalid-running-status");
      status = runningStatus;
    } else {
      offset += 1;
    }

    if (status >= 0x80 && status <= 0xef) {
      runningStatus = status;
      const eventType = status >>> 4;
      const dataLength = eventType === 0x0c || eventType === 0x0d ? 1 : 2;
      offset = consumeDataBytes(bytes, offset, dataLength, trackEnd);
      continue;
    }
    if (status === 0xff) {
      offset = consumeDataBytes(bytes, offset, 1, trackEnd, false);
      const length = readVariableLength(bytes, offset, trackEnd);
      offset = consumePayload(length.nextOffset, length.value, trackEnd);
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      const length = readVariableLength(bytes, offset, trackEnd);
      offset = consumePayload(length.nextOffset, length.value, trackEnd);
      continue;
    }
    throw invalidMidi("invalid-event-status");
  }
}

function readVariableLength(
  bytes: Uint8Array,
  startOffset: number,
  endOffset: number,
): { value: number; nextOffset: number } {
  let value = 0;
  let offset = startOffset;
  for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
    if (offset >= endOffset) throw invalidMidi("invalid-variable-length-quantity");
    const byte = bytes[offset]!;
    offset += 1;
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, nextOffset: offset };
  }
  throw invalidMidi("invalid-variable-length-quantity");
}

function consumeDataBytes(
  bytes: Uint8Array,
  offset: number,
  length: number,
  endOffset: number,
  requireDataByte = true,
): number {
  const nextOffset = offset + length;
  if (nextOffset > endOffset) throw invalidMidi("invalid-event-data");
  if (requireDataByte) {
    for (let index = offset; index < nextOffset; index += 1) {
      if (bytes[index]! >= 0x80) throw invalidMidi("invalid-event-data");
    }
  }
  return nextOffset;
}

function consumePayload(offset: number, length: number, endOffset: number): number {
  const nextOffset = offset + length;
  if (!Number.isSafeInteger(nextOffset) || nextOffset > endOffset) throw invalidMidi("invalid-event-data");
  return nextOffset;
}

function projectEvent(
  event: MidiEvent,
  source: { trackIndex: number; eventIndex: number; deltaTick: number; absoluteTick: number },
): RawMidiEvent {
  const running = "running" in event && event.running === true ? { running: true as const } : {};
  switch (event.type) {
    case "noteOn":
      return {
        type: "note-on",
        ...source,
        channel: event.channel,
        pitch: event.noteNumber,
        velocity: event.velocity,
        ...running,
      };
    case "noteOff":
      return {
        type: "note-off",
        ...source,
        channel: event.channel,
        pitch: event.noteNumber,
        velocity: event.velocity,
        ...running,
        ...(event.byte9 === true ? { byte9: true as const } : {}),
      };
    case "controller":
      return {
        type: "control-change",
        ...source,
        channel: event.channel,
        controller: event.controllerType,
        value: event.value,
        ...running,
      };
    case "programChange":
      return {
        type: "program-change",
        ...source,
        channel: event.channel,
        program: event.programNumber,
        ...running,
      };
    case "noteAftertouch":
      return {
        type: "polyphonic-key-pressure",
        ...source,
        channel: event.channel,
        pitch: event.noteNumber,
        value: event.amount,
        ...running,
      };
    case "channelAftertouch":
      return {
        type: "channel-pressure",
        ...source,
        channel: event.channel,
        value: event.amount,
        ...running,
      };
    case "pitchBend":
      return {
        type: "pitch-bend",
        ...source,
        channel: event.channel,
        value: event.value,
        ...running,
      };
    case "setTempo":
      return { type: "tempo", ...source, microsecondsPerQuarter: event.microsecondsPerBeat };
    case "timeSignature":
      return {
        type: "time-signature",
        ...source,
        numerator: event.numerator,
        denominator: event.denominator,
        metronome: event.metronome,
        thirtySeconds: event.thirtyseconds,
      };
    case "keySignature":
      return {
        type: "key-signature",
        ...source,
        fifths: event.key,
        mode: event.scale === 0 ? "major" : "minor",
      };
    case "trackName":
      return { type: "track-name", ...source, text: event.text };
    case "endOfTrack":
      return { type: "end-of-track", ...source };
    case "sysEx":
    case "endSysEx": {
      const data = Uint8Array.from(event.data);
      return {
        type: "sysex",
        ...source,
        continuation: event.type === "endSysEx",
        dataLength: data.length,
        dataSha256: sha256Bytes(data),
      };
    }
    case "unknownMeta": {
      const data = Uint8Array.from(event.data);
      return metaOther(source, event.type, data, { metaType: event.metatypeByte });
    }
    case "sequencerSpecific":
      return metaOther(source, event.type, Uint8Array.from(event.data));
    case "sequenceNumber":
      return metaOther(source, event.type, new Uint8Array([(event.number >>> 8) & 0xff, event.number & 0xff]));
    case "text":
    case "copyrightNotice":
    case "instrumentName":
    case "lyrics":
    case "marker":
    case "cuePoint": {
      const data = new TextEncoder().encode(event.text);
      return metaOther(source, event.type, data, { text: event.text });
    }
    case "channelPrefix":
      return metaOther(source, event.type, new Uint8Array([event.channel]));
    case "portPrefix":
      return metaOther(source, event.type, new Uint8Array([event.port]));
    case "smpteOffset":
      return metaOther(
        source,
        event.type,
        new TextEncoder().encode(
          JSON.stringify({
            frameRate: event.frameRate,
            hour: event.hour,
            min: event.min,
            sec: event.sec,
            frame: event.frame,
            subFrame: event.subFrame,
          }),
        ),
      );
  }
}

function metaOther(
  source: { trackIndex: number; eventIndex: number; deltaTick: number; absoluteTick: number },
  kind: string,
  data: Uint8Array,
  optional: { metaType?: number; text?: string } = {},
): RawMidiEvent {
  return {
    type: "meta-other",
    ...source,
    kind,
    ...optional,
    dataLength: data.length,
    dataSha256: sha256Bytes(data),
  };
}

function safeTickSum(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw invalidMidi("invalid-event-delta");
  return result;
}

function assertNonnegativeSafeInteger(value: number, reason: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw invalidMidi(reason);
}

function resourceLimit(resource: string, limit: number): never {
  throw new PdfOmrError("INVALID_INPUT", "MIDI input exceeds configured resource limit", {
    context: { reason: "resource-limit-exceeded", resource, limit },
  });
}

function invalidMidi(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("INVALID_INPUT", "MIDI input is invalid or unsupported", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}
