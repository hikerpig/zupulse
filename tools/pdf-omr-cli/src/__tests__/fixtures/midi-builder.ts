type MidiFileOptions = {
  format?: 0 | 1 | 2;
  ticksPerQuarter?: number;
  tracks: readonly Uint8Array[];
};

export function midiFile(options: MidiFileOptions): Uint8Array {
  const format = options.format ?? (options.tracks.length === 1 ? 0 : 1);
  const ticksPerQuarter = options.ticksPerQuarter ?? 480;
  return concat(
    ascii("MThd"),
    uint32(6),
    uint16(format),
    uint16(options.tracks.length),
    uint16(ticksPerQuarter),
    ...options.tracks.map((events) => concat(ascii("MTrk"), uint32(events.length), events)),
  );
}

export function midiTrack(...events: readonly Uint8Array[]): Uint8Array {
  return concat(...events, metaEvent(0, 0x2f, new Uint8Array()));
}

export function noteOn(delta: number, channel: number, pitch: number, velocity: number): Uint8Array {
  return event(delta, 0x90 | channel, pitch, velocity);
}

export function noteOff(delta: number, channel: number, pitch: number, velocity = 0): Uint8Array {
  return event(delta, 0x80 | channel, pitch, velocity);
}

export function velocityZeroNoteOn(delta: number, channel: number, pitch: number): Uint8Array {
  return event(delta, 0x90 | channel, pitch, 0);
}

export function controlChange(delta: number, channel: number, controller: number, value: number): Uint8Array {
  return event(delta, 0xb0 | channel, controller, value);
}

export function programChange(delta: number, channel: number, program: number): Uint8Array {
  return concat(variableLength(delta), new Uint8Array([0xc0 | channel, program]));
}

export function tempo(delta: number, microsecondsPerQuarter: number): Uint8Array {
  return metaEvent(
    delta,
    0x51,
    new Uint8Array([
      (microsecondsPerQuarter >>> 16) & 0xff,
      (microsecondsPerQuarter >>> 8) & 0xff,
      microsecondsPerQuarter & 0xff,
    ]),
  );
}

export function timeSignature(
  delta: number,
  numerator: number,
  denominatorPower: number,
  metronome = 24,
  thirtySeconds = 8,
): Uint8Array {
  return metaEvent(delta, 0x58, new Uint8Array([numerator, denominatorPower, metronome, thirtySeconds]));
}

export function trackName(delta: number, value: string): Uint8Array {
  return metaEvent(delta, 0x03, new TextEncoder().encode(value));
}

export function rawEvent(delta: number, ...bytes: number[]): Uint8Array {
  return concat(variableLength(delta), new Uint8Array(bytes));
}

export function concat(...values: readonly Uint8Array[]): Uint8Array {
  const length = values.reduce((sum, value) => sum + value.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function event(delta: number, status: number, first: number, second: number): Uint8Array {
  return concat(variableLength(delta), new Uint8Array([status, first, second]));
}

function metaEvent(delta: number, type: number, data: Uint8Array): Uint8Array {
  return concat(variableLength(delta), new Uint8Array([0xff, type]), variableLength(data.length), data);
}

function variableLength(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new Error("invalid variable-length value");
  }
  const bytes = [value & 0x7f];
  for (let remaining = value >>> 7; remaining > 0; remaining >>>= 7) {
    bytes.unshift((remaining & 0x7f) | 0x80);
  }
  return new Uint8Array(bytes);
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([(value >>> 8) & 0xff, value & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}
