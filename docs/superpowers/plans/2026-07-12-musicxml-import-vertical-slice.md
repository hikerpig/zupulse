# MusicXML Import Vertical Slice Implementation Plan

> 本计划只覆盖 MusicXML-first 竖切，不实施 MIDI Analyzer。实施时逐任务执行测试先行，并保留工作区中与 score workspace scrolling 有关的现有修改。

**Goal:** 在 Desktop Shell 的统一“打开乐谱”入口中支持 `.musicxml` 与 `.mxl`，复用 alphaTab 完成响应式谱面、播放和练习能力，并提供可信诊断、事务式 Session 切换与跨平台验收。

**Architecture:** 将 GP 专属打开流程收敛为共享 Open Score 管线。Electron Main 只负责文件选择、受限读取和 token；Web Core 负责内容探测、格式 adapter、身份、Candidate Session 与诊断；Web Viewer 负责 latest-intent-wins 编排、加载状态、原子提交和降级 UI。alphaTab `Score` 是 MusicXML 渲染与播放运行时权威，自有模型只投影稳定业务子集。

**Tech Stack:** TypeScript、Zod 4、alphaTab 1.8.4、Vitest、Electron、Playwright、pnpm workspace。

## Global Constraints

- 遵循 ADR 0036、0037、0038 与 `docs/architecture/musicxml-import-design.md`。
- 正式支持 `.musicxml` 与 `.mxl`；`.xml` 只能经“所有文件”选择并通过内容探测识别。
- 不支持 opus、MusicXML 编辑、回写、另存或打印保真。
- 原始文件内容 SHA-256 仍是 Score Identity 权威。
- 导入失败、取消或 superseded 不得销毁或覆盖当前 Viewer Session。
- MusicXML/MXL 一律视为不可信输入；资源超限必须返回稳定诊断。
- 不复制 MusicXML/alphaTab 完整对象图到 `ScoreDocument`。
- 不把现有 GP/MusicXML adapter 扩张成第三方插件系统。
- 每个任务先写失败测试，再实现最小改动，并运行任务级测试；里程碑结束运行根级 `pnpm check`、两个应用构建及 Desktop E2E。

## Task 1：扩展格式、身份与 Bridge 的共享契约

**Files:**

- Modify: `packages/web-core/src/score/types.ts`
- Modify: `packages/web-core/src/score/format.ts`
- Modify: `packages/web-core/src/score/format.test.ts`
- Modify: `packages/web-core/src/score/schemas.ts`
- Modify: `packages/web-core/src/bridge/schemas.ts`
- Modify: `packages/web-core/src/bridge/schemas.test.ts`
- Modify: `packages/web-core/src/bridge/types.ts`

**Steps:**

- [ ] 给 `ScoreFormat` 增加 `musicxml`，给受支持扩展增加 `.musicxml` 与 `.mxl`；`.xml` 不作为仅凭扩展名即可确认的格式。
- [ ] 将现有 `detectScoreFormat(fileName)` 拆成扩展名提示与最终内容探测可以分别使用的 API，保持 GP 调用方兼容。
- [ ] 扩展 `scoreIdentitySchema` 的格式枚举并添加 round-trip 测试。
- [ ] 将 Bridge 中的 GP 专属命名收敛为 Score 文件语义；Bridge response 继续只返回 opaque token、文件名和体积。
- [ ] 添加大小写扩展名、伪装扩展名、无扩展名和通用 `.xml` 的测试。

**Verify:** `pnpm exec vitest run packages/web-core/src/score packages/web-core/src/bridge`

## Task 2：把 Electron GP 文件端口泛化为安全的 Score 文件端口

**Files:**

- Modify: `apps/desktop-shell/src/main/files.ts`
- Modify: `apps/desktop-shell/src/main/files.test.ts`
- Modify: `apps/desktop-shell/src/main/bridge.ts`
- Modify: `apps/desktop-shell/src/main/bridge.test.ts`
- Modify: `apps/desktop-shell/src/main/main.ts`
- Modify: `apps/desktop-shell/src/preload.ts`

**Steps:**

- [ ] 将 `openGpFile`、`readGpFileBytes`、`assertReadableGp` 重命名为格式无关 Score API。
- [ ] 文件选择器显示 Guitar Pro、MusicXML 与“所有文件”入口；`.xml` 不进入 MusicXML 默认扩展过滤器。
- [ ] 保留一次性 token、真实路径隔离、普通文件检查和 64 MiB 源文件硬上限。
- [ ] 文件扩展名只做选择器提示；Main 不宣称文件内容有效，最终判定交给 Web Core Format Probe。
- [ ] 更新 Bridge 组合测试，确认取消、token 单次消费、读取后二次体积检查及非普通文件拒绝行为不变。

**Verify:** `pnpm exec vitest run apps/desktop-shell/src/main/files.test.ts apps/desktop-shell/src/main/bridge.test.ts`

## Task 3：实现 Format Probe 与 MusicXML/MXL 安全预检

**Files:**

- Create: `packages/web-core/src/score/formatProbe.ts`
- Create: `packages/web-core/src/score/formatProbe.test.ts`
- Create: `packages/web-core/src/musicxml/preflight.ts`
- Create: `packages/web-core/src/musicxml/preflight.test.ts`
- Create: `packages/web-core/src/import/diagnostics.ts`
- Create: `packages/web-core/src/import/diagnostics.test.ts`
- Modify: `packages/web-core/src/index.ts`

**Steps:**

- [ ] 定义 `FormatProbeResult`，区分 confirmed、unsupported 与 malformed，并记录扩展名提示和内容证据。
- [ ] 识别 GP headers/ZIP、纯 XML 的 `score-partwise`/`score-timewise` 根元素，以及带 `META-INF/container.xml` 的 MXL。
- [ ] MXL 预检限制容器入口数、单入口解压量和累计解压量；具体默认值集中配置，测试覆盖 zip bomb 模拟、缺失 rootfile、路径缺失和损坏 XML。
- [ ] XML 预检只提取根结构、版本、part/measure/note 计数和已知高风险特性，不实现完整 MusicXML importer。
- [ ] 定义稳定诊断 code、severity、用户摘要和可选技术上下文；区分 unsupported、malformed、resource-limit-exceeded。

**Verify:** `pnpm exec vitest run packages/web-core/src/score/formatProbe.test.ts packages/web-core/src/musicxml/preflight.test.ts packages/web-core/src/import/diagnostics.test.ts`

## Task 4：建立窄 ScoreFormatAdapter 与通用 Candidate Session 管线

**Files:**

- Create: `packages/web-core/src/import/types.ts`
- Create: `packages/web-core/src/import/openScore.ts`
- Create: `packages/web-core/src/import/openScore.test.ts`
- Create: `packages/web-core/src/gp/gpFormatAdapter.ts`
- Modify: `packages/web-core/src/gp/gpOpenFlow.ts`
- Modify: `packages/web-core/src/score/session.ts`
- Modify: `packages/web-core/src/score/session.test.ts`
- Modify: `packages/web-core/src/index.ts`

**Steps:**

- [ ] 定义只满足 GP/MusicXML 的 `ScoreFormatAdapter`：probe 后解析、运行时验证、领域投影与诊断；runtime payload 保持 opaque。
- [ ] 定义 `ImportResult = success | success-with-warnings | failure` 与 Candidate Session。
- [ ] 把身份、sidecar 读取、资源检查和最低运行时验证放在提交之前。
- [ ] 将 GP 现有 loader 包装成 GP Adapter，保留已有 GP 行为和测试。
- [ ] `openGpThroughBridge` 过渡为共享 `openScoreThroughBridge` 的兼容薄封装，随后迁移调用方。
- [ ] 测试失败、取消和带警告成功都不会隐式销毁调用方的现有 Session。

**Verify:** `pnpm exec vitest run packages/web-core/src/import packages/web-core/src/gp packages/web-core/src/score`

## Task 5：实现 MusicXML Adapter、alphaTab 投影与能力降级

**Files:**

- Create: `packages/web-core/src/musicxml/musicXmlAdapter.ts`
- Create: `packages/web-core/src/musicxml/musicXmlAdapter.test.ts`
- Create: `packages/web-core/src/musicxml/alphaTabProjection.ts`
- Create: `packages/web-core/src/musicxml/alphaTabProjection.test.ts`
- Create: `packages/web-core/src/score/positions.ts`
- Create: `packages/web-core/src/score/positions.test.ts`
- Modify: `packages/web-core/src/score/types.ts`
- Modify: `packages/web-core/src/index.ts`

**Steps:**

- [ ] 使用锁定 alphaTab importer 解析纯 MusicXML、score-timewise 与 MXL；显式设置 `mergePartGroupsInMusicXml: false` 和资源预算。
- [ ] 投影 title、artist、part/track、staff 摘要、master bars、tempo 与播放能力，不镜像完整 alphaTab 对象。
- [ ] 一个 part 映射一个 track，多 staff 保留在 track 内，voice 不变成独立 track。
- [ ] 定义 `WrittenPosition` 与 `PlaybackOccurrence` 的版本化 schema 和映射 API，测试简单反复、ending 与无法重建 occurrence 的回退。
- [ ] 无可播放时间轴但书面结构可靠时返回 `success-with-warnings` 与 view-only capability；核心结构不可靠才 failure。
- [ ] 为显示/播放核心统计不一致生成严重诊断，但不猜测 alphaTab 未报告的全部忽略元素。

**Verify:** `pnpm exec vitest run packages/web-core/src/musicxml packages/web-core/src/score/positions.test.ts`

## Task 6：在 Web Viewer 实现 latest-intent-wins 与原子 Session 提交

**Files:**

- Create: `packages/web-viewer/src/importJob.ts`
- Create: `packages/web-viewer/src/importJob.test.ts`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Modify: `packages/web-viewer/src/viewerApp.test.ts`
- Modify: `packages/web-viewer/src/host.ts`
- Modify: `packages/web-viewer/src/index.ts`

**Steps:**

- [ ] 为每次 Open Score Intent 创建带 generation/AbortSignal 的 Import Job。
- [ ] 新 Job 将旧 Job 标记 superseded；不可中断的底层结果也必须在提交前被 generation guard 丢弃。
- [ ] Candidate Session 完成最低验证后才替换 active session，并在新 Session 就绪后销毁旧 Session。
- [ ] 取消选择、用户取消、失败和 superseded 均保留当前 Session。
- [ ] 最近打开和 sidecar 只能在成功提交后更新。
- [ ] 用可控 deferred promises 测试慢旧请求不能覆盖快新请求。

**Verify:** `pnpm exec vitest run packages/web-viewer/src/importJob.test.ts packages/web-viewer/src/viewerApp.test.ts`

## Task 7：接入 MusicXML Viewer、轨道默认策略与加载/诊断 UI

**Files:**

- Modify: `packages/web-viewer/src/viewerShell.ts`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Modify: `packages/web-viewer/src/gpDemoPresenter.ts` or replace with a format-neutral presenter
- Create: `packages/web-viewer/src/importPresenter.ts`
- Create: `packages/web-viewer/src/importPresenter.test.ts`
- Modify: `packages/web-viewer/src/playbackPresenter.ts`
- Modify: `packages/web-viewer/src/styles.css`
- Modify: `packages/web-viewer/src/viewerApp.test.ts`

**Steps:**

- [ ] 将“打开 GP 文件”改为“打开乐谱”，保持现有可访问按钮和状态区域。
- [ ] 显示读取、检查、解析、准备谱面、准备播放五个真实阶段；只有真实字节进度才显示百分比。
- [ ] 1–4 part 默认全部显示；超过 4 part 默认显示首个非打击乐 part，同时明确显示总 part 数和轨道入口。
- [ ] 展示聚合 warning banner 与可展开导入报告，不逐条弹窗。
- [ ] view-only Session 禁用播放、循环和节拍器，保留滚动、缩放、批注与轨道显示。
- [ ] 复用并尊重当前 score workspace scrolling 改动，不重写现有布局结构。

**Verify:** `pnpm exec vitest run packages/web-viewer/src`

## Task 8：建立 MusicXML fixtures、结构验收与来源记录

**Files:**

- Create: `test-fixtures/musicxml/README.md`
- Create: `test-fixtures/musicxml/generated/`
- Create: `scripts/generate-musicxml-fixtures.mjs`
- Create: `scripts/verify-musicxml-fixtures.mjs`
- Modify: `package.json`
- Test: `packages/web-core/src/musicxml/musicXmlAcceptance.test.ts`

**Steps:**

- [ ] 生成确定性最小 fixtures：单声部、钢琴双 staff/多 voice、多 part、大型总谱、timewise、拍调速变化、repeat/ending、歌词、弱起和中文元数据。
- [ ] 生成 `.mxl`、损坏 XML/MXL、伪装扩展名、空谱和超限模拟样本。
- [ ] 对外部真实 fixtures 记录来源、许可证、导出软件和版本；未明确授权的用户文件不得提交仓库。
- [ ] 验证脚本断言导入三态、结构摘要、默认轨道、播放 capability、位置映射和诊断代码。
- [ ] 根脚本增加 `fixtures:musicxml`，并保证 fixtures 可确定性重建。

**Verify:** `pnpm fixtures:musicxml && pnpm exec vitest run packages/web-core/src/musicxml/musicXmlAcceptance.test.ts`

## Task 9：接通 Browser 验收入口与 Desktop 端到端流程

**Files:**

- Modify: `apps/web-demo/src/browserHost.ts`
- Modify: `apps/web-demo/src/browserHost.test.ts`
- Modify: `apps/web-demo/src/main.ts`
- Modify: `apps/desktop-shell/e2e/desktop.spec.ts`
- Modify: `apps/desktop-shell/scripts/verify-package.mjs`
- Modify: `apps/web-demo/scripts/verify-assets.mjs`

**Steps:**

- [ ] Web Demo 增加开发用 fixture selector，但不增加公开产品化的持久文件权限。
- [ ] Desktop E2E 覆盖 MusicXML 正常打开、MXL、带警告成功、失败保留旧谱、再次打开 supersede 和只读降级。
- [ ] 保持 Renderer CSP、sandbox、context isolation 与 worker 资源策略不变。
- [ ] 构建验证确认 alphaTab worker、font、soundfont 和新增 fixture/资源路径离线可用。

**Verify:** `pnpm demo:build && pnpm desktop:build && pnpm desktop:test:e2e`

## Task 10：性能、安全与跨平台交付门槛

**Files:**

- Create: `scripts/benchmark-musicxml-import.mjs`
- Create: `docs/architecture/musicxml-import-acceptance.md`
- Modify: `apps/desktop-shell/src/main/diagnostics.ts`
- Modify: `apps/desktop-shell/src/main/diagnostics.test.ts`
- Modify: `package.json`

**Steps:**

- [ ] 用不超过 5 MB、20 part、5 万 note 的基准谱记录字节就绪到首屏和播放就绪耗时。
- [ ] 验证主要开发 Mac 上首屏 P95 ≤ 3 秒、播放总计 ≤ 5 秒、取消/再次打开响应 ≤ 100 ms。
- [ ] 大型总谱验证有阶段反馈、可取消、无窗口假死和无旧 Job 提交。
- [ ] 诊断只写稳定 code、耗时和截断 hash，不记录路径、标题、歌词或原始 XML。
- [ ] 在 Windows x64 内部验收机复用 fixtures 并记录校准结果。
- [ ] 运行完整回归并把实际兼容矩阵、已知 alphaTab 限制和性能结果写入验收文档。

**Verify:**

```bash
pnpm fixtures:gp
pnpm fixtures:musicxml
pnpm check
pnpm demo:build
pnpm desktop:build
pnpm desktop:test:e2e
```

## Completion Criteria

- Desktop Shell 的统一入口可以可靠打开 GP、MusicXML 与 MXL。
- MusicXML 成功、带警告成功、只读降级、失败、取消与 superseded 行为都有自动化覆盖。
- 当前 Session 只在 Candidate Session 验证通过后原子切换。
- repeat/jump 文件具备 Written Position 与 Playback Occurrence 映射测试。
- MXL 资源预算和不可信输入测试通过。
- 代表性 fixtures、Web Demo 验收、macOS/Windows Desktop E2E 和性能报告齐全。
- MIDI 仍未开放，但通用管线允许后续以独立 adapter 接入。
