# PDF OMR CLI 与 Benchmark 规格

## 文档状态

- Status: approved
- Owner: Engineering
- Date: 2026-07-28
- Approved: 2026-07-28
- Scope: CLI PoC and reproducible benchmark only
- Decision gate: CLI 与 benchmark 方向已批准；本文不代表 PDF 已成为产品或 App 能力。
- Implementation plan:
  `docs/superpowers/plans/2026-07-28-pdf-omr-cli-benchmark.md`

## 结论摘要

第一阶段只回答两个问题：

1. 在目标 PDF 谱型上，哪种 OMR engine 能稳定生成足以做和弦分析和 MusicXML 输出的结构化结果？
2. 这条链路的质量、延迟、内存、可复现性和主要错误分布是否值得后续产品化？

本阶段只建设一个可重复运行的 CLI 与 benchmark：

```text
PDF
  → inspect / render / optional layout preprocessing
  → replaceable OMR engine adapter
  → engine-neutral OmrScoreDraft
  → deterministic validation
  ├─ HarmonyAnalysisInput → current harmony analyzer → harmony.json
  └─ MusicXML generator → current MusicXML adapter round trip → output.mxl
  → benchmark metrics and decision report
```

本阶段不设计或实现 App route、UI、Bridge、Repository、Library persistence、Recognition Project、
用户修正工作区或发布流程。CLI 结果通过质量门槛后，再单独制定 App 产品规格和架构决策。

## 当前仓库对 CLI 的可复用能力

1. `tools/harmony-cli` 已证明生产和声算法可以由仓库内 CLI 复用。
2. `packages/web-core/src/harmony/analysisInput.ts` 已定义当前和声算法的窄输入。
3. `packages/web-core/src/musicxml/musicXmlAdapter.ts` 可以真实解析生成的 MusicXML/MXL。
4. `packages/web-core/src/musicxml/alphaTabProjection.ts` 可以把回读结果投影为结构摘要和
   `HarmonyAnalysisInput`。
5. 当前 PDF、OMR、ABC 与 `**kern` 都没有产品领域契约；本阶段不提前把实验 schema 提升为
   `web-core` 公共 API。

## 默认假设

1. CLI 在开发机或评测机运行，不要求普通用户设备可以直接运行。
2. OMR engine 可以是外部 Python/Java process；Node CLI 负责 orchestration、validation 和 metrics。
3. 首轮目标是印刷体 Common Western Music Notation，优先钢琴 grand staff 和少量声部。
4. 首轮不承诺手写谱、简谱、吉他六线谱、拍照透视或复杂管弦总谱。
5. 首轮至少比较 Audiveris baseline 和一个可复现 neural engine。
6. vector PDF 信息只作为可测的 preprocessing variant，不预先规定为生产必选路径。
7. MusicXML 是输出和 round-trip 验证产物；engine-native ABC、`**kern` 或 OMR XML 不是公共接口。

## 目标

- 从命令行对单个 PDF 完成 inspect、recognize、validate、analyze 和 export。
- 用相同 manifest 批量运行多个 engine 和 preprocessing variant。
- 保存足以复现实验的 engine version、model hash、command、parameters、input hash 与输出 hash。
- 用统一 Draft 计算结构指标，不让某个 engine 的输出格式定义评价标准。
- 直接复用当前生产 harmony analyzer，测量 OMR 对下游和弦结果的影响。
- 生成 MusicXML/MXL，并用当前 MusicXML adapter 做真实回读和结构一致性检查。
- 用冻结 holdout 形成明确的 Continue / Stop / Investigate decision。

## 非目标

- 修改 `apps/*`。
- 新增 React UI、Desktop Main handler、Bridge capability 或持久化 schema。
- 把 PDF 加入 `ScoreFormat` 或 Sheet Library。
- 定义用户可见 Recognition Project 生命周期。
- 建设完整 notation editor 或人工修正 UI。
- 自动训练、在线学习或使用用户文件训练模型。
- 把 benchmark tool 当作未来产品 runtime。
- 因 CLI 能运行就承诺模型可以随 Desktop、Browser 或 iPad 发布。

## 目标目录

本阶段优先保持在一个独立工具目录内：

```text
tools/pdf-omr-cli/
  README.md
  package.json
  src/
    cli.ts
    command.ts
    schemas.ts
    inspect-pdf.ts
    engine-runner.ts
    engines/
    normalizers/
    validate-draft.ts
    project-harmony.ts
    generate-musicxml.ts
    round-trip-musicxml.ts
    benchmark/
    __tests__/
  corpus/
    manifest.json
  docs/
    evaluation.md
```

除非 CLI 评测证明 contract 稳定且 App 确实需要共享，本阶段不新增
`packages/web-core/src/recognition` 或 `packages/web-core/src/omr`。

## CLI contract

以下命令是目标 contract，实现后由根 `package.json` 暴露稳定入口：

```bash
pnpm pdf-omr -- inspect <input.pdf> --output <run-dir>

pnpm pdf-omr -- recognize <input.pdf> \
  --engine <engine-id> \
  --output <run-dir> \
  [--pages <range>] \
  [--preprocess <variant>]

pnpm pdf-omr -- validate <draft.json> --output <diagnostics.json>

pnpm pdf-omr -- analyze <draft.json> \
  --output <harmony.json> \
  [--decision-threshold <0..1>]

pnpm pdf-omr -- export-musicxml <draft.json> \
  --output <score.mxl> \
  [--round-trip-report <report.json>]

pnpm benchmark:pdf-omr -- \
  --manifest <manifest.json> \
  --engine <engine-id> \
  --output <result-dir> \
  [--preprocess <variant>]
```

### CLI behavior

- Commands MUST support `--help` without loading an OMR model.
- Commands MUST write machine-readable JSON to files and concise progress to stderr.
- Commands MUST NOT mix progress text into stdout JSON.
- `SIGINT` MUST terminate the owned engine process and exit without committing a complete run manifest.
- Existing output directories MUST NOT be overwritten unless the caller passes an explicit future
  `--overwrite` option; first implementation MAY reject all existing targets.
- Relative and absolute input paths MAY be accepted by the CLI, but canonical reports MUST record a logical
  corpus ID and content hash rather than leaking developer-specific absolute paths.
- Same input bytes, engine version, model hash and parameters MUST produce the same normalized Draft and canonical
  metrics, except separately recorded timing and resource fields.

### Exit codes

```text
0   SUCCESS
2   INVALID_CLI_ARGUMENT
3   INVALID_INPUT
4   ENGINE_UNAVAILABLE
5   ENGINE_EXECUTION_FAILED
6   ENGINE_OUTPUT_INVALID
7   DRAFT_VALIDATION_FAILED
8   PROJECTION_OR_EXPORT_FAILED
9   BENCHMARK_GATE_FAILED
130 INTERRUPTED
```

错误 JSON 使用稳定 `code` 和可选结构化 `context`。原始 stack、stderr 和 exception 只能进入明确的
debug artifact，不得进入 canonical result。

## Run artifact contract

每次 `recognize` 产生独立目录：

```text
<run-dir>/
  run.json
  input.json
  engine/
    raw-output.*
    debug.log
  draft.json
  diagnostics.json
  harmony.json
  output.mxl
  round-trip.json
  metrics.json
```

只有实际产生的 artifact 才存在。`run.json` MUST record：

```ts
type OmrRunManifest = {
  schemaVersion: "1.0.0";
  runId: string;
  corpusItemId?: string;
  inputSha256: string;
  engine: {
    id: string;
    version: string;
    modelSha256?: string;
  };
  parameters: Record<string, string | number | boolean>;
  preprocess: {
    id: string;
    version: string;
  };
  startedAt: string;
  completedAt?: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  artifactSha256: Record<string, string>;
};
```

未完成 run 可以保留 debug evidence，但不得伪造 `completedAt`、`succeeded` 或完整 metrics。

## Engine adapter contract

```ts
type OmrEngineAdapter = {
  id: string;
  inspectEnvironment(): Promise<OmrEngineEnvironment>;
  recognize(request: OmrEngineRequest, signal: AbortSignal): Promise<OmrEngineArtifact>;
  normalize(artifact: OmrEngineArtifact): Promise<OmrScoreDraft>;
};
```

约束：

1. Adapter owns engine invocation and engine-native syntax.
2. Normalization MUST NOT silently invent required musical facts.
3. Syntax repair MAY recover unambiguous formatting defects, but every repair MUST create a diagnostic.
4. Process timeout, non-zero exit, malformed output and cancellation MUST remain distinguishable.
5. Engine environment MUST include executable version, model hash when applicable, and license metadata.
6. Adapter-specific confidence MAY be preserved as evidence but MUST NOT be compared across engines without
   calibration.

## `OmrScoreDraft`

Draft 是 CLI 内部的实验性、engine-neutral IR。它必须足以支持当前 benchmark，不承诺是未来 App
领域模型。

```ts
type Rational = {
  numerator: number;
  denominator: number;
};

type SourceAnchor = {
  pageIndex: number;
  systemIndex?: number;
  bbox?: { x: number; y: number; width: number; height: number };
};

type OmrNote = {
  id: string;
  measureIndex: number;
  staffIndex: number;
  voice: number;
  onset: Rational;
  duration: Rational;
  writtenPitch?: {
    step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
    alter: number;
    octave: number;
  };
  soundingMidi?: number;
  tie?: "start" | "continue" | "end";
  confidence?: number;
  source?: SourceAnchor;
};
```

完整 Draft MUST additionally represent：

- parts, staves, measures and voices；
- clef, key signature, time signature and measure duration；
- notes and rests；
- ties, tuplets, barlines and repeats required by the target corpus；
- unresolved or conflicting facts；
- per-fact source anchor and optional confidence；
- provenance linking each normalized fact to engine-native evidence when available。

时间首先使用 exact rational。投影 `HarmonyAnalysisInput` 或 MusicXML divisions 时，如果安全 LCM
不能精确表达，命令必须失败并输出 diagnostic，不能用浮点近似隐藏误差。

## Validation contract

Validator 至少检查：

- measure duration matches effective time signature；
- voice events do not create unexplained overlap；
- rests and notes account for required written duration；
- simultaneous notes form a consistent vertical event；
- tie endpoints are compatible；
- part/staff measure counts align；
- key signature and accidentals can derive written and sounding pitch；
- required tuplets and repeats are representable；
- source anchors stay within page bounds when geometry exists。

Readiness 分开计算：

```ts
type OmrReadiness = {
  harmony: "blocked" | "ready-with-warnings" | "ready";
  musicXml: "blocked" | "ready-with-warnings" | "ready";
};
```

`Harmony-ready` 只要求和声算法所需的 written time、pitch 和 scope 可靠。
`MusicXML-ready` 还要求首轮 exporter 支持的 notation structure 完整。前者不得自动推导后者。

## Harmony projection

- CLI MUST reuse current `createHarmonyAnalysisInput` and production `analyzeHarmony`.
- Projection MUST preserve measure index, exact offset, duration, track/staff/voice, spelling and sounding pitch.
- CLI MUST record the current harmony model/algorithm version independently from OMR engine version.
- OMR diagnostics and Harmony unresolved status MUST remain separate in `harmony.json`.
- Benchmark MUST measure a `falseConfidentChord` case when OMR input is wrong but Harmony output is resolved above
  threshold.
- CLI MUST NOT modify the production Semi-CRF decoder or use a special OMR-only fallback analyzer.

## MusicXML generation and round trip

- Exporter only implements the explicitly tested target subset.
- Unresolved required facts MUST block export instead of receiving guessed defaults.
- Generated bytes MUST be parsed by the current `createMusicXmlAdapter`.
- Parse success、view capability、playback capability 与 structural agreement 必须分开记录。
- Round-trip comparison 至少覆盖 measure、part/staff、pitch、written onset、duration、voice 和 tie。
- 能解析但结构发生 blocking drift 的结果不得计为成功。
- 相同 Draft MUST generate deterministic canonical MusicXML/MXL bytes.

## Benchmark corpus

首轮 corpus 至少包含 50–100 页，并按以下维度分层：

- native vector PDF；
- clean raster scan；
- degraded raster scan；
- monophonic、piano grand staff、3–4 staves；
- regular rhythm、pickup、tuplets、multi-voice、ties、repeats；
- source with and without chord symbols。

每个 corpus item MUST record：

```ts
type OmrCorpusItem = {
  id: string;
  input: string;
  inputSha256: string;
  groundTruthMusicXml: string;
  groundTruthSha256: string;
  split: "development" | "holdout";
  categories: string[];
  license: {
    id: string;
    source: string;
    redistributionAllowed: boolean;
  };
};
```

同一作品和其重排、渲染、裁剪版本不得跨 development/holdout。最终决策只使用冻结 holdout；开发期
不得查看逐项 holdout 结果来调参。

## Metrics

### Symbolic structure

- pitch precision / recall / F1；
- onset F1；
- duration F1；
- note joint F1；
- measure duration validity；
- part/staff/voice assignment accuracy；
- tie/tuplet/repeat accuracy；
- OMR-NED or another declared normalized sequence metric。

### Downstream harmony

- resolved precision delta against ground-truth MusicXML input；
- coverage delta；
- boundary F1 delta；
- false confident chord rate；
- analysis failure rate。

### MusicXML

- generation rate；
- adapter parse rate；
- view capability rate；
- playback capability rate；
- structural agreement rate。

### Runtime and reproducibility

- page and score wall time；
- peak RSS and GPU memory when measurable；
- model and environment size；
- cancellation latency；
- repeated-run Draft hash agreement；
- engine crash and invalid-output rate。

指标必须同时按 overall 与 corpus category 报告，防止 vector PDF 的高分掩盖 degraded scan 的失败。

## 暂定 Go / No-Go gate

至少一个 engine + preprocess variant 在冻结 holdout 上同时满足：

```text
noteJointF1 >= 0.90
validMeasureRate >= 0.95
generatedMxlParseRate >= 0.95
roundTripStructuralAgreementRate >= 0.90
harmonyResolvedPrecisionDelta >= -0.05
falseConfidentChordRate <= 0.03
repeatedRunDraftHashAgreement == 1.00
cancelLatencyP95Seconds <= 2
```

runtime latency、RSS、GPU memory 与模型体积先完整记录，不在目标评测机和未来分发方式确定前伪造产品
门槛。

决策输出只能是：

- `CONTINUE_TO_APP_DISCOVERY`：质量 gate 通过，可以开始独立 App 发现与架构设计。
- `INVESTIGATE`：接近 gate，但存在可被限定实验验证的单一主要缺口。
- `STOP`：没有候选达到可用水平，或依赖/许可证/资源成本不可接受。

`CONTINUE_TO_APP_DISCOVERY` 不等于批准实现 App。

## 验收契约

- Given the same input, engine, model hash and parameters, repeated recognition MUST produce the same normalized
  Draft hash.
- Given a missing engine executable or model, CLI MUST return `ENGINE_UNAVAILABLE` without creating a succeeded
  run.
- Given malformed engine output, normalization MUST fail with `ENGINE_OUTPUT_INVALID` and MUST NOT invent a valid
  Draft.
- Given an interrupted run, CLI MUST terminate the owned process and MUST NOT write complete metrics.
- Given a Harmony-ready Draft, `analyze` MUST use the current production harmony analyzer.
- Given OMR errors and a resolved Harmony result, benchmark MUST retain both facts and calculate false confident
  chord metrics.
- Given a MusicXML-ready Draft, export MUST generate deterministic bytes and round-trip them through the current
  MusicXML adapter.
- Given parseable MusicXML with structural drift, round-trip MUST fail structural agreement.
- Given development and holdout items from the same work, corpus verification MUST reject the manifest.
- Given a benchmark result, every reported aggregate MUST be reproducible from recorded run artifacts.

## 验证命令

实现后目标验证入口：

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm pdf-omr -- --help
pnpm benchmark:pdf-omr -- --manifest tools/pdf-omr-cli/corpus/manifest.json --engine <engine-id> --output <dir>
pnpm --filter @zupulse/harmony-cli test
pnpm benchmark:harmony
pnpm format:check
git diff --check
pnpm verify:fast
```

外部 engine 的 smoke/benchmark 命令必须记录在 `tools/pdf-omr-cli/README.md`，包含版本、环境创建和
模型准备步骤。

## 风险

| 风险                          | 影响 | 缓解                                                                  |
| ----------------------------- | ---- | --------------------------------------------------------------------- |
| 论文指标不能代表目标 PDF      | 高   | 冻结真实 corpus，按类别和下游指标报告                                 |
| engine-native format 丢失结构 | 高   | rich Draft + blocking diagnostics，不让 parser 静默猜测               |
| OMR 错误产生高置信度和弦      | 高   | false confident chord metric，分开记录两类 confidence                 |
| benchmark 为某个 engine 特化  | 高   | 先冻结 Draft、metrics 和 positive controls，再实现 adapters           |
| 环境不可复现                  | 高   | executable version、model hash、environment manifest 和 artifact hash |
| AGPL 或模型许可证阻止产品化   | 高   | CLI 评测不等于分发许可，报告单列 license decision                     |
| 提前抽象未来 App 架构         | 中   | 所有实验代码留在 tool；过 gate 后重新做产品规格                       |

## 开放问题

1. 首轮 neural candidate 选择 LEGATO 1、LEGATO 2 还是 Transcoda。
2. 目标 corpus 只含 piano grand staff，还是增加 lead sheet。
3. vector extraction 使用 PDF.js、PyMuPDF 还是只做 raster baseline。
4. MusicXML 首轮 exporter 必须覆盖的 notation subset。
5. degraded scan 的 degradation boundary 如何定义。
6. ground-truth alignment 使用 note matching、measure-local matching 还是标准 OMR-NED pipeline。
7. engine runtime 使用容器、uv/venv、Conda 或锁定本机环境。

## 参考

- Harmony CLI: `tools/harmony-cli`
- Harmony input: `packages/web-core/src/harmony/analysisInput.ts`
- MusicXML adapter: `packages/web-core/src/musicxml/musicXmlAdapter.ts`
- MusicXML projection: `packages/web-core/src/musicxml/alphaTabProjection.ts`
- Harmony evaluation: `tools/harmony-cli/docs/evaluation.md`
- LEGATO: <https://arxiv.org/abs/2506.19065>
- LEGATO 2: <https://arxiv.org/abs/2607.05769>
- Transcoda: <https://arxiv.org/abs/2605.10835>
- Sheet Music Benchmark: <https://arxiv.org/abs/2506.10488>
- Audiveris CLI:
  <https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/>
