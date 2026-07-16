import { chordSymbolSchema, type ChordSymbolInput } from "../packages/web-core/src/harmony/schemas";

export type MidiHarmonyNote = { startMs: number; endMs: number; midi: number; channel: number };
export type CmuChordLabel = { startMs: number; label: string; chord: ChordSymbolInput | null };

export function isPitchedMidiNote(note: MidiHarmonyNote): boolean {
  return note.channel !== 9;
}

export function projectMidiNoteToWindow(
  note: MidiHarmonyNote,
  windowStartMs: number,
  windowEndMs: number,
  windowTicks: number,
): { offsetTicks: number; durationTicks: number } | null {
  const overlapStart = Math.max(note.startMs, windowStartMs);
  const overlapEnd = Math.min(note.endMs, windowEndMs);
  if (overlapEnd <= overlapStart || windowEndMs <= windowStartMs) return null;
  const scale = windowTicks / (windowEndMs - windowStartMs);
  const offsetTicks = Math.max(0, Math.floor((overlapStart - windowStartMs) * scale));
  const endTicks = Math.min(windowTicks, Math.ceil((overlapEnd - windowStartMs) * scale));
  return { offsetTicks, durationTicks: Math.max(1, endTicks - offsetTicks) };
}

export function parseCmuChordLabels(text: string): CmuChordLabel[] {
  return text
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(\d+(?:\.\d+)?)\s+(.+?)\s*$/.exec(line);
      if (!match) return [];
      return [{ startMs: Number(match[1]), label: match[2]!, chord: parseCmuChordLabel(match[2]!) }];
    });
}

export function parseCmuChordLabel(label: string): ChordSymbolInput | null {
  const normalized = label.trim();
  if (normalized === "N") return null;
  const [body, bassName] = normalized.split("/", 2);
  const match = /^([A-G])([#b]?)(.*)$/.exec(body ?? "");
  if (!match) throw new Error(`Unsupported CMU chord label: ${label}`);
  const root = pitchName(match[1]! + match[2]!);
  let suffix = match[3] ?? "";
  let kind: ChordSymbolInput["kind"] = "major";
  let extension: ChordSymbolInput["extension"];
  const degrees: ChordSymbolInput["degrees"] = [];

  if (suffix.startsWith("m7b5")) {
    kind = "half-diminished";
    extension = 7;
    suffix = suffix.slice(4);
  } else if (suffix.startsWith("dim")) {
    kind = "diminished";
    suffix = suffix.slice(3);
  } else if (suffix.startsWith("aug")) {
    kind = "augmented";
    suffix = suffix.slice(3);
  } else if (suffix.startsWith("sus2")) {
    kind = "suspended-second";
    suffix = suffix.slice(4);
  } else if (suffix.startsWith("sus4")) {
    kind = "suspended-fourth";
    suffix = suffix.slice(4);
  } else if (suffix.startsWith("m")) {
    kind = "minor";
    suffix = suffix.slice(1);
  } else if (suffix.startsWith("M")) {
    kind = "major";
    suffix = suffix.slice(1);
  }

  const extensionMatch = /^(6|7|9|11|13)/.exec(suffix);
  if (extensionMatch) {
    if (kind === "major" && extensionMatch[1] !== "6") kind = "dominant";
    extension = Number(extensionMatch[1]) as ChordSymbolInput["extension"];
    suffix = suffix.slice(extensionMatch[1]!.length);
  }

  for (const alteration of suffix.matchAll(/([b#])(5|9|11|13)/g)) {
    degrees.push({
      operation: "alter",
      value: Number(alteration[2]) as 5 | 9 | 11 | 13,
      alter: alteration[1] === "#" ? 1 : -1,
    });
  }
  if (suffix.replace(/[b#](5|9|11|13)/g, "") !== "") throw new Error(`Unsupported CMU chord suffix: ${label}`);

  const bass = bassName ? pitchName(bassName) : undefined;
  return chordSymbolSchema.parse({
    root,
    kind,
    ...(extension === undefined ? {} : { extension }),
    degrees,
    ...(bass && (bass.step !== root.step || bass.alter !== root.alter) ? { bass } : {}),
  });
}

export function parseStandardMidi(bytes: Uint8Array): MidiHarmonyNote[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  if (readAscii(view, 0, 4) !== "MThd") throw new Error("Invalid MIDI header");
  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if ((division & 0x8000) !== 0 || division === 0) throw new Error("Unsupported MIDI time division");
  offset = 8 + headerLength;
  const rawNotes: Array<{ startTick: number; endTick: number; midi: number; channel: number }> = [];
  const tempoChanges: Array<{ tick: number; microsecondsPerQuarter: number }> = [
    { tick: 0, microsecondsPerQuarter: 500_000 },
  ];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (readAscii(view, offset, 4) !== "MTrk") throw new Error("Invalid MIDI track");
    const trackLength = view.getUint32(offset + 4);
    const end = offset + 8 + trackLength;
    offset += 8;
    let tick = 0;
    let runningStatus = 0;
    const active = new Map<string, Array<{ startTick: number; midi: number; channel: number }>>();
    while (offset < end) {
      tick += readVariableLength(view, () => offset++);
      let status = view.getUint8(offset++);
      if (status < 0x80) {
        offset -= 1;
        status = runningStatus;
      } else if (status < 0xf0) runningStatus = status;
      if (status === 0xff) {
        const metaType = view.getUint8(offset++);
        const length = readVariableLength(view, () => offset++);
        if (metaType === 0x51 && length === 3)
          tempoChanges.push({
            tick,
            microsecondsPerQuarter:
              (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2),
          });
        offset += length;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        offset += readVariableLength(view, () => offset++);
        continue;
      }
      const type = status & 0xf0;
      const channel = status & 0x0f;
      if (type === 0xc0 || type === 0xd0) {
        offset += 1;
        continue;
      }
      const midi = view.getUint8(offset++);
      const velocity = view.getUint8(offset++);
      if (type === 0x90 && velocity > 0) {
        const key = `${channel}:${midi}`;
        active.set(key, [...(active.get(key) ?? []), { startTick: tick, midi, channel }]);
      } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
        const key = `${channel}:${midi}`;
        const notes = active.get(key) ?? [];
        const note = notes.shift();
        if (note) rawNotes.push({ ...note, endTick: Math.max(tick, note.startTick + 1) });
        if (notes.length === 0) active.delete(key);
        else active.set(key, notes);
      }
    }
    for (const notes of active.values())
      for (const note of notes) rawNotes.push({ ...note, endTick: Math.max(tick, note.startTick + 1) });
    offset = end;
  }

  const tickToMs = createTickToMs(tempoChanges, division);
  return rawNotes.map((note) => ({
    startMs: tickToMs(note.startTick),
    endMs: tickToMs(note.endTick),
    midi: note.midi,
    channel: note.channel,
  }));
}

function createTickToMs(changes: readonly { tick: number; microsecondsPerQuarter: number }[], division: number) {
  const sorted = [...changes].sort((a, b) => a.tick - b.tick);
  return (tick: number): number => {
    let elapsedMicroseconds = 0;
    let previousTick = 0;
    let tempo = sorted[0]!.microsecondsPerQuarter;
    for (const change of sorted) {
      if (change.tick > tick) break;
      elapsedMicroseconds += ((change.tick - previousTick) * tempo) / division;
      previousTick = change.tick;
      tempo = change.microsecondsPerQuarter;
    }
    return (elapsedMicroseconds + ((tick - previousTick) * tempo) / division) / 1000;
  };
}

function pitchName(name: string): { step: "A" | "B" | "C" | "D" | "E" | "F" | "G"; alter: -1 | 0 | 1 } {
  const match = /^([A-G])([#b]?)$/.exec(name);
  if (!match) throw new Error(`Unsupported pitch name: ${name}`);
  return {
    step: match[1] as "A" | "B" | "C" | "D" | "E" | "F" | "G",
    alter: match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0,
  };
}

function readAscii(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(...Array.from({ length }, (_, index) => view.getUint8(offset + index)));
}

function readVariableLength(view: DataView, nextOffset: () => number): number {
  let value = 0;
  for (;;) {
    const byte = view.getUint8(nextOffset());
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
}
