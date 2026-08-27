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
      | ((value: (typeof score.tracks)[0]["staves"][0]["bars"][0]["voices"][0]["beats"][number]) => void)
      | undefined;
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
  it("uses alphaTab public DOM events when a score host is available", () => {
    const target = new EventTarget();
    const selected: unknown[] = [];
    const detach = attachAlphaTabScoreSelection({}, (moment) => selected.push(moment), target);
    const event = new Event("alphaTab.beatMouseDown");
    Object.defineProperty(event, "detail", { value: beat(2, 12) });

    target.dispatchEvent(event);
    detach();
    target.dispatchEvent(event);

    expect(selected).toEqual([{ measureIndex: 2, offsetTicks: 12 }]);
  });

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

  it("skips unrendered empty voice beats at the range edges", () => {
    const emptyBeat = { ...beat(0, 12), isEmpty: true };
    const scoreWithEmptyVoice = {
      masterBars: score.masterBars,
      tracks: [
        {
          index: 0,
          staves: [
            {
              bars: [
                {
                  voices: [{ beats: [beat(0, 0), beat(0, 4)] }, { beats: [emptyBeat] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const highlighted: unknown[][] = [];
    const api = {
      score: scoreWithEmptyVoice,
      highlightPlaybackRange(start: unknown, end: unknown) {
        highlighted.push([start, end]);
      },
      tickPosition: 0,
      scrollToCursor() {},
    };

    expect(
      highlightAlphaTabWrittenRange(api, {
        start: { measureIndex: 0, offsetTicks: 0 },
        end: { measureIndex: 1, offsetTicks: 0 },
      }),
    ).toEqual({ status: "highlighted" });
    const beats = scoreWithEmptyVoice.tracks[0].staves[0].bars[0].voices[0].beats;
    expect(highlighted).toEqual([[beats[0], beats[1]]]);
  });

  it("positions the cursor from the measure of the first rendered beat", () => {
    const laterBeat = beat(1, 0);
    const scoreWithEmptyStartMeasure = {
      masterBars: score.masterBars,
      tracks: [
        {
          index: 0,
          staves: [
            {
              bars: [{ voices: [{ beats: [{ ...beat(0, 0), isEmpty: true }] }] }, { voices: [{ beats: [laterBeat] }] }],
            },
          ],
        },
      ],
    };
    const api = {
      score: scoreWithEmptyStartMeasure,
      highlightPlaybackRange() {},
      tickPosition: 0,
      scrollToCursor() {},
    };

    expect(
      highlightAlphaTabWrittenRange(api, {
        start: { measureIndex: 0, offsetTicks: 0 },
        end: { measureIndex: 1, offsetTicks: 4 },
      }),
    ).toEqual({ status: "highlighted" });
    // masterBars[1].start (16) + displayStart (0), not masterBars[range.start.measureIndex].start (0).
    expect(api.tickPosition).toBe(16);
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

  it("uses the first beat inside a range when its exact start is not attachable", () => {
    const chords = new Map<string, { name?: string }>();
    const staff = {
      addChord: (id: string, chord: { name?: string }) => chords.set(id, chord),
    };
    const grace = { ...beat(0, 0), voice: { bar: { index: 0, staff } } };
    const firstAttachable = { ...beat(0, 4), voice: { bar: { index: 0, staff } } };
    const previewScore = {
      masterBars: [{ start: 0 }],
      tracks: [{ staves: [{ bars: [{ voices: [{ beats: [grace, firstAttachable] }] }] }] }],
    };

    const result = applyAlphaTabHarmonyPreview({ score: previewScore, renderTracks: () => undefined }, [
      {
        type: "chord",
        range: { start: { measureIndex: 0, offsetTicks: 1 }, end: { measureIndex: 0, offsetTicks: 8 } },
        chord: { root: { step: "B", alter: 0 }, kind: "minor", degrees: [] },
        origin: "analysis",
      },
    ]);

    expect(result.status).toBe("applied");
    expect(grace.chordId).toBeUndefined();
    expect(chords.get(firstAttachable.chordId!)?.name).toBe("Bm");
  });

  it("uses the chronologically first fallback beat across voices", () => {
    const chords = new Map<string, { name?: string }>();
    const staff = {
      addChord: (id: string, chord: { name?: string }) => chords.set(id, chord),
    };
    const laterVoiceBeat = { ...beat(0, 8), voice: { bar: { index: 0, staff } } };
    const earlierVoiceBeat = { ...beat(0, 4), voice: { bar: { index: 0, staff } } };
    const previewScore = {
      masterBars: [{ start: 0 }],
      tracks: [
        {
          staves: [
            {
              bars: [
                {
                  voices: [{ beats: [laterVoiceBeat] }, { beats: [earlierVoiceBeat] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = applyAlphaTabHarmonyPreview({ score: previewScore, renderTracks: () => undefined }, [
      {
        type: "chord",
        range: { start: { measureIndex: 0, offsetTicks: 1 }, end: { measureIndex: 0, offsetTicks: 10 } },
        chord: { root: { step: "D", alter: 0 }, kind: "major", degrees: [] },
        origin: "analysis",
      },
    ]);

    expect(result.status).toBe("applied");
    expect(laterVoiceBeat.chordId).toBeUndefined();
    expect(chords.get(earlierVoiceBeat.chordId!)?.name).toBe("D");
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

  it("clears the local loop without changing the current position", () => {
    const api = {
      score,
      tickPosition: 9,
      playbackRange: { startTick: 2, endTick: 6 } as { startTick: number; endTick: number } | null,
      isLooping: true,
    };

    expect(setAlphaTabPreviewLoop(api, undefined)).toEqual({ status: "looped" });
    expect(api).toMatchObject({ tickPosition: 9, playbackRange: null, isLooping: false });
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
