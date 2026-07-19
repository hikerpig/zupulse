import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createMusicXmlAdapter } from "../../musicxml/musicXmlAdapter";
import type { EffectiveHarmonyEntry } from "../../harmony/effectiveProjection";
import {
  applyAlphaTabHarmonyPreview,
  attachAlphaTabBeatSelection,
  attachAlphaTabPreviewErrors,
  attachAlphaTabScoreSelection,
  highlightAlphaTabWrittenRange,
  setAlphaTabPreviewLoop,
  setAlphaTabPreviewPosition,
  setAlphaTabPreviewSpeed,
  toScoreWrittenMoment,
  toggleAlphaTabPreviewPlayback,
} from "../alpha-tab-studio";

const beat = (measureIndex: number, offsetTicks: number) => ({
  displayStart: offsetTicks,
  voice: { bar: { index: measureIndex } },
});

const score = {
  masterBars: [
    { index: 0, start: 0, calculateDuration: () => 16 },
    { index: 1, start: 16, calculateDuration: () => 16 },
  ],
  tracks: [
    {
      index: 0,
      staves: [
        {
          bars: [
            { voices: [{ beats: [beat(0, 0), beat(0, 4), beat(0, 8), beat(0, 12)] }] },
            { voices: [{ beats: [beat(1, 0), beat(1, 4)] }] },
          ],
        },
      ],
    },
  ],
};

describe("toScoreWrittenMoment", () => {
  it("maps an alphaTab beat to its exact written position", () => {
    expect(toScoreWrittenMoment(beat(1, 4))).toEqual({ measureIndex: 1, offsetTicks: 4 });
  });
});

describe("attachAlphaTabBeatSelection", () => {
  it("emits written positions from beat clicks and detaches the alphaTab listener", () => {
    let handler:
      ((value: (typeof score.tracks)[0]["staves"][0]["bars"][0]["voices"][0]["beats"][number]) => void) | undefined;
    let detached = false;
    const selected: unknown[] = [];

    const detach = attachAlphaTabBeatSelection(
      {
        beatMouseDown: {
          on(nextHandler) {
            handler = nextHandler;
            return () => {
              detached = true;
            };
          },
        },
      },
      (moment) => selected.push(moment),
    );
    handler?.(beat(0, 8));
    detach();

    expect(selected).toEqual([{ measureIndex: 0, offsetTicks: 8 }]);
    expect(detached).toBe(true);
  });
});

describe("attachAlphaTabScoreSelection", () => {
  it("maps note clicks through their owning beat and detaches every listener", () => {
    let beatHandler: ((value: ReturnType<typeof beat>) => void) | undefined;
    let noteHandler: ((value: { beat: ReturnType<typeof beat> }) => void) | undefined;
    let detachCount = 0;
    const selected: unknown[] = [];

    const detach = attachAlphaTabScoreSelection(
      {
        beatMouseDown: {
          on(handler) {
            beatHandler = handler;
            return () => {
              detachCount += 1;
            };
          },
        },
        noteMouseDown: {
          on(handler) {
            noteHandler = handler;
            return () => {
              detachCount += 1;
            };
          },
        },
      },
      (moment) => selected.push(moment),
    );
    beatHandler?.(beat(0, 4));
    noteHandler?.({ beat: beat(1, 0) });
    detach();

    expect(selected).toEqual([
      { measureIndex: 0, offsetTicks: 4 },
      { measureIndex: 1, offsetTicks: 0 },
    ]);
    expect(detachCount).toBe(2);
  });
});

describe("highlightAlphaTabWrittenRange", () => {
  it("highlights only beats inside the half-open range and scrolls to its start", () => {
    const highlighted: unknown[][] = [];
    const api = {
      score,
      highlightPlaybackRange(start: unknown, end: unknown) {
        highlighted.push([start, end]);
      },
      tickPosition: 0,
      scrollToCursor() {},
    };
    const scrollToCursor = api.scrollToCursor;
    let scrollCalls = 0;
    api.scrollToCursor = () => {
      scrollCalls += 1;
    };

    expect(
      highlightAlphaTabWrittenRange(api, {
        start: { measureIndex: 0, offsetTicks: 4 },
        end: { measureIndex: 0, offsetTicks: 12 },
      }),
    ).toEqual({ status: "highlighted" });
    expect(highlighted).toEqual([
      [score.tracks[0].staves[0].bars[0].voices[0].beats[1], score.tracks[0].staves[0].bars[0].voices[0].beats[2]],
    ]);
    expect(api.tickPosition).toBe(4);
    expect(scrollCalls).toBe(1);
    expect(scrollToCursor).not.toBe(api.scrollToCursor);
  });

  it("returns false rather than snapping when a range has no matching beat", () => {
    const api = { score, highlightPlaybackRange() {}, scrollToCursor() {} };

    expect(
      highlightAlphaTabWrittenRange(api, {
        start: { measureIndex: 0, offsetTicks: 1 },
        end: { measureIndex: 0, offsetTicks: 4 },
      }),
    ).toEqual({ status: "unrepresentable" });
  });
});

describe("applyAlphaTabHarmonyPreview", () => {
  it("replaces runtime chords without changing the original bindings permanently", () => {
    const chords = new Map<string, { name: string }>();
    const staff = { addChord: (id: string, chord: { name: string }) => chords.set(id, chord) };
    const first = { ...beat(0, 0), chordId: "source-c", voice: { bar: { index: 0, staff } } };
    const second = { ...beat(0, 4), chordId: "source-d", voice: { bar: { index: 0, staff } } };
    const third = { ...beat(0, 8), chordId: "source-e", voice: { bar: { index: 0, staff } } };
    const previewScore = {
      masterBars: [{ start: 0 }],
      tracks: [{ index: 0, staves: [{ bars: [{ voices: [{ beats: [first, second, third] }] }] }] }],
    };
    let renders = 0;
    const entries: EffectiveHarmonyEntry[] = [
      {
        type: "chord",
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
        origin: "correction",
      },
      {
        type: "unresolved",
        range: { start: { measureIndex: 0, offsetTicks: 4 }, end: { measureIndex: 0, offsetTicks: 8 } },
        reason: "low-confidence",
        alternatives: [],
        origin: "analysis",
      },
      {
        type: "no-chord",
        range: { start: { measureIndex: 0, offsetTicks: 8 }, end: { measureIndex: 0, offsetTicks: 12 } },
        origin: "correction",
      },
    ];

    const restore = applyAlphaTabHarmonyPreview({ score: previewScore, renderTracks: () => (renders += 1) }, entries);

    expect(restore.status).toBe("applied");
    expect(first.chordId).not.toBe("source-c");
    expect(chords.get(first.chordId!)?.name).toBe("C");
    expect(second.chordId).toBeNull();
    expect(chords.get(third.chordId!)?.name).toBe("N.C.");
    expect(renders).toBe(1);
    if (restore.status === "applied") restore.restore();
    expect(first.chordId).toBe("source-c");
    expect(second.chordId).toBe("source-d");
    expect(third.chordId).toBe("source-e");
    expect(renders).toBe(2);
  });

  it("accepts the production MusicXML runtime without rewriting fixture bytes", async () => {
    const bytes = new Uint8Array(
      await readFile(resolve("test-fixtures/musicxml/generated/harmony-written-time.musicxml")),
    );
    const source = bytes.slice();
    const runtime = (await createMusicXmlAdapter().parse({ fileName: "harmony-written-time.musicxml", bytes })).runtime;
    let renders = 0;

    const result = applyAlphaTabHarmonyPreview({ score: runtime as never, renderTracks: () => (renders += 1) }, [
      {
        type: "chord",
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
        origin: "analysis",
      },
    ]);

    expect(result.status).toBe("applied");
    expect(renders).toBe(1);
    expect(bytes).toEqual(source);
  });
});

describe("Studio alphaTab preview transport", () => {
  it("uses public player settings for playback, seek, speed, and local written-range looping", () => {
    let toggles = 0;
    const api = {
      score,
      playPause: () => {
        toggles += 1;
      },
      tickPosition: 0,
      playbackSpeed: 1,
      playbackRange: null as { startTick: number; endTick: number } | null,
      isLooping: false,
    };

    expect(toggleAlphaTabPreviewPlayback(api)).toEqual({ status: "toggled" });
    expect(setAlphaTabPreviewPosition(api, 9)).toEqual({ status: "positioned" });
    expect(setAlphaTabPreviewSpeed(api, 1.25)).toEqual({ status: "sped" });
    expect(
      setAlphaTabPreviewLoop(api, {
        start: { measureIndex: 0, offsetTicks: 4 },
        end: { measureIndex: 1, offsetTicks: 4 },
      }),
    ).toEqual({ status: "looped" });

    expect(toggles).toBe(1);
    expect(api.tickPosition).toBe(9);
    expect(api.playbackSpeed).toBe(1.25);
    expect(api.playbackRange).toEqual({ startTick: 4, endTick: 20 });
    expect(api.isLooping).toBe(true);
  });

  it("refuses an invalid written range instead of changing the current loop", () => {
    const api = {
      score,
      playbackRange: { startTick: 2, endTick: 6 },
      isLooping: true,
    };

    expect(
      setAlphaTabPreviewLoop(api, {
        start: { measureIndex: 0, offsetTicks: 8 },
        end: { measureIndex: 0, offsetTicks: 8 },
      }),
    ).toEqual({ status: "unrepresentable" });
    expect(api.playbackRange).toEqual({ startTick: 2, endTick: 6 });
    expect(api.isLooping).toBe(true);
  });
});

describe("attachAlphaTabPreviewErrors", () => {
  it("forwards player errors without depending on alphaTab internals", () => {
    let handler: ((error: unknown) => void) | undefined;
    const reported: Error[] = [];
    const detach = attachAlphaTabPreviewErrors(
      {
        error: {
          on(nextHandler) {
            handler = nextHandler;
            return () => {
              handler = undefined;
            };
          },
        },
      },
      (error) => reported.push(error),
    );

    handler?.("broken preview");
    detach();

    expect(reported[0]?.message).toBe("alphaTab preview error");
    expect(handler).toBeUndefined();
  });
});
