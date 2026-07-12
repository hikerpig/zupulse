# GP Playback Practice Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Browser Demo 中交付可离线使用的 GP 播放练习闭环，包括播放定位、变速、多个命名 AB 循环、轨道显示与混音，以及通过 Bridge/mock storage 验证的练习状态持久化。

**Architecture:** Web Core 的 `PlaybackController` 是播放练习状态的单一入口，UI 只发送领域命令并订阅状态。`AlphaTabPlaybackAdapter` 把领域命令映射到 alphaTab；`PlaybackPersistence` 把同步 sidecar 与仅本机恢复位置映射到 Bridge RPC。Browser Demo 负责 DOM 和可访问交互，不拥有播放规则。

**Tech Stack:** TypeScript、Vitest、jsdom、Rspack、`@coderline/alphatab@1.8.4`、Web Audio/SoundFont、现有 mock Native Bridge。

## Global Constraints

- 使用中文写文档和用户可见文案。
- 使用 `rtk` 前缀运行所有 shell 命令。
- 采用测试驱动开发：每个行为先写失败测试，再写最小实现。
- 第一版只实现 alphaTab 播放后端，不定义完整原生音频协议。
- UI 不直接调用 alphaTab 播放、循环或轨道混音 API。
- 播放速度范围固定为 `0.25–2.0`，按 `0.05` 吸附，音高保持不变。
- 循环边界使用音乐位置作为权威值，毫秒值只作为缓存。
- sidecar 保存全谱速度、命名循环、显示轨道、静音和音量，不保存独奏与播放位置。
- 上次播放位置只保存到本机状态，不参与 sidecar 或同步。
- SoundFont 从锁定版本的 alphaTab 依赖复制，不把二进制重复提交到仓库。
- 本计划不实现 MIDI、SQLite、CloudKit、SwiftUI 或 WKWebView。

---

## Scope Check

本计划只覆盖 Web Core 与 Browser Demo 的 GP 播放练习竖切。Apple Shell 是后续独立项目，因为它涉及文件权限、WKWebView 资源 URL、`AVAudioSession`、应用生命周期和真实存储实现，不能与浏览器播放验证共享同一验收边界。

## File Structure

- Create: `web-core/src/playback/types.ts`  
  定义领域状态、命令、循环、轨道、时间轴和引擎端口。
- Create: `web-core/src/playback/loopRegions.ts`  
  实现速度归一化、边界吸附、默认命名和有效速度计算。
- Create: `web-core/src/playback/loopRegions.test.ts`
- Create: `web-core/src/playback/playbackSidecar.ts`  
  定义播放练习 sidecar、校验、旧版本迁移和对象级合并。
- Create: `web-core/src/playback/playbackSidecar.test.ts`
- Modify: `web-core/src/storage/sidecar.ts`  
  把播放练习子结构接入现有 `SidecarPayload`，schema 升级到 `0.2.0`。
- Modify: `web-core/src/storage/sidecar.test.ts`
- Create: `web-core/src/playback/playbackPersistence.ts`  
  定义持久化端口并实现 Bridge RPC adapter。
- Create: `web-core/src/playback/playbackPersistence.test.ts`
- Modify: `web-core/src/bridge/types.ts`  
  增加 typed sidecar 和 local resume RPC payload。
- Modify: `web-core/src/bridge/mockNativeBridge.ts`
- Modify: `web-core/src/bridge/mockNativeBridge.test.ts`
- Create: `web-core/src/playback/alphaTabPlaybackAdapter.ts`  
  实现 `PlaybackEngine` 的 alphaTab adapter。
- Create: `web-core/src/playback/alphaTabPlaybackAdapter.test.ts`
- Modify: `web-core/src/gp/alphaTabBrowser.ts`  
  扩充最小可测试 alphaTab façade。
- Modify: `web-core/src/gp/alphaTabBrowser.test.ts`
- Create: `web-core/src/playback/playbackController.ts`  
  实现状态机、命令、事件隔离和持久化调度。
- Create: `web-core/src/playback/playbackController.test.ts`
- Modify: `web-core/src/index.ts`  
  导出新的播放模块。
- Modify: `web-demo/rspack.config.mjs`  
  把 alphaTab script、字体、SoundFont 和许可证复制到构建产物。
- Create: `web-demo/scripts/verify-assets.mjs`
- Modify: `web-demo/package.json`
- Modify: `web-demo/index.html`  
  添加播放工具栏、循环面板和轨道面板。
- Create: `web-demo/src/playbackPresenter.ts`
- Create: `web-demo/src/playbackPresenter.test.ts`
- Create: `web-demo/src/playbackControls.ts`
- Create: `web-demo/src/playbackControls.test.ts`
- Modify: `web-demo/src/demoApp.ts`
- Modify: `web-demo/src/demoApp.test.ts`
- Modify: `web-demo/src/gpDemoPresenter.ts`
- Modify: `web-demo/src/gpDemoPresenter.test.ts`
- Modify: `web-demo/src/styles.css`
- Modify: `docs/architecture/browser-demo-alphatab-dom-rendering.md`
- Modify: `docs/architecture/implementation-foundation.md`
- Create: `docs/architecture/gp-playback-practice-acceptance.md`

---

### Task 1: Playback Domain Model And Loop Rules

**Files:**

- Create: `web-core/src/playback/types.ts`
- Create: `web-core/src/playback/loopRegions.ts`
- Create: `web-core/src/playback/loopRegions.test.ts`
- Modify: `web-core/src/index.ts`

**Interfaces:**

- Consumes: no runtime dependencies outside TypeScript standard APIs.
- Produces:
  - `MusicalPosition`
  - `LoopRegion`
  - `TrackPlaybackState`
  - `PlaybackState`
  - `PlaybackCommand`
  - `PlaybackEngine`
  - `normalizePlaybackSpeed(value: number): number`
  - `snapMusicalPosition(position, mode, timeline): MusicalPosition`
  - `createLoopRegion(input): LoopRegion`
  - `getEffectivePlaybackSpeed(scoreSpeed, loop): number`
  - `musicalPositionFromTick(tick, timeMs, timeline): MusicalPosition`

- [ ] **Step 1: Write failing loop-domain tests**

Create `web-core/src/playback/loopRegions.test.ts` with cases that assert:

```ts
import { describe, expect, it } from "vitest";
import {
  createLoopRegion,
  getEffectivePlaybackSpeed,
  musicalPositionFromTick,
  normalizePlaybackSpeed,
  snapMusicalPosition,
} from "./loopRegions";
import type { PlaybackTimelineMap } from "./types";

const timeline: PlaybackTimelineMap = {
  durationTicks: 3840,
  durationMs: 8000,
  measures: [
    {
      id: "measure-0",
      index: 0,
      startTick: 0,
      durationTicks: 1920,
      beatTicks: [0, 480, 960, 1440],
    },
    {
      id: "measure-1",
      index: 1,
      startTick: 1920,
      durationTicks: 1920,
      beatTicks: [1920, 2400, 2880, 3360],
    },
  ],
};

describe("normalizePlaybackSpeed", () => {
  it("clamps to 25%-200% and snaps to 5%", () => {
    expect(normalizePlaybackSpeed(0.1)).toBe(0.25);
    expect(normalizePlaybackSpeed(0.773)).toBe(0.75);
    expect(normalizePlaybackSpeed(2.4)).toBe(2);
  });
});

describe("snapMusicalPosition", () => {
  const position = {
    measureId: "measure-0",
    measureIndex: 0,
    beatIndex: 1,
    tick: 731,
    cachedTimeMs: 1500,
  };

  it("supports off, beat, and measure snapping", () => {
    expect(snapMusicalPosition(position, "off", timeline).tick).toBe(731);
    expect(snapMusicalPosition(position, "beat", timeline).tick).toBe(480);
    expect(snapMusicalPosition(position, "measure", timeline).tick).toBe(0);
  });

  it("maps an engine tick back to its measure and beat", () => {
    expect(musicalPositionFromTick(2500, 5200, timeline)).toEqual({
      measureId: "measure-1",
      measureIndex: 1,
      beatIndex: 1,
      tick: 2500,
      cachedTimeMs: 5200,
    });
  });
});

describe("createLoopRegion", () => {
  it("rejects reversed boundaries and generates a one-based label", () => {
    const start = {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick: 0,
      cachedTimeMs: 0,
    };
    const end = {
      measureId: "measure-1",
      measureIndex: 1,
      beatIndex: 3,
      tick: 3360,
      cachedTimeMs: 7000,
    };

    expect(() => createLoopRegion({ id: "bad", start: end, end: start, now: "2026-07-10T00:00:00Z" })).toThrow(
      "Loop start must be before loop end",
    );
    expect(createLoopRegion({ id: "loop-1", start, end, now: "2026-07-10T00:00:00Z" }).label).toBe("小节 1–2");
  });

  it("uses a loop speed override before the score speed", () => {
    expect(getEffectivePlaybackSpeed(0.8, { speedOverride: 0.55 })).toBe(0.55);
    expect(getEffectivePlaybackSpeed(0.8, {})).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm test -- web-core/src/playback/loopRegions.test.ts
```

Expected: FAIL because `./loopRegions` and `./types` do not exist.

- [ ] **Step 3: Add the domain types**

Create `web-core/src/playback/types.ts` with these exact public shapes:

```ts
export type TransportState = "idle" | "loading" | "ready" | "playing" | "paused" | "stopped" | "error";

export type LoopSnapMode = "off" | "beat" | "measure";

export type MusicalPosition = {
  measureId: string;
  measureIndex: number;
  beatIndex: number;
  tick: number;
  cachedTimeMs: number;
};

export type MeasureTimeline = {
  id: string;
  index: number;
  startTick: number;
  durationTicks: number;
  beatTicks: number[];
};

export type PlaybackTimelineMap = {
  durationTicks: number;
  durationMs: number;
  measures: MeasureTimeline[];
};

export type LoopRegion = {
  id: string;
  label: string;
  labelSource: "generated" | "user";
  start: MusicalPosition;
  end: MusicalPosition;
  snapMode: LoopSnapMode;
  speedOverride?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type LoopDraft = {
  start?: MusicalPosition;
  end?: MusicalPosition;
  snapMode: LoopSnapMode;
};

export type PlaybackTrack = {
  id: string;
  sourceIndex: number;
  name: string;
};

export type TrackMixState = {
  muted: boolean;
  solo: boolean;
  volume: number;
  muteUpdatedAt: string;
  volumeUpdatedAt: string;
};

export type TrackPlaybackState = {
  primaryVisibleTrackId: string;
  additionalVisibleTrackIds: string[];
  visibilityUpdatedAt: string;
  settings: Record<string, TrackMixState>;
};

export type PlaybackState = {
  sessionId: string;
  transport: TransportState;
  position: MusicalPosition;
  durationMs: number;
  scoreSpeed: number;
  looping: boolean;
  activeLoopId?: string;
  loopDraft: LoopDraft;
  loops: LoopRegion[];
  tracks: PlaybackTrack[];
  trackState: TrackPlaybackState;
  soundFont: "idle" | "loading" | "ready" | "error";
  persistence: "clean" | "saving" | "unsaved" | "error";
  errorCode?: string;
};

export type PlaybackCommand =
  | { type: "toggle-playback" }
  | { type: "stop" }
  | { type: "retry-soundfont" }
  | { type: "seek"; position: MusicalPosition }
  | { type: "set-score-speed"; speed: number }
  | { type: "set-loop-enabled"; enabled: boolean }
  | { type: "set-loop-snap"; mode: LoopSnapMode }
  | { type: "set-loop-boundary"; boundary: "start" | "end"; position: MusicalPosition }
  | { type: "select-loop"; loopId: string }
  | { type: "save-loop"; label?: string }
  | { type: "rename-loop"; loopId: string; label: string }
  | { type: "delete-loop"; loopId: string }
  | { type: "set-loop-speed"; loopId: string; speed?: number }
  | { type: "set-primary-track"; trackId: string }
  | { type: "set-additional-tracks"; trackIds: string[] }
  | { type: "set-track-mute"; trackId: string; muted: boolean }
  | { type: "set-track-solo"; trackId: string; solo: boolean }
  | { type: "set-track-volume"; trackId: string; volume: number };

export type PlaybackEngineEvent =
  | { type: "ready" }
  | { type: "soundfont-loading" }
  | { type: "soundfont-ready" }
  | { type: "soundfont-error"; error: Error }
  | { type: "transport"; state: "playing" | "paused" | "stopped" }
  | { type: "position"; positionMs: number; endMs: number; tick: number }
  | { type: "error"; error: Error };

export type PlaybackEngineSnapshot = {
  soundFont: "loading" | "ready" | "error";
  transport: "playing" | "paused" | "stopped";
};

export interface PlaybackEngine {
  subscribe(listener: (event: PlaybackEngineEvent) => void): () => void;
  getSnapshot(): PlaybackEngineSnapshot;
  playPause(): void;
  stop(): void;
  retrySoundFont(): void;
  seekTick(tick: number): void;
  setSpeed(speed: number): void;
  setLoop(range: { startTick: number; endTick: number } | null, enabled: boolean): void;
  setVisibleTracks(trackIds: string[]): void;
  setTrackMute(trackId: string, muted: boolean): void;
  setTrackSolo(trackId: string, solo: boolean): void;
  setTrackVolume(trackId: string, volume: number): void;
  destroy(): void;
}
```

- [ ] **Step 4: Implement the pure loop helpers**

Create `web-core/src/playback/loopRegions.ts`. Implement the following rules without touching alphaTab:

```ts
import type { LoopRegion, LoopSnapMode, MusicalPosition, PlaybackTimelineMap } from "./types";

export function normalizePlaybackSpeed(value: number): number {
  const clamped = Math.min(2, Math.max(0.25, value));
  return Math.round(clamped / 0.05) * 0.05;
}

export function snapMusicalPosition(
  position: MusicalPosition,
  mode: LoopSnapMode,
  timeline: PlaybackTimelineMap,
): MusicalPosition {
  if (mode === "off") return position;
  const measure =
    timeline.measures.find((item) => item.id === position.measureId) ??
    timeline.measures.find((item) => item.index === position.measureIndex);
  if (!measure) return position;
  const candidates = mode === "measure" ? [measure.startTick] : measure.beatTicks;
  const tick = candidates.reduce(
    (best, candidate) => (Math.abs(candidate - position.tick) < Math.abs(best - position.tick) ? candidate : best),
    candidates[0] ?? measure.startTick,
  );
  const beatIndex = Math.max(0, measure.beatTicks.indexOf(tick));
  return { ...position, measureId: measure.id, measureIndex: measure.index, beatIndex, tick };
}

export function createLoopRegion(input: {
  id: string;
  start: MusicalPosition;
  end: MusicalPosition;
  now: string;
  label?: string;
  snapMode?: LoopSnapMode;
  speedOverride?: number;
}): LoopRegion {
  if (input.start.tick >= input.end.tick) {
    throw new Error("Loop start must be before loop end");
  }
  const region: LoopRegion = {
    id: input.id,
    label: input.label ?? `小节 ${input.start.measureIndex + 1}–${input.end.measureIndex + 1}`,
    labelSource: input.label === undefined ? "generated" : "user",
    start: input.start,
    end: input.end,
    snapMode: input.snapMode ?? "beat",
    createdAt: input.now,
    updatedAt: input.now,
  };
  if (input.speedOverride !== undefined) {
    region.speedOverride = normalizePlaybackSpeed(input.speedOverride);
  }
  return region;
}

export function getEffectivePlaybackSpeed(
  scoreSpeed: number,
  loop: Pick<LoopRegion, "speedOverride"> | Record<string, never>,
): number {
  return normalizePlaybackSpeed(loop.speedOverride ?? scoreSpeed);
}

export function musicalPositionFromTick(tick: number, timeMs: number, timeline: PlaybackTimelineMap): MusicalPosition {
  const measure = [...timeline.measures].reverse().find((item) => item.startTick <= tick) ?? timeline.measures[0];
  if (!measure) {
    return { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick, cachedTimeMs: timeMs };
  }
  const reversedIndex = [...measure.beatTicks].reverse().findIndex((beatTick) => beatTick <= tick);
  const beatIndex = reversedIndex < 0 ? 0 : measure.beatTicks.length - 1 - reversedIndex;
  return {
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex,
    tick,
    cachedTimeMs: timeMs,
  };
}
```

- [ ] **Step 5: Export and verify the domain module**

Append to `web-core/src/index.ts`:

```ts
export * from "./playback/types";
export * from "./playback/loopRegions";
```

Run:

```bash
pnpm test -- web-core/src/playback/loopRegions.test.ts
pnpm typecheck
```

Expected: focused tests PASS and TypeScript build PASS.

- [ ] **Step 6: Commit**

```bash
git add web-core/src/playback web-core/src/index.ts
git commit -m "feat: add playback practice domain model"
```

---

### Task 2: Versioned Playback Sidecar And Merge Rules

**Files:**

- Create: `web-core/src/playback/playbackSidecar.ts`
- Create: `web-core/src/playback/playbackSidecar.test.ts`
- Modify: `web-core/src/storage/sidecar.ts`
- Modify: `web-core/src/storage/sidecar.test.ts`
- Modify: `web-core/src/score/session.test.ts`
- Modify: `web-core/src/index.ts`

**Interfaces:**

- Consumes: `LoopRegion`, `TrackPlaybackState`, `ScoreIdentity`.
- Produces:
  - `PracticePlaybackSidecar`
  - `createDefaultPlaybackSidecar(now): PracticePlaybackSidecar`
  - `mergePlaybackSidecar(local, remote): PracticePlaybackSidecar`
  - `SIDECAR_SCHEMA_VERSION = "0.2.0"`
  - backward migration from existing `0.1.0` JSON.

- [ ] **Step 1: Write failing sidecar tests**

Create tests that prove all persistence decisions:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultPlaybackSidecar, mergePlaybackSidecar } from "./playbackSidecar";

describe("playback sidecar", () => {
  it("does not contain transport, resume position, or solo", () => {
    const sidecar = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    expect(sidecar.scoreSpeed.value).toBe(1);
    expect(sidecar.loops).toEqual([]);
    expect(JSON.stringify(sidecar)).not.toContain("transport");
    expect(JSON.stringify(sidecar)).not.toContain("resume");
    expect(JSON.stringify(sidecar)).not.toContain("solo");
  });

  it("merges loops by id and newest updatedAt, including tombstones", () => {
    const local = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    const remote = createDefaultPlaybackSidecar("2026-07-10T00:00:00Z");
    local.loops = [loop("loop-1", "2026-07-10T01:00:00Z")];
    remote.loops = [
      {
        ...loop("loop-1", "2026-07-10T02:00:00Z"),
        deletedAt: "2026-07-10T02:00:00Z",
      },
    ];
    expect(mergePlaybackSidecar(local, remote).loops[0]?.deletedAt).toBe("2026-07-10T02:00:00Z");
  });
});
```

In the same file, define a complete `loop(id, updatedAt)` fixture returning a valid `LoopRegion` with ticks `0–1920`, measures `0–1`, default beat snapping, and generated label `小节 1–2`.

Use this fixture implementation:

```ts
function loop(id: string, updatedAt: string) {
  return {
    id,
    label: "小节 1–2",
    labelSource: "generated" as const,
    start: {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick: 0,
      cachedTimeMs: 0,
    },
    end: {
      measureId: "measure-1",
      measureIndex: 1,
      beatIndex: 0,
      tick: 1920,
      cachedTimeMs: 4000,
    },
    snapMode: "beat" as const,
    createdAt: "2026-07-10T00:00:00Z",
    updatedAt,
  };
}
```

Extend `web-core/src/storage/sidecar.test.ts` with one test that decodes a literal `0.1.0` payload and expects a `0.2.0` payload with default playback settings. Update existing expectations from `0.1.0` to `0.2.0`.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm test -- web-core/src/playback/playbackSidecar.test.ts web-core/src/storage/sidecar.test.ts
```

Expected: FAIL because the playback sidecar module and schema migration do not exist.

- [ ] **Step 3: Define the playback sidecar schema**

Create `web-core/src/playback/playbackSidecar.ts` with:

```ts
import type { LoopRegion } from "./types";

export type TimedValue<T> = {
  value: T;
  updatedAt: string;
};

export type PersistedTrackMix = {
  muted: boolean;
  volume: number;
  muteUpdatedAt: string;
  volumeUpdatedAt: string;
};

export type PracticePlaybackSidecar = {
  scoreSpeed: TimedValue<number>;
  loops: LoopRegion[];
  visibility: {
    primaryTrackId?: string;
    additionalTrackIds: string[];
    updatedAt: string;
  };
  tracks: Record<string, PersistedTrackMix>;
};

export function createDefaultPlaybackSidecar(now: string): PracticePlaybackSidecar {
  return {
    scoreSpeed: { value: 1, updatedAt: now },
    loops: [],
    visibility: { additionalTrackIds: [], updatedAt: now },
    tracks: {},
  };
}

export function mergePlaybackSidecar(
  local: PracticePlaybackSidecar,
  remote: PracticePlaybackSidecar,
): PracticePlaybackSidecar {
  const loopMap = new Map(local.loops.map((loop) => [loop.id, loop]));
  for (const loop of remote.loops) {
    const current = loopMap.get(loop.id);
    if (!current || loop.updatedAt > current.updatedAt) loopMap.set(loop.id, loop);
  }
  const trackIds = new Set([...Object.keys(local.tracks), ...Object.keys(remote.tracks)]);
  const tracks: PracticePlaybackSidecar["tracks"] = {};
  for (const id of trackIds) {
    const left = local.tracks[id];
    const right = remote.tracks[id];
    if (!left) {
      if (right) tracks[id] = right;
      continue;
    }
    if (!right) {
      tracks[id] = left;
      continue;
    }
    tracks[id] = {
      muted: right.muteUpdatedAt > left.muteUpdatedAt ? right.muted : left.muted,
      muteUpdatedAt: right.muteUpdatedAt > left.muteUpdatedAt ? right.muteUpdatedAt : left.muteUpdatedAt,
      volume: right.volumeUpdatedAt > left.volumeUpdatedAt ? right.volume : left.volume,
      volumeUpdatedAt: right.volumeUpdatedAt > left.volumeUpdatedAt ? right.volumeUpdatedAt : left.volumeUpdatedAt,
    };
  }
  return {
    scoreSpeed: remote.scoreSpeed.updatedAt > local.scoreSpeed.updatedAt ? remote.scoreSpeed : local.scoreSpeed,
    loops: [...loopMap.values()].sort((a, b) => a.start.tick - b.start.tick),
    visibility: remote.visibility.updatedAt > local.visibility.updatedAt ? remote.visibility : local.visibility,
    tracks,
  };
}
```

- [ ] **Step 4: Upgrade and migrate the root sidecar**

Modify `web-core/src/storage/sidecar.ts` so:

- `SIDECAR_SCHEMA_VERSION` is exactly `"0.2.0"`.
- `SidecarPayload.practice` contains `playback: PracticePlaybackSidecar`.
- `createDefaultSidecar` accepts an optional `now = new Date().toISOString()` and uses `createDefaultPlaybackSidecar(now)`.
- `decodeSidecar` accepts both `0.1.0` and `0.2.0`.
- A `0.1.0` payload migrates old `practice.loops` into `LoopRegion` values. Use `measureId: "legacy"`, `measureIndex: -1`, `beatIndex: -1`, the old ticks, `cachedTimeMs: 0`, `snapMode: "off"`, and timestamp `1970-01-01T00:00:00.000Z`.
- Unsupported versions still throw `Unsupported sidecar schema version: <version>`.
- Preserve old sections, annotations, MIDI settings and track overrides.

Keep `TrackOverride.solo` readable for old payloads, but do not copy it into the new `practice.playback.tracks` structure.

- [ ] **Step 5: Update session expectations and exports**

Update default sidecar snapshots in `web-core/src/score/session.test.ts` and export:

```ts
export * from "./playback/playbackSidecar";
```

from `web-core/src/index.ts`.

Run:

```bash
pnpm test -- web-core/src/playback/playbackSidecar.test.ts web-core/src/storage/sidecar.test.ts web-core/src/score/session.test.ts
pnpm typecheck
```

Expected: all focused tests PASS and TypeScript build PASS.

- [ ] **Step 6: Commit**

```bash
git add web-core/src/playback web-core/src/storage web-core/src/score/session.test.ts web-core/src/index.ts
git commit -m "feat: persist playback practice settings in sidecar"
```

---

### Task 3: Bridge Playback Persistence And Local Resume

**Files:**

- Create: `web-core/src/playback/playbackPersistence.ts`
- Create: `web-core/src/playback/playbackPersistence.test.ts`
- Modify: `web-core/src/bridge/types.ts`
- Modify: `web-core/src/bridge/mockNativeBridge.ts`
- Modify: `web-core/src/bridge/mockNativeBridge.test.ts`
- Modify: `web-core/src/index.ts`

**Interfaces:**

- Consumes: `ScoreIdentity`, `SidecarPayload`, `MusicalPosition`, generic `rpc<T>()` bridge capability.
- Produces:
  - `LocalPlaybackResume`
  - `PlaybackPersistence`
  - `BridgePlaybackPersistence`
  - RPCs `sidecar.read`, `sidecar.write`, `playbackResume.read`, `playbackResume.write`.

- [ ] **Step 1: Write failing persistence tests**

Create a test that constructs `MockNativeBridge` and `BridgePlaybackPersistence`, writes a default sidecar and resume position, then reads both back. Add this explicit assertion:

```ts
expect(await persistence.readResume(identity)).toEqual({
  position: {
    measureId: "measure-2",
    measureIndex: 2,
    beatIndex: 1,
    tick: 4320,
    cachedTimeMs: 9000,
  },
  updatedAt: "2026-07-10T03:00:00Z",
});
```

Add a mock bridge test proving unknown identities return `undefined` for both reads rather than throwing.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm test -- web-core/src/playback/playbackPersistence.test.ts web-core/src/bridge/mockNativeBridge.test.ts
```

Expected: FAIL because playback persistence RPCs do not exist.

- [ ] **Step 3: Add typed RPC payloads**

In `web-core/src/bridge/types.ts`, replace `WriteSidecarRequest.payload: unknown` with `SidecarPayload` and add:

```ts
export type ReadSidecarResponse = { payload?: SidecarPayload };

export type LocalPlaybackResume = {
  position: MusicalPosition;
  updatedAt: string;
};

export type ReadPlaybackResumeRequest = { identity: ScoreIdentity };
export type ReadPlaybackResumeResponse = { resume?: LocalPlaybackResume };
export type WritePlaybackResumeRequest = {
  identity: ScoreIdentity;
  resume: LocalPlaybackResume;
};
```

Use type-only imports for `SidecarPayload` and `MusicalPosition`.

- [ ] **Step 4: Implement the persistence port and adapter**

Create `web-core/src/playback/playbackPersistence.ts`:

```ts
import type { ScoreIdentity } from "../score/types";
import type { SidecarPayload } from "../storage/sidecar";
import type { LocalPlaybackResume, ReadPlaybackResumeResponse, ReadSidecarResponse } from "../bridge/types";

export interface RpcBridge {
  rpc<TResponse>(type: string, payload: unknown): Promise<TResponse>;
}

export interface PlaybackPersistence {
  readSidecar(identity: ScoreIdentity): Promise<SidecarPayload | undefined>;
  writeSidecar(identity: ScoreIdentity, payload: SidecarPayload): Promise<void>;
  readResume(identity: ScoreIdentity): Promise<LocalPlaybackResume | undefined>;
  writeResume(identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void>;
}

export class BridgePlaybackPersistence implements PlaybackPersistence {
  constructor(private readonly bridge: RpcBridge) {}

  async readSidecar(identity: ScoreIdentity): Promise<SidecarPayload | undefined> {
    return (await this.bridge.rpc<ReadSidecarResponse>("sidecar.read", { identity })).payload;
  }

  async writeSidecar(identity: ScoreIdentity, payload: SidecarPayload): Promise<void> {
    await this.bridge.rpc("sidecar.write", { identity, payload });
  }

  async readResume(identity: ScoreIdentity): Promise<LocalPlaybackResume | undefined> {
    return (await this.bridge.rpc<ReadPlaybackResumeResponse>("playbackResume.read", { identity })).resume;
  }

  async writeResume(identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void> {
    await this.bridge.rpc("playbackResume.write", { identity, resume });
  }
}
```

- [ ] **Step 5: Extend MockNativeBridge storage**

Add two maps keyed by `identity.contentHash`. Handle all four RPC names using the typed request objects. Write operations return `undefined as TResponse`; read operations return `{ payload }` or `{ resume }`. Clone stored payloads with `structuredClone` on both write and read so tests cannot mutate mock storage by reference.

Export `BridgePlaybackPersistence` and related types from `web-core/src/index.ts`.

Run:

```bash
pnpm test -- web-core/src/playback/playbackPersistence.test.ts web-core/src/bridge/mockNativeBridge.test.ts
pnpm typecheck
```

Expected: focused tests PASS and TypeScript build PASS.

- [ ] **Step 6: Commit**

```bash
git add web-core/src/playback web-core/src/bridge web-core/src/index.ts
git commit -m "feat: add bridge playback persistence"
```

---

### Task 4: AlphaTab Playback Engine Adapter

**Files:**

- Create: `web-core/src/playback/alphaTabPlaybackAdapter.ts`
- Create: `web-core/src/playback/alphaTabPlaybackAdapter.test.ts`
- Modify: `web-core/src/gp/alphaTabBrowser.ts`
- Modify: `web-core/src/gp/alphaTabBrowser.test.ts`
- Modify: `web-core/src/index.ts`

**Interfaces:**

- Consumes: `AlphaTabApiLike`, `PlaybackEngine`, alphaTab public player and track APIs.
- Produces:
  - `AlphaTabPlaybackAdapter implements PlaybackEngine`
  - `extractAlphaTabPlaybackModel(api): { tracks; timeline }`
  - `waitForAlphaTabScore(api): Promise<AlphaTabBrowserScoreLike>`
  - stable track IDs `track-<sourceIndex>` and measure IDs `measure-<index>`.

- [ ] **Step 1: Write failing adapter tests**

Use a plain object fake API and event emitters. Tests must prove:

- `playPause`, `stop`, `tickPosition`, `playbackSpeed`, `playbackRange` and `isLooping` map exactly once.
- `setVisibleTracks(["track-1", "track-0"])` calls `renderTracks` with source tracks in requested order.
- mute, solo and volume resolve stable IDs to source tracks.
- alphaTab player state `state: 1` emits `playing`; `state: 0, stopped: false` emits `paused`; `state: 0, stopped: true` emits `stopped`.
- position, player-ready and SoundFont-ready events map to domain events; an API error before SoundFont readiness maps to `soundfont-error`, while a later API error maps to `error`.
- `retrySoundFont()` calls `loadSoundFontFromUrl(configuredUrl, false)`.
- `waitForAlphaTabScore` resolves immediately when `api.score` exists, otherwise resolves from the next `scoreLoaded` event and detaches its temporary listener.
- `getSnapshot()` reports SoundFont and transport events that occurred before Controller subscription.
- `destroy()` detaches every event handler before calling `api.destroy()`.
- an unknown track ID throws `Unknown alphaTab track: <id>`.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm test -- web-core/src/playback/alphaTabPlaybackAdapter.test.ts
```

Expected: FAIL because `AlphaTabPlaybackAdapter` does not exist.

- [ ] **Step 3: Expand the testable alphaTab façade**

Define `AlphaTabBrowserTrackLike` and `AlphaTabBrowserScoreLike`, then extend `AlphaTabApiLike` in `web-core/src/gp/alphaTabBrowser.ts` with optional members matching alphaTab public API:

```ts
score?: AlphaTabBrowserScoreLike | null;
scoreLoaded?: AlphaTabEvent<AlphaTabBrowserScoreLike>;
```

Use these façade types:

```ts
export type AlphaTabBrowserTrackLike = { index: number; name?: string };

export type AlphaTabBrowserScoreLike = {
  tracks: AlphaTabBrowserTrackLike[];
  masterBars: Array<{
    index: number;
    start: number;
    timeSignatureNumerator?: number;
    calculateDuration(respectAnacrusis?: boolean): number;
  }>;
};
```

Add the remaining API members:

```ts
playPause?: () => void;
stop?: () => void;
tickPosition?: number;
timePosition?: number;
endTick?: number;
endTime?: number;
playbackSpeed?: number;
playbackRange?: { startTick: number; endTick: number } | null;
isLooping?: boolean;
renderTracks?: (tracks: AlphaTabBrowserTrackLike[]) => void;
changeTrackMute?: (tracks: AlphaTabBrowserTrackLike[], muted: boolean) => void;
changeTrackSolo?: (tracks: AlphaTabBrowserTrackLike[], solo: boolean) => void;
changeTrackVolume?: (tracks: AlphaTabBrowserTrackLike[], volume: number) => void;
playerReady?: AlphaTabEvent<void>;
playerStateChanged?: AlphaTabEvent<unknown>;
soundFontLoaded?: AlphaTabVoidEvent;
soundFontLoad?: AlphaTabEvent<{ loaded?: number; total?: number }>;
error?: AlphaTabEvent<unknown>;
loadSoundFontFromUrl?: (url: string, append: boolean) => void;
```

Define `AlphaTabEvent<T>` as `{ on(handler: (arg: T) => void): () => void }` and `AlphaTabVoidEvent` as `{ on(handler: () => void): () => void }`. Keep the existing position event type compatible.

- [ ] **Step 4: Implement model extraction**

In `alphaTabPlaybackAdapter.ts`, extract:

- tracks from `api.score.tracks`, with `id: "track-<index>"`, `sourceIndex`, and fallback name `轨道 <index + 1>`;
- one timeline measure per master bar;
- `startTick` from `masterBar.start`;
- `durationTicks` from `calculateDuration(true)`;
- beat boundaries by dividing duration into `timeSignatureNumerator ?? 4` equal segments;
- duration from `api.endTick`/`api.endTime`, falling back to the final measure end.

This beat mapping is only for first-slice snapping. It must remain inside the alphaTab adapter so a later exact beat lookup can replace it without changing `PlaybackController`.

- [ ] **Step 5: Implement the adapter and event cleanup**

The constructor accepts `(api: AlphaTabApiLike, soundFontUrl: string)`, snapshots source tracks when `api.score` already exists, refreshes the stable-ID map on `scoreLoaded`, and registers all available event emitters. Store every returned detach function in an array. Implement `PlaybackEngine` methods using only the façade fields from Step 3. `setTrackVolume` clamps to `0–1` before forwarding. `retrySoundFont()` emits `soundfont-loading` and calls `loadSoundFontFromUrl(soundFontUrl, false)`.

alphaTab 的 `AlphaTabApi` 没有公开独立的 SoundFont failure event。Adapter 在 `soundFontLoaded` 前收到 `api.error` 时映射为 `soundfont-error`；SoundFont 就绪后的 `api.error` 映射为普通 `error`。Map error values with:

```ts
function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}
```

Do not call `api.play`; use `playPause` so Controller owns toggle semantics.

- [ ] **Step 6: Export and verify**

Append:

```ts
export * from "./playback/alphaTabPlaybackAdapter";
```

to `web-core/src/index.ts`, then run:

```bash
pnpm test -- web-core/src/playback/alphaTabPlaybackAdapter.test.ts web-core/src/gp/alphaTabBrowser.test.ts
pnpm typecheck
```

Expected: focused tests PASS and TypeScript build PASS.

- [ ] **Step 7: Commit**

```bash
git add web-core/src/playback web-core/src/gp/alphaTabBrowser.ts web-core/src/gp/alphaTabBrowser.test.ts web-core/src/index.ts
git commit -m "feat: adapt alphatab playback engine"
```

---

### Task 5: Playback Controller State Machine

**Files:**

- Create: `web-core/src/playback/playbackController.ts`
- Create: `web-core/src/playback/playbackController.test.ts`
- Modify: `web-core/src/index.ts`

**Interfaces:**

- Consumes: `PlaybackEngine`, `PlaybackPersistence`, `SidecarPayload`, `PlaybackTimelineMap`, `PlaybackTrack`, `ScoreIdentity`.
- Produces:
  - `PlaybackController`
  - `PlaybackControllerOptions`
  - `subscribe(listener): () => void`
  - `initialize(): Promise<void>`
  - `dispatch(command): Promise<void>`
  - `flush(): Promise<void>`
  - `destroy(): Promise<void>`.

- [ ] **Step 1: Build a reusable fake engine and persistence in the test file**

The fake engine records method calls and exposes `emit(event)`. The fake persistence records sidecar and resume writes and can reject the next write. Use fixed dependencies:

```ts
let now = "2026-07-10T04:00:00Z";
const clock = { now: () => now };
const ids = { next: () => "loop-generated-1" };
```

Create a two-track model and a two-measure timeline matching Task 1.

- [ ] **Step 2: Write failing transport and session-isolation tests**

Tests must assert:

- `initialize()` loads sidecar/resume, applies speed/track settings, seeks to resume, and remains silent.
- `soundfont-ready` transitions `loading -> ready`.
- toggle from ready calls `playPause`; engine `transport` events are the only source of `playing/paused/stopped` state.
- retry from `soundFont: "error"` calls `retrySoundFont()` and returns to loading without reloading the score.
- stop calls `engine.stop()` and saves the resulting start position as local resume.
- position events update state and write resume at most once per five seconds.
- pause and destroy flush the latest resume immediately.
- events delivered after `destroy()` do not change state.
- events from an engine callback captured under a previous `sessionId` are ignored.

- [ ] **Step 3: Write failing loop and speed tests**

Tests must assert:

- score speed is clamped/snapped and forwarded to the engine;
- A/B commands apply the selected snap mode to a draft; save rejects incomplete drafts and creates a named region from a complete draft;
- selecting a loop calls `setLoop(range, true)`, seeks A, applies the override speed, and does not call play while stopped;
- selecting during playback calls `playPause` zero times and remains playing after seeking A;
- disabling a loop calls `setLoop(null, false)` and restores score speed;
- rename sets `labelSource: "user"`;
- delete creates a tombstone, disables the active loop, and persists;
- invalid or tombstoned loop IDs reject with a precise error.

- [ ] **Step 4: Write failing track and persistence tests**

Tests must assert:

- main/extra visible track changes call `setVisibleTracks` without changing mute/solo/volume;
- persisted missing track IDs are discarded;
- mute and volume mark sidecar unsaved, then write a debounced snapshot;
- solo calls the engine but never appears in sidecar writes;
- sidecar write failure sets `persistence: "error"` while playback still works;
- a later successful write returns persistence to `clean`.

- [ ] **Step 5: Run the complete controller test and verify failure**

```bash
pnpm test -- web-core/src/playback/playbackController.test.ts
```

Expected: FAIL because `PlaybackController` does not exist.

- [ ] **Step 6: Define explicit controller dependencies**

Create `web-core/src/playback/playbackController.ts` with this public constructor contract:

```ts
export type PlaybackControllerOptions = {
  sessionId: string;
  identity: ScoreIdentity;
  engine: PlaybackEngine;
  persistence: PlaybackPersistence;
  baseSidecar: SidecarPayload;
  tracks: PlaybackTrack[];
  timeline: PlaybackTimelineMap;
  clock?: { now(): string };
  ids?: { next(): string };
  schedule?: {
    set(delayMs: number, callback: () => void): unknown;
    clear(handle: unknown): void;
  };
};

export class PlaybackController {
  constructor(options: PlaybackControllerOptions);
  getState(): PlaybackState;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  initialize(): Promise<void>;
  dispatch(command: PlaybackCommand): Promise<void>;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}
```

Default `clock`, `ids`, and `schedule` use `new Date().toISOString()`, `crypto.randomUUID()`, `setTimeout`, and `clearTimeout`.

- [ ] **Step 7: Implement initialization and engine-event reduction**

Use a private immutable state snapshot and a `Set` of listeners. Every update creates new arrays/records before notifying listeners. Initialization order is:

1. subscribe to engine events and read `engine.getSnapshot()` so no earlier SoundFont event is lost;
2. read sidecar and local resume in parallel while transport remains `loading`;
3. filter settings against current track IDs;
4. apply visible tracks, mute, volume and score speed to the engine;
5. seek resume when present;
6. expose `ready` only after persistence initialization is complete and the cached/live SoundFont state is ready.

Capture `sessionId` in the engine callback and compare it to the controller's active session before reducing an event.

- [ ] **Step 8: Implement command handling and persistence scheduling**

Use a `switch (command.type)` with an exhaustive `never` check. Enforce the behavior from the approved design and Steps 2–4. Use:

- `300 ms` debounce for sidecar writes;
- `5000 ms` throttle for position writes;
- serialized promises for both write streams;
- immediate sidecar queueing for rename, delete and mute;
- immediate resume flush on pause, stop, destroy and file replacement.

`destroy()` must be idempotent. It flushes pending writes, detaches the engine subscription, destroys the engine, clears listeners and ignores all later commands.

- [ ] **Step 9: Export and verify**

Append:

```ts
export * from "./playback/playbackController";
```

to `web-core/src/index.ts`, then run:

```bash
pnpm test -- web-core/src/playback/playbackController.test.ts
pnpm check
```

Expected: all repository tests PASS and TypeScript build PASS.

- [ ] **Step 10: Commit**

```bash
git add web-core/src/playback web-core/src/index.ts
git commit -m "feat: add playback controller state machine"
```

---

### Task 6: Offline AlphaTab And SoundFont Assets

**Files:**

- Modify: `web-demo/rspack.config.mjs`
- Create: `web-demo/scripts/verify-assets.mjs`
- Modify: `web-demo/package.json`
- Create: `web-demo/src/playbackAssets.ts`
- Create: `web-demo/src/playbackAssets.test.ts`

**Interfaces:**

- Consumes: alphaTab distribution files from the locked pnpm dependency.
- Produces:
  - `/alphatab/alphaTab.mjs`
  - `/alphatab/font/*`
  - `/alphatab/soundfont/sonivox.sf3`
  - `/alphatab/soundfont/LICENSE`
  - `ALPHATAB_ASSETS` URL constants.

- [ ] **Step 1: Write the failing asset configuration test**

Create `web-demo/src/playbackAssets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ALPHATAB_ASSETS } from "./playbackAssets";

describe("alphaTab playback assets", () => {
  it("uses app-relative offline asset URLs", () => {
    expect(ALPHATAB_ASSETS).toEqual({
      scriptFile: "/alphatab/alphaTab.mjs",
      fontDirectory: "/alphatab/font/",
      soundFont: "/alphatab/soundfont/sonivox.sf3",
    });
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
pnpm test -- web-demo/src/playbackAssets.test.ts
```

Expected: FAIL because `playbackAssets.ts` does not exist.

- [ ] **Step 3: Add URL constants and CopyRspackPlugin**

Create `playbackAssets.ts` with the exact object asserted above and `as const`.

Import `CopyRspackPlugin` beside `HtmlRspackPlugin` in `rspack.config.mjs`. Add patterns that copy:

```js
new CopyRspackPlugin({
  patterns: [
    {
      from: fileURLToPath(new URL("../node_modules/@coderline/alphatab/dist/alphaTab.mjs", import.meta.url)),
      to: "alphatab/alphaTab.mjs",
    },
    {
      from: fileURLToPath(new URL("../node_modules/@coderline/alphatab/dist/font/", import.meta.url)),
      to: "alphatab/font/",
    },
    {
      from: fileURLToPath(new URL("../node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf3", import.meta.url)),
      to: "alphatab/soundfont/sonivox.sf3",
    },
    {
      from: fileURLToPath(new URL("../node_modules/@coderline/alphatab/dist/soundfont/LICENSE", import.meta.url)),
      to: "alphatab/soundfont/LICENSE",
    },
  ],
});
```

Keep the existing dev-server static mapping so development and production use identical URLs.

- [ ] **Step 4: Add a build asset verifier**

Create `web-demo/scripts/verify-assets.mjs` using `node:fs/promises` and `node:url`. It must call `stat()` for all four required paths, assert `sonivox.sf3` has non-zero size, and throw `Missing playback asset: <relative path>` on failure.

Change the demo build script to:

```json
"build": "rspack build && node ./scripts/verify-assets.mjs"
```

- [ ] **Step 5: Verify tests and production build**

```bash
pnpm test -- web-demo/src/playbackAssets.test.ts
pnpm demo:build
```

Expected: test PASS; build PASS; verifier confirms script, fonts, SoundFont and license in `web-demo/dist/alphatab/`.

- [ ] **Step 6: Commit**

```bash
git add web-demo/rspack.config.mjs web-demo/package.json web-demo/scripts web-demo/src/playbackAssets.ts web-demo/src/playbackAssets.test.ts
git commit -m "build: bundle offline alphatab playback assets"
```

---

### Task 7: Playback Presenter And Workbench Markup

**Files:**

- Create: `web-demo/src/playbackPresenter.ts`
- Create: `web-demo/src/playbackPresenter.test.ts`
- Modify: `web-demo/index.html`
- Modify: `web-demo/src/styles.css`

**Interfaces:**

- Consumes: `PlaybackState`.
- Produces:
  - `PlaybackViewModel`
  - `presentPlayback(state): PlaybackViewModel`
  - stable DOM IDs used by Task 8.

- [ ] **Step 1: Write failing presenter tests**

Tests must verify:

- milliseconds format as `m:ss` and never show `NaN`;
- play button label is `播放` for ready/paused/stopped and `暂停` for playing;
- play is disabled while SoundFont is not ready;
- active loop reports effective speed and selected state;
- tombstoned loops are absent;
- tracks expose independent `primary`, `additional`, `muted`, `solo`, and `volume` flags;
- persistence errors produce `练习设置尚未保存` without replacing score-load errors.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm test -- web-demo/src/playbackPresenter.test.ts
```

Expected: FAIL because the presenter does not exist.

- [ ] **Step 3: Define and implement the view model**

Use this public structure:

```ts
export type PlaybackViewModel = {
  playLabel: "播放" | "暂停";
  playDisabled: boolean;
  stopDisabled: boolean;
  currentTime: string;
  duration: string;
  progress: number;
  speedPercent: number;
  looping: boolean;
  loopDraftStart: number;
  loopDraftEnd: number;
  loopSnapMode: "off" | "beat" | "measure";
  soundFontRetryVisible: boolean;
  persistenceMessage: string;
  loops: Array<{
    id: string;
    label: string;
    rangeLabel: string;
    speedPercent?: number;
    selected: boolean;
  }>;
  tracks: Array<{
    id: string;
    name: string;
    primary: boolean;
    additional: boolean;
    muted: boolean;
    solo: boolean;
    volumePercent: number;
  }>;
};
```

Clamp `progress`, `loopDraftStart`, and `loopDraftEnd` to `0–1`. Format loop ranges with one-based measure numbers. Use `Math.round(speed * 100)` and `Math.round(volume * 100)`. Show SoundFont retry only for `soundFont: "error"`.

- [ ] **Step 4: Replace the page shell with stable workbench regions**

Update `web-demo/index.html` to contain:

- existing file picker and status;
- `#play-toggle`, `#play-stop`, `#play-current-time`, `#play-duration`;
- `#play-progress` range input with `min="0"`, `max="1000"`, `step="1"`;
- `#play-speed` range input with `min="25"`, `max="200"`, `step="5"` and `#play-speed-value`;
- `#loop-enabled`, `#loop-set-a`, `#loop-set-b`, and `#loop-snap-mode`;
- `#loop-start` and `#loop-end` range inputs for correcting draft boundaries, plus `#loop-save`;
- `#soundfont-retry`, hidden unless SoundFont loading failed;
- `#loop-list` and `#track-list` containers;
- `#playback-persistence-status` with `aria-live="polite"`;
- existing `#alpha-tab` score host.

Use native buttons, range inputs, checkbox and select controls with explicit `<label>` elements. Every icon-like button must have visible text or `aria-label` plus `title`.

- [ ] **Step 5: Add responsive workbench CSS**

Use a three-row shell: file/summary header, fixed transport toolbar, and viewer workspace. Desktop workspace uses `minmax(0, 1fr) 280px`; the right inspector contains unframed loop and track sections separated by borders. At `max-width: 800px`, move inspector below the score and expose `details/summary` disclosure controls. Keep cards at `8px` radius or less, prevent toolbar controls from changing height, and ensure long Chinese track names wrap without overlapping sliders.

- [ ] **Step 6: Verify presenter and current UI tests**

```bash
pnpm test -- web-demo/src/playbackPresenter.test.ts web-demo/src/demoApp.test.ts
pnpm typecheck
```

Expected: presenter tests PASS; existing Demo tests remain PASS; TypeScript build PASS.

- [ ] **Step 7: Commit**

```bash
git add web-demo/index.html web-demo/src/playbackPresenter.ts web-demo/src/playbackPresenter.test.ts web-demo/src/styles.css
git commit -m "feat: add playback practice workbench ui"
```

---

### Task 8: Bind GP Loading, Controller, And UI Commands

**Files:**

- Create: `web-demo/src/playbackControls.ts`
- Create: `web-demo/src/playbackControls.test.ts`
- Modify: `web-demo/src/demoApp.ts`
- Modify: `web-demo/src/demoApp.test.ts`
- Modify: `web-demo/src/gpDemoPresenter.ts`
- Modify: `web-demo/src/gpDemoPresenter.test.ts`

**Interfaces:**

- Consumes: `PlaybackController`, `AlphaTabPlaybackAdapter`, `BridgePlaybackPersistence`, `MockNativeBridge`, `presentPlayback`, `ALPHATAB_ASSETS`.
- Produces:
  - `mountPlaybackControls(document, controller, timeline): () => void`
  - one active playback session per selected file.

- [ ] **Step 1: Write failing control-binding tests**

With jsdom and a fake controller, assert:

- play, stop, speed, progress, loop toggle, A/B, snap mode and track controls dispatch the exact command objects;
- SoundFont retry dispatches `retry-soundfont`;
- loop save, rename, delete and speed override dispatch their exact commands;
- progress drag uses current duration/timeline mapping and dispatches a `MusicalPosition`;
- selecting a saved loop dispatches `select-loop` but no playback command;
- changing a slider uses `input` for immediate UI and `change` for the final command;
- the unsubscribe returned by `mountPlaybackControls` removes all DOM and controller listeners.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm test -- web-demo/src/playbackControls.test.ts
```

Expected: FAIL because control binding does not exist.

- [ ] **Step 3: Implement render and event delegation**

Create `playbackControls.ts`. Query every ID established in Task 7 and throw `Playback DOM is missing: <id>` for a missing required element. Subscribe to Controller, call `presentPlayback`, update scalar controls, then render loop and track rows with DOM APIs rather than interpolating user-provided labels into `innerHTML`.

Use event delegation on `#loop-list` and `#track-list` with `data-action`, `data-loop-id`, and `data-track-id`. Clamp all numeric values before dispatch. Return one cleanup function that removes event listeners and unsubscribes from Controller.

- [ ] **Step 4: Make GP presentation return reusable bytes and score data**

Change `presentGpFile` ready state to also return:

```ts
bytes: Uint8Array;
score: AlphaTabScoreLike;
```

Populate `identity.sourceHints.trackNames` from score tracks when names are available. Keep all existing error messages and encoding detection behavior.

- [ ] **Step 5: Create the playback-enabled alphaTab API**

In `demoApp.ts`, use `ALPHATAB_ASSETS` and add this player configuration:

```ts
player: {
  enablePlayer: true,
  soundFont: ALPHATAB_ASSETS.soundFont,
},
```

Keep `useWorkers: false` for the first Browser Demo slice. Set script and font URLs from `ALPHATAB_ASSETS`.

- [ ] **Step 6: Replace session lifecycle in Demo App**

Maintain one local session object containing API, adapter, controller and control cleanup. On each file change:

1. await previous controller `destroy()` and run previous cleanup;
2. create a fresh alphaTab API and adapter;
3. read bytes, detect encoding and load the GP file;
4. wait for score model extraction;
5. create `BridgePlaybackPersistence` over a demo-scoped `MockNativeBridge`;
6. create and initialize `PlaybackController` with a new `crypto.randomUUID()` session ID;
7. mount controls and render ready score summary;
8. on failure, destroy the partial session before rendering error state.

Register `pagehide` to call controller `destroy()` once. Do not autoplay after initialization or loop selection.

- [ ] **Step 7: Add lifecycle and integration tests**

Extend `demoApp.test.ts` to inject factories for alphaTab API, adapter, controller and UUID. Prove:

- choosing a second file destroys the first session before creating the second;
- an initialization failure leaves no subscribed session;
- `pagehide` flushes and destroys the current session;
- SoundFont loading leaves score summary visible and play disabled;
- SoundFont failure shows an audio-specific recoverable error without clearing the rendered score.

Update `gpDemoPresenter.test.ts` for returned bytes, score and track names.

- [ ] **Step 8: Verify the complete Web Demo slice**

```bash
pnpm test -- web-demo/src/playbackControls.test.ts web-demo/src/demoApp.test.ts web-demo/src/gpDemoPresenter.test.ts
pnpm check
pnpm demo:build
```

Expected: all tests PASS; typecheck PASS; production build and asset verification PASS.

- [ ] **Step 9: Commit**

```bash
git add web-demo/src web-demo/index.html
git commit -m "feat: connect GP playback practice controls"
```

---

### Task 9: Documentation And Real-File Acceptance

**Files:**

- Modify: `docs/architecture/browser-demo-alphatab-dom-rendering.md`
- Modify: `docs/architecture/implementation-foundation.md`
- Create: `docs/architecture/gp-playback-practice-acceptance.md`

**Interfaces:**

- Consumes: completed Browser Demo behavior and build commands.
- Produces: reproducible build/try instructions and a recorded real-file acceptance matrix.

- [ ] **Step 1: Update build and usage documentation**

Document these exact commands:

```bash
pnpm install
pnpm check
pnpm demo:build
pnpm demo:dev
```

State that the dev server defaults to `http://127.0.0.1:5173`, files remain local in the browser, and the bundled SoundFont supports offline playback after app assets load.

- [ ] **Step 2: Create the acceptance matrix**

Create `docs/architecture/gp-playback-practice-acceptance.md` with rows for:

- GP3 with Chinese title/track names;
- GP4;
- GP5 multi-track;
- GPX;
- GP;
- one simple single-track score;
- one score with at least three tracks;
- Chinese file name;
- malformed GP file.

Columns must be: format/sample, render, SoundFont ready, play/pause/stop, seek, speed, named loops, track display, mute/solo/volume, reopen restore, result, notes. Use `未执行` as the initial result instead of an ambiguous blank.

- [ ] **Step 3: Run automated verification**

```bash
pnpm check
pnpm demo:build
```

Expected: TypeScript PASS, all Vitest tests PASS, Rspack build PASS, asset verifier PASS.

- [ ] **Step 4: Start the demo and perform real-file checks**

```bash
pnpm demo:dev
```

Open `http://127.0.0.1:5173`. For every available fixture row, exercise all applicable columns and replace `未执行` with `通过` or `失败`. For unavailable fixture formats, leave `未执行` and state the missing sample in notes. Verify no browser console errors during a passing row.

- [ ] **Step 5: Final diff and scope review**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only files listed in this plan are changed; no SoundFont binary is staged from outside build output; `web-demo/dist/` remains ignored.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture
git commit -m "docs: add GP playback practice acceptance guide"
```

---

## Final Verification Checklist

- [ ] `pnpm check` passes.
- [ ] `pnpm demo:build` passes and verifies offline assets.
- [ ] SoundFont and license exist in `web-demo/dist/alphatab/soundfont/` but are not committed as duplicate source assets.
- [ ] Playback never starts without a user action.
- [ ] Selecting a loop seeks to A and enables looping without starting from rest.
- [ ] Score speed and per-loop speed override restore correctly.
- [ ] Main/additional display tracks are independent from mute/solo/volume.
- [ ] Solo does not appear in serialized sidecar data.
- [ ] Resume position is read/written separately from sidecar.
- [ ] Switching files destroys the previous session and ignores late events.
- [ ] SoundFont failure leaves notation readable.
- [ ] Real-file acceptance results are recorded honestly; unavailable fixtures remain marked `未执行`.
