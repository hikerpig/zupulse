# 执行状态

## 已完成（2026-09-16）

- 源提取支持连续谱线、复合小节线、明确起始反复线、位置限定的速度/小节编号、标准调号及基本临时升降号。
- 完整音高建议支持单声部内唯一和弦对应；保持数量不符、曲线、tie、tuplet、未知记号与移调保护。
- 无法归属的升降号使该页对应谱表调号证据失效，未知音乐记号拒绝整页，不向后传播旧上下文。
- 实验性 `--pitch-correction-python` 与共享 pipeline 显式选项已接线；保留原始 Draft 和源证据，修改仅涉及音高，
  校验及 MusicXML 回环失败时全部回退。默认、Desktop、Remote 和 benchmark 均未启用。
- 修复导出结构比较器将 JSON 属性插入顺序误判为音高差异的问题，增加独立回归。
- registry 支持 `legatoSourcePitchCorrection`，将任务配置中的 Python 传给共享纠错流程，不需要第二条宿主路径配置。
  产品配置尚未开启此开关。提取脚本物化到私有临时目录，避免外部 Python 无法读取 ASAR 资源。

## 真实输出回放

使用 PyMuPDF 1.26.3 和当前 normalizer，直接读取原始 PDF 与既有未经人工纠错的 LEGATO MusicXML；
不运行新推理，不读取 truth 或历史修正 Draft。复现入口：

```bash
pnpm exec vite-node tasks/legato-pitch-shadow/check-source.ts \
  tools/pdf-omr-cli/reports/development/piano-recognition-v1-20260905/score-9.pdf \
  tools/pdf-omr-cli/reports/development/legato-decoder-v1-20260913-r2/score-9/baseline/engine/converted.musicxml \
  /absolute/path/to/legato-venv/bin/python
```

- score-9：源谱 40 个谱表小节、186 个符头；预测两个谱表各 20 小节。
  20 小节一致、15 个因源曲线拒绝、4 个因多声部拒绝；1 处完整音高差异。
  `P2-m11-s0-v1-e4` 从 C4/MIDI 60 修正为 B3/MIDI 59，应用后通过真实导出回环。
  PDF SHA-256：`5b7c61a760c41fc7ba2f4ff00a8cbc10acc1f07fad9cc7830a85d59016ee3b4d`；
  raw XML SHA-256：`933f2509e3c0cab68bd6b24a86bed55fc38b8b6ec247e3777b44a84f19c2b949`。
  在命令末尾增加新的输出目录，可经 `DesktopPdfOmrRuntime` 执行同一回放。
  本地证据：`tmp/pdfs/legato-production/desktop-score-9-replay-v1/`；实际应用 1 处修改并导出 MXL，结束后恢复空闲。
  MXL SHA-256：`655e4702d613ef11589864d76451ccd25652f277fceff4f6be6bce5edd20dfc5`。
  这不是新模型推理、UI 操作或独立评测。
- score-4：源谱 184 个谱表小节、783 个符头，预测各谱表 99 小节而源谱 92 小节，整份拒绝对齐。
  收紧未归属升降号保护后仍需刷新各页可用音高覆盖；几何总数不等于可修正覆盖。
  PDF SHA-256：`5697fee05e9b695e2cf3ec68a63e6bef2a207e81b9de6a365e552256ccc57428`；
  raw XML SHA-256：`1559e6eefc7712550fad56c01471c679c0da71ff41d959c8afefd108bf5a3f04`。
- 额外源预检：K282 的两个本地排版版本均因未知记号拒绝；ASAP Mozart 11/3 因复合小节线/记号拒绝；
  K331 reviewed 因谱表布局、小节线或记号拒绝。它们不是独立正向识别证据，也不能计为零回归样本。

## 验证

- Python 源提取单测：23 项通过，不依赖模型。
- TS 建议与应用测试：21 项通过，包含唯一地址保护、真实导出回环及原始对象不变。
- CLI/共享 pipeline 测试：15 项通过，覆盖修正 MXL、原始产物保留、默认不变、失败回退、互斥参数、取消、registry 传参及脚本副本清理。
  使用假 engine/提取进程，不代表真实模型或宿主接入。
- MusicXML 属性顺序回归：4 项通过。
- `pnpm verify:fast`：通过 context、arch、design、docs、i18n、format、lint、typecheck；278 个测试文件、1,403 项测试通过。
- registry 测试：6 项通过；打包 smoke 单测：2 项通过，保留原有真实进程树取消回归。
- 最终记录更新后再次检查格式、文档和 `git diff --check`。
- `pnpm desktop:build`：通过 Main、Preload、Renderer 构建。
- `pnpm desktop:verify:pdf-omr-runtime`：macOS arm64 打包与常规 runtime smoke 通过。
- `node apps/desktop-shell/scripts/verify-pdf-omr-runtime.mjs /absolute/path/to/legato-venv/bin/python`：
  已使用真实 PyMuPDF 1.26.3 通过 ASAR 内资源执行验证。检查源证据及输入哈希，提取失败回退不能使此 gate 通过。
  输入是确定性非谱面 PDF，因此验证提取执行与安全拒绝，不验证打包后的正向纠错或 UI。
- 本轮尚未运行宿主 UI E2E，也未推送 PR、合并或发布。

## 下一步与停止条件

1. 冻结未参与规则选择的独立作品、原始推理配置、预算与验收协议，再读取评测 truth。
   报告实际覆盖、正确修改、错误修改、原本正确音符受损及整曲严格匹配；开发谱不能充当 holdout。
2. 验证两个宿主完整路径并补齐 Remote 原始证据持久化。当前 worker 仅发布 MXL 和摘要 manifest，随后删除临时目录；
   原始 Draft、源证据与修改清单不能在上线后随临时目录丢失。持久化需覆盖发布失败、删除与过期清理。
3. 运行真实生产路径正例及宿主预览/导出验证；独立门槛通过后才启用经过验证的输入范围。
4. 更新契约与 PR，分别报告代码集成、PR 推送与实际发布状态。

生产接入目标仍未完成。不得用默认关闭、所有独立谱拒绝、合成测试通过或单首开发谱收益代替默认准入。
