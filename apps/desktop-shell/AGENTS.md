# desktop-shell context

## 信任边界

- Main 拥有文件系统、SQLite、托管文件、窗口和应用生命周期。
- Preload 只暴露 `request` / `subscribe`，不得把 Electron 或通用 IPC 暴露给 Renderer。
- Renderer 是 Web 环境，只消费公开的 `web-core` / `web-viewer` API，不得导入 `node:*`、Main 模块或获得绝对路径。
- 所有 IPC request、response 和 event 都经过版本化 Zod schema 精确校验。

## Bridge 变更清单

- request schema、response schema、类型映射、capability。
- Preload 暴露面、Main handler、Renderer adapter。
- schema 单测、dispatcher 单测和必要的 E2E 用户旅程。

参考：`src/preload.ts`、`src/main/bridge/dispatcher.ts`、`src/main/bridge/server.ts`、`src/renderer.ts`、`e2e/desktop.spec.ts`。
最小验证：`pnpm desktop:build`；端到端：`pnpm desktop:test:e2e`。

## 本地启动与 UI 复现

- 启动前先 `pnpm desktop:build`（产物 `dist/main/main.cjs`），再 `pnpm desktop:start`；`pnpm desktop:dev` 只是 rspack watch，不启动应用。
- 用 `--user-data-dir=<dir>` 隔离 profile（`pnpm desktop:start --user-data-dir=<dir>`；参数直接跟在 script 名后，不要加 `--`，否则字面 `--` 会传给 Electron 使 flag 失效）。启动前可预置
  `preferences.json`（`localePreference`）和 `recognition-providers/<provider>.json`（schema 见
  `src/main/recognition/provider-configuration-store.ts`）来配置识谱引擎；引擎资源默认缓存在
  `~/.cache/zupulse-rokot`、`~/.cache/zupulse-legato`。
- UI 驱动参考 `e2e/desktop.spec.ts` 的 `_electron.launch`：原生文件对话框无法自动化点击，用
  `app.evaluate` mock `dialog.showOpenDialog` / `showSaveDialog`；Renderer 的 `window.confirm` 会被
  Playwright 自动 dismiss，需要先 `page.evaluate` 覆盖。
- PDF OMR 任务可能运行数分钟，超出单次脚本等待能力时，用常驻 driver 进程（命令文件轮询）跨调用交互；
  结束后必须关闭 Electron 进程，不留孤儿进程。
- PDF OMR 复现输入：`tools/pdf-omr-cli/corpus/evaluation/melody-clean.pdf` 可走通成功路径；
  `tools/pdf-omr-cli/corpus/olimpic-scanned-full-page-dev-v1/**` 与
  `test-fixtures/musicxml/K331-3_reviewed.pdf` 当前在 full-page staff-system segmentation 必然失败
  （`ENGINE_OUTPUT_INVALID`，见 `tools/pdf-omr-cli/src/__tests__/olimpic-full-page-corpus.test.ts`）。
- 不要用 `tools/pdf-omr-cli` CLI 复现扫描件：dev 布局下 pdfjs wasm 资源解析失败导致 JBig2 无法解码；
  desktop dist 内置 `pdfjs-wasm`，无此问题。
- 任务产物在 `<userData>/pdf-omr/<jobId>/output/`（如 `inspect/input.json` 含页数与页面尺寸）；
  失败诊断先看产物和 Main 日志，再看 UI 展示。
