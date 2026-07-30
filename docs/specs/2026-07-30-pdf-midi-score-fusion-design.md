---
status: draft
date: 2026-07-30
owner: Engineering
scope: CLI PoC and research only
---

# PDF OMR 与 MIDI 证据融合设计

## Objective

研究是否可以用同一首乐曲的 MIDI 修正 PDF OMR 结果，提高音高、时值、漏音和多余音符的正确率。
第一阶段只扩展隔离的 `tools/pdf-omr-cli` 实验链路，不改变 App、Sheet Library、`ScoreFormat` 或
当前 MusicXML 产品导入边界。

目标数据流：

```text
PDF -> Audiveris -> MusicXML -> ScoreEvidence
                                      |
MIDI ---------------------> PerformanceEvidence
                                      |
                         alignment + deterministic fusion
                                      |
                repair proposals + corrected MusicXML + diagnostics
```

MusicXML 是 OMR 侧的首选输入。不得先降级为 ABC，因为 ABC 不适合作为复杂钢琴谱的完整中间表示，
可能弱化 staff、voice、tie、slur、pedal、enharmonic spelling 和其他 notation facts。

## Assumptions

1. PDF 与 MIDI 表示同一首乐曲和同一编曲；系统必须先验证该假设，不能仅凭文件名接受。
2. 主要目标来源是制谱软件导出的 score-exported MIDI。human-performance MIDI 是次级兼容输入，
   两者仍必须分类处理，不能共用未经区分的 confidence 和 repair policy。
3. 首轮 alignment、quantization 和 compatibility thresholds 应优先针对 score-exported MIDI。它可以
   提供强音高和量化节奏证据；performance MIDI 包含 rubato、踏板、错音、漏音和额外音，不能直接
   覆盖书面谱。
4. OMR 负责 measure、staff、voice、notation 和页面证据；MIDI 主要提供 sounding pitch、onset
   sequence 和 duration evidence。
5. 第一阶段没有人工标注 ground truth，因此只能评估 alignment coverage、结构约束、回渲染和人工
   spot check，不能宣称绝对识别准确率。

## Proposed CLI

以下命令仅定义候选 contract，尚未批准实施：

```bash
pnpm pdf-omr -- fuse \
  --musicxml <audiveris-output.mxl> \
  --midi <matching-performance.mid> \
  --output <run-dir> \
  [--midi-kind <auto|score-export|performance>] \
  [--repair-mode <report-only|high-confidence>]
```

候选输出：

```text
<run-dir>/
  score-evidence.json
  performance-evidence.json
  alignment.json
  repair-proposals.json
  corrected.musicxml
  diagnostics.json
  run.json
```

`report-only` MUST be the initial default. `high-confidence` MUST NOT apply a repair unless all affected measure
and voice invariants remain valid.

## Intermediate Representations

MIDI 导入、Raw MIDI 与 `PerformanceEvidence` 的详细 contract 见
[`2026-07-30-midi-performance-evidence-import-design.md`](2026-07-30-midi-performance-evidence-import-design.md)。
第一条实施 slice 已交付独立的 `import-midi` command；它不承担量化、score position 推断或
alignment。

中间表示应独立于 MusicXML DOM 和 MIDI tick，并使用 exact rational 表达书面音乐时间：

```ts
type FusionNoteEvidence = {
  id: string;
  scorePosition?: {
    measureIndex: number;
    beat: Rational;
    duration: Rational;
    staffIndex?: number;
    voice?: number;
  };
  writtenPitch?: {
    step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
    alter: number;
    octave: number;
  };
  soundingMidi?: number;
  sources: {
    omr?: {
      noteId: string;
      confidence?: number;
      sourceAnchor?: SourceAnchor;
    };
    midi?: {
      track: number;
      channel: number;
      noteIndex: number;
      onsetSeconds: number;
      durationSeconds: number;
      velocity: number;
    };
  };
  alignment: "matched" | "omr-only" | "midi-only" | "ambiguous";
  confidence: number;
};
```

`alignment.json` SHOULD additionally preserve tempo mapping, sequence anchors, insertion/deletion classifications,
alignment cost and confidence. MIDI seconds and ticks MUST NOT become final score time without quantization and
validation.

## Alignment and Fusion

第一阶段应采用确定性算法，不依赖 LLM：

1. 解析 MusicXML 的 measures、beats、pitches、durations、staff、voice、repeat 和 tempo facts。
2. 解析 MIDI note-on/off、tempo map、time signatures、tracks、channels 和 sustain pedal。
3. 展开 MusicXML repeat，构造可与 MIDI 演奏顺序比较的 pitch-time sequence。
4. 用 chroma/piano-roll DTW 或 Needleman-Wunsch 类序列对齐建立粗时间映射。
5. 在局部窗口中按 pitch、projected onset 和 duration 完成 note-level matching。
6. 分类 matched、OMR-only、MIDI-only 和 ambiguous evidence。
7. 生成 repair proposals，并重新验证 measure duration、voice overlap、tie 和 staff consistency。

优先调查现有 `Partitura` 的 `Score`、`PerformedPart` 和 match/alignment 表示，避免自行发明完整的
score-performance alignment 基础设施。依赖引入必须在实施 Spec 获批后单独审查。

## Repair Policy

第一阶段允许报告以下候选：

- aligned pitch disagreement；
- MIDI-supported missing note；
- unsupported OMR extra note；
- duration disagreement；
- chord member omission；
- repeated semitone disagreement suggesting a wrong key signature or accidental。

自动修复仅可用于唯一且高置信度的局部变更，并必须满足：

- effective measure duration remains exact；
- no unexplained voice overlap is introduced；
- note identity and provenance remain traceable；
- written pitch is consistent with key signature and accidental state；
- ambiguous staff、voice、enharmonic spelling、tie 或 repeat mapping remains unresolved。

系统 MUST NOT use MIDI alone to invent slurs、articulations、dynamics、pedal notation、engraving layout or
written enharmonic spelling.

## LLM Boundary

LLM 不是第一阶段 alignment engine，也不得直接重写完整 MusicXML。后续实验只允许把已经缩小的冲突
窗口、有限 repair candidates 和显式约束交给 LLM 排序或解释。

任何 LLM proposal MUST pass the same deterministic validators as a programmatic proposal. Raw score files,
MIDI files and user paths MUST NOT be sent to a remote model without a separately approved privacy and product
design.

## Evaluation

PoC 至少记录：

- piece compatibility and detected transposition；
- aligned-note coverage；
- OMR-only、MIDI-only 和 ambiguous ratios；
- pitch agreement；
- onset and duration agreement after time mapping；
- invalid-measure and invalid-voice counts before and after proposals；
- MusicXML round-trip and MuseScore render result；
- wall time and peak memory；
- score-exported MIDI 与 performance MIDI 的分组结果。

至少使用两组不同用途的 corpus：

- `Flower_Day.pdf` 及其对应 MIDI：复杂真实输入；没有人工校订 reference MusicXML 时，结果只能
  标为 exploratory；
- `test-fixtures/musicxml/K331-3_reviewed.mxl`：人工校订 ground truth，用于量化 pitch、onset、
  duration、voice、alignment 和 repair precision/recall。

K331 缺少的输入从同一 ground-truth MusicXML 用 MuseScore Studio 4.7.4 导出：

- `K331-3_reviewed.mid` 是 score-exported MIDI，用于 clean upper-bound alignment；
- `K331-3_reviewed.pdf` 是 score-rendered PDF，用于受控 OMR 与 fusion evaluation；
- `K331-3_reviewed.provenance.json` 记录 source/derived roles、hash、generator 和结构摘要。

K331 的 MIDI 与 PDF 是派生 fixture，不是独立 annotation。报告必须把这组结果标为
`derived-controlled`，不得用它单独证明对真实世界 PDF 或真人演奏 MIDI 的泛化改善。

## Boundaries

- Always:
  - preserve original MusicXML and MIDI as immutable evidence；
  - retain per-note provenance and confidence；
  - validate every applied repair deterministically；
  - separate alignment success from repair quality。
- Ask first:
  - add a new runtime dependency；
  - enable remote LLM processing；
  - promote the IR into `web-core`；
  - expose fusion in Browser、Desktop 或 iPad。
- Never:
  - silently replace the OMR score with MIDI；
  - treat performance timing as written duration without quantization；
  - apply ambiguous notation repairs；
  - claim accuracy improvement without reference data or a documented proxy metric。

## Success Criteria for a Future PoC

1. The CLI produces deterministic evidence and alignment artifacts for the same inputs.
2. It rejects or reports incompatible piece/version/transposition pairs before repair.
3. `report-only` identifies note-level conflicts without changing MusicXML.
4. High-confidence repairs preserve all Draft and MusicXML structural invariants.
5. Before/after MusicXML can be rendered and compared without parser or round-trip failures.
6. Evaluation separates score-exported MIDI from human-performance MIDI.

## Runtime Ecosystem Decision

MIDI import 和后续产品化路径使用 Node.js/TypeScript 与 npm 生态，首选以 `midi-file` 作为底层 SMF
parser，再投影到本项目 strict schemas。Browser、Desktop Renderer、`web-core` 与 App bundle 不得
引入 Python runtime 或 Python package。

Partitura 只允许用于隔离的离线研究或 differential evaluation；它不是产品 dependency，也不能成为
`PerformanceEvidence` 的 canonical schema。

## Reference Approaches

- Partitura symbolic music processing and score/performance representations:
  <https://github.com/CPJKU/partitura>
- Partitura alignment and match-file tutorial:
  <https://partitura.readthedocs.io/en/latest/Tutorial/notebook.html>
- Automatic Note-Level Score-to-Performance Alignments in the ASAP Dataset:
  <https://doi.org/10.5334/tismir.149>
- MIDI-Sheet Music Alignment Using Bootleg Score Synthesis:
  <https://arxiv.org/abs/2004.10345>
- Online Symbolic Music Alignment with Offline Reinforcement Learning:
  <https://arxiv.org/abs/2401.00466>

## Open Questions

已确认：

- 主要目标 MIDI 来自制谱软件导出；真人演奏 MIDI 不作为首轮优化目标。
- `K331-3_reviewed.mxl` 作为人工校订 ground truth；其 MIDI/PDF 从同一 MusicXML 派生。

1. repeat、D.C./D.S.、coda 和删节版本是否需要在首轮支持？
2. 第一阶段只生成 repair proposals，还是允许应用严格白名单内的高置信度修复？
