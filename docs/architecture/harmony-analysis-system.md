# Harmony Analysis 当前实现

本文说明 Harmony Analysis Studio 已落地的系统边界和运行路径。产品行为以运行时代码、Zod schema、Current ADR 和自动化测试为准；历史设计规格只用于解释来源。

## 系统范围

Harmony 功能由四层组成：

```text
Managed Score Copy
  → MusicXML/alphaTab 投影
  → web-core Harmony engine
  → Harmony Analysis Document
  → Effective Projection
  → Studio UI / annotated MusicXML export
```

- `packages/web-core`：书面时间、领域 schema、分析、来源和弦、Correction、Repository contract 和导出。
- `packages/web-viewer`：Studio route、会话状态、编辑命令、autosave、重分析和 Preview Transport。
- `apps/web-demo`：IndexedDB 中的 Library 与 Harmony Analysis Document。
- `apps/desktop-shell`：SQLite/Main/Preload/Renderer adapter；Renderer 只经受校验 Bridge 访问本地能力。
- `tools/harmony-cli`：在 Node.js 中复用 production 投影与 analyzer，执行结构回归、数据集评测和 baseline diff。

Harmony Studio 只对 MusicXML Library Score 开放。Viewer 的练习 sidecar、播放恢复和摘要不读取 Harmony Analysis Document；Studio Preview Transport 也不写这些状态。

## Studio 工作区

Studio 使用独立的 `StudioScoreRuntime`，不创建 Viewer 的 `PlaybackController`，也不接触练习 sidecar 或续播数据。页面是全视口可调双栏，默认左侧乐谱 40%、右侧分析 60%；用户调整后的比例与派生和弦预览开关作为版本化设备偏好保存在 localStorage，损坏或不可用 storage 时安全回退。窄视口堆叠为乐谱后接分析区。

右栏的事实源是 Effective Harmony Range，而非 Revision 数组下标。谱面 Beat/Note 点击与列表选择以书面 range 联动；选择恢复使用书面焦点时刻。列表显示当前有效和弦、来源和置信度，并支持筛选与键盘导航。

Studio runtime 以公开 alphaTab API 临时投影完整 Effective Harmony Projection；每次刷新先恢复上次派生绑定，因而不会重复叠加来源和弦。预览渲染失败和音频不可用均为就地状态，不阻止 Correction 保存或导出。Transport snapshot 由 runtime 拥有，播放、定位、速度和线性局部循环不写入 Viewer 练习状态。
播放状态以 alphaTab 的 `playerStateChanged` 事件为准；调用 `playPause()` 本身不提前宣告状态切换，
避免音频源尚未真正启动时让 UI 提供暂停操作。

## 书面时间与分析输入

`ScoreWrittenMoment` 使用 `measureIndex + offsetTicks` 表达不展开 repeat 的书面位置。MusicXML divisions 可能包含 7、11 等不能被固定 960 tick 精确表示的值，因此 [`writtenTime.ts`](../../packages/web-core/src/harmony/writtenTime.ts) 对实际 divisions 计算安全 LCM：

- 可精确表示的位置才能成为 legal moment；
- 转回来源 divisions 必须完全相等；
- LCM 超出安全整数或位置不可整除时返回结构化错误，不取整或吸附；
- written range 是左闭右开区间，不绑定 playback occurrence 或 track。

MusicXML/alphaTab 投影生成可序列化 `HarmonyAnalysisInput`，保留 measures、track/staff/voice、sounding pitch、spelling、tie/grace 和来源位置。默认 Scope 只包含有音高的非打击乐轨道。

## 分析引擎

生产入口是 [`analyzeHarmony.ts`](../../packages/web-core/src/harmony/analyzeHarmony.ts)，核心顺序是：

1. 从相邻 note onset/offset 建立论文定义的 basic events。
2. 对最长 20 events 的所有 segment 和冻结的 62-label inventory 提取论文特征。
3. 用随应用发布的 Mozart train-only 线性模型和 chord bigram 执行 exact semi-Markov Viterbi。
4. Semi-CRF path 决定 primary chord 与 boundary。
5. bundled frequency ranker 在这些冻结 range 上生成 Top-8 alternatives，并沿用独立规则 confidence
   做 resolved/unresolved 决策。

CRF path score 不作为 confidence。模型是静态 JSON 和确定性 TypeScript，不需要 Torch、Python、
浏览器网络请求或在线服务。模型损坏会明确失败，不能静默切换算法。旧 `analyzeHarmonyRules`
保留为显式 legacy baseline 和实验参数路径。

## Document、来源与 Correction

一次完整成功分析形成不可变 `AnalysisRevision`。当前可编辑状态保存在独立 `HarmonyAnalysisDocument`，不是写回来源 XML，也不持久化 alphaTab runtime、DOM、绝对路径或临时文件 token。

有效视图按以下优先级组合：

```text
User Correction > supported source <harmony> > active Analysis Revision
```

- Correction 以 written range 保存，不绑定旧 segment ID，因此可重新叠加到新 Revision。
- 来源冲突、不支持的来源 kind、微分音和低置信度保持 unresolved，不伪装成 N.C.。
- N.C. 只能来自明确的 source 或 User Correction，analyzer 不自动生成。
- Reset 删除指定范围的 Correction，使下层来源或分析重新显现。

## 持久化与并发

[`HarmonyAnalysisRepository`](../../packages/web-core/src/harmony/repository.ts) 使用 `expectedDocumentVersion` 做 CAS，并校验 `libraryScoreId` 与 `sourceContentHash`：

- Browser adapter 与 Library 共用 IndexedDB transaction；
- Desktop adapter 在 Main 的 SQLite store 中实现相同 contract；
- Preload request/response 和 capability 经过 Zod 校验；
- 删除 Library Score 时同时删除托管字节、练习数据和 Harmony Analysis Document；旧会话不能重建 orphan document。

[`HarmonyStudioSession`](../../packages/web-viewer/src/harmonyStudioSession.ts) 是 UI 会话状态所有者：

- edit 后 500 ms autosave，`flush()` 用于显式保存、离开和导出；
- 保存串行化并使用 CAS，冲突保留本地 Document、暴露 conflict，不覆盖外部版本；
- reanalysis 使用递增 intent，只有最新意图的完整成功结果能替换 active Revision；
- 失败、取消和过期 Job 保留旧 Revision 与最新 Corrections；
- undo/redo 只属于当前会话，不持久化历史 Revision。

## MusicXML/MXL 导出

导出从不可变 Managed Score Copy 和固化的 Effective Projection 生成新副本，不从渲染模型反向序列化，也不修改或重新导入当前 Library Score。

为避免 DOM 重序列化改变未知节点、属性、歌词、direction 和 layout，导出器使用受限的结构感知词法插入。MXL 通过 `fflate` 读取 container rootfile，只替换声明的 score entry，并保留其他 archive entries。

边界保护包括 external entity、path traversal、重复 ZIP entry、压缩比/entry/总解压大小限制和不可表示书面位置拒绝。导出的 `.musicxml`、`.xml` 或 `.mxl` 保持来源容器与扩展名，并可由当前 importer 重新打开。

## 当前质量边界

当前 analyzer 已具备浏览器可运行、确定性、可拒识和可人工修正的完整产品链。K331-3 隔离 eval
显示 raw primary accuracy `79.30%`、raw interval accuracy `71.93%`；默认阈值下 resolved precision
`90.79%`、gold-start coverage `80.12%`。但 `K331-3_reviewed.mxl` 整曲推理约 28 秒，仍明显超过原
5 秒产品目标。这个性能风险不能通过 label Top-K、beam search 或静默规则回退掩盖。

下一轮准确率工作必须使用冻结的数据集角色、作品级 split 和 no-regression baseline；协议、当前基线和调优循环见：

- [`tools/harmony-cli/README.md`](../../tools/harmony-cli/README.md)
- [`tools/harmony-cli/docs/evaluation.md`](../../tools/harmony-cli/docs/evaluation.md)
- [`tools/harmony-cli/docs/tuning-loop.md`](../../tools/harmony-cli/docs/tuning-loop.md)

## 验证入口

```bash
pnpm vitest run packages/web-core/src/harmony
pnpm --filter @zupulse/harmony-cli test
pnpm verify:fast
pnpm verify:e2e
```

Current 决策见 ADR 0052、0053、0066；产品行为和非目标仍可从历史设计规格
[`2026-07-15-harmony-analysis-studio-design.md`](../superpowers/specs/2026-07-15-harmony-analysis-studio-design.md)追溯。
