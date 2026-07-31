# PDF OMR CLI

该 package 是 PDF → `OmrScoreDraft` → Harmony/MusicXML 与 benchmark 的命令行实验层。当前不接入
`apps/*`，也不承诺这里的 Draft 会直接成为 App 领域模型。

## 当前命令

```bash
pnpm pdf-omr -- --help
pnpm pdf-omr -- inspect <input.pdf> --output <run-dir>
pnpm pdf-omr -- import-midi <input.mid> --output <run-dir>
pnpm pdf-omr -- fuse --musicxml <score.musicxml|score.mxl> --midi <score-export.mid> --output <run-dir>
pnpm pdf-omr -- recognize <input.pdf> --engine <audiveris|transcoda|legato|rokot> --output <run-dir>
pnpm pdf-omr -- validate <draft.json> --output <diagnostics.json>
pnpm pdf-omr -- analyze <draft.json> --output <harmony.json>
pnpm pdf-omr -- export-musicxml <draft.json> --output <score.mxl>
pnpm benchmark:pdf-omr -- --manifest <manifest.json> --engine <audiveris|transcoda|legato|rokot> --output <result-dir>
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
修复建议和 coverage/pitch agreement metrics，但所有建议均为 `autoApplicable: false`，不会生成或
覆盖 corrected MusicXML。真人演奏 MIDI、D.C./D.S./coda、volta ending 和自动修复不在 v1 范围。

`recognize` 通过可替换 adapter 调用 Audiveris、Transcoda、LEGATO 或 Rokot，再规范化为
engine-neutral Draft。Audiveris 保留原始 MXL/OMR；Transcoda 保留原始 `**kern`；LEGATO 保留原始
ABC。后两者同时保留转换后的 MusicXML。Rokot v1 仅处理印刷体钢琴 grand staff，保留逐 system
crop、ABC、MusicXML fragment 和 segmentation metadata；它是隔离的本地研究 engine，不代表 App
已经支持 PDF 导入。

Audiveris executable 默认从 `PATH` 查找。开发或 CI 可以显式指定：

```bash
PDF_OMR_AUDIVERIS_EXECUTABLE=/absolute/path/to/audiveris \
  pnpm pdf-omr -- recognize input.pdf --engine audiveris --output result
```

Transcoda 必须显式提供锁定的 repository、checkpoint 和 Python 3.11 environment：

```bash
PDF_OMR_TRANSCODA_PYTHON=/absolute/path/to/python \
PDF_OMR_TRANSCODA_REPOSITORY=/absolute/path/to/transcoda \
PDF_OMR_TRANSCODA_CHECKPOINT=/absolute/path/to/transcoda-59M-zeroshot-v1.ckpt \
  pnpm pdf-omr -- recognize input.pdf --engine transcoda --output result
```

固定 revision、model hash、decoder 参数和 Python dependencies 见
`engines/transcoda-environment.json`。模型及外部 repository 不提交到本仓库。

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

LEGATO 本地 engine 与官方 Demo 对齐：接受一至三页 PDF，将页面纵向拼接，输出 ABC，再通过
锁定的 `abc2xml.py` 转为 MusicXML。模型条款、revision、hash、预处理和 decoder 参数见
`engines/legato-environment.json`。模型、Llama vision encoder 与外部 repository 不提交到仓库。

Rokot 使用明确锁定的 Q8_0 GGUF、F16 vision projector、llama.cpp build 和独立 Python 3.11
converter environment；recognize 不会自动下载模型。先准备并保留本地模型：

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

converter environment 必须安装 `abc-xml-converter==1.0.1`。完整 revision、hash、decoder 参数和
license provenance 见 `engines/rokot-environment.json`；模型和 Python environment 不提交到仓库。

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

Transcoda run 的 engine artifacts 改为 `raw-output.krn` 与 `converted.musicxml`；LEGATO 改为
`raw-output.abc` 与 `converted.musicxml`。Rokot 改为 `segmentation.json` 以及
`systems/page-NNN-system-NNN.{png,abc,musicxml}`。任一 native syntax、spine、conversion 或 Draft
validation 问题都必须稳定失败，不能静默猜测。

`run.json` 记录 input hash、engine version、参数和所有已提交 artifact hashes。绝对输入路径、raw
stderr 和 exception stack 不进入 canonical artifacts。已有输出目录不会被覆盖。

## 验证

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
```
