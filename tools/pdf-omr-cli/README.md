# PDF OMR CLI

该 package 是 PDF → `OmrScoreDraft` → Harmony/MusicXML 与 benchmark 的命令行实验层。当前不接入
`apps/*`，也不承诺这里的 Draft 会直接成为 App 领域模型。

## 当前命令

```bash
pnpm pdf-omr -- --help
pnpm pdf-omr -- inspect <input.pdf> --output <run-dir>
pnpm pdf-omr -- recognize <input.pdf> --engine <audiveris|transcoda|legato> --output <run-dir>
pnpm pdf-omr -- validate <draft.json> --output <diagnostics.json>
pnpm pdf-omr -- analyze <draft.json> --output <harmony.json>
pnpm pdf-omr -- export-musicxml <draft.json> --output <score.mxl>
pnpm benchmark:pdf-omr -- --manifest <manifest.json> --engine <audiveris|transcoda|legato> --output <result-dir>
```

`inspect` 使用 PDF.js，输出 page count、page dimensions 和 vector/raster operator signals。
`recognize` 通过可替换 adapter 调用 Audiveris、Transcoda 或 LEGATO，再规范化为 engine-neutral
Draft。Audiveris 保留原始 MXL/OMR；Transcoda 保留原始 `**kern`；LEGATO 保留原始 ABC。后两者
同时保留转换后的 MusicXML。

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

## Run artifacts

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
`raw-output.abc` 与 `converted.musicxml`。任一 native syntax、spine、conversion 或 Draft
validation 问题都必须稳定失败，不能静默猜测。

`run.json` 记录 input hash、engine version、参数和所有已提交 artifact hashes。绝对输入路径、raw
stderr 和 exception stack 不进入 canonical artifacts。已有输出目录不会被覆盖。

## 验证

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
```
