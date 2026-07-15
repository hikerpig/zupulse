---
status: accepted
---

# Separate Studio harmony analysis from Viewer practice

Zupulse 将和弦推断与人工修正放在独立的 Studio 工作区，而不把它们混入 Viewer 练习状态或直接改写 Managed Score Copy。Viewer 使用 `#/viewer/:libraryScoreId`，Studio 使用 `#/studio/:libraryScoreId`；两者按 Library Score 重建各自的 Session，不共享可变 alphaTab 运行时。首版 Viewer 不读取 Studio 分析结果，Studio 的 Preview Transport 也不读写 Practice Sidecar 或 Local Playback Resume。

每份 Library Score 可以拥有一个由独立 Harmony Analysis Repository 管理的 Harmony Analysis Document。Document 保存当前不可变 Analysis Revision 与按 Score Written Range 锚定的 User Corrections；同一区间按 User Corrections、来源和弦、算法结果的顺序形成 Effective Harmony Projection。重新分析会事务式创建并替换 active Revision，保留 Corrections，但首版不持久化旧 Revision 历史。来源和弦默认作为权威锚点，低于固定决策阈值的候选保持 Unresolved，只有已确定结果才进入导出。

首次进入尚无 Harmony Analysis Document 的 Studio 时，系统使用默认 Harmony Analysis Scope 自动启动可取消的 Harmony Analysis Job；已有 Document 时不静默重跑。重新分析期间继续显示并允许修正当前 active Revision，新的 Scope 或参数使旧 Job 失效，只有最新且完整成功的 Job 可以结合当时最新的 Corrections 原子替换 active Revision。

Studio 只把 Effective Harmony Projection 临时叠加到自己的预览运行时。Annotated Score Export 从原始托管字节生成保持来源 `.musicxml`、`.xml` 或 `.mxl` 容器与结构的新副本，并通过 Score File Gateway 保存；它不修改当前馆藏、Score Identity 或 Managed Score Copy。删除 Library Score 时，宿主必须同时删除 Harmony Analysis Document。

该决策延续 ADR 0035 的不可变来源、派生 Revision 与用户修正分层，并遵守 ADR 0037 对 alphaTab Session 运行时所有权的约束。代价是 Browser 与 Desktop 都需要新的分析持久化适配器和严格 Bridge 契约，但避免了把作者工作流、练习状态和来源文件生命周期耦合在一起。
