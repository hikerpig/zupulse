import * as alphaTab from "@coderline/alphatab";
import type { EffectiveHarmonyEntry } from "../harmony/effectiveProjection";
import { formatChordSymbol } from "../harmony/formatter";
import { compareMoments, type ScoreWrittenRange } from "../harmony/schemas";
import type { ScoreWrittenMoment } from "../harmony/writtenTime";

export type AlphaTabStudioBeat = {
  displayStart: number;
  chordId?: string | null;
  voice: { bar: { index: number; staff?: { addChord(id: string, chord: unknown): void } } };
};

export type AlphaTabStudioNote = { beat: AlphaTabStudioBeat };

export type AlphaTabStudioScore = {
  masterBars: Array<{ start: number }>;
  tracks: Array<{
    staves?: Array<{
      bars?: Array<{
        voices?: Array<{ beats?: AlphaTabStudioBeat[] }>;
      }>;
    }>;
  }>;
};

export type AlphaTabStudioApiLike = {
  score?: AlphaTabStudioScore | null;
  beatMouseDown?: { on(handler: (beat: AlphaTabStudioBeat) => void): () => void };
  noteMouseDown?: { on(handler: (note: AlphaTabStudioNote) => void): () => void };
  highlightPlaybackRange?: (start: AlphaTabStudioBeat, end: AlphaTabStudioBeat) => void;
  scrollToCursor?: () => void;
  renderTracks?: (tracks: AlphaTabStudioScore["tracks"]) => void;
  error?: { on(handler: (error: unknown) => void): () => void };
  playerStateChanged?: { on(handler: (state: unknown) => void): () => void };
  playerPositionChanged?: { on(handler: (event: unknown) => void): () => void };
  playPause?: () => void;
  tickPosition?: number;
  playbackSpeed?: number;
  playbackRange?: { startTick: number; endTick: number } | null;
  isLooping?: boolean;
};

export type AlphaTabWrittenRangeHighlightResult =
  { status: "highlighted" } | { status: "unavailable" } | { status: "unrepresentable" };

export type AlphaTabHarmonyPreviewResult =
  { status: "applied"; restore(): void } | { status: "unavailable" } | { status: "unrepresentable" };

export type AlphaTabPreviewTransportResult =
  | { status: "toggled" }
  | { status: "positioned" }
  | { status: "sped" }
  | { status: "looped" }
  | { status: "unavailable" }
  | { status: "unrepresentable" };

export function toScoreWrittenMoment(beat: AlphaTabStudioBeat): ScoreWrittenMoment {
  return { measureIndex: beat.voice.bar.index, offsetTicks: beat.displayStart };
}

export function attachAlphaTabBeatSelection(
  api: AlphaTabStudioApiLike,
  select: (moment: ScoreWrittenMoment) => void,
): () => void {
  return api.beatMouseDown?.on((beat) => select(toScoreWrittenMoment(beat))) ?? (() => {});
}

export function attachAlphaTabScoreSelection(
  api: AlphaTabStudioApiLike,
  select: (moment: ScoreWrittenMoment) => void,
): () => void {
  const detachBeat = attachAlphaTabBeatSelection(api, select);
  const detachNote = api.noteMouseDown?.on((note) => select(toScoreWrittenMoment(note.beat))) ?? (() => {});
  return () => {
    detachBeat();
    detachNote();
  };
}

export function attachAlphaTabPreviewErrors(api: AlphaTabStudioApiLike, report: (error: Error) => void): () => void {
  return (
    api.error?.on((error) => report(error instanceof Error ? error : new Error("alphaTab preview error"))) ?? (() => {})
  );
}

export function toggleAlphaTabPreviewPlayback(api: AlphaTabStudioApiLike): AlphaTabPreviewTransportResult {
  if (!api.playPause) return { status: "unavailable" };
  api.playPause();
  return { status: "toggled" };
}

export function setAlphaTabPreviewPosition(
  api: AlphaTabStudioApiLike,
  positionTicks: number,
): AlphaTabPreviewTransportResult {
  if (!api.score) return { status: "unavailable" };
  if (!isNonNegativeSafeInteger(positionTicks)) return { status: "unrepresentable" };
  api.tickPosition = positionTicks;
  return { status: "positioned" };
}

export function setAlphaTabPreviewSpeed(api: AlphaTabStudioApiLike, speed: number): AlphaTabPreviewTransportResult {
  if (!api.score) return { status: "unavailable" };
  if (!Number.isFinite(speed) || speed <= 0) return { status: "unrepresentable" };
  api.playbackSpeed = speed;
  return { status: "sped" };
}

export function setAlphaTabPreviewLoop(
  api: AlphaTabStudioApiLike,
  range: ScoreWrittenRange | undefined,
): AlphaTabPreviewTransportResult {
  const score = api.score;
  if (!score) return { status: "unavailable" };
  if (range === undefined) {
    api.playbackRange = null;
    api.isLooping = false;
    return { status: "looped" };
  }
  const startTick = toAbsoluteTick(score, range.start);
  const endTick = toAbsoluteTick(score, range.end);
  if (startTick === undefined || endTick === undefined || startTick >= endTick) return { status: "unrepresentable" };
  api.playbackRange = { startTick, endTick };
  api.isLooping = true;
  return { status: "looped" };
}

export function highlightAlphaTabWrittenRange(
  api: AlphaTabStudioApiLike,
  range: ScoreWrittenRange,
): AlphaTabWrittenRangeHighlightResult {
  const score = api.score;
  if (!score || !api.highlightPlaybackRange) return { status: "unavailable" };
  const beats = allBeats(score).filter((beat) => contains(range, toScoreWrittenMoment(beat)));
  const start = beats[0];
  const end = beats.at(-1);
  const masterBar = score.masterBars[range.start.measureIndex];
  if (!start || !end || !masterBar) return { status: "unrepresentable" };
  api.highlightPlaybackRange(start, end);
  api.tickPosition = masterBar.start + start.displayStart;
  api.scrollToCursor?.();
  return { status: "highlighted" };
}

export function applyAlphaTabHarmonyPreview(
  api: AlphaTabStudioApiLike,
  entries: readonly EffectiveHarmonyEntry[],
): AlphaTabHarmonyPreviewResult {
  const score = api.score;
  if (!score || !api.renderTracks) return { status: "unavailable" };
  const pending = entries.map((entry) => ({ entry, beat: findBeat(score, entry.range.start) }));
  if (pending.some(({ beat }) => beat === undefined)) return { status: "unrepresentable" };
  if (pending.some(({ beat }) => beat?.voice.bar.staff === undefined)) return { status: "unavailable" };

  const original = new Map<AlphaTabStudioBeat, string | null | undefined>();
  for (const { entry, beat } of pending) {
    const resolvedBeat = beat!;
    original.set(resolvedBeat, resolvedBeat.chordId);
    if (entry.type === "unresolved") {
      resolvedBeat.chordId = null;
      continue;
    }
    const chord = new alphaTab.model.Chord();
    chord.name = entry.type === "no-chord" ? "N.C." : formatChordSymbol(entry.chord);
    chord.showDiagram = false;
    chord.showFingering = false;
    const id = `studio:${rangeKey(entry.range)}`;
    resolvedBeat.voice.bar.staff!.addChord(id, chord);
    resolvedBeat.chordId = id;
  }
  api.renderTracks(score.tracks);

  return {
    status: "applied",
    restore() {
      for (const [beat, chordId] of original) {
        if (chordId === undefined) delete beat.chordId;
        else beat.chordId = chordId;
      }
      api.renderTracks!(score.tracks);
    },
  };
}

function allBeats(score: AlphaTabStudioScore): AlphaTabStudioBeat[] {
  return score.tracks.flatMap((track) =>
    (track.staves ?? []).flatMap((staff) =>
      (staff.bars ?? []).flatMap((bar) => (bar.voices ?? []).flatMap((voice) => voice.beats ?? [])),
    ),
  );
}

function findBeat(score: AlphaTabStudioScore, moment: ScoreWrittenMoment): AlphaTabStudioBeat | undefined {
  return allBeats(score).find((beat) => compareMoments(toScoreWrittenMoment(beat), moment) === 0);
}

function contains(range: ScoreWrittenRange, moment: ScoreWrittenMoment): boolean {
  return compareMoments(range.start, moment) <= 0 && compareMoments(moment, range.end) < 0;
}

function rangeKey(range: ScoreWrittenRange): string {
  return `${range.start.measureIndex}:${range.start.offsetTicks}-${range.end.measureIndex}:${range.end.offsetTicks}`;
}

function toAbsoluteTick(score: AlphaTabStudioScore, moment: ScoreWrittenMoment): number | undefined {
  const masterBar = score.masterBars[moment.measureIndex];
  if (!masterBar || !isNonNegativeSafeInteger(moment.offsetTicks)) return undefined;
  return masterBar.start + moment.offsetTicks;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
