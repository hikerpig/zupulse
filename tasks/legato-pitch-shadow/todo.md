# 执行状态

- [x] 源几何和建议测试先失败、再通过：Python 10 项、建议 10 项。
- [x] CLI opt-in、默认不变、失败隔离、取消和输入副本一致性测试通过：6 项。
- [x] 真实 PDF 提取检查完成，记录覆盖与拒绝原因。
- [x] 文档、格式、静态检查和测试完成。
- [ ] 冻结独立识别评测协议（下一阶段，不阻塞旁路首个切片）。

## 真实输入检查

使用既有 LEGATO Python 环境（PyMuPDF 1.26.3）直接读取原始 PDF，不运行模型、不读取参考答案。
`piano-recognition-v1-20260905/score-4.pdf` 三页分别为 `unsupported-font`、`unsupported-notation`、
`incomplete-barlines`；`score-9.pdf` 一页为 `incomplete-barlines`，均未输出可比较小节或建议。
这些是源提取拒绝，不是准确率变化，也不能视为正例验证。

连续谱线与小节线合并已测试；实际曲目还包含其他字体的音乐文字、数字标记和复合终止线。
下一步必须通过源位置证据区分这些对象，再扩展支持范围；不得直接忽略未知 glyph 或沿用旧谱号。

## 验证记录

- `python3 -m unittest discover -s tools/pdf-omr-cli/engines -p 'test_pitch_shadow.py'`：10 项通过，
  覆盖连续与断裂谱线、小节线、谱号、字体、曲线和符头定位；不依赖 PyMuPDF 或模型。
- `pnpm test tools/pdf-omr-cli/src/__tests__/pitch-shadow.test.ts`：10 项通过，覆盖只读建议和对应拒绝。
- `pnpm test tools/pdf-omr-cli/src/__tests__/pitch-shadow-command.test.ts`：6 项通过，使用假 engine 和提取进程，
  证明命令接线、输入副本、hash、默认不变及失败隔离，不证明真实识别质量。
- `pnpm verify:fast`：通过 context、arch、design、docs、i18n、format、lint、typecheck 和全部测试；
  首次为 278 个文件、1,379 项测试，补充输入副本测试后再次完整通过。
- `pnpm desktop:build`：Main、Preload、Renderer 编译通过，未启用 Desktop 旁路入口。
- `pnpm format:check`、`git diff --check`：通过；最终记录更新后再次检查文档与格式。
- 新行为先验证失败再实现；未运行真实模型推理、独立识别评测、Browser 或 Desktop 手工/E2E 旅程。
