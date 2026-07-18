export type MidiNote = { startMs: number; endMs: number; midi: number; channel: number };

export function parseStandardMidi(bytes: Uint8Array): MidiNote[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== "MThd") throw new Error("invalid MIDI header");
  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if ((division & 0x8000) !== 0 || division === 0) throw new Error("unsupported MIDI time division");
  let offset = 8 + headerLength;
  const notes: Array<{ startTick: number; endTick: number; midi: number; channel: number }> = [];
  const tempos = [{ tick: 0, microsecondsPerQuarter: 500_000 }];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (readAscii(view, offset, 4) !== "MTrk") throw new Error("invalid MIDI track");
    const end = offset + 8 + view.getUint32(offset + 4);
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
      } else if (status < 0xf0) {
        runningStatus = status;
      }
      if (status === 0xff) {
        const metaType = view.getUint8(offset++);
        const length = readVariableLength(view, () => offset++);
        if (metaType === 0x51 && length === 3) {
          tempos.push({
            tick,
            microsecondsPerQuarter:
              (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2),
          });
        }
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
      const key = `${channel}:${midi}`;
      if (type === 0x90 && velocity > 0) {
        active.set(key, [...(active.get(key) ?? []), { startTick: tick, midi, channel }]);
      } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
        const activeNotes = active.get(key) ?? [];
        const note = activeNotes.shift();
        if (note) notes.push({ ...note, endTick: Math.max(tick, note.startTick + 1) });
        if (activeNotes.length === 0) active.delete(key);
        else active.set(key, activeNotes);
      }
    }
    for (const activeNotes of active.values()) {
      for (const note of activeNotes) notes.push({ ...note, endTick: Math.max(tick, note.startTick + 1) });
    }
    offset = end;
  }

  const tickToMs = createTickToMs(tempos, division);
  return notes.map((note) => ({
    startMs: tickToMs(note.startTick),
    endMs: tickToMs(note.endTick),
    midi: note.midi,
    channel: note.channel,
  }));
}

function createTickToMs(changes: readonly { tick: number; microsecondsPerQuarter: number }[], division: number) {
  const sorted = [...changes].sort((a, b) => a.tick - b.tick);
  return (tick: number): number => {
    let elapsed = 0;
    let previousTick = 0;
    let tempo = sorted[0]!.microsecondsPerQuarter;
    for (const change of sorted) {
      if (change.tick > tick) break;
      elapsed += ((change.tick - previousTick) * tempo) / division;
      previousTick = change.tick;
      tempo = change.microsecondsPerQuarter;
    }
    return (elapsed + ((tick - previousTick) * tempo) / division) / 1000;
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
