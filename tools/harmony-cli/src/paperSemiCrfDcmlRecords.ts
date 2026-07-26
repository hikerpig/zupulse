import { buildPaperSemiCrfEvents, paperSemiCrfChordToLabel, type PaperSemiCrfEvent } from "@zupulse/web-core";
import type { DcmlPiece } from "./adapters/dcml";

type PaperSemiCrfDcmlRecord = {
  id: string;
  corpus: string;
  groupId: string;
  events: PaperSemiCrfEvent[];
  targetSegments: Array<{ startEvent: number; endEvent: number; label: string }>;
};

export function projectDcmlPieceToPaperSemiCrfWindows(input: {
  pieceId: string;
  piece: DcmlPiece;
  labels: readonly string[];
  maxSegmentLength: number;
}): {
  records: PaperSemiCrfDcmlRecord[];
  stats: {
    gold: number;
    supported: number;
    excludedUnsupported: number;
    excludedUnaligned: number;
    excludedOverSpan: number;
    windows: number;
    events: number;
  };
} {
  const events = buildPaperSemiCrfEvents(input.piece.input, { includedTrackIds: ["dcml"] });
  const boundaryIndices = new Map<string, number>();
  for (const event of events) boundaryIndices.set(momentKey(event.range.start), event.index);
  boundaryIndices.set(momentKey(events.at(-1)!.range.end), events.length);
  const labels = new Set(input.labels);
  const records: PaperSemiCrfDcmlRecord[] = [];
  const stats = {
    gold: input.piece.gold.length,
    supported: 0,
    excludedUnsupported: 0,
    excludedUnaligned: 0,
    excludedOverSpan: 0,
    windows: 0,
    events: 0,
  };
  let window: Array<{ startEvent: number; endEvent: number; label: string }> = [];

  const finishWindow = () => {
    if (window.length === 0) return;
    const firstEvent = window[0]!.startEvent;
    const endEvent = window.at(-1)!.endEvent;
    const windowIndex = records.length;
    records.push({
      id: `${input.pieceId}:window:${windowIndex}`,
      corpus: input.piece.corpus,
      groupId: input.piece.groupId,
      events: events.slice(firstEvent, endEvent).map((event, index) => ({ ...event, index })),
      targetSegments: window.map((segment) => ({
        startEvent: segment.startEvent - firstEvent,
        endEvent: segment.endEvent - firstEvent,
        label: segment.label,
      })),
    });
    stats.events += endEvent - firstEvent;
    window = [];
  };

  for (const gold of input.piece.gold) {
    let label: string;
    try {
      if (gold.chord === undefined) throw new Error("unsupported DCML gold");
      label = paperSemiCrfChordToLabel(gold.chord);
      if (!labels.has(label)) throw new Error("label is outside paper inventory");
    } catch {
      stats.excludedUnsupported += 1;
      finishWindow();
      continue;
    }
    const startEvent = boundaryIndices.get(momentKey(gold.range.start));
    const endEvent = boundaryIndices.get(momentKey(gold.range.end));
    if (startEvent === undefined || endEvent === undefined) {
      stats.excludedUnaligned += 1;
      finishWindow();
      continue;
    }
    if (endEvent - startEvent > input.maxSegmentLength) {
      stats.excludedOverSpan += 1;
      finishWindow();
      continue;
    }
    if (window.length > 0 && window.at(-1)!.endEvent !== startEvent) finishWindow();
    window.push({ startEvent, endEvent, label });
    stats.supported += 1;
  }
  finishWindow();
  stats.windows = records.length;
  return { records, stats };
}

function momentKey(moment: { measureIndex: number; offsetTicks: number }): string {
  return `${moment.measureIndex}:${moment.offsetTicks}`;
}
