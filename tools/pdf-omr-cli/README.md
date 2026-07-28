# PDF OMR CLI

该 package 是 PDF → `OmrScoreDraft` → Harmony/MusicXML 与 benchmark 的命令行实验层。当前不接入
`apps/*`，也不承诺这里的 Draft 会直接成为 App 领域模型。

## 当前命令

```bash
pnpm pdf-omr -- --help
pnpm pdf-omr -- inspect <input.pdf> --output <run-dir>
pnpm pdf-omr -- recognize <input.pdf> --engine audiveris --output <run-dir>
pnpm pdf-omr -- validate <draft.json> --output <diagnostics.json>
pnpm pdf-omr -- analyze <draft.json> --output <harmony.json>
pnpm pdf-omr -- export-musicxml <draft.json> --output <score.mxl>
```

`inspect` 使用 PDF.js，输出 page count、page dimensions 和 vector/raster operator signals。
`recognize` 调用 Audiveris batch CLI，保留原始 MXL/OMR，再规范化为 engine-neutral Draft。

Audiveris executable 默认从 `PATH` 查找。开发或 CI 可以显式指定：

```bash
PDF_OMR_AUDIVERIS_EXECUTABLE=/absolute/path/to/audiveris \
  pnpm pdf-omr -- recognize input.pdf --engine audiveris --output result
```

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

`run.json` 记录 input hash、engine version、参数和所有已提交 artifact hashes。绝对输入路径、raw
stderr 和 exception stack 不进入 canonical artifacts。已有输出目录不会被覆盖。

## 验证

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
```
