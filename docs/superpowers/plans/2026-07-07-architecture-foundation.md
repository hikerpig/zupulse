# Architecture Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Viewer 第一版的可测试架构基础：TypeScript Web Core、Score Model schema、Bridge API 协议、sidecar/storage 合约和一个端到端 mock 打开文件流程。

**Architecture:** 第一阶段只实现跨端共享核心，不实现真实 GP 渲染、真实 MIDI 转谱、SwiftUI 壳层或 CloudKit。Web Core 用 TypeScript 暴露稳定 schema 和纯函数；Native Shell 相关能力先通过 typed Bridge mock 表达，后续 Apple Shell 和 Windows Shell 都消费同一协议。

**Tech Stack:** TypeScript、Vitest、Node.js Web Crypto、SQLite schema SQL、JSON sidecar payload、WebView Bridge typed messages。

## Global Constraints

- 使用中文写文档。
- 本地文件优先，不把上传原始谱文件作为第一版核心能力。
- GP 与 MIDI 平权，但承认两者技术性质不同：GP 是结构化乐谱文件，MIDI 是演奏事件流。
- 渲染和交互核心尽量跨端复用，平台壳层只负责系统能力。
- 第一版允许轻编辑，但所有修改保存到 sidecar，不直接改原始文件。
- 播放引擎可替换：MVP 先打通 Web Audio / SoundFont，后续可替换或增强为原生音频桥。
- 第一版支持 Guitar Pro：`.gp3`、`.gp4`、`.gp5`、`.gpx`、`.gp`。
- 第一版支持 MIDI：`.mid`、`.midi`。
- Score Model 采用中等厚度：渲染、播放和练习层主要依赖统一模型，但不追求完整制谱级模型。
- Bridge API 采用混合风格：RPC 用于文件、sidecar、权限、安全书签、同步拉取和推送；事件流用于播放状态、当前小节、同步状态、错误状态和用户交互。
- sidecar 绑定 `ScoreIdentity`，而不是绑定单一路径。
- 本地存储采用 SQLite + JSON sidecar payload。
- macOS 与 iOS 第一版优先使用 iCloud / CloudKit 或等价 Apple 系统同步能力；Sync Layer 对 Web Viewer Core 暴露抽象接口，不暴露 CloudKit 细节。
- 第一版不同步原始谱文件。
- 第一版不 fork alphaTab，优先使用公共 API、配置项、wrapper、adapter、上游 issue / PR。

---

## Scope Check

当前架构文档覆盖 GP 渲染、MIDI Analyzer、Apple Native Shell、CloudKit、音频后端和存储同步多个独立子系统。这个计划只实现第一个可独立验收的基础切片：

- TypeScript workspace 和测试基建。
- Score Model 与 sidecar 类型。
- 文件格式识别与内容指纹。
- Bridge API typed RPC / event message。
- SQLite schema 文本与 sidecar JSON codec。
- 使用 mock native bridge 打通“打开文件 -> 识别 -> 生成 identity -> 读取 sidecar -> 产出 viewer session”的流程。

后续应另写计划：

- GP Adapter + alphaTab vertical slice。
- MIDI Analyzer heuristic + 测试素材。
- SwiftUI / WKWebView Apple Shell。
- CloudKit Sync Adapter。
- Playback Engine + Web Audio MVP。

## File Structure

- Create: `package.json`  
  定义 workspace 脚本、开发依赖和测试入口。
- Create: `tsconfig.json`  
  TypeScript 全局编译配置。
- Create: `web-core/package.json`  
  Web Core 包配置。
- Create: `web-core/tsconfig.json`  
  Web Core 编译配置。
- Create: `web-core/src/index.ts`  
  Web Core 对外导出入口。
- Create: `web-core/src/score/types.ts`  
  Score Model、ScoreIdentity、SidecarPayload 等共享类型。
- Create: `web-core/src/score/format.ts`  
  文件格式识别。
- Create: `web-core/src/score/identity.ts`  
  内容 hash 与 ScoreIdentity 创建。
- Create: `web-core/src/score/session.ts`  
  打开文件后的 ViewerSession 聚合。
- Create: `web-core/src/bridge/types.ts`  
  Bridge message、RPC、event、capability 类型。
- Create: `web-core/src/bridge/mockNativeBridge.ts`  
  测试用 Native Bridge mock。
- Create: `web-core/src/storage/sidecar.ts`  
  sidecar payload 默认值、编码、解析、版本校验。
- Create: `web-core/src/storage/sqliteSchema.ts`  
  SQLite schema 字符串和 schema 校验辅助。
- Test: `web-core/src/**/*.test.ts`  
  每个模块的 Vitest 单元测试。

## Task 1: TypeScript Web Core Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `web-core/package.json`
- Create: `web-core/tsconfig.json`
- Create: `web-core/src/index.ts`
- Test: `web-core/src/index.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `const WEB_CORE_VERSION: string`

- [ ] **Step 1: Write the failing test**

Create `web-core/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { WEB_CORE_VERSION } from "./index";

describe("web core package", () => {
  it("exposes a stable package version marker", () => {
    expect(WEB_CORE_VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 2: Add workspace package files**

Create `package.json`:

```json
{
  "name": "tab-viewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -b",
    "check": "pnpm typecheck && pnpm test"
  },
  "workspaces": [
    "web-core"
  ],
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    {
      "path": "./web-core"
    }
  ]
}
```

Create `web-core/package.json`:

```json
{
  "name": "@tab-viewer/web-core",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

Create `web-core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "types": [
      "node",
      "vitest"
    ]
  },
  "include": [
    "src/**/*.ts"
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm install
pnpm test -- web-core/src/index.test.ts
```

Expected: FAIL with an import error because `web-core/src/index.ts` does not export `WEB_CORE_VERSION`.

- [ ] **Step 4: Write minimal implementation**

Create `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";
```

- [ ] **Step 5: Run test and typecheck**

Run:

```bash
pnpm check
```

Expected: PASS. Vitest reports `1 passed`; TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json web-core/package.json web-core/tsconfig.json web-core/src/index.ts web-core/src/index.test.ts
git commit -m "chore: scaffold web core workspace"
```

## Task 2: Score Types And Format Detection

**Files:**
- Create: `web-core/src/score/types.ts`
- Create: `web-core/src/score/format.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/score/format.test.ts`

**Interfaces:**
- Consumes:
  - `WEB_CORE_VERSION: string`
- Produces:
  - `type ScoreFormat = "gp" | "midi"`
  - `type SupportedExtension = ".gp3" | ".gp4" | ".gp5" | ".gpx" | ".gp" | ".mid" | ".midi"`
  - `function detectScoreFormat(fileName: string): ScoreFormat`
  - `function isSupportedScoreFile(fileName: string): boolean`
  - `class UnsupportedScoreFormatError extends Error`

- [ ] **Step 1: Write the failing tests**

Create `web-core/src/score/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  UnsupportedScoreFormatError,
  detectScoreFormat,
  isSupportedScoreFile,
} from "./format";

describe("detectScoreFormat", () => {
  it("detects supported Guitar Pro extensions case-insensitively", () => {
    expect(detectScoreFormat("song.gp3")).toBe("gp");
    expect(detectScoreFormat("song.GP4")).toBe("gp");
    expect(detectScoreFormat("song.gp5")).toBe("gp");
    expect(detectScoreFormat("song.gpx")).toBe("gp");
    expect(detectScoreFormat("song.gp")).toBe("gp");
  });

  it("detects supported MIDI extensions case-insensitively", () => {
    expect(detectScoreFormat("lesson.mid")).toBe("midi");
    expect(detectScoreFormat("lesson.MIDI")).toBe("midi");
  });

  it("rejects unsupported extensions", () => {
    expect(() => detectScoreFormat("chart.pdf")).toThrow(UnsupportedScoreFormatError);
  });
});

describe("isSupportedScoreFile", () => {
  it("returns true only for first-version score formats", () => {
    expect(isSupportedScoreFile("riff.gp5")).toBe(true);
    expect(isSupportedScoreFile("piano.mid")).toBe(true);
    expect(isSupportedScoreFile("scan.pdf")).toBe(false);
    expect(isSupportedScoreFile("archive.zip")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-core/src/score/format.test.ts
```

Expected: FAIL with module not found for `./format`.

- [ ] **Step 3: Write minimal implementation**

Create `web-core/src/score/types.ts`:

```ts
export type ScoreFormat = "gp" | "midi";

export type SupportedExtension =
  | ".gp3"
  | ".gp4"
  | ".gp5"
  | ".gpx"
  | ".gp"
  | ".mid"
  | ".midi";

export type ScoreIdentity = {
  contentHash: string;
  format: ScoreFormat;
  title?: string;
  artist?: string;
  durationMs?: number;
  sourceHints?: {
    fileName?: string;
    trackNames?: string[];
    tempoSummary?: string;
  };
};

export type ScoreSource = {
  fileName: string;
  sizeBytes: number;
  format: ScoreFormat;
};

export type ScoreSummary = {
  title: string;
  trackCount: number;
  durationMs?: number;
};

export type TimeSignature = {
  numerator: number;
  denominator: number;
};

export type TrackPlaybackSettings = {
  muted: boolean;
  solo: boolean;
  volume: number;
};

export type Staff = {
  id: string;
  measures: Measure[];
};

export type Beat = {
  id: string;
  startTick: number;
  durationTicks: number;
  notes: Note[];
};

export type MeasureAnalysis = {
  hasQuantizationWarning: boolean;
  hasOverlappingNotes: boolean;
  isReadableAsNotation: boolean;
};

export type Note = {
  id: string;
  pitch?: number;
  string?: number;
  fret?: number;
  startTick: number;
  durationTicks: number;
  velocity?: number;
  tie?: "start" | "continue" | "end";
  hand?: "left" | "right" | "unknown";
};

export type Measure = {
  id: string;
  index: number;
  startTick: number;
  durationTicks: number;
  timeSignature: TimeSignature;
  beats: Beat[];
  analysis?: MeasureAnalysis;
};

export type Track = {
  id: string;
  name: string;
  instrument?: string;
  channel?: number;
  staves: Staff[];
  playback: TrackPlaybackSettings;
};

export type PlaybackTimeline = {
  ticksPerQuarter: number;
  durationTicks: number;
  durationMs?: number;
};

export type Section = {
  id: string;
  name: string;
  startTick: number;
  endTick: number;
};

export type SourceExtensions = {
  gp?: Record<string, unknown>;
  midi?: Record<string, unknown>;
};

export type ScoreDocument = {
  schemaVersion: string;
  identity: ScoreIdentity;
  source: ScoreSource;
  summary: ScoreSummary;
  tracks: Track[];
  timeline: PlaybackTimeline;
  sections: Section[];
  extensions?: SourceExtensions;
};
```

Create `web-core/src/score/format.ts`:

```ts
import type { ScoreFormat, SupportedExtension } from "./types";

const GP_EXTENSIONS = new Set<SupportedExtension>([".gp3", ".gp4", ".gp5", ".gpx", ".gp"]);
const MIDI_EXTENSIONS = new Set<SupportedExtension>([".mid", ".midi"]);

export class UnsupportedScoreFormatError extends Error {
  constructor(fileName: string) {
    super(`Unsupported score format for file: ${fileName}`);
    this.name = "UnsupportedScoreFormatError";
  }
}

export function detectScoreFormat(fileName: string): ScoreFormat {
  const extension = getLowercaseExtension(fileName);

  if (GP_EXTENSIONS.has(extension as SupportedExtension)) {
    return "gp";
  }

  if (MIDI_EXTENSIONS.has(extension as SupportedExtension)) {
    return "midi";
  }

  throw new UnsupportedScoreFormatError(fileName);
}

export function isSupportedScoreFile(fileName: string): boolean {
  try {
    detectScoreFormat(fileName);
    return true;
  } catch (error) {
    if (error instanceof UnsupportedScoreFormatError) {
      return false;
    }
    throw error;
  }
}

function getLowercaseExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) {
    return "";
  }
  return fileName.slice(lastDot).toLowerCase();
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
```

- [ ] **Step 4: Run test and typecheck**

Run:

```bash
pnpm check
```

Expected: PASS. Format tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add web-core/src/index.ts web-core/src/score/types.ts web-core/src/score/format.ts web-core/src/score/format.test.ts
git commit -m "feat: add score format detection"
```

## Task 3: Score Identity From Content Fingerprint

**Files:**
- Create: `web-core/src/score/identity.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/score/identity.test.ts`

**Interfaces:**
- Consumes:
  - `detectScoreFormat(fileName: string): ScoreFormat`
  - `type ScoreIdentity`
- Produces:
  - `function createContentHash(bytes: Uint8Array): Promise<string>`
  - `function createScoreIdentity(input: { fileName: string; bytes: Uint8Array; title?: string; artist?: string; durationMs?: number; trackNames?: string[]; tempoSummary?: string }): Promise<ScoreIdentity>`

- [ ] **Step 1: Write the failing tests**

Create `web-core/src/score/identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createContentHash, createScoreIdentity } from "./identity";

describe("createContentHash", () => {
  it("creates a stable sha-256 hex hash", async () => {
    const bytes = new TextEncoder().encode("same score bytes");

    await expect(createContentHash(bytes)).resolves.toBe(
      "fe8e4d1525a2508eade49e8f394ddf5bb12dfeca0aa0426f2533d2d3c9b4b396",
    );
  });
});

describe("createScoreIdentity", () => {
  it("uses content hash as primary identity and format from file name", async () => {
    const bytes = new TextEncoder().encode("midi bytes");

    const identity = await createScoreIdentity({
      fileName: "Etude.MID",
      bytes,
      title: "Etude",
      trackNames: ["Piano"],
      tempoSummary: "120 bpm",
    });

    expect(identity).toEqual({
      contentHash: "9a860552822c2458da284714e00641663d9add23b59a2394d4b73a14a8dc80de",
      format: "midi",
      title: "Etude",
      sourceHints: {
        fileName: "Etude.MID",
        trackNames: ["Piano"],
        tempoSummary: "120 bpm",
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-core/src/score/identity.test.ts
```

Expected: FAIL with module not found for `./identity`.

- [ ] **Step 3: Write minimal implementation**

Create `web-core/src/score/identity.ts`:

```ts
import { createHash } from "node:crypto";
import { detectScoreFormat } from "./format";
import type { ScoreIdentity } from "./types";

export async function createContentHash(bytes: Uint8Array): Promise<string> {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function createScoreIdentity(input: {
  fileName: string;
  bytes: Uint8Array;
  title?: string;
  artist?: string;
  durationMs?: number;
  trackNames?: string[];
  tempoSummary?: string;
}): Promise<ScoreIdentity> {
  const identity: ScoreIdentity = {
    contentHash: await createContentHash(input.bytes),
    format: detectScoreFormat(input.fileName),
  };

  if (input.title !== undefined) {
    identity.title = input.title;
  }
  if (input.artist !== undefined) {
    identity.artist = input.artist;
  }
  if (input.durationMs !== undefined) {
    identity.durationMs = input.durationMs;
  }

  const sourceHints: NonNullable<ScoreIdentity["sourceHints"]> = {
    fileName: input.fileName,
  };
  if (input.trackNames !== undefined) {
    sourceHints.trackNames = input.trackNames;
  }
  if (input.tempoSummary !== undefined) {
    sourceHints.tempoSummary = input.tempoSummary;
  }
  identity.sourceHints = sourceHints;

  return identity;
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
```

- [ ] **Step 4: Run test and typecheck**

Run:

```bash
pnpm check
```

Expected: PASS. Identity tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add web-core/src/index.ts web-core/src/score/identity.ts web-core/src/score/identity.test.ts
git commit -m "feat: create score identity from content hash"
```

## Task 4: Bridge API Types And Mock Native Bridge

**Files:**
- Create: `web-core/src/bridge/types.ts`
- Create: `web-core/src/bridge/mockNativeBridge.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/bridge/mockNativeBridge.test.ts`

**Interfaces:**
- Consumes:
  - `type ScoreIdentity`
- Produces:
  - `type BridgeMessage<TPayload>`
  - `type BridgeError`
  - `type Capabilities`
  - `type OpenFileRequest`
  - `type OpenFileResponse`
  - `type ReadSidecarRequest`
  - `type WriteSidecarRequest`
  - `type SyncRequest`
  - `type PlaybackStateEvent`
  - `type SyncStateEvent`
  - `type ViewerInteractionEvent`
  - `class MockNativeBridge`
  - `MockNativeBridge.rpc<TResponse>(type: string, payload: unknown): Promise<TResponse>`
  - `MockNativeBridge.emit<TPayload>(type: string, payload: TPayload): void`
  - `MockNativeBridge.events(): BridgeMessage<unknown>[]`

- [ ] **Step 1: Write the failing test**

Create `web-core/src/bridge/mockNativeBridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "./mockNativeBridge";
import type { Capabilities, OpenFileResponse } from "./types";

describe("MockNativeBridge", () => {
  it("responds to capability discovery with platform-neutral capabilities", async () => {
    const bridge = new MockNativeBridge();

    const capabilities = await bridge.rpc<Capabilities>("capabilities.get", {});

    expect(capabilities).toEqual({
      fileAccess: {
        externalReferences: true,
        securityBookmarks: true,
        localLibraryImport: true,
      },
      storage: {
        sqliteIndex: true,
        sidecarPayload: true,
      },
      sync: {
        available: true,
        provider: "cloudkit",
      },
      audio: {
        webAudio: true,
        nativeBridge: false,
      },
    });
  });

  it("can return a registered file response", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFile("file-1", {
      fileToken: "file-1",
      fileName: "riff.gp5",
      sizeBytes: 16,
    });

    const response = await bridge.rpc<OpenFileResponse>("file.open", {
      fileRef: "file-1",
      mode: "external-reference",
    });

    expect(response.fileName).toBe("riff.gp5");
  });

  it("records event messages with correlation ids", () => {
    const bridge = new MockNativeBridge();

    bridge.emit("playback.state", {
      state: "paused",
      positionMs: 1200,
    });

    expect(bridge.events()).toHaveLength(1);
    expect(bridge.events()[0]).toMatchObject({
      bridgeVersion: "0.1.0",
      type: "playback.state",
      payload: {
        state: "paused",
        positionMs: 1200,
      },
    });
    expect(bridge.events()[0]?.correlationId).toMatch(/^mock-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-core/src/bridge/mockNativeBridge.test.ts
```

Expected: FAIL with module not found for `./mockNativeBridge`.

- [ ] **Step 3: Write Bridge API types**

Create `web-core/src/bridge/types.ts`:

```ts
import type { ScoreIdentity } from "../score/types";

export type BridgeMessage<TPayload> = {
  bridgeVersion: string;
  type: string;
  correlationId: string;
  payload: TPayload;
};

export type BridgeError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: unknown;
};

export type Capabilities = {
  fileAccess: {
    externalReferences: boolean;
    securityBookmarks: boolean;
    localLibraryImport: boolean;
  };
  storage: {
    sqliteIndex: boolean;
    sidecarPayload: boolean;
  };
  sync: {
    available: boolean;
    provider: "cloudkit" | "none" | "custom";
  };
  audio: {
    webAudio: boolean;
    nativeBridge: boolean;
  };
};

export type OpenFileRequest = {
  fileRef: string;
  mode: "external-reference" | "local-library-copy";
};

export type OpenFileResponse = {
  fileToken: string;
  fileName: string;
  sizeBytes: number;
  contentHash?: string;
};

export type ReadSidecarRequest = {
  identity: ScoreIdentity;
};

export type WriteSidecarRequest = {
  identity: ScoreIdentity;
  payload: unknown;
};

export type SyncRequest = {
  identity?: ScoreIdentity;
  reason: "startup" | "manual" | "sidecar-updated";
};

export type PlaybackStateEvent = {
  state: "idle" | "loading" | "playing" | "paused" | "stopped" | "error";
  positionMs: number;
  currentMeasureId?: string;
  currentNoteIds?: string[];
};

export type SyncStateEvent = {
  state: "idle" | "syncing" | "conflict" | "error";
  lastSyncedAt?: string;
  identity?: ScoreIdentity;
};

export type ViewerInteractionEvent = {
  action:
    | "section-created"
    | "loop-changed"
    | "annotation-updated"
    | "midi-quantization-updated"
    | "midi-measure-corrected";
  identity: ScoreIdentity;
  payload: unknown;
};
```

- [ ] **Step 4: Write mock bridge implementation**

Create `web-core/src/bridge/mockNativeBridge.ts`:

```ts
import type { BridgeMessage, Capabilities, OpenFileRequest, OpenFileResponse } from "./types";

const DEFAULT_CAPABILITIES: Capabilities = {
  fileAccess: {
    externalReferences: true,
    securityBookmarks: true,
    localLibraryImport: true,
  },
  storage: {
    sqliteIndex: true,
    sidecarPayload: true,
  },
  sync: {
    available: true,
    provider: "cloudkit",
  },
  audio: {
    webAudio: true,
    nativeBridge: false,
  },
};

export class MockNativeBridge {
  private readonly fileResponses = new Map<string, OpenFileResponse>();
  private readonly eventMessages: BridgeMessage<unknown>[] = [];
  private nextId = 1;

  registerFile(fileRef: string, response: OpenFileResponse): void {
    this.fileResponses.set(fileRef, response);
  }

  async rpc<TResponse>(type: string, payload: unknown): Promise<TResponse> {
    if (type === "capabilities.get") {
      return DEFAULT_CAPABILITIES as TResponse;
    }

    if (type === "file.open") {
      const request = payload as OpenFileRequest;
      const response = this.fileResponses.get(request.fileRef);
      if (response === undefined) {
        throw new Error(`No mock file registered for ref: ${request.fileRef}`);
      }
      return response as TResponse;
    }

    throw new Error(`Unsupported mock RPC: ${type}`);
  }

  emit<TPayload>(type: string, payload: TPayload): void {
    this.eventMessages.push({
      bridgeVersion: "0.1.0",
      type,
      correlationId: `mock-${this.nextId++}`,
      payload,
    });
  }

  events(): BridgeMessage<unknown>[] {
    return [...this.eventMessages];
  }
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
export * from "./bridge/types";
export * from "./bridge/mockNativeBridge";
```

- [ ] **Step 5: Run test and typecheck**

Run:

```bash
pnpm check
```

Expected: PASS. Bridge tests pass and TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add web-core/src/index.ts web-core/src/bridge/types.ts web-core/src/bridge/mockNativeBridge.ts web-core/src/bridge/mockNativeBridge.test.ts
git commit -m "feat: define bridge api contract"
```

## Task 5: Sidecar Codec And SQLite Schema Contract

**Files:**
- Create: `web-core/src/storage/sidecar.ts`
- Create: `web-core/src/storage/sqliteSchema.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/storage/sidecar.test.ts`
- Test: `web-core/src/storage/sqliteSchema.test.ts`

**Interfaces:**
- Consumes:
  - `type ScoreIdentity`
  - `type Section`
- Produces:
  - `const SIDECAR_SCHEMA_VERSION: "0.1.0"`
  - `type LoopRange`
  - `type Annotation`
  - `type TrackOverride`
  - `type QuantizationSettings`
  - `type MidiMeasureCorrection`
  - `type SidecarPayload`
  - `function createDefaultSidecar(identity: ScoreIdentity): SidecarPayload`
  - `function encodeSidecar(payload: SidecarPayload): string`
  - `function decodeSidecar(json: string): SidecarPayload`
  - `const SQLITE_SCHEMA: string`
  - `function requiredSqliteTables(): string[]`

- [ ] **Step 1: Write sidecar failing tests**

Create `web-core/src/storage/sidecar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultSidecar, decodeSidecar, encodeSidecar } from "./sidecar";
import type { ScoreIdentity } from "../score/types";

const identity: ScoreIdentity = {
  contentHash: "abc123",
  format: "midi",
  title: "Etude",
  sourceHints: {
    fileName: "etude.mid",
  },
};

describe("sidecar codec", () => {
  it("creates default sidecar payload bound to score identity", () => {
    expect(createDefaultSidecar(identity)).toEqual({
      schemaVersion: "0.1.0",
      identity,
      practice: {
        loops: [],
        sections: [],
        annotations: [],
      },
      tracks: {},
    });
  });

  it("round-trips sidecar JSON", () => {
    const payload = createDefaultSidecar(identity);
    const decoded = decodeSidecar(encodeSidecar(payload));

    expect(decoded).toEqual(payload);
  });

  it("rejects unsupported sidecar schema version", () => {
    const json = JSON.stringify({
      ...createDefaultSidecar(identity),
      schemaVersion: "9.9.9",
    });

    expect(() => decodeSidecar(json)).toThrow("Unsupported sidecar schema version: 9.9.9");
  });
});
```

- [ ] **Step 2: Write SQLite schema failing tests**

Create `web-core/src/storage/sqliteSchema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SQLITE_SCHEMA, requiredSqliteTables } from "./sqliteSchema";

describe("SQLITE_SCHEMA", () => {
  it("contains the first-version local index tables", () => {
    expect(requiredSqliteTables()).toEqual(["scores", "file_refs", "sidecars", "score_index"]);

    for (const table of requiredSqliteTables()) {
      expect(SQLITE_SCHEMA).toContain(`CREATE TABLE ${table}`);
    }
  });

  it("stores sidecar payload as JSON text", () => {
    expect(SQLITE_SCHEMA).toContain("payload_json TEXT NOT NULL");
    expect(SQLITE_SCHEMA).toContain("schema_version TEXT NOT NULL");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm test -- web-core/src/storage/sidecar.test.ts web-core/src/storage/sqliteSchema.test.ts
```

Expected: FAIL with module not found for `./sidecar` and `./sqliteSchema`.

- [ ] **Step 4: Write sidecar implementation**

Create `web-core/src/storage/sidecar.ts`:

```ts
import type { ScoreIdentity, Section } from "../score/types";

export const SIDECAR_SCHEMA_VERSION = "0.1.0" as const;

export type LoopRange = {
  id: string;
  startTick: number;
  endTick: number;
};

export type Annotation = {
  id: string;
  tick: number;
  text: string;
  updatedAt: string;
};

export type TrackOverride = {
  muted?: boolean;
  solo?: boolean;
  volume?: number;
  instrument?: string;
};

export type QuantizationSettings = {
  grid: "1/8" | "1/16" | "1/32";
  swing: boolean;
};

export type MidiMeasureCorrection = {
  measureId: string;
  quantization?: QuantizationSettings;
  handAssignments?: Record<string, "left" | "right" | "unknown">;
};

export type SidecarPayload = {
  schemaVersion: typeof SIDECAR_SCHEMA_VERSION;
  identity: ScoreIdentity;
  practice: {
    tempoOverride?: number;
    transpose?: number;
    loops: LoopRange[];
    sections: Section[];
    annotations: Annotation[];
  };
  tracks: Record<string, TrackOverride>;
  midi?: {
    quantization: QuantizationSettings;
    handAssignments: Record<string, "left" | "right" | "unknown">;
    measureCorrections: Record<string, MidiMeasureCorrection>;
  };
};

export function createDefaultSidecar(identity: ScoreIdentity): SidecarPayload {
  return {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    identity,
    practice: {
      loops: [],
      sections: [],
      annotations: [],
    },
    tracks: {},
  };
}

export function encodeSidecar(payload: SidecarPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function decodeSidecar(json: string): SidecarPayload {
  const parsed = JSON.parse(json) as SidecarPayload;

  if (parsed.schemaVersion !== SIDECAR_SCHEMA_VERSION) {
    throw new Error(`Unsupported sidecar schema version: ${parsed.schemaVersion}`);
  }

  return parsed;
}
```

- [ ] **Step 5: Write SQLite schema implementation**

Create `web-core/src/storage/sqliteSchema.ts`:

```ts
export const SQLITE_SCHEMA = `
CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT,
  artist TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE file_refs (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path_hint TEXT,
  security_bookmark BLOB,
  local_library_path TEXT,
  last_accessed_at TEXT,
  FOREIGN KEY(score_id) REFERENCES scores(id)
);

CREATE TABLE sidecars (
  score_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_state TEXT NOT NULL,
  FOREIGN KEY(score_id) REFERENCES scores(id)
);

CREATE TABLE score_index (
  score_id TEXT PRIMARY KEY,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  practice_summary_json TEXT,
  FOREIGN KEY(score_id) REFERENCES scores(id)
);
`.trim();

export function requiredSqliteTables(): string[] {
  return ["scores", "file_refs", "sidecars", "score_index"];
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
export * from "./bridge/types";
export * from "./bridge/mockNativeBridge";
export * from "./storage/sidecar";
export * from "./storage/sqliteSchema";
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm check
```

Expected: PASS. Storage tests pass and TypeScript exits with code 0.

- [ ] **Step 7: Commit**

```bash
git add web-core/src/index.ts web-core/src/storage/sidecar.ts web-core/src/storage/sidecar.test.ts web-core/src/storage/sqliteSchema.ts web-core/src/storage/sqliteSchema.test.ts
git commit -m "feat: add sidecar and storage schema contracts"
```

## Task 6: Viewer Session Vertical Slice

**Files:**
- Create: `web-core/src/score/session.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/score/session.test.ts`

**Interfaces:**
- Consumes:
  - `createScoreIdentity(input): Promise<ScoreIdentity>`
  - `createDefaultSidecar(identity: ScoreIdentity): SidecarPayload`
  - `type Capabilities`
- Produces:
  - `type ViewerSession`
  - `function createViewerSession(input: { fileName: string; bytes: Uint8Array; capabilities: Capabilities; sidecarJson?: string }): Promise<ViewerSession>`

- [ ] **Step 1: Write the failing tests**

Create `web-core/src/score/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDefaultSidecar, encodeSidecar } from "../storage/sidecar";
import { createScoreIdentity } from "./identity";
import { createViewerSession } from "./session";
import type { Capabilities } from "../bridge/types";

const capabilities: Capabilities = {
  fileAccess: {
    externalReferences: true,
    securityBookmarks: true,
    localLibraryImport: true,
  },
  storage: {
    sqliteIndex: true,
    sidecarPayload: true,
  },
  sync: {
    available: true,
    provider: "cloudkit",
  },
  audio: {
    webAudio: true,
    nativeBridge: false,
  },
};

describe("createViewerSession", () => {
  it("creates a session with identity, source summary, capabilities, and default sidecar", async () => {
    const bytes = new TextEncoder().encode("gp bytes");

    const session = await createViewerSession({
      fileName: "riff.gp5",
      bytes,
      capabilities,
    });

    expect(session.identity.format).toBe("gp");
    expect(session.source).toEqual({
      fileName: "riff.gp5",
      sizeBytes: 8,
      format: "gp",
    });
    expect(session.sidecar.identity).toEqual(session.identity);
    expect(session.capabilities.sync.provider).toBe("cloudkit");
  });

  it("uses an existing sidecar when provided", async () => {
    const bytes = new TextEncoder().encode("midi bytes");
    const identity = await createScoreIdentity({
      fileName: "lesson.mid",
      bytes,
    });
    const existing = createDefaultSidecar(identity);
    existing.practice.tempoOverride = 80;

    const session = await createViewerSession({
      fileName: "lesson.mid",
      bytes,
      capabilities,
      sidecarJson: encodeSidecar(existing),
    });

    expect(session.sidecar.practice.tempoOverride).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-core/src/score/session.test.ts
```

Expected: FAIL with module not found for `./session`.

- [ ] **Step 3: Write minimal implementation**

Create `web-core/src/score/session.ts`:

```ts
import type { Capabilities } from "../bridge/types";
import { createDefaultSidecar, decodeSidecar, type SidecarPayload } from "../storage/sidecar";
import { createScoreIdentity } from "./identity";
import type { ScoreIdentity, ScoreSource } from "./types";

export type ViewerSession = {
  identity: ScoreIdentity;
  source: ScoreSource;
  capabilities: Capabilities;
  sidecar: SidecarPayload;
};

export async function createViewerSession(input: {
  fileName: string;
  bytes: Uint8Array;
  capabilities: Capabilities;
  sidecarJson?: string;
}): Promise<ViewerSession> {
  const identity = await createScoreIdentity({
    fileName: input.fileName,
    bytes: input.bytes,
  });

  return {
    identity,
    source: {
      fileName: input.fileName,
      sizeBytes: input.bytes.byteLength,
      format: identity.format,
    },
    capabilities: input.capabilities,
    sidecar: input.sidecarJson === undefined ? createDefaultSidecar(identity) : decodeSidecar(input.sidecarJson),
  };
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
export * from "./score/session";
export * from "./bridge/types";
export * from "./bridge/mockNativeBridge";
export * from "./storage/sidecar";
export * from "./storage/sqliteSchema";
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
pnpm check
```

Expected: PASS. Session tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add web-core/src/index.ts web-core/src/score/session.ts web-core/src/score/session.test.ts
git commit -m "feat: add viewer session foundation"
```

## Task 7: Mock Open File Flow Through Bridge

**Files:**
- Modify: `web-core/src/bridge/mockNativeBridge.ts`
- Create: `web-core/src/bridge/openFileFlow.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/bridge/openFileFlow.test.ts`

**Interfaces:**
- Consumes:
  - `MockNativeBridge.rpc<TResponse>(type: string, payload: unknown): Promise<TResponse>`
  - `createViewerSession(input): Promise<ViewerSession>`
  - `type ViewerSession`
- Produces:
  - `type NativeFileBytes = { fileName: string; bytes: Uint8Array }`
  - `function openFileThroughBridge(input: { bridge: MockNativeBridge; fileRef: string; mode: "external-reference" | "local-library-copy" }): Promise<ViewerSession>`

- [ ] **Step 1: Write the failing test**

Create `web-core/src/bridge/openFileFlow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "./mockNativeBridge";
import { openFileThroughBridge } from "./openFileFlow";

describe("openFileThroughBridge", () => {
  it("discovers capabilities, opens bytes, and creates a viewer session", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFileBytes("file-1", {
      fileName: "practice.mid",
      bytes: new TextEncoder().encode("midi bytes"),
    });

    const session = await openFileThroughBridge({
      bridge,
      fileRef: "file-1",
      mode: "external-reference",
    });

    expect(session.source.fileName).toBe("practice.mid");
    expect(session.identity.format).toBe("midi");
    expect(session.capabilities.storage.sqliteIndex).toBe(true);
    expect(session.sidecar.schemaVersion).toBe("0.1.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-core/src/bridge/openFileFlow.test.ts
```

Expected: FAIL because `openFileFlow` does not exist and `MockNativeBridge.registerFileBytes` does not exist.

- [ ] **Step 3: Extend mock bridge with file bytes**

Modify `web-core/src/bridge/mockNativeBridge.ts`:

```ts
import type { BridgeMessage, Capabilities, OpenFileRequest, OpenFileResponse } from "./types";

export type NativeFileBytes = {
  fileName: string;
  bytes: Uint8Array;
};

const DEFAULT_CAPABILITIES: Capabilities = {
  fileAccess: {
    externalReferences: true,
    securityBookmarks: true,
    localLibraryImport: true,
  },
  storage: {
    sqliteIndex: true,
    sidecarPayload: true,
  },
  sync: {
    available: true,
    provider: "cloudkit",
  },
  audio: {
    webAudio: true,
    nativeBridge: false,
  },
};

export class MockNativeBridge {
  private readonly fileResponses = new Map<string, OpenFileResponse>();
  private readonly fileBytes = new Map<string, NativeFileBytes>();
  private readonly eventMessages: BridgeMessage<unknown>[] = [];
  private nextId = 1;

  registerFile(fileRef: string, response: OpenFileResponse): void {
    this.fileResponses.set(fileRef, response);
  }

  registerFileBytes(fileRef: string, file: NativeFileBytes): void {
    this.fileBytes.set(fileRef, file);
    this.fileResponses.set(fileRef, {
      fileToken: fileRef,
      fileName: file.fileName,
      sizeBytes: file.bytes.byteLength,
    });
  }

  async rpc<TResponse>(type: string, payload: unknown): Promise<TResponse> {
    if (type === "capabilities.get") {
      return DEFAULT_CAPABILITIES as TResponse;
    }

    if (type === "file.open") {
      const request = payload as OpenFileRequest;
      const response = this.fileResponses.get(request.fileRef);
      if (response === undefined) {
        throw new Error(`No mock file registered for ref: ${request.fileRef}`);
      }
      return response as TResponse;
    }

    if (type === "file.readBytes") {
      const request = payload as { fileToken: string };
      const response = this.fileBytes.get(request.fileToken);
      if (response === undefined) {
        throw new Error(`No mock file bytes registered for token: ${request.fileToken}`);
      }
      return response as TResponse;
    }

    throw new Error(`Unsupported mock RPC: ${type}`);
  }

  emit<TPayload>(type: string, payload: TPayload): void {
    this.eventMessages.push({
      bridgeVersion: "0.1.0",
      type,
      correlationId: `mock-${this.nextId++}`,
      payload,
    });
  }

  events(): BridgeMessage<unknown>[] {
    return [...this.eventMessages];
  }
}
```

- [ ] **Step 4: Implement open file flow**

Create `web-core/src/bridge/openFileFlow.ts`:

```ts
import { createViewerSession, type ViewerSession } from "../score/session";
import type { Capabilities, OpenFileResponse } from "./types";
import type { MockNativeBridge, NativeFileBytes } from "./mockNativeBridge";

export async function openFileThroughBridge(input: {
  bridge: MockNativeBridge;
  fileRef: string;
  mode: "external-reference" | "local-library-copy";
}): Promise<ViewerSession> {
  const capabilities = await input.bridge.rpc<Capabilities>("capabilities.get", {});
  const opened = await input.bridge.rpc<OpenFileResponse>("file.open", {
    fileRef: input.fileRef,
    mode: input.mode,
  });
  const file = await input.bridge.rpc<NativeFileBytes>("file.readBytes", {
    fileToken: opened.fileToken,
  });

  return createViewerSession({
    fileName: file.fileName,
    bytes: file.bytes,
    capabilities,
  });
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
export * from "./score/session";
export * from "./bridge/types";
export * from "./bridge/mockNativeBridge";
export * from "./bridge/openFileFlow";
export * from "./storage/sidecar";
export * from "./storage/sqliteSchema";
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
pnpm check
```

Expected: PASS. All tests pass and TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add web-core/src/index.ts web-core/src/bridge/mockNativeBridge.ts web-core/src/bridge/openFileFlow.ts web-core/src/bridge/openFileFlow.test.ts
git commit -m "feat: add mock open file bridge flow"
```

## Task 8: Architecture Foundation Documentation Check

**Files:**
- Create: `docs/architecture/implementation-foundation.md`
- Modify: `docs/architecture/glossary.md`
- Test: `docs/superpowers/plans/2026-07-07-architecture-foundation.md`

**Interfaces:**
- Consumes:
  - `WEB_CORE_VERSION`
  - Score Model types from `web-core/src/score/types.ts`
  - Bridge types from `web-core/src/bridge/types.ts`
  - Storage contracts from `web-core/src/storage/sidecar.ts` and `web-core/src/storage/sqliteSchema.ts`
- Produces:
  - A short implementation foundation doc linking architecture decisions to code paths.

- [ ] **Step 1: Create implementation foundation doc**

Create `docs/architecture/implementation-foundation.md`:

```markdown
# 架构基础实现说明

## 范围

当前实现只覆盖 Viewer 第一版的架构基础切片：

- TypeScript Web Core。
- Score Model 共享类型。
- 文件格式识别。
- 内容指纹和 ScoreIdentity。
- Bridge API typed RPC / event 合约。
- JSON sidecar payload。
- SQLite schema 合约。
- mock native bridge 打开文件流程。

当前实现不包含真实 alphaTab 渲染、真实 MIDI Analyzer、SwiftUI / WKWebView 壳层、CloudKit adapter 或 Web Audio 播放器。

## 代码入口

- `web-core/src/index.ts`：Web Core 对外导出入口。
- `web-core/src/score/types.ts`：Score Model 与 ScoreIdentity。
- `web-core/src/score/format.ts`：GP / MIDI 文件格式识别。
- `web-core/src/score/identity.ts`：内容 hash 与 ScoreIdentity 创建。
- `web-core/src/score/session.ts`：ViewerSession 聚合。
- `web-core/src/bridge/types.ts`：Bridge API 消息类型。
- `web-core/src/bridge/mockNativeBridge.ts`：测试用 Native Bridge。
- `web-core/src/bridge/openFileFlow.ts`：mock 打开文件流程。
- `web-core/src/storage/sidecar.ts`：sidecar payload codec。
- `web-core/src/storage/sqliteSchema.ts`：SQLite schema 合约。

## 验证

运行：

```bash
pnpm check
```

预期结果：

- TypeScript 编译通过。
- Vitest 单元测试全部通过。

## 后续计划

后续应继续拆分以下实现计划：

- GP Adapter + alphaTab vertical slice。
- MIDI Analyzer heuristic + 测试素材。
- SwiftUI / WKWebView Apple Shell。
- CloudKit Sync Adapter。
- Playback Engine + Web Audio MVP。
```

- [ ] **Step 2: Update glossary with implementation terms**

Modify `docs/architecture/glossary.md` by appending:

```markdown

## ViewerSession

Web Core 打开某份谱后的会话对象。它聚合 `ScoreIdentity`、文件来源摘要、平台 capabilities 和 sidecar payload。

## Capability Discovery

Web Core 启动或打开文件前询问 Native Shell 支持哪些能力的过程。第一版能力包括文件访问、SQLite/sidecar 存储、同步 provider 和音频后端。

## MockNativeBridge

Web Core 测试用 Native Bridge。它模拟 capability discovery、文件打开、文件字节读取和事件记录，不代表真实平台实现。
```

- [ ] **Step 3: Run documentation and placeholder checks**

Run:

```bash
PATTERN='TO''DO|TB''D|待''定|占''位|FIX''ME'
rg -n "$PATTERN" docs web-core
pnpm check
```

Expected: `rg` exits with code 1 because no placeholder text is found. `pnpm check` exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/implementation-foundation.md docs/architecture/glossary.md
git commit -m "docs: describe architecture foundation implementation"
```

## Self-Review

Spec coverage:

- WebView 渲染核心：本计划建立 Web Core 包和共享协议基础；真实 WebView 集成留给 Apple Shell 计划。
- Score Model 中等厚度：Task 2 定义 Score Model 类型，Task 6 通过 ViewerSession 使用。
- Bridge API 混合风格：Task 4 定义 RPC / event 类型，Task 7 打通 mock RPC flow。
- sidecar 绑定内容指纹：Task 3 创建 `ScoreIdentity`，Task 5 sidecar 绑定 identity。
- SQLite + JSON sidecar：Task 5 定义 SQLite schema 和 sidecar codec。
- CloudKit 抽象：Task 4 capability 中表达 provider，真实 CloudKit adapter 留给后续计划。
- GP/MIDI 双优先：Task 2 和 Task 3 覆盖格式识别与 identity；真实 GP/MIDI 解析留给后续计划。
- 不 fork alphaTab：本计划不引入 alphaTab，不修改 alphaTab。

Placeholder scan:

- 本计划已避免留下常见未完成标记、未收口标记和修复标记。

Type consistency:

- `ScoreIdentity` 在 `types.ts` 定义，并被 identity、sidecar、bridge、session 复用。
- `Capabilities` 在 bridge types 定义，并被 mock bridge、session、open file flow 复用。
- `SidecarPayload` 在 sidecar codec 定义，并被 session 复用。
