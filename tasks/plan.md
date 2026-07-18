---
status: historical
planning_status: proposed
feature: harmony-analysis-studio
source_spec: docs/superpowers/specs/2026-07-15-harmony-analysis-studio-design.md
---

# Implementation Plan: Harmony Analysis Studio

> `status: historical` 是仓库上下文检查对 `tasks/*` 执行文档的固定分类，表示它不覆盖 Current ADR/spec；实际执行生命周期由 `planning_status` 表示。

## Overview

把 Harmony Analysis Studio 分成九个可独立验收的阶段：先关闭书面时间与 XML/MXL 回写风险，再建立领域模型和分析引擎，然后依次交付双宿主持久化、Studio 编辑竖切、导出竖切、发布质量门禁、CLI 工具与数据驱动调优基准。每个阶段都必须留下可运行证据；上一个阶段的退出门槛未通过时，不进入依赖它的阶段。

详细任务与逐项验收见 [`tasks/todo.md`](todo.md)，产品与技术语义仍以[设计规格](../docs/superpowers/specs/2026-07-15-harmony-analysis-studio-design.md)为准。

## Delivery rules

- 一次只实施一个任务；每个任务应在一个聚焦会话内完成。
- 行为先写相邻失败测试，再实现最小代码。
- 不提前铺设未来 ML、Roman numeral、GP 分析或通用制谱编辑抽象。
- 每 2–5 个任务设置 checkpoint；checkpoint 失败只修复当前阶段，不继续叠加功能。
- Browser 先证明共享契约可用，Desktop 随后实现同一契约，不产生两套领域语义。
- 任何 Bridge、Repository 或导出边界都必须先过 Zod/资源限制和数据完整性测试。

## Dependency graph

```text
P0 可行性关口
  T1 written-time 可逆映射 ─┐
  T2 XML/MXL 增量回写 ──────┴─> P1 领域核心
                                  T3 schema/formatter
                                  T4 correction/projection
                                  T5 analysis input/source harmony
                                            │
                                            v
P2 分析引擎 T6 -> T7 -> T8 -> T9 -> T10
                    │
                    └──────────────> P3 数据层 T11 ─┬-> T12 Browser
                                                    └-> T13 Desktop -> T14 -> T15
                                                              │
                                                              v
P4 Studio T16 -> T17 -> T18 -> T19 -> T20
                                                             │
                                                             v
P5 导出 T21 -> T22 -> T23
                         │
                         v
P6 发布质量 T24 -> T25

P7 CLI 工具 T29 -> T30 -> T31
                         │
                         v
P8 数据驱动调优 T32 -> T33 -> T34 -> T35
```

## Phase 0: Feasibility gates

目标：用最小可运行 fixture 证明两个最高风险边界，不做 UI 或持久化。

- [x] T1：证明 Score Written Moment 与 MusicXML divisions/tuplets 可逆。
- [x] T2：证明 partwise/timewise/MXL 能语义保留地增量写入 `<harmony>`。

### Exit gate P0

> T1 结论：固定 960 tick 无法精确覆盖 7/11 divisions。`web-core` 改用每份谱有效 divisions 的安全 LCM 作为内部 `ticksPerQuarter`；moment 外形不变，超出安全整数的位置拒绝成为 legal moment。

> T2 结论：DOM 重序列化不满足“未触及内容保持”的目标。导出器采用受限的结构感知词法插入，并以直接依赖的 `fflate@0.8.3`（MIT，约 797 KB unpacked）读取和重建 MXL；只替换声明的 rootfile，保留其他解压 entry 内容。外部 DTD、重复/超限 ZIP entry 和超限解压总量在解析前拒绝。

- [x] 变化 divisions、tuplets、多 voice 的 legal moments 可以精确 round-trip；不可表示位置被拒绝而不是取整。
- [x] `.musicxml`、`.xml`、`.mxl` fixture 写入后可重新导入，非 harmony 音乐语义不变。
- [x] XML/ZIP 只采用公开 API；依赖、许可、bundle 影响已记录。
- [x] 若任一项失败，先修订领域位置或导出设计并更新 ADR/spec，不进入 Phase 1。

## Phase 1: Domain core

目标：得到无需 UI/宿主即可验证的 Harmony Analysis Document 与 Effective Projection。

- [x] T3：建立 ChordSymbol、Range、Revision、Document Zod schema 与 formatter。
- [x] T4：实现 Correction range 代数和 Effective Harmony Projection。
- [x] T5：实现 AnalysisInput 与来源 `<harmony>` 投影。

### Exit gate P1

- [x] `pnpm vitest run packages/web-core/src/harmony` 通过。
- [x] 9/11/13、altered degrees、N.C.、unresolved、来源冲突都有结构化 round-trip 测试。
- [x] User Correction > source harmony > revision 的所有组合通过表驱动测试。
- [x] `pnpm verify:fast` 通过。

## Phase 2: Analysis engine

目标：从 AnalysisInput 产出可拒识的 Analysis Revision，先达到规则基线，不接 ML。

- [x] T6：建立 legal boundary lattice 与缓存特征。
- [x] T7：实现基础 kind/extension 候选和 LocalScore。
- [x] T8：实现 segmental Viterbi/beam 与 Transition。
- [x] T9：加入完整 9/11/13 和 altered chord 候选。
- [x] T10：加入非和弦音修正、合并、confidence 和 unresolved。

### Exit gate P2

- [x] 合成 fixtures 覆盖 inversion、9/11/13、`b9/#9/#11/b13` 组合、经过音、挂留、tie、移调乐器和微分音拒识。
- [x] Top-8 oracle recall、resolved precision 和 coverage 能从固定 corpus 自动生成报告；此阶段允许尚未达到最终发布阈值，但不得回归基础 golden cases。（`pnpm harmony:eval`，synthetic baseline；发布独立 corpus 仍属 P6。）
- [x] 典型 fixture benchmark 有基线，边界/候选/beam 上限可观察且取消有效。
- [x] `pnpm verify:fast` 通过。

## Phase 3: Persisted analysis data

目标：Browser 与 Desktop 都能安全保存同一 Harmony Analysis Document，并随 Library Score 删除。

- [x] T11：定义 HarmonyAnalysisRepository、CAS 与共享 contract harness。
- [x] T12：交付 Browser IndexedDB version 2 adapter。
- [x] T13：交付 Desktop SQLite library schema version 2 store。
- [x] T14：升级 Bridge schema 到 3.0.0 并接入 Main/Preload。
- [x] T15：接入 Desktop Renderer adapter 与双端契约测试。

### Exit gate P3

- [x] Browser/Desktop 同一 contract suite 覆盖 create/read/CAS/hash mismatch/delete/orphan prevention/migration failure。
- [x] Library 删除事务同时删除 Harmony Analysis Document；旧 Session autosave 无法重建孤儿记录。
- [x] Renderer 不获得绝对路径、SQLite 或未校验 payload。
- [x] `pnpm verify:fast`、`pnpm demo:build`、`pnpm desktop:build` 通过。

## Phase 4: Studio editing vertical slice

目标：用户能进入 Studio、看到结果、修正、保存和试听；Viewer 状态保持隔离。

- [x] T16：交付 Studio route/session 和首次自动分析。
- [x] T17：交付 score overlay、候选检查器和结构化 chord editor。
- [x] T18：交付 split/merge/move/reset、N.C. 与 session undo/redo。
- [x] T19：交付 autosave、CAS 冲突和 latest-intent-wins reanalysis。
- [x] T20：交付 Scope、Annotation Target 与 Preview Transport。

### Exit gate P4

- [x] 刷新 `#/studio/:libraryScoreId` 可重建 Studio；已有 Document 不静默重跑。
- [x] 用户修正跨 reanalysis/Scope 变化保留；失败、取消、旧 Job 都不能替换 active Revision。
- [x] Preview Transport 不改变 Practice Sidecar、Local Playback Resume 或练习摘要。
- [ ] 键盘、焦点、loading/empty/error/save-conflict 状态通过组件测试和人工检查。
- [x] `pnpm verify`、`pnpm demo:test:e2e` 的 Studio 主旅程通过。

## Phase 5: Annotated score export

目标：从原始 Managed Score Copy 导出语义保持的新副本，不修改馆藏。

- [x] T21：交付 partwise `.musicxml/.xml` 导出。
- [x] T22：交付 timewise 与 `.mxl` round-trip。
- [x] T23：交付 Studio export command、保存面板和失败恢复。

### Exit gate P5

- [x] 来源 harmony、Correction override、N.C.、unresolved skip、Annotation Target 在导出后语义正确。
- [x] unknown elements/attributes、lyrics、directions、layout 和 MXL 附加 entries 语义保留。
- [x] 导出前后原始 Managed Score Copy 的 SHA-256 不变；导出文件可被项目重新导入。
- [x] path traversal、zip bomb、external entity 和 unrepresentable position 被安全拒绝。
- [x] `pnpm fixtures:musicxml`、相关核心测试、Browser/Desktop 导出 E2E 通过。

## Phase 6: Release quality

目标：达到规格中的量化精度、性能、韧性和双端发布门槛。

- [ ] T24：完成标注 corpus、confidence calibration 与性能/资源预算。
- [x] T25：完成双端 E2E、故障注入、可访问性和发布验收证据。
- [x] T26：固化无 eval 泄漏的学习特征、训练协议和版本化模型资产。
- [x] T27：把本地 ranker 接入候选排序、序列解码与置信度拒识。
- [ ] T28：在隔离语料上达到发布指标并复验性能、双端构建与 E2E。（2026-07-17 按产品决定停止本轮调参；保留浏览器可运行的最佳安全结果，准确率提升方案留待重新设计。）

### Exit gate P6

- [ ] Top-8 oracle recall >= 95%。
- [ ] resolved duration sound-label precision >= 95%，coverage >= 70%。
- [ ] boundary F1 >= 85%，confidence ECE <= 0.10。
- [x] 典型 5,000-note 乐谱 P95 分析时间 <= 5 秒，UI/cancel 反馈 <= 100 ms。
- [x] `pnpm verify` 与 `pnpm verify:e2e` 全部通过。
- [x] 规格 15 条验收标准逐项有自动化或明确人工证据。

## Phase 7: Harmony CLI evaluation tool

目标：把一次性 Node 脚本迁移为适合人和 agent 的独立、可版本化 workspace 工具包。

- [x] T29：建立 `@zupulse/harmony-cli` workspace 包与稳定 `inspect` JSON 协议。
- [x] T30：实现版本化 regression manifest、结构化 `eval` 报告和可靠退出码。
- [x] T31：迁移文档与根命令，删除旧 CLI，实现进程级验证并关闭迁移。

### Exit gate P7

- [x] `inspect` 的 model/result/all 输出均通过 schema 和进程级测试。
- [x] Turkish March 结构回归由 manifest 与 SHA-256 管理，且不冒充 accuracy gold。
- [x] `eval` 成败均输出 JSON，失败时返回非零退出码。
- [x] 工具包只依赖 `@zupulse/web-core` 公共入口，相关 typecheck、测试和仓库门禁通过。

## Phase 8: Data-driven harmony tuning benchmark

目标：把 CLI 从结构回归升级为可复现的专家标注准确率评测，先建立可信基线和误差分类，再开始任何新一轮模型设计。

- [x] T32：定义 accuracy manifest、gold canonicalization、数据集 provenance 与分组隔离协议。
- [x] T33：接入 DCML Mozart，先用 K331-3 建立 adapter pilot，再扩展为按奏鸣曲隔离的古典钢琴基线。
- [x] T34：接入 Distant Listening Corpus 的跨作曲家钢琴子集，建立域外泛化与按和弦族切片报告。
- [x] T35：接入 POP909 流行钢琴域；把 ASAP、ChoCo 和 WJazzD 分别限定为解析鲁棒性、标签词表和后续爵士研究数据，不混入主准确率总分。

### Dataset roles

| Dataset                       | Role                                | Input / gold                                             | Decision                                              |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| DCML Mozart Piano Sonatas     | 首要准确率基准                      | `notes`/`measures` TSV + 专家 `harmonies` TSV            | 立即接入；K331-3 先做 pilot，K331 整部固定 holdout    |
| DCML Distant Listening Corpus | 古典跨风格泛化                      | 同一 DCML schema 的 score notes + harmony labels         | 第二阶段；先选 Beethoven/Chopin/Schumann 等钢琴子集   |
| POP909                        | 流行钢琴域外评测                    | 多轨 MIDI（含钢琴伴奏）+ 时间区间 chord labels           | 第三阶段；单独报告绝对和弦指标                        |
| ASAP                          | MusicXML/节拍解析鲁棒性             | MusicXML/MIDI + beat/downbeat/key-signature，无和声 gold | 只做 ingestion/boundary stress，不计算 chord accuracy |
| ChoCo                         | 标签规范化与 progression prior 研究 | 标准化 chord annotations，常缺少可对应的完整符号音符     | 不作为端到端主 benchmark                              |
| WJazzD                        | 后续爵士探索                        | solo events + beat-level accompanying chord              | 延后；输入是独奏而非完整伴奏，不能直接代表谱面识别    |

所有外部 corpus 默认只在开发机缓存，不提交原始数据。manifest 必须固定来源 URL、版本或 commit、许可、文件摘要和 adapter 版本。DCML、ASAP、ChoCo 均为 CC BY-NC-SA 4.0，只能作为开发/研究评测输入；POP909 仓库标注为 MIT，但在重新分发歌曲 MIDI 前仍需单独审查底层作品权利。

现有 Turkish March MXL 保持 `structural-regression`。其内部投影为 147 小节，而 DCML v2.3 K331-3 是 137 个书面小节、127 个和声标签，禁止按小节号直接拼接 gold。T33 从 DCML 自身 TSV 构造 `HarmonyAnalysisInput` 与 gold；跨版本 MusicXML 对齐另以音高/节拍指纹实现并单独计量对齐覆盖率。

### Exit gate P8

- [x] accuracy manifest 能区分 analyzer accuracy、MusicXML ingestion robustness 和 label-only prior，不把三类指标混成一个总分。
- [x] train/tune/eval 按完整作品分组；K331 全奏鸣曲只进入 eval，任何调参或统计资产不得读取其 gold。
- [x] 报告至少包含 gold mapping coverage、unsupported-label rate、Top-1/Top-8、resolved precision/coverage、boundary F1、ECE，以及按 chord family/corpus 的切片。
- [x] 每个候选改动保存相对固定 baseline 的 JSON diff；只接受改善目标误差类且不显著损害已冻结域的改动。
- [x] 外部数据可由 manifest 重建且不进入产品 bundle；CLI 测试、typecheck 与 `pnpm verify:fast` 通过。

**P8 evidence:** 2026-07-18 完成 DCML Mozart/Schumann/Chopin/Beethoven、POP909 accuracy 与 ASAP ingestion 的真实固定版本运行；ChoCo/WJazzD 被 schema 与 train-only prior guard 限定为 label-only。三个 accuracy baseline 和 `compare` JSON diff 使用 0.005 no-regression 容差。`rtk pnpm verify:fast` 通过（99 files / 362 tests），root `tsc -b`、format、context 与 architecture checks 全部通过。后续准确率实现仍需人工选择目标错误簇，本阶段未修改 analyzer。

### Dataset sources

- DCML Mozart Piano Sonatas: https://github.com/DCMLab/mozart_piano_sonatas
- DCML Distant Listening Corpus: https://github.com/DCMLab/distant_listening_corpus
- POP909: https://github.com/music-x-lab/POP909-Dataset
- ASAP: https://github.com/fosfrancesco/asap-dataset
- ChoCo: https://zenodo.org/records/7193888
- WJazzD format: https://jazzomat.hfm-weimar.de/dbformat/dbformat.html

## Verification plan

### Per-task loop

1. 运行任务列出的最小测试，确认新增测试先失败。
2. 实现最小行为并只运行相关测试直到通过。
3. 运行受影响 package 的 typecheck/build。
4. 每完成 2–5 个任务运行当前 phase checkpoint。
5. 不用全量 E2E 替代缺失的领域单测或 Repository contract。

### Gate matrix

| Change area              | Minimum verification                            | Phase gate               | Release gate                   |
| ------------------------ | ----------------------------------------------- | ------------------------ | ------------------------------ |
| Harmony schema/algorithm | `pnpm vitest run packages/web-core/src/harmony` | `pnpm verify:fast`       | corpus metrics + `pnpm verify` |
| Browser persistence      | Browser repository tests                        | `pnpm demo:build`        | `pnpm demo:test:e2e`           |
| Desktop store/Bridge     | Main/Bridge tests                               | `pnpm desktop:build`     | `pnpm desktop:test:e2e`        |
| Studio React UI          | harmony-studio component/app tests              | Browser smoke            | Browser + Desktop E2E          |
| MusicXML/MXL export      | harmony export + fixture tests                  | `pnpm fixtures:musicxml` | dual-host export E2E           |
| Docs/context             | Prettier + `pnpm check:context`                 | `pnpm check:arch`        | `pnpm verify`                  |

### Evidence retention

- Golden MusicXML/MXL fixtures、corpus manifest、metric JSON 和 benchmark JSON 必须版本化或可重复生成。
- 人工验证只用于视觉、键盘、屏幕阅读器和系统保存面板；领域正确性必须自动化。
- 每个 checkpoint 在 `tasks/todo.md` 勾选并记录实际命令；失败命令不以“其他测试通过”替代。

## Risks and mitigations

| Risk                                          | Impact | Mitigation                                                        |
| --------------------------------------------- | ------ | ----------------------------------------------------------------- |
| fixed tick 无法无损表达变化 divisions/tuplets | High   | P0 先证明；失败时在内部引入 rational mapping，保持 UI Moment 外形 |
| DOM 重序列化破坏未知 MusicXML 语义            | High   | P0 使用语义 diff fixture；导出只从原始字节增量修改                |
| 高叠/altered 候选造成组合爆炸                 | High   | evidence-driven generation、Top-K、复杂度先验和硬上限             |
| confidence 未校准导致错误“确定答案”           | High   | 保留 unresolved；P6 用独立 corpus 校准，不开放用户阈值            |
| reanalysis/autosave 并发丢失 correction       | High   | 串行写队列、intent id、CAS 和故障测试                             |
| Browser/Desktop 持久化语义漂移                | High   | 共享 schema、contract harness 与删除联动测试                      |
| Studio 污染 Viewer 练习状态                   | Medium | 独立 runtime/Repository；E2E 对 sidecar/resume 做前后快照         |
| MXL 攻击面扩大                                | High   | entry/path/ratio/size 上限与恶意 fixture                          |

## Parallelization

- P0 的 T1/T2 可并行探索，但在位置模型和依赖决策冻结前不进入 P1。
- P2 契约冻结后，P3 的 Browser 与 Desktop adapter 可并行；共享 contract 只能由 T11 统一修改。
- P4 中纯 UI 呈现可以在 Studio application contract 冻结后与宿主 adapter 收尾并行。
- P5 的 timewise/MXL 必须复用 T21 的导出 planner，不创建第二套 exporter。

## Definition of done

每个任务同时满足才可勾选：

- 验收标准有自动化或明确人工证据。
- 最小测试和受影响 package build/typecheck 通过。
- 跨进程/持久化输入有严格 Zod 校验，错误不会泄漏路径或原始异常。
- 不存在第二份状态所有者、无消费者抽象、临时 spike 或跳过的测试。
- Prettier 通过；涉及 UI 时键盘、焦点、loading、empty、error 状态不回退。

> `planning-and-task-breakdown` 技能引用的 `references/definition-of-done.md` 在当前安装中不存在；本节采用技能正文与项目验证阶梯定义。

## Open questions

当前无阻塞计划评审的产品问题。P0 的技术结论若推翻现有设计，必须先更新规格/ADR，再调整后续任务依赖。
