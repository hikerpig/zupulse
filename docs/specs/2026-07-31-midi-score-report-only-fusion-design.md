---
status: implemented
date: 2026-07-31
owner: Engineering
scope: tools/pdf-omr-cli score-export MIDI report-only fusion
parent: docs/specs/2026-07-30-pdf-midi-score-fusion-design.md
---

# MIDI 与乐谱 Report-only Fusion 设计

## Objective

在已经交付的 `import-midi` 之上实现第一条可本地验证的 MIDI 辅助识别链路：

```text
OMR MusicXML/MXL -> ScoreEvidence
score-export MIDI -> PerformanceEvidence
                   -> compatibility + deterministic alignment
                   -> report-only repair proposals and metrics
```

本切片让工程师能够判断 MIDI 是否与 OMR 结果兼容、哪些音符一致、哪些音符疑似漏识/多识/音高错误，
并用人工校订的 MusicXML 评估报告质量。它不自动修改 MusicXML，也不宣称真人演奏 MIDI 的泛化效果。

## CLI Contract

```bash
pnpm pdf-omr -- fuse \
  --musicxml <score.musicxml|score.mxl> \
  --midi <score-export.mid> \
  --output <run-dir> \
  [--midi-kind score-export] \
  [--repair-mode report-only]
```

`midi-kind` v1 只接受 `score-export`，`repair-mode` v1 只接受 `report-only`。省略时使用这两个默认值。
未知 flag、重复 flag、已有 output directory 和不可读输入必须稳定失败。

成功 run 写入：

```text
input/score.<source-extension>
input/midi.mid
input.json
score-evidence.json
performance-evidence.json
alignment.json
repair-proposals.json
diagnostics.json
run.json
```

原始输入、evidence、alignment、proposal 与 diagnostics 对相同输入必须 byte-for-byte deterministic。
`run.json` 包含时间戳，不属于 deterministic comparison。

## ScoreEvidence Contract

`ScoreEvidence` 从 MusicXML/MXL 规范化后的 `OmrScoreDraft` 投影，不把 MIDI tick 写回书面时间：

```ts
type ScoreNoteEvidence = {
  id: string;
  partId: string;
  staffIndex: number;
  voice: number;
  measureIndex: number;
  playbackMeasureIndex: number;
  playbackIteration: number;
  writtenOnset: Rational;
  playbackOnset: Rational;
  duration: Rational;
  soundingMidi: number;
  sourceNoteId: string;
};

type ScoreEvidence = {
  schemaVersion: "1.0.0";
  source: {
    fileName: string;
    sha256: string;
    sizeBytes: number;
  };
  writtenMeasureCount: number;
  playbackMeasureOrder: number[];
  notes: ScoreNoteEvidence[];
  diagnostics: FusionDiagnostic[];
};
```

规则：

- v1 使用第一 part / 第一 staff 的 repeat markers 生成统一 playback measure order；
- 支持普通 forward/backward repeat，每个 backward repeat 只展开一次；
- 乐谱完全没有 repeat marker 时允许 staff/part 的小节数不同；只要任一 staff 存在 repeat marker，所有
  staff 的小节数和逐小节 repeat markers 必须一致，否则输出 blocking diagnostic 并停止 alignment；
- measure playback duration 取所有 staff/voice 中最大的 `onset + duration`，无事件时才使用声明 duration；
- tie `continue` / `end` 不生成新的 attack evidence，tie `start` 保留；
- 无 `soundingMidi` 或不支持的 repeat 状态不得静默猜测。
- normalizer 的 `MISSING_EVENT_TIMING` 表示该事件已无法形成可对齐 note，fusion 将它聚合为 warning
  并继续对齐其余事件；其他 blocking MusicXML normalization diagnostic 仍停止 alignment。

## Compatibility Contract

兼容性必须先于 note-level proposal：

```ts
type CompatibilityEvidence = {
  status: "compatible" | "ambiguous" | "incompatible";
  detectedTransposition: number;
  chromaSimilarity: number;
  transpositionMargin: number;
  scoreNoteCount: number;
  midiNoteCount: number;
  noteCountRatio: number;
  reasons: string[];
};
```

v1 在 `[-12, 12]` 半音范围内比较 pitch-class histogram，并用平均音高的 register agreement
打破相差八度但 pitch class 相同的候选；取 combined score 最大、绝对移调最小、数值最小的候选。
以下任一条件成立时为 `incompatible`：

- 任一侧没有可对齐 note；
- `chromaSimilarity < 0.75`；
- `noteCountRatio < 0.5` 或 `noteCountRatio > 2.0`。

最优与次优 transposition 的 combined score margin 小于 `0.01` 时标为 `ambiguous`。`incompatible`
只输出兼容性和 diagnostics，不产生 repair proposal。

## Alignment Contract

1. Score notes 按 `playbackOnset` 聚合为 onset frames，MIDI notes 按 `onsetTick` 聚合。
2. 使用 Needleman-Wunsch 类动态规划对齐 frame sequence。
3. frame substitution cost 同时使用 transposed pitch multiset disagreement 与 normalized onset distance；
   gap cost 固定且写入 `run.json` parameters。
4. 对齐 frame 内先按 transposed pitch FIFO 精确配对，再把剩余 score/MIDI notes 按最小 pitch distance
   配成 `ambiguous`；无法配对的 note 分别标记 `score-only` / `midi-only`。
5. frame 边界不一致造成的 `score-only` / `midi-only`，允许在 normalized onset distance 不超过
   `0.01` 时按相同 transposed pitch 做一次确定性 reconciliation；该阈值必须进入 algorithm parameters。
6. 输出必须保留 score note ID 与 MIDI note ID，不得只保存数组下标。

`alignment.json` 至少记录：

- compatibility；
- `matched`、`score-only`、`midi-only`、`ambiguous` entries；
- score coverage、MIDI coverage、pitch agreement、各分类数量；
- frame alignment cost；
- algorithm ID、version 与 parameters。

## Repair Proposal Contract

v1 只报告：

- `pitch-disagreement`；
- `midi-supported-missing-note`；
- `unsupported-score-note`。

所有 proposal 必须包含 source IDs、reason、confidence 和 `autoApplicable: false`。系统不得生成
corrected MusicXML，不得推断 enharmonic spelling、staff、voice、tie、slur、articulation、dynamic
或 pedal notation。

## Project Structure

```text
tools/pdf-omr-cli/src/
  fusion/
    schemas.ts
    build-score-evidence.ts
    assess-compatibility.ts
    align-score-performance.ts
  commands/
    fuse.ts
  __tests__/
    build-score-evidence.test.ts
    align-score-performance.test.ts
    fuse-command.test.ts
```

复用现有 `normalizeAudiverisMusicXml`、MIDI importer、canonical artifact writer、Zod 与 exact rational
工具；不新增 runtime dependency。

## Testing Strategy

- Unit：repeat expansion、pickup duration、tie attack filtering、移调检测、frame alignment、
  missing/extra/pitch disagreement。
- Command integration：plain MusicXML + generated MIDI、artifact contract、determinism、invalid flags、
  incompatible input。
- Controlled integration：`K331-3_reviewed.mxl` + `K331-3_reviewed.mid`。
- 评测中把 K331 标记为 `derived-controlled`；它只能证明 clean upper-bound，不证明真实 OMR 泛化。

## Commands

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/build-score-evidence.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/align-score-performance.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/fuse-command.test.ts
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm format:check
git diff --check
```

## Boundaries

- Always:
  - preserve immutable source bytes and per-note provenance；
  - run compatibility before alignment and proposals；
  - separate alignment coverage from repair quality；
  - keep all output deterministic except timestamps in `run.json`。
- Ask first:
  - add a dependency；
  - support human-performance MIDI；
  - apply any MusicXML mutation；
  - expose the capability to App、Library、Bridge or `web-core`。
- Never:
  - overwrite MusicXML from MIDI；
  - treat MIDI tick/seconds as written duration without score validation；
  - claim accuracy improvement from K331 alone；
  - send score or MIDI bytes to a remote service。

## Acceptance Criteria

1. `fuse` 对兼容 score-export MIDI 产生 deterministic evidence、alignment、proposal 和 metrics artifacts。
2. 普通 forward/backward repeat、pickup measure 和 tied attack 有单元测试。
3. 相同输入的 detected transposition、alignment entries、metrics 和 proposal ordering 稳定。
4. 不兼容输入不产生 repair proposal，并输出 machine-readable reason。
5. 所有 proposal 都是 `autoApplicable: false`，run 内不存在 corrected MusicXML。
6. K331 controlled fixture 能完成 report-only run，结果记录实际 coverage 与 diagnostics。
7. 不新增依赖，不修改 `apps/*`、Library、Bridge、`ScoreFormat` 或 `web-core` exports。
