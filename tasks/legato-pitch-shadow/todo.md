# 执行状态

## 已完成（2026-09-16）

- 源提取支持连续谱线、复合小节线、明确起始反复线、位置限定的速度/小节编号、标准调号及基本临时升降号。
- 完整音高建议支持单声部内唯一和弦对应；保持数量不符、曲线、tie、tuplet、未知记号与移调保护。
- 无法归属的升降号使该页对应谱表调号证据失效，未知音乐记号拒绝整页，不向后传播旧上下文。
- 实验性 `--pitch-correction-python` 与共享 pipeline 显式选项已接线；保留原始 Draft 和源证据，修改仅涉及音高，
  校验及 MusicXML 回环失败时全部回退。默认、Desktop、Remote 和 benchmark 均未启用。
- 修复导出结构比较器将 JSON 属性插入顺序误判为音高差异的问题，增加独立回归。

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
- score-4：源谱 184 个谱表小节、783 个符头，预测各谱表 99 小节而源谱 92 小节，整份拒绝对齐。
  收紧未归属升降号保护后仍需刷新各页可用音高覆盖；几何总数不等于可修正覆盖。
  PDF SHA-256：`5697fee05e9b695e2cf3ec68a63e6bef2a207e81b9de6a365e552256ccc57428`；
  raw XML SHA-256：`1559e6eefc7712550fad56c01471c679c0da71ff41d959c8afefd108bf5a3f04`。
- 额外源预检：K282 的两个本地排版版本均因未知记号拒绝；ASAP Mozart 11/3 因复合小节线/记号拒绝；
  K331 reviewed 因谱表布局、小节线或记号拒绝。它们不是独立正向识别证据，也不能计为零回归样本。

## 验证

- Python 源提取单测：23 项通过，不依赖模型。
- TS 建议与应用测试：21 项通过，包含唯一地址保护、真实导出回环及原始对象不变。
- CLI/共享 pipeline 测试：12 项通过，覆盖修正 MXL、原始产物保留、默认不变、失败回退、互斥参数和取消。
  使用假 engine/提取进程，不代表真实模型或宿主接入。
- MusicXML 属性顺序回归：4 项通过。
- `pnpm verify:fast`：通过 context、arch、design、docs、i18n、format、lint、typecheck，278 个测试文件、1,398 项测试通过。
- 最终记录更新后再次检查格式、文档和 `git diff --check`。
- 前一切片的 `pnpm desktop:build` 通过不代表本轮 Desktop 接入；尚未运行本轮宿主 E2E、打包或发布。

## 下一步与停止条件

1. 冻结未参与规则选择的独立作品、原始推理配置、预算与验收协议，再读取评测 truth。
   报告实际覆盖、正确修改、错误修改、原本正确音符受损及整曲严格匹配；开发谱不能充当 holdout。
2. 补齐 Desktop/Remote 的已配置 Python 传递、打包资源定位和失败/取消测试，不增加 Renderer 路径或额外用户配置。
3. 运行真实生产路径正例及宿主预览/导出验证；独立门槛通过后才启用经过验证的输入范围。
4. 更新契约与 PR，分别报告代码集成、PR 推送与实际发布状态。

生产接入目标仍未完成。不得用默认关闭、所有独立谱拒绝、合成测试通过或单首开发谱收益代替默认准入。
