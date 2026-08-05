---
status: historical
supersededBy: ./README.md
---

# Score Model、Bridge API 与存储同步详细设计

> 历史研究文档：Apple Native Shell、CloudKit 和 JSON Schema 方向已被当前架构与 Zod Bridge 取代。

## 目标

本文细化 Viewer 第一版的三个关键边界：

- Score Model：GP 与 MIDI 共用的中等厚度模型。
- Bridge API：Web Viewer Core 与 Apple Native Shell 的通信协议。
- Storage / Sync：SQLite、sidecar JSON 与 CloudKit 同步的职责划分。

这些边界的目标是让第一版在 macOS 与 iOS 上快速落地，同时为后续 Windows 桌面和原生音频桥保留空间。

## Score Model

### 模型厚度

Score Model 采用中等厚度。

它统一表达 viewer / practice / playback 必需的结构：

- `score`
- `track`
- `staff`
- `measure`
- `beat`
- `note`
- `tempo`
- `timeSignature`
- `repeat`
- `section`
- `playbackMapping`

它不追求完整制谱级模型。GP 技法、MIDI 原始事件、MIDI 分析状态和未来格式特有信息放进 source-specific extension。

### 所有权

Score Model 采用跨端共享 schema，Web Viewer Core 拥有主要实现。

- schema 使用 TypeScript 类型和 JSON Schema 定义。
- Web Viewer Core 负责解析、归一、渲染和播放所需的完整模型实现。
- Native Shell 只消费必要子集。
- schema 必须带版本号。

Native Shell 第一版需要消费的子集包括：

- `scoreIdentity`
- `scoreSummary`
- `playbackState`
- `syncMetadata`
- 未来原生音频桥所需的 `playbackEvents`

### 核心结构草案

```ts
type ScoreDocument = {
  schemaVersion: string;
  identity: ScoreIdentity;
  source: ScoreSource;
  summary: ScoreSummary;
  tracks: Track[];
  timeline: PlaybackTimeline;
  sections: Section[];
  extensions?: SourceExtensions;
};

type ScoreIdentity = {
  contentHash: string;
  format: "gp" | "midi";
  title?: string;
  artist?: string;
  durationMs?: number;
  sourceHints?: {
    fileName?: string;
    trackNames?: string[];
    tempoSummary?: string;
  };
};

type Track = {
  id: string;
  name: string;
  instrument?: string;
  channel?: number;
  staves: Staff[];
  playback: TrackPlaybackSettings;
};

type Measure = {
  id: string;
  index: number;
  startTick: number;
  durationTicks: number;
  timeSignature: TimeSignature;
  beats: Beat[];
  analysis?: MeasureAnalysis;
};

type Note = {
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
```

### Source-Specific Extension

GP extension 保存 alphaTab / GP 语义中不适合进入统一模型的内容：

- bend、slide、hammer-on、pull-off、harmonics、vibrato 等技法。
- GP track / staff / voice 原始标识。
- alphaTab 渲染定位需要的引用。

MIDI extension 保存 MIDI 原始事件和分析状态：

- raw note events。
- tempo map 原始事件。
- program change、control change、pitch bend。
- piano-roll lanes。
- 量化参数。
- 左右手分配置信度。
- 异常小节列表。

## Bridge API

### 通信风格

Bridge API 采用混合风格。

RPC 用于请求/响应型平台能力：

- 文件读取。
- 文件重定位。
- sidecar 读写。
- 安全书签。
- 本机库导入。
- 同步拉取和推送。
- capability discovery。

Event Stream 用于持续状态和用户行为：

- 播放状态。
- 当前小节或音符。
- 同步状态。
- 错误状态。
- 用户交互事件。

### 消息规范

所有消息都必须：

- typed。
- versioned。
- 带 `correlationId`。
- 支持错误结构。
- 支持 capability discovery。

```ts
type BridgeMessage<TPayload> = {
  bridgeVersion: string;
  type: string;
  correlationId: string;
  payload: TPayload;
};

type BridgeError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: unknown;
};
```

### Capability Discovery

Web Viewer Core 启动时先请求平台能力：

```ts
type Capabilities = {
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
```

Web Viewer Core 不能直接假设自己运行在 iOS、macOS 或 Windows，也不能直接假设 CloudKit、SQLite 或原生音频桥存在。

### 第一版 RPC

```ts
// 文件选取（Library 导入）：select 返回一次性 token，readBytes 按 token 读取。
// （早期 `file.open` 单文件直开 RPC 已随 ADR 0067 移除。）
type FileSelectResponse =
  | { status: "cancelled" }
  | {
      status: "selected";
      files: Array<{ fileToken: string; fileName: string; sizeBytes: number }>;
    };

type ReadScoreFileResponse = {
  fileName: string;
  bytes: Uint8Array;
};

type ReadSidecarRequest = {
  identity: ScoreIdentity;
};

type WriteSidecarRequest = {
  identity: ScoreIdentity;
  payload: SidecarPayload;
};

type SyncRequest = {
  identity?: ScoreIdentity;
  reason: "startup" | "manual" | "sidecar-updated";
};
```

### 第一版事件

```ts
type PlaybackStateEvent = {
  state: "idle" | "loading" | "playing" | "paused" | "stopped" | "error";
  positionMs: number;
  currentMeasureId?: string;
  currentNoteIds?: string[];
};

type SyncStateEvent = {
  state: "idle" | "syncing" | "conflict" | "error";
  lastSyncedAt?: string;
  identity?: ScoreIdentity;
};

type ViewerInteractionEvent = {
  action:
    "section-created" | "loop-changed" | "annotation-updated" | "midi-quantization-updated" | "midi-measure-corrected";
  identity: ScoreIdentity;
  payload: unknown;
};
```

## Storage

### 本地存储策略

第一版采用 SQLite + JSON sidecar payload。

SQLite 负责查询和索引：

- score identity。
- 文件引用。
- 安全书签。
- 本机库路径。
- 最近打开。
- 收藏。
- 同步状态。
- 练习统计摘要。

JSON sidecar payload 负责保存可迁移的练习元数据：

- tempo override。
- transpose。
- loop。
- section。
- annotation。
- track override。
- MIDI 量化参数。
- MIDI 左右手分配。
- MIDI 小节级修正。

Web Viewer Core 不直接访问 SQLite。所有读写通过 Bridge API。

### SQLite 表草案

```sql
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
```

### Sidecar Payload 草案

```ts
type SidecarPayload = {
  schemaVersion: string;
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
```

## Sync

### 第一版同步范围

同步范围包括：

- sidecar payload。
- 收藏。
- 最近打开。
- 练习进度。
- section。
- 批注。
- track override。
- MIDI 分析参数和修正。

不同步范围：

- 原始 GP / MIDI 文件。
- 大型音色包。
- 版权曲库内容。

### Provider

macOS 与 iOS 第一版优先使用 CloudKit 或等价 Apple 系统同步能力。

Sync Layer 对 Web Viewer Core 只暴露抽象接口：

- `sync.pull`
- `sync.push`
- `sync.status`
- `sync.resolveConflict`

CloudKit record 类型、zone、account 状态和冲突细节留在 Native Shell / Sync Adapter 内部。

### 冲突策略

第一版采用字段级或对象级 last-writer-wins，加少量可合并结构：

- section、annotation 可以按 id 合并。
- loop、tempo、transpose 采用最后写入。
- MIDI 小节修正按 measure id 合并。
- 无法自动合并时标记 conflict，由 UI 提示用户选择。

## 文件访问

文件访问采用混合模型：

- 默认外部文件引用。
- 可选导入本机库。

外部文件引用适合轻量使用：

- iOS Document Picker。
- macOS open panel。
- 安全书签。
- 最近访问和路径线索。

本机库适合稳定离线访问：

- 用户主动选择导入。
- 文件复制到 App 管理目录。
- sidecar 仍绑定内容指纹。
- 本机库不是云曲库，不自动上传原始谱文件。

## MIDI Analyzer 实现策略

第一版客户端使用 TypeScript heuristic：

- 基于 tempo map 和 time signature 建立 tick grid。
- 根据用户选择或自动检测量化粒度。
- 将 note events 归入 measure / beat。
- 通过 pitch range、hand crossing、channel / track hint 做左右手分配。
- 标记重叠音、极短音、疑似错位音和复杂不可读小节。

同时维护离线研究脚本：

- 使用 music21、mido 或 pretty_midi 分析测试集。
- 生成量化和左右手分配质量报告。
- 把验证过的规则迁移到 Web Viewer Core。

第一版不依赖服务端 MIDI 转谱。

## alphaTab 集成策略

第一版不 fork alphaTab。

优先使用：

- 公共 API。
- 配置项。
- wrapper。
- adapter。
- 上游 issue / PR。

只有当 alphaTab 限制阻塞核心体验时，才单独评估轻 patch，并新增 ADR 记录 MPL-2.0 合规义务。
