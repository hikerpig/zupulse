# PDF OMR CLI

该 package 是 PDF → `OmrScoreDraft` → Harmony/MusicXML 与 benchmark 的命令行实验层。当前不接入
`apps/*`，也不承诺这里的 Draft 会直接成为 App 领域模型。

## 当前命令

```bash
pnpm pdf-omr -- --help
pnpm pdf-omr -- inspect <input.pdf> --output <run-dir>
pnpm pdf-omr -- import-midi <input.mid> --output <run-dir>
pnpm pdf-omr -- fuse --musicxml <score.musicxml|score.mxl> --midi <score-export.mid> --output <run-dir>
pnpm pdf-omr -- apply-fusion --run <fusion-run-dir> --decisions <decisions.json> --output <run-dir>
pnpm pdf-omr -- rebuild-from-midi --musicxml <score.musicxml|score.mxl> --midi <score-export.mid> --musescore <executable> --output <run-dir>
pnpm pdf-omr -- recognize <input.pdf> --engine <audiveris|legato|rokot> --output <run-dir> [--input-scope <full-page|system-crop>] [--staff-layout <auto|single-staff|grand-staff>]
pnpm pdf-omr -- validate <draft.json> --output <diagnostics.json>
pnpm pdf-omr -- analyze <draft.json> --output <harmony.json>
pnpm pdf-omr -- export-musicxml <draft.json> --output <score.mxl>
pnpm benchmark:pdf-omr -- --manifest <manifest.json> --engine <audiveris|legato|rokot> --output <result-dir>
pnpm pdf-omr -- compare-engines --primary <benchmark-run-dir> --secondary <benchmark-run-dir> --output <comparison-run-dir>
```

`inspect` 使用 PDF.js，输出 page count、page dimensions 和 vector/raster operator signals。
`import-midi` 使用锁定版本的 `midi-file` 解析 SMF format 0/1 + PPQ，输出 immutable MIDI copy、
`RawMidiDocument`、`PerformanceEvidence`、structured diagnostics 和 canonical hashes。它保留 tick、
track、channel、velocity、tempo、meter、controls、机械松键与 CC64 调整后的 sound-off，不做量化、
staff/voice 推断或 MusicXML alignment。Format 2、SMPTE division、冲突 tempo 和 malformed input
稳定失败。

`fuse` 是隔离在 CLI 内的 report-only MIDI 辅助识别实验。v1 只接受制谱软件导出的
`score-export` MIDI：它从 MusicXML/MXL 和 MIDI 构造可追溯 evidence，先检测兼容性与移调，再用
确定性 onset-frame alignment 报告 matched、score-only、MIDI-only 和 ambiguous notes。它会生成
修复建议和 coverage/pitch agreement metrics，所有建议仍为 `autoApplicable: false`。没有 repeat marker
时允许 OMR 产生的 staff/part 小节数不同；存在 repeat marker 时仍要求所有 staff 严格一致。

`apply-fusion` 是独立的人工审核回写阶段：它验证 fusion run 和 proposal hashes，只应用 reviewer 明确
批准并提供 `writtenPitch` 的 writeback-ready pitch proposal，以最小 XML patch 生成新的 corrected
MusicXML/MXL，再执行结构、runtime 与 before/after fusion 无回归门禁。它永不覆盖 source 或修改 fuse run。
missing/extra、tie chain、非零移调、冲突 repeat evidence、真人演奏 MIDI、D.C./D.S./coda、volta ending
和无人审核自动修复不在 v1 范围。

`rebuild-from-midi` 用于 OMR 小节或时值结构已经损坏、最小 pitch patch 无法修复的情况。它先验证 OMR
MusicXML 与 `score-export` MIDI 为同曲，再调用用户显式提供的 MuseScore executable 从 MIDI 重建
MusicXML。命令仅在重建 Draft 无 blocking diagnostic、可 view/playback，且与 MIDI 达到逐音符
`scoreCoverage=1`、`midiCoverage=1`、`pitchAgreement=1` 时发布新文件。它不会覆盖原文件，也不会把
真人演奏 MIDI 当作制谱真值；重建会舍弃 OMR 的排版细节和文本。

`recognize` 通过可替换 adapter 调用 Audiveris、LEGATO 或 Rokot，再规范化为 engine-neutral Draft。
Audiveris 保留原始 MXL/OMR；LEGATO 保留原始 ABC 并同时保留转换后的 MusicXML。Rokot 处理印刷体 single staff 与 piano grand staff，保留逐 system
crop、ABC、MusicXML fragment 和包含 `staffLayout`/`staffCount` 的 segmentation metadata；它是隔离的本地研究 engine，不代表 App
已经支持 PDF 导入。

Audiveris executable 默认从 `PATH` 查找。开发或 CI 可以显式指定：

```bash
PDF_OMR_AUDIVERIS_EXECUTABLE=/absolute/path/to/audiveris \
  pnpm pdf-omr -- recognize input.pdf --engine audiveris --output result
```

LEGATO 需要分别取得 `guangyangmusic/legato` 与
`meta-llama/Llama-3.2-11B-Vision` 的 gated access。安装时锁定模型和 Demo revision：

```bash
hf download guangyangmusic/legato \
  --revision 2d07c5d0e73186f2c0b12e35ea187bbc30dec18c \
  --local-dir /absolute/path/to/legato-model

hf download meta-llama/Llama-3.2-11B-Vision \
  --revision 3f2e93603aaa5dd142f27d34b06dfa2b6e97b8be \
  --exclude "original/*" \
  --local-dir /absolute/path/to/llama-3.2-11b-vision

git clone https://huggingface.co/spaces/guangyangmusic/legato-demo /absolute/path/to/legato-demo
git -C /absolute/path/to/legato-demo checkout 8c1de27e414f487fe59086547aaae23b868ed6ca
```

若 Hugging Face 的 Meta gated repository 尚未批准，可在已经接受 Llama 3.2 Community License 的前提下，
使用 ModelScope 上相同 Transformers 目录结构的 base model 镜像。必须锁定 revision，不能替换为
`-Instruct`、GGUF、MLX 或量化版本：

```bash
uvx --from modelscope modelscope download \
  LLM-Research/Llama-3.2-11B-Vision \
  --revision f602922f64cbe153c580e358fdabc2bbd023b3ca \
  --exclude "original/*" \
  --local-dir /absolute/path/to/llama-3.2-11b-vision
```

ModelScope revision 的 5 个 `model-*.safetensors` 分片必须逐文件核对 SHA-256；锁定值记录在
`engines/legato-environment.json`。该镜像只解决下载来源，不改变模型许可义务。

使用独立 Python 3.11 环境安装锁定依赖，并显式配置所有路径：

```bash
uv venv --python python3.11 /absolute/path/to/legato-venv
uv pip install --python /absolute/path/to/legato-venv/bin/python \
  transformers==4.54.0 torch==2.8.0 pillow==11.1.0 pymupdf==1.26.3 sentencepiece

PDF_OMR_LEGATO_PYTHON=/absolute/path/to/legato-venv/bin/python \
PDF_OMR_LEGATO_REPOSITORY=/absolute/path/to/legato-demo \
PDF_OMR_LEGATO_MODEL=/absolute/path/to/legato-model \
PDF_OMR_LEGATO_BASE_MODEL=/absolute/path/to/llama-3.2-11b-vision \
  pnpm pdf-omr -- recognize input.pdf --engine legato --output result
```

LEGATO 本地 engine 接受一至 32 页 PDF。runner 流式渲染并逐页使用官方 Demo 的 padding 语义执行推理，
避免同时保留整份 PDF 的页面图像；再用锁定的 `abc2xml.py` 转换。CLI 校验每页每个声明 part 均含音符，然后合并 MusicXML，并保留
`engine/pages/page-NNN.{abc,musicxml}` 作为证据。模型条款、revision、hash、预处理和 decoder 参数见
`engines/legato-environment.json`。模型、Llama vision encoder 与外部 repository 不提交到仓库。
默认 inference timeout 为 60 分钟。CUDA 与 MPS 使用 float16 推理，CPU 按 checkpoint config dtype
加载；这与官方 Demo 的 GPU half-precision 路径一致，同时避免 MPS 上的 float32 attention OOM 和
mixed bfloat16/float32 Metal crash。

development-only 的 decoder 筛选会顺序运行 `beam=1/2/4`。每个 variant 在一个串行 worker 中只加载一次模型，
`comparison.json` 记录测量值和评测集合是否一致，不自动作 promotion 决策：

```bash
PDF_OMR_LEGATO_PYTHON=/absolute/path/to/legato-venv/bin/python \
PDF_OMR_LEGATO_REPOSITORY=/absolute/path/to/legato-demo \
PDF_OMR_LEGATO_MODEL=/absolute/path/to/legato-model \
PDF_OMR_LEGATO_BASE_MODEL=/absolute/path/to/llama-3.2-11b-vision \
  pnpm exec vite-node tools/pdf-omr-cli/scripts/run_legato_ablation.ts \
    --manifest tools/pdf-omr-cli/corpus/evaluation/manifest.json \
    --output tools/pdf-omr-cli/reports/development/legato-ablation
```

各 variant 子目录必须不存在。它们保留完整 canonical benchmark。普通 `recognize` 使用真实 corpus 筛选后的
`beam=1 / maxLength=2048` baseline；显式 decoder 配置仍允许 `beam=2..10`。

当 full-page LEGATO 出现稳定的整小节遗漏时，可在 development split 上物化确定性的 system-page 输入。该过程
读取现有 staff-system detector，生成每页一个 system 的派生 PDF、development-only manifest 和
`materialization.json`；它不读取 source manifest 的 holdout assets：

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/materialize-legato-system-pages.ts \
  --manifest tools/pdf-omr-cli/corpus/evaluation/manifest.json \
  --output /absolute/path/to/legato-system-pages

pnpm benchmark:pdf-omr -- \
  --manifest /absolute/path/to/legato-system-pages/manifest.json \
  --engine legato \
  --preprocess legato-system-pages-v1 \
  --output /absolute/path/to/legato-system-pages-run \
  --mode development

pnpm benchmark:pdf-omr -- \
  --manifest /absolute/path/to/legato-system-pages/manifest.json \
  --engine legato \
  --preprocess legato-system-pages-context-v1 \
  --output /absolute/path/to/legato-system-pages-context-run \
  --mode development
```

两个 system-page preprocess 只允许用于 LEGATO；未知 preprocess 或其他 engine 会 fail closed。
`legato-system-pages-context-v1` 额外使用上一页唯一且合法的 ABC `L/M/K` header 作为
`LegatoSegmentProcessor` context，并在 telemetry 中记录可复算的 prefix hash。派生输入不得替换原
full-page report，只能作为 development ablation。

两个相同 corpus manifest、mode 与 item set 的全成功 benchmark run 可以生成 report-only comparison：

```bash
pnpm pdf-omr -- compare-engines \
  --primary /absolute/path/to/primary-run \
  --secondary /absolute/path/to/secondary-run \
  --output /absolute/path/to/comparison-run \
  --topology strict
```

comparison 对单 part Draft 做 global measure sequence alignment，将完整小节遗漏压缩为
`measure-missing-in-primary` / `measure-missing-in-secondary`，内容差异记录为
`measure-content-disagreement`。唯一、非歧义的 alignment 会额外生成 secondary-to-primary 的 `insert`、
`replace` 或 `delete` repair candidate；`insert`/`replace` 携带移除 event ID、confidence 与 source anchor 后的
规范化小节事实和可复算 SHA-256。所有 proposal 与 candidate 固定 `autoApplicable: false`，candidate 固定
`reviewRequired: true`。alignment ambiguity 时不生成 candidate；多 part 缺少显式跨引擎 identity、topology
不一致、run identity 不一致或不完整 run 都会 fail closed。命令不读取 ground truth，也不修改输入 run。
当同一钢琴谱被一个 engine 表示为多个单谱表 part、另一个表示为单个多谱表 part 时，必须显式传
`--topology ordered-staves`；该模式只按 Draft 中 part/staff 的声明顺序建立 comparison view，不猜测或持久化
part identity。默认 `strict` 仍会拒绝这种拓扑差异。

候选效果只能通过显式的 development-only 模拟评分命令评估。该命令校验 comparison 与 primary report hash，
先在内存中应用全部 candidate，再逐个候选相对未修改 primary 独立评分。只有单候选 assessment 为 `improved`
且 `nonRegressive: true` 时才标为 `recommended`；报告还会联合应用这些推荐候选并输出 `recommendedSet`，验证组合后
仍满足 non-regression。推荐只代表 development evidence，不改变 `autoApplicable: false` / `reviewRequired: true`。
命令只写 `evaluation.json`，不会写 simulated Draft：

```bash
pnpm pdf-omr -- evaluate-repair-candidates \
  --comparison /absolute/path/to/comparison-run \
  --primary /absolute/path/to/primary-run \
  --output /absolute/path/to/evaluation-run
```

Rokot 使用明确锁定的 Q8_0 GGUF、F16 vision projector、llama.cpp build 和独立 Python 3.11
converter environment；recognize 不会自动下载模型。推理固定 `maxNewTokens=1600` 与 `ctxSize=4096`，避免
llama.cpp 按模型 metadata 分配远超单个 system transcription 所需的默认 KV cache。先准备并保留本地模型：

```bash
rokot_snapshot=$(HF_XET_HIGH_PERFORMANCE=1 hf download rokotmidi/rokot-omr-2b \
  --revision 7add305aade6fb3a64ad4dde77d410fa68381089 \
  --include 'rokot-omr-2b-Q8_0.gguf' \
  --include 'mmproj-rokot-omr-2b-f16.gguf')

PDF_OMR_ROKOT_LLAMA_CLI=/absolute/path/to/llama-cli \
PDF_OMR_ROKOT_MODEL="$rokot_snapshot/rokot-omr-2b-Q8_0.gguf" \
PDF_OMR_ROKOT_MMPROJ="$rokot_snapshot/mmproj-rokot-omr-2b-f16.gguf" \
PDF_OMR_ROKOT_ABC2XML_PYTHON=/absolute/path/to/abc2xml-venv/bin/python \
  pnpm pdf-omr -- recognize input.pdf --engine rokot --output result
```

默认 `--staff-layout auto`。已知输入类型时应显式传 `single-staff` 或 `grand-staff`；`auto` 只接受整页一致的
topology，同页同时出现已配对 grand staff 与未配对 single staff 时会在 inference 前失败。benchmark manifest
也用每个 item 的 `staffLayout` 声明相同约束，避免用文件名或 category 猜测。

默认 `--input-scope full-page`。若 PDF 每页已经是一个裁好的 system，使用
`--input-scope system-crop --staff-layout <single-staff|grand-staff>` 直接送入模型，避免二次 segmentation。
公开 benchmark 的 OLiMPiC oracle items 使用 `system-crop`；contract 与 FP-GrandStaff 使用 `full-page`。
full-page detector v2 合并 continuous-first 与 fragmented-first 候选，并按 connector evidence 选择
grand-staff pairing。对已确认的 single staff，adapter 还可将严格 header-valid、以 barline 结束的 unvoiced
ABC 确定性规范化为 `V:1`；grand staff 仍 fail closed。

converter environment 必须安装 `abc-xml-converter==1.0.1`。完整 revision、hash、decoder 参数和
license provenance 见 `engines/rokot-environment.json`；模型和 Python environment 不提交到仓库。

full-page development corpus 的 segmentation pilot 不调用模型，只渲染原始多页 PDF 并逐页运行
`rokot-staff-system-v1` 的 `grand-staff` mode，用于在 inference 前审计 page/system boundary。该 detector 保留 fragmented-row 检测，
并允许被密集音符遮断的谱线片段对齐到同一条完整谱线范围；严格直线配对失败后，孤立候选可使用
曲线花括号覆盖率回退：

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/run_full_page_segmentation_pilot.ts \
  tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/manifest.json \
  tools/pdf-omr-cli/reports/development/olimpic-scanned-full-page-v1-segmentation-pilot/segmentation.json
```

该脚本保留 render/crop hashes、逐页错误 stage 和 `ambiguous-system-segmentation` context，不写回输入或
人工修补 crop。full-page protocol、readiness limitation 和两次相同 report hash 见
`tools/pdf-omr-cli/docs/evaluation.md` 与对应 development report README。

## Run artifacts

成功的 `import-midi` run 包含：

```text
run.json
input/midi.mid
input.json
raw-midi.json
performance-evidence.json
diagnostics.json
```

原始 bytes 与 raw/performance evidence 对相同输入必须 deterministic；`run.json` 含执行时间戳，不属于
byte-for-byte deterministic evidence。MIDI import 完全运行在 Node.js/TypeScript 与 npm 生态，不引入
Python runtime。

成功的 `fuse` run 包含：

```text
run.json
input/score.<source-extension>
input/midi.mid
input.json
score-evidence.json
performance-evidence.json
alignment.json
repair-proposals.json
diagnostics.json
```

本地验证一组同曲 MusicXML/MIDI：

```bash
fusion_run_dir=$(mktemp -d)/fusion-run

pnpm pdf-omr -- fuse \
  --musicxml /absolute/path/to/score.mxl \
  --midi /absolute/path/to/score.mid \
  --output "$fusion_run_dir"

jq '{compatibility, summary}' "$fusion_run_dir/alignment.json"
jq '{
  proposalCount: (.proposals | length),
  byType: (.proposals | sort_by(.type) | group_by(.type) |
    map({type: .[0].type, count: length}))
}' "$fusion_run_dir/repair-proposals.json"
jq 'sort_by(.code) | group_by(.code) |
  map({code: .[0].code, count: length})' "$fusion_run_dir/diagnostics.json"
```

先看 `compatibility.status`，只有 `compatible` / `ambiguous` 才会进入 alignment。提升效果时分别观察
`scoreCoverage`、`midiCoverage`、`pitchAgreement` 和三类 proposal 数量，不能只优化单一 coverage。
同一输入重复运行时，除 `run.json` 外的八个 artifacts 应 byte-for-byte 相同。

人工审核后创建 `decisions.json`：

```json
{
  "schemaVersion": "1.0.0",
  "fusionRun": {
    "runId": "<run.json runId>",
    "runManifestSha256": "<run.json SHA-256>",
    "repairProposalsSha256": "<repair-proposals.json SHA-256>"
  },
  "decisions": [
    {
      "proposalId": "proposal-000000",
      "action": "apply",
      "writtenPitch": { "step": "C", "alter": 1, "octave": 4 }
    }
  ]
}
```

执行回写：

```bash
pnpm pdf-omr -- apply-fusion \
  --run /absolute/path/to/fusion-run \
  --decisions /absolute/path/to/decisions.json \
  --output /absolute/path/to/writeback-run
```

成功 run 包含 `corrected/score.musicxml|score.mxl`、`patch-plan.json`、拆分的 `validation/*`、
`diagnostics.json` 和带 artifact hashes 的 `run.json`。source/proposal hash 漂移、已有 output、结构变化或
fusion metrics 回退都会在发布 output 前失败。

当 OMR 的小节边界或 voice duration 已损坏时，使用显式的 MIDI 重建阶段：

```bash
pnpm pdf-omr -- rebuild-from-midi \
  --musicxml /absolute/path/to/recognized.musicxml \
  --midi /absolute/path/to/score-export.mid \
  --musescore /absolute/path/to/mscore \
  --output /absolute/path/to/rebuild-run
```

成功 run 包含 immutable inputs、`corrected/score.musicxml`、`validation.json` 和记录 MuseScore version、
输入/输出 hashes、小节数及音符数的 `run.json`。

仓库内 K331 是 `derived-controlled` upper-bound：reviewed MusicXML 是 ground truth，PDF 与 MIDI
均由它导出。当前 fixture 的 report-only 结果为 score coverage `0.9988`、MIDI coverage `0.9916`、
pitch agreement `1.0`，剩余 24 条 proposal 全部不可自动应用。这组结果用于防止 clean alignment
回退，不能单独证明真实扫描 PDF 或真人演奏 MIDI 的泛化改善。

成功的 `recognize` run 包含：

```text
run.json
input.json
engine/environment.json
engine/raw-output.mxl
engine/raw-output.omr
draft.json
diagnostics.json
```

LEGATO run 的 engine artifacts 为 `raw-output.abc`、`converted.musicxml` 与逐页 decoder telemetry
`inference.json`。Rokot 改为 `segmentation.json` 以及
`systems/page-NNN-system-NNN.{png,abc,musicxml}`。任一 native syntax、spine、conversion 或 Draft
validation 问题都必须稳定失败，不能静默猜测。

`run.json` 记录 input hash、engine version、参数和所有已提交 artifact hashes。绝对输入路径、raw
stderr 和 exception stack 不进入 canonical artifacts。已有输出目录不会被覆盖。

Benchmark 还会先校验 ground-truth readiness，并以 structural role 对齐 part identity；校验阻断或 part
mapping 冲突会生成 evaluation limitation，不伪造 symbolic/Harmony metrics。成功 item 仍会保留 symbolic
metrics；若 predicted Draft 在附加 Harmony analysis 中触发已知的 exact-tick 或 written-moment
projection limitation，则 Harmony impact 记录 `omrBlocked`，不会把已完成的 recognition 误记为 engine failure。
未知 analyzer 异常仍会向外抛出。成功 item 的 runtime artifacts 记录五个 pipeline stage 的 wall time，并在
Unix/macOS 运行 engine 时每 250ms 采样独立进程组，报告
`processResources` 的采样数、平均/峰值 CPU 与 engine process-tree peak RSS；aggregate report 输出
这些指标的分布。可用的 GPU/cancel probe 仍独立记录。没有探针或没有有效样本时字段保持缺失，并由
`metricsAvailability` 显式标记，holdout gate 对其 fail closed。没有可量化 duration 的 grace note 会保留
`MISSING_EVENT_TIMING` warning，不会被当成可用于
timing 对齐的事件。Benchmark item 还保留 `engine/normalization-output.bin`，即 adapter 的原始 canonical
normalization payload；Rokot item 另外写出 `joining.json`，其中包含按 page/system 排序的 system span、local
measure numbers、global measure boundaries 和 normalized measure count。它可与 `segmentation.json`、
`systems/*` 和 `predicted-draft.json` 一起复查 joining、measure identity 与 source boundary。
每个成功 item 还写出 `predicted-validation.json`，直接记录 Harmony/MusicXML readiness 与诊断。development
失败 item 可保留有界 `failure-debug/`；holdout 不保留该目录。

新的真实扫描 intake 位于 `corpus/olimpic-scanned-v1/`，manifest 记录 OLiMPiC release、source split、
archive/item hashes 与 CC BY-SA 4.0 provenance；该 v1 明确是 `system-crop` scope，不代表 full-page
segmentation 或跨 system joining。

## Public pianoform benchmark profiles

新的 profiled manifest 支持两种固定规模：`quick` 为 10 个唯一 items 且不重复；`standard` 为 45 个唯一
items，其中仅 6 个 `oracle-system` items 运行两次，并带 `3_600_000 ms` 总墙钟预算。总预算过期会终止
runner 持有的执行、为未完成 items 写入稳定失败记录，并以
`BENCHMARK_RESOURCE_BUDGET_EXCEEDED` 返回；外部取消仍保持 `INTERRUPTED`。

profiled report 的 `overall` 聚合所有成功 items，`quality` 只聚合 `oracle-system`。holdout gate 只读取
`quality`，因此 contract fixtures 与 synthetic full-page pages 不能抬高 engine 识别质量。旧 manifest 没有
`execution` 时仍保持全部 items 运行两次，既有冻结 hash 不变。

每个公开 benchmark item 声明 `staffLayout`：三个 melody contract fixtures 为 `single-staff`，piano
contract、OLiMPiC 与 FP-GrandStaff 为 `grand-staff`。quick 的两个 contract 固定为一单谱表加一大谱表；
失败摘要保留稳定的 `code`、`stage` 和 `reason`，不包含 path、raw exception 或 stderr。

公开大文件与 materialized assets 保持在仓库外；仓库只冻结三个 suite 的 selection metadata。当前锁定输入为：

- OLiMPiC `1.0-scanned (2024-02-12)` archive SHA-256
  `a84091b50154251b66d37b50806f98d8a6d758b4195d2aa9805d1b9cb78e6993`。
- FP-GrandStaff revision `334351427faf94cdb17fecbbab8d83fcf225fa46`；`val` parquet SHA-256
  `c7d6d77dd0e4874c7875c36f02b8c4dd62edbcb4a8e31dc49db4006f3135a1bc`，`test` parquet SHA-256
  `6a16319fd368ce5fa9b99d13817733ed1fe4f7a01565cb4d0bf5f50f829d17ad`。

在一个全新的外部目录中按以下顺序构建。先生成 OLiMPiC inventory，执行 ground-truth readiness audit，
再基于 ready candidates 冻结选择并 materialize 72 个 system assets：

```bash
python3 tools/pdf-omr-cli/scripts/build_olimpic_system_inventory.py \
  --source-root "$PUBLIC_BENCHMARK_CACHE/olimpic-1.0-scanned" \
  --archive-sha256 a84091b50154251b66d37b50806f98d8a6d758b4195d2aa9805d1b9cb78e6993 \
  --output "$PUBLIC_BENCHMARK_CACHE/olimpic.inventory.json"

pnpm exec vite-node tools/pdf-omr-cli/scripts/audit_benchmark_ground_truth.ts \
  "$PUBLIC_BENCHMARK_CACHE/olimpic.inventory.json" \
  "$PUBLIC_BENCHMARK_CACHE/olimpic-1.0-scanned" \
  "$PUBLIC_BENCHMARK_CACHE/olimpic.readiness.json"

python3 tools/pdf-omr-cli/scripts/build_olimpic_system_inventory.py \
  --source-root "$PUBLIC_BENCHMARK_CACHE/olimpic-1.0-scanned" \
  --archive-sha256 a84091b50154251b66d37b50806f98d8a6d758b4195d2aa9805d1b9cb78e6993 \
  --output "$PUBLIC_BENCHMARK_CACHE/olimpic.inventory.json" \
  --readiness "$PUBLIC_BENCHMARK_CACHE/olimpic.readiness.json" \
  --selection-output "$PUBLIC_BENCHMARK_CACHE/olimpic-selection.json"

python3 tools/pdf-omr-cli/scripts/materialize_olimpic_system_selection.py \
  --source-root "$PUBLIC_BENCHMARK_CACHE/olimpic-1.0-scanned" \
  --inventory "$PUBLIC_BENCHMARK_CACHE/olimpic.inventory.json" \
  --selection "$PUBLIC_BENCHMARK_CACHE/olimpic-selection.json" \
  --output-root "$PUBLIC_BENCHMARK_CACHE/materialized" \
  --output-inventory "$PUBLIC_BENCHMARK_CACHE/olimpic.materialized.json"
```

FP-GrandStaff 先从 pinned parquet 生成全量 inventory，把 eKern 转成临时 MusicXML 做 readiness audit，
再选择并 materialize 8 个 page assets：

```bash
uv run --with pyarrow tools/pdf-omr-cli/scripts/build_fp_grandstaff_inventory.py \
  --val-parquet "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-val.parquet" \
  --val-sha256 c7d6d77dd0e4874c7875c36f02b8c4dd62edbcb4a8e31dc49db4006f3135a1bc \
  --test-parquet "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-test.parquet" \
  --test-sha256 6a16319fd368ce5fa9b99d13817733ed1fe4f7a01565cb4d0bf5f50f829d17ad \
  --output "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff.inventory.json"

uv run --with converter21 tools/pdf-omr-cli/scripts/prepare_fp_ground_truth_audit.py \
  --inventory "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff.inventory.json" \
  --output-root "$PUBLIC_BENCHMARK_CACHE/fp-ground-truth-audit" \
  --output-inventory "$PUBLIC_BENCHMARK_CACHE/fp-audit.inventory.json"

pnpm exec vite-node tools/pdf-omr-cli/scripts/audit_benchmark_ground_truth.ts \
  "$PUBLIC_BENCHMARK_CACHE/fp-audit.inventory.json" \
  "$PUBLIC_BENCHMARK_CACHE/fp-ground-truth-audit" \
  "$PUBLIC_BENCHMARK_CACHE/fp.readiness.json"

uv run --with pyarrow tools/pdf-omr-cli/scripts/build_fp_grandstaff_inventory.py \
  --val-parquet "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-val.parquet" \
  --val-sha256 c7d6d77dd0e4874c7875c36f02b8c4dd62edbcb4a8e31dc49db4006f3135a1bc \
  --test-parquet "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-test.parquet" \
  --test-sha256 6a16319fd368ce5fa9b99d13817733ed1fe4f7a01565cb4d0bf5f50f829d17ad \
  --output "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff.inventory.json" \
  --readiness "$PUBLIC_BENCHMARK_CACHE/fp.readiness.json" \
  --selection-output "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-selection.json"

uv run --with pyarrow --with pillow --with converter21 \
  tools/pdf-omr-cli/scripts/materialize_fp_grandstaff_selection.py \
  --val-parquet "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-val.parquet" \
  --test-parquet "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-test.parquet" \
  --inventory "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff.inventory.json" \
  --selection "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff-selection.json" \
  --output-root "$PUBLIC_BENCHMARK_CACHE/materialized" \
  --output-inventory "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff.materialized.json"
```

最后复制现有 5 个 contract fixtures，并合并三个 materialized inventories：

```bash
python3 tools/pdf-omr-cli/scripts/build_public_contract_inventory.py \
  --manifest tools/pdf-omr-cli/corpus/evaluation/manifest.json \
  --source-root tools/pdf-omr-cli/corpus/evaluation \
  --output-root "$PUBLIC_BENCHMARK_CACHE/materialized" \
  --output-inventory "$PUBLIC_BENCHMARK_CACHE/contract.materialized.json" \
  --selection-output "$PUBLIC_BENCHMARK_CACHE/contract-selection.json"

python3 tools/pdf-omr-cli/scripts/build_public_pianoform_benchmark.py \
  --contract-inventory "$PUBLIC_BENCHMARK_CACHE/contract.materialized.json" \
  --olimpic-inventory "$PUBLIC_BENCHMARK_CACHE/olimpic.materialized.json" \
  --fp-grandstaff-inventory "$PUBLIC_BENCHMARK_CACHE/fp-grandstaff.materialized.json" \
  --output-directory "$PUBLIC_BENCHMARK_CACHE/materialized"
```

builders 不下载数据，也不读取 engine output。最终目录包含 90 个 split-specific assets，以及
`selection.json`、`quick-development.manifest.json`、`standard-development.manifest.json` 与
`standard-holdout.manifest.json`。仓库内 `corpus/public-pianoform-v1/*-selection.json` 是当前冻结选择；
重新构建后 MUST byte-compare 一致，差异意味着 source、readiness 或 selection contract 已漂移。

standard holdout 运行前，使用已提交的 benchmark commit 和显式时间冻结同目录 `protocol.json`。该命令
从三个 engine environment 文件读取锁定 revision/model/decoder，拒绝非 standard holdout manifest，且不
覆盖已有 protocol：

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/freeze_public_pianoform_protocol.ts \
  --manifest "$PUBLIC_BENCHMARK_CACHE/materialized/standard-holdout.manifest.json" \
  --output "$PUBLIC_BENCHMARK_CACHE/materialized/protocol.json" \
  --benchmark-commit "$(git rev-parse HEAD)" \
  --frozen-at "2026-08-12T12:00:00.000Z" \
  --audiveris-version 5.11.0
```

命令输出 `protocolSha256`。holdout 运行必须原样传给 `--protocol-sha`；development/quick 不需要读取
holdout protocol。

运行 quick 前先校验 20 个 corpus files 的 hash，并独立检查四个 engine environment。report 只记录稳定
failure code/reason，不写入绝对路径、raw exception 或 secrets：

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/check_public_pianoform_readiness.ts \
  --manifest "$PUBLIC_BENCHMARK_CACHE/materialized/quick-development.manifest.json" \
  --output "$PUBLIC_BENCHMARK_CACHE/readiness.json"

jq '{readyEngineIds, engines}' "$PUBLIC_BENCHMARK_CACHE/readiness.json"
```

只有出现在 `readyEngineIds` 的 engine 才进入 quick。实际运行仍使用统一 benchmark command，因此 10 分钟
预算、canonical item/report artifacts 和 semantic exit code 不会被 wrapper 绕开。

## 验证

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
python3 -m unittest discover -s tools/pdf-omr-cli/scripts -p 'test_*.py'
```
