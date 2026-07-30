---
status: implemented
date: 2026-07-30
owner: Engineering
scope: tools/pdf-omr-cli MIDI import and PerformanceEvidence only
parent: docs/specs/2026-07-30-pdf-midi-score-fusion-design.md
---

# MIDI 导入与 PerformanceEvidence 设计

## Objective

为 PDF OMR 与 MIDI 证据融合建立第一条独立、确定性、可测试的 MIDI 导入路径：

```text
Standard MIDI File bytes
  -> input validation and immutable source artifact
  -> RawMidiDocument
  -> tempo / control / note normalization
  -> PerformanceEvidence
  -> canonical artifacts and diagnostics
```

本设计只覆盖 Standard MIDI File 的读取、事件解析和演奏证据投影。它不做 MusicXML 对齐、书面时值
量化、左右手或 staff/voice 分配、repair proposal，也不改变 App 当前不支持 MIDI 产品导入的边界。

## Decision Summary

1. 在 `tools/pdf-omr-cli` 增加独立的 `import-midi` vertical slice，先于 `fuse` 实现。
2. 将 `RawMidiDocument` 与 `PerformanceEvidence` 分层：
   - `RawMidiDocument` 保存 MIDI 文件中可验证的事件事实和 source coordinates；
   - `PerformanceEvidence` 保存用于后续 alignment 的 note、tempo、meter、track、channel 和 pedal
     语义。
3. 第一版只接受 SMF format 0/1 与 PPQ/TPQN time division。SMF format 2 和 SMPTE division 必须以稳定
   error reason 拒绝，不能猜测成单一演奏时间轴。
4. 不把 MIDI tick 或 seconds 转换为 `Score Written Moment`。量化和 score mapping 属于后续 alignment
   阶段。
5. 第一版使用 npm 生态的 SMF parser，首选 `midi-file`，并在项目内增加 strict adapter、resource
   limits 与 Zod persisted schemas。不得为 MIDI 导入或 alignment 在 Browser、App 或其他产品运行时
   引入 Python 生态。
6. 原始 `.mid` bytes、`raw-midi.json`、`performance-evidence.json` 和 diagnostics 都进入 run
   artifacts。任何派生字段都必须能追溯到 track/event coordinates。

## Scope

### In scope

- SMF header 与 track chunk boundary validation；
- delta time、running status、channel voice、meta 与 SysEx framing；
- note-on/note-off、velocity、track、channel 与 program facts；
- tempo、time signature、track name、CC64 sustain pedal；
- tick 到 seconds 的确定性 tempo timeline；
- 重叠同音、孤立 note-off、未关闭 note-on 与冲突 tempo 的 diagnostics；
- canonical JSON、SHA-256、不可覆盖 run directory；
- npm parser adapter、normalizer、command 与 artifact contract 测试。

### Out of scope

- MusicXML repeat expansion 或 MIDI/score compatibility；
- score-export/performance 自动分类；
- quantization、measure/beat projection、hand/staff/voice inference；
- pitch spelling、enharmonic inference、key signature 推断；
- alignment、fusion、repair proposals 或 corrected MusicXML；
- Browser、Desktop、iPad、Library、Bridge 或 `web-core` API；
- live MIDI stream、`.kar` 专用语义、RIFF RMID、UMP/MIDI 2.0；
- 对任意损坏 MIDI 做容错猜测。

## Current Repository Evidence

- `tools/harmony-cli/src/adapters/midi.ts` 已能读取最小 SMF 并生成
  `startMs/endMs/midi/channel`，但它不保留 track、velocity、tick、time signature、program、control、
  sustain、source event index 或 structured diagnostics，不能作为本设计的 `PerformanceEvidence`
  contract。
- `tools/pdf-omr-cli/src/artifact-writer.ts` 已提供不可覆盖目录、atomic write、canonical JSON 和
  artifact SHA-256，应直接复用。
- `tools/pdf-omr-cli/src/rational.ts` 已提供 exact rational 运算，但 MIDI 导入阶段的权威时间仍是
  tick + tempo timeline；只有后续 score quantization 才生成书面 `Rational`。
- 当前 `omrRunManifestSchema` 强制包含 OMR engine，不适用于 MIDI import。应新增独立
  `midiImportRunManifestSchema`，不能伪装成 OMR engine run。
- `docs/architecture/README.md` 与 Sheet Library Feature Contract 明确说明产品导入当前不支持 MIDI。
  本工具内 PoC 不得改变该事实。
- `midi-file` 提供 MIT-licensed、零传递依赖、带 TypeScript declarations 的 SMF parse/write
  能力，并保留 track、delta time、running-status 与 velocity-zero note-off 等底层事件信息。项目
  adapter 不得直接把第三方对象作为 persisted contract。

## Proposed CLI Contract

```bash
pnpm pdf-omr -- import-midi <input.mid> --output <run-dir>
```

第一版不在 import command 接收 `--midi-kind`。`score-export` 或 `performance` 是融合策略输入，不是
SMF parser 可以从单文件可靠证明的 source fact。未来 `fuse` 可以接收用户声明，并把声明与检测证据
分开记录。

当前已确认的主要输入是制谱软件导出的 score-exported MIDI。因此后续 compatibility、quantization
和 alignment 应先优化这条路径；`import-midi` 仍保持 source-kind neutral，避免在事实解析阶段根据
来源预期改写事件。

成功输出：

```text
<run-dir>/
  input/midi.mid
  input.json
  raw-midi.json
  performance-evidence.json
  diagnostics.json
  run.json
```

- `input/midi.mid` 是原始 bytes 的 immutable copy；
- `input.json` 只保存 basename、SHA-256、size 和已验证容器摘要，不保存绝对路径；
- `raw-midi.json` 与 `performance-evidence.json` 对相同 bytes 必须 byte-for-byte deterministic；
- `run.json` 可以包含时间戳，因此不属于 byte-for-byte deterministic evidence；
- 已存在的 output directory 必须拒绝，任何 artifact 都不得被覆盖。

失败分为两类：

- 文件无法读取、header/chunk 越界、非法 VLQ/running status 等结构错误：command 失败，不产生
  succeeded manifest；
- 合法事件中的可恢复证据问题，例如 dangling note-on：command 成功，相关 note 不进入完整 note
  evidence，并输出 warning diagnostic。

## Layered Data Model

### Layer 1: RawMidiDocument

`RawMidiDocument` 是 MIDI 事件事实层，不包含 score interpretation：

```ts
type MidiSourceCoordinate = {
  trackIndex: number;
  eventIndex: number;
  absoluteTick: number;
};

type RawMidiDocument = {
  schemaVersion: "1.0.0";
  header: {
    format: 0 | 1;
    trackCount: number;
    ticksPerQuarter: number;
  };
  tracks: Array<{
    trackIndex: number;
    byteLength: number;
    endTick: number;
    events: RawMidiEvent[];
  }>;
};
```

所有 event 至少包含：

```ts
type RawMidiEventBase = MidiSourceCoordinate & {
  deltaTick: number;
  absoluteTick: number;
};
```

第一版 `RawMidiEvent` discriminated union 必须覆盖：

- `note-on` / `note-off`；
- `control-change`；
- `program-change`；
- `channel-pressure` / `polyphonic-key-pressure` / `pitch-bend`；
- `tempo`；
- `time-signature`；
- `key-signature`；
- `track-name` / `end-of-track`；
- `sysex`；
- `meta-other`。

`sysex` 和未知 meta 不需要把任意大 payload 复制进 JSON；记录 `dataLength` 与 `dataSha256` 即可，
原始 payload 仍由 `input/midi.mid` 保存。已知且有消费价值的事件保存结构化字段。

### Layer 2: PerformanceEvidence

`PerformanceEvidence` 是后续 alignment 的唯一 MIDI 输入。它不能依赖 parser 内部对象，也不能要求
消费者重新解释 running status 或 tempo meta bytes：

```ts
type PerformanceEvidence = {
  schemaVersion: "1.0.0";
  source: {
    fileName: string;
    sha256: string;
    sizeBytes: number;
    smfFormat: 0 | 1;
    trackCount: number;
    ticksPerQuarter: number;
  };
  tempoTimeline: {
    changes: TempoChangeEvidence[];
    segments: TempoSegment[];
  };
  timeSignatures: TimeSignatureEvidence[];
  tracks: PerformanceTrackEvidence[];
  notes: PerformanceNoteEvidence[];
  controls: PerformanceControlEvidence[];
  diagnostics: MidiDiagnostic[];
};
```

每个完整 note 保留机械按键时长与踏板影响后的 sounding 时长：

```ts
type PerformanceNoteEvidence = {
  id: string;
  trackIndex: number;
  channel: number;
  noteIndex: number;
  pitch: number;
  velocity: number;
  onsetTick: number;
  keyReleaseTick: number;
  soundOffTick: number;
  onsetSeconds: number;
  keyReleaseSeconds: number;
  soundOffSeconds: number;
  source: {
    noteOn: MidiSourceCoordinate;
    noteOff: MidiSourceCoordinate;
  };
  flags: Array<
    "overlapping-same-pitch" | "pedal-extended" | "simultaneous-pedal-order-ambiguous" | "percussion-channel"
  >;
};
```

字段语义：

- `keyRelease*` 来自匹配的 note-off；
- `soundOff*` 由 CC64 threshold 64 投影；没有延音时等于 `keyRelease*`；
- `durationSeconds` 不进入 v1 contract，避免调用方误把机械时长或 sounding 时长当成唯一 duration；
- `id` 使用 `midi-t<trackIndex>-e<noteOnEventIndex>`，不依赖排序后的数组下标；
- `noteIndex` 是按 `(onsetTick, trackIndex, noteOn.eventIndex)` 排序后的稳定序号；
- channel 9（人类习惯中的 MIDI channel 10）保留并标记，alignment 默认排除但不得在 import 时删除。

## Parse and Normalization Path

### Stage A: Input gate

1. 读取 bytes，计算 lowercase SHA-256；
2. 在调用 npm parser 前验证 file size 与最小 `MThd` framing；
3. 使用锁定版本的 `midi-file` 解析 SMF，并由 adapter 验证 header、format、track count 与 division；
4. 对 file size、track count、event count 与 opaque payload 设置显式上限；
5. 只接受 format 0/1 + PPQ；format 2、SMPTE 与 malformed input 稳定失败；
6. 创建 output directory 后写入 immutable input copy，后续失败不得写 succeeded manifest。

建议第一版 limits：

```ts
type MidiImportLimits = {
  maxFileBytes: 64 * 1024 * 1024;
  maxTracks: 256;
  maxEvents: 5_000_000;
  maxSysexBytes: 16 * 1024 * 1024;
};
```

limits 属于 importer version，必须进入 `run.json` parameters。以后放宽上限不应悄悄改变旧 run 的
可复现条件。

### Stage B: npm parser adapter

1. `midi-file.parseMidi()` 只负责 SMF binary decoding；
2. adapter 对 parser exception 做稳定 error mapping，不暴露第三方 exception message；
3. 每个 track 独立累计 `absoluteTick`，并为 event 分配稳定 `(trackIndex, eventIndex)`；
4. adapter 重新验证 channel data、tempo、meter、tick 与事件数量等领域边界；
5. adapter 只生成 `RawMidiDocument`，不配对 note，也不计算 seconds；
6. 第三方 parser object 不得写入 artifact，也不得越过 `midi/` module boundary；
7. event source coordinate 在 projection 时冻结，后续排序不得改写。

同一输入必须产生相同 event ordering。Track 内按原始顺序；跨 track 不制造不存在的全局原始顺序。
原始 byte offset 不作为 v1 source coordinate；需要调查单个事件的编码时，以 immutable MIDI bytes、
SHA-256、track/event index 和 absolute tick 复现。若未来确有 byte-level diagnostics 需求，再单独增加
offset scanner，不因此重新实现完整 SMF parser。

### Stage C: Global timelines

Tempo changes 按 `(absoluteTick, trackIndex, eventIndex)` 合并：

- 没有 tempo 事件时，从 tick 0 使用 SMF 默认 `500000 µs/quarter`，并标记
  `MIDI_DEFAULT_TEMPO_ASSUMED`；
- 相同 tick 的相同 tempo 去重但保留全部 source coordinates；
- 相同 tick 的不同 tempo 是 blocking ambiguity，import command 失败；不能用“最后一个 wins”；
- tick 0 之后的首个 tempo 之前仍使用默认 tempo；
- tick 到 seconds 使用 piecewise tempo integration，tick 与 tempo segments 保持权威，seconds 是
  派生值。

Time signature 按同样稳定顺序保存，但不创建 measure grid。相同 tick 的冲突 meter 输出 warning，
留给 compatibility/alignment 阶段处理；import 本身仍可成功。

### Stage D: Note pairing

1. 以 `(trackIndex, channel, pitch)` 维护 active note queue；
2. velocity > 0 的 note-on 入队；
3. note-off 或 velocity = 0 的 note-on 作为 release；
4. 正常情况配对队首 note-on；
5. 同 key 已 active 又收到 note-on 时，所有相关 note 标记 `overlapping-same-pitch` 并输出 warning；
6. 无 active note 的 release 只保留在 Raw MIDI，输出 `MIDI_UNMATCHED_NOTE_OFF`；
7. track 结束仍 active 的 note-on 不猜测 end tick，不进入 `PerformanceNoteEvidence`，输出
   `MIDI_DANGLING_NOTE_ON`。

选择 FIFO 是确定性 policy，不宣称它能恢复所有设备对重叠同音的真实意图。相关 notes 降低后续
alignment confidence，但 import 层不生成融合 confidence。

### Stage E: Sustain projection

- CC64 value >= 64 表示 pedal down；
- pedal 状态按 MIDI channel 在合并播放时间轴上计算，因为 channel messages 在 SMF playback 中对
  channel 生效，而不是对 JSON track 生效；
- note 在 pedal down 时 release，`soundOffTick` 延长到该 channel 下一次 pedal up；
- 文件结束仍 pedal down 时，不越过最后一个已知 playback tick；
- 同一 tick 的 track 内顺序使用 event index；
- 不同 track 在同一 tick 出现 release/pedal transition 且结果依赖顺序时，标记
  `simultaneous-pedal-order-ambiguous`，保守地令 `soundOffTick = keyReleaseTick`；
- CC66 sostenuto、CC67 soft pedal 和 half-pedal curve 只作为 controls 保留，v1 不改变 sound-off。

### Stage F: Canonical projection

- tracks 按 `trackIndex`；
- events 按 track 内 `eventIndex`；
- tempo/meter/controls 按 `(tick, trackIndex, eventIndex)`；
- notes 按 `(onsetTick, trackIndex, noteOn.eventIndex)`；
- diagnostics 按 `(severity, code, first source coordinate)`；
- optional field 不存在时省略，不传 `undefined`；
- Zod strict schema 在写 artifact 前进行最终边界校验。

## Diagnostics and Error Contract

结构错误沿用 `INVALID_INPUT`，并用稳定 `context.reason` 区分：

```text
invalid-midi-header
unsupported-midi-format
unsupported-smpte-division
invalid-track-chunk
chunk-out-of-bounds
invalid-variable-length-quantity
invalid-running-status
invalid-channel-data
resource-limit-exceeded
conflicting-tempo-at-tick
```

可恢复 diagnostics 至少包括：

```text
MIDI_DEFAULT_TEMPO_ASSUMED
MIDI_UNMATCHED_NOTE_OFF
MIDI_DANGLING_NOTE_ON
MIDI_OVERLAPPING_SAME_PITCH
MIDI_TIME_SIGNATURE_CONFLICT
MIDI_SIMULTANEOUS_PEDAL_ORDER_AMBIGUOUS
MIDI_PEDAL_LEFT_DOWN_AT_END
```

diagnostic message 可供 CLI 用户阅读，但后续逻辑只能依赖 `code`、`severity`、`context` 和 source
coordinates，不能解析 message。

## Partitura Boundary

Partitura 只允许作为隔离的离线研究与对照工具：

- 官方 `PerformedPart` 表示 notes、controls、programs、PPQ 和 tick fields，并可根据 sustain pedal 计算
  `sound_off`；
- 当前 `load_performance_midi` source 会保留部分 tick、time/key signature 与 meta fields，但不会把
  原始 tempo change sequence、source byte coordinates、running status、冲突事件和全部 Raw MIDI
  framing 暴露成稳定 canonical contract；
- Partitura 当前 API 文档、`load_performance_midi` docstring 与实际返回字段之间存在版本演进造成的
  差异，因此本项目不能把未适配的 `PerformedPart` 当作 persisted schema；
- `load_score_midi` 会量化并推断 pitch spelling、measure 和可选 voice/key facts，不符合本层“只保存
  演奏事件事实”的边界；
- 项目使用 Apache-2.0 license，但 Python runtime、Mido、NumPy 等完整 dependency footprint 仍需
  单独审查。

因此：

1. v1 authoritative importer 使用 Node.js/TypeScript 与批准的 npm package，不依赖 Partitura；
2. dependency 获批后，可用 Partitura 对 note、velocity、control 与 sustain projection 做 differential
   test；
3. Partitura 或其他 alignment library 的输出必须适配到本项目 schema，不能直接成为 canonical
   artifact；
4. Browser、Desktop Renderer、`web-core` 与 App bundle 不得包含 Python runtime、Python package、
   Python/WASM compatibility layer 或远程 Python service dependency；
5. 官方参考：
   - <https://www.npmjs.com/package/midi-file>
   - <https://github.com/carter-thaxton/midi-file>
   - <https://github.com/CPJKU/partitura>
   - <https://partitura.readthedocs.io/en/latest/modules/partitura.performance.html>
   - <https://partitura.readthedocs.io/en/latest/_modules/partitura/io/importmidi.html>

## Proposed Implementation Layout

```text
tools/pdf-omr-cli/src/
  midi/
    schemas.ts
    parse-standard-midi.ts
    build-tempo-timeline.ts
    build-performance-evidence.ts
  commands/
    import-midi.ts
  __tests__/
    parse-standard-midi.test.ts
    build-tempo-timeline.test.ts
    build-performance-evidence.test.ts
    import-midi-command.test.ts
    fixtures/midi/
```

职责边界：

- `parse-standard-midi.ts`：作为 `midi-file` anti-corruption adapter，把第三方 parse result 转换为
  `RawMidiDocument`；
- `build-tempo-timeline.ts`：tempo facts -> tick/seconds mapping；
- `build-performance-evidence.ts`：note pairing、controls、sustain、stable ordering；
- `commands/import-midi.ts`：I/O、hash、limits、artifact writer、manifest；
- `schemas.ts`：所有 persisted MIDI artifact 的 strict Zod contract。

不要从 `tools/harmony-cli/src/adapters/midi.ts` 做 workspace deep import，也不要把第三方 parser
types 暴露给其他 package。实现完成后，
`harmony-cli` 可以在独立任务中改为消费一个公开、经过批准的共享 package；本 slice 不顺手扩大
package ownership。

## Test Matrix

最小 committed fixtures 应由测试内的小型 byte builder 生成，避免提交来源不明 MIDI：

| Fixture                           | Expected result                                  |
| --------------------------------- | ------------------------------------------------ |
| format 0, one tempo, one note     | exact tick/source/seconds projection             |
| format 1, conductor track + notes | merged tempo timeline, preserved tracks          |
| running status                    | equivalent decoded channel events                |
| velocity-zero note-on             | treated as note-off                              |
| tempo change across a held note   | onset/release seconds integrate correctly        |
| CC64 extends released note        | distinct keyRelease and soundOff                 |
| overlapping same pitch            | FIFO pairing + warning + flags                   |
| dangling note-on                  | raw event preserved, complete note omitted       |
| unmatched note-off                | raw event preserved + warning                    |
| conflicting same-tick tempo       | stable failure                                   |
| format 2                          | stable unsupported failure                       |
| SMPTE division                    | stable unsupported failure                       |
| malformed VLQ/chunk length        | no out-of-bounds read, stable failure            |
| percussion channel                | preserved and flagged                            |
| unknown meta/SysEx                | length/hash preserved without semantic invention |

同一 fixture 连续导入两次到不同目录时，以下文件 hash 必须相同：

- `input/midi.mid`；
- `input.json`；
- `raw-midi.json`；
- `performance-evidence.json`；
- `diagnostics.json`。

除测试内最小 bytes 外，使用 `test-fixtures/musicxml/K331-3_reviewed.mid` 作为完整 score-exported MIDI
integration fixture。它必须按 `K331-3_reviewed.provenance.json` 校验 source hash；对应 reviewed
MusicXML 是 ground truth，MIDI 只是从该 truth 导出的 importer/alignment 输入。

## Verification

实现阶段按风险递增执行：

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/parse-standard-midi.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/build-tempo-timeline.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/build-performance-evidence.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/import-midi-command.test.ts
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm format:check
git diff --check
```

不需要 Browser/Desktop E2E，因为本设计禁止触及产品运行时。

## Acceptance Criteria

1. `import-midi` 对相同 bytes 生成 deterministic raw and performance evidence artifacts。
2. 每个完整 note 可追溯到原始 track/event/tick coordinates；原始 bytes 由 immutable input artifact
   保留。
3. tempo changes 跨区间的 seconds 映射有精确 tick 依据和测试。
4. key release 与 pedal-adjusted sound-off 不被合并成含义不明的 duration。
5. malformed、format 2、SMPTE 与资源超限输入稳定失败，不发生静默截断。
6. 不完整或歧义 note 事实被保留在 Raw MIDI，并通过 structured diagnostics 显式降级。
7. 实现只新增经批准并锁定版本的 npm SMF parser，不引入 Python runtime，不改变 App、Library、
   Bridge、`ScoreFormat` 或 `web-core` exports。
8. 产出的 `PerformanceEvidence` 可以直接成为后续 compatibility/alignment 阶段的 MIDI 输入，无需
   重新读取原始 MIDI。

## Open Decisions

以下问题不阻塞 `import-midi` v1，但会影响后续 fusion：

1. 以 score-exported MIDI 为默认目标时，`fuse --midi-kind auto` 的分类特征、拒识阈值及
   human-performance 降级策略；
2. alignment 使用 `keyRelease`、`soundOff` 或两者的条件策略；
3. valid-but-ambiguous MIDI 是否允许进入 report-only alignment；
4. 是否仅在开发机维护可选的 Partitura differential test environment；它不得成为 CI 或产品运行
   dependency；
5. MIDI parser 何时从 `pdf-omr-cli` 提升为独立 shared tooling package。
