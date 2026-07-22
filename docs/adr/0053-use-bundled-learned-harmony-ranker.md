---
status: accepted
---

# Use a bundled learned ranker for harmony candidates

Zupulse 在现有规则序列解码后的最终 range 上加入本地学习型候选扩充、重排序和拒识。模型只接收
`web-core` 已投影的和声特征与结构化候选，不读取来源文件、DOM、绝对路径或持久化状态；推断
离线、确定性运行，不调用在线模型服务。版本化模型权重作为只读发布资产，其版本进入
`algorithmVersion`，因此重分析仍创建新的不可变 Analysis Revision。

训练与调参只使用 corpus 的 train/tune 分组，最终发布指标只从隔离的 eval 分组生成。训练脚本、
特征定义、模型资产摘要与 corpus manifest 必须可重复；评估脚本校验模型未从 eval 样本训练。
规则候选生成、结构化 Chord Symbol 校验、Top-8 硬上限、置信度拒识和用户 Correction 仍是产品
边界，模型不能直接生成任意文本和弦或绕过 Zod schema。

首个实现使用可解释、固定维度的轻量排序模型，并复用现有 TypeScript 与平台能力；只有该模型
在独立语料上无法达到发布门槛时，才另行决策更重的运行时或第三方依赖。此方案比在线服务保留
本地优先与隐私，比端到端模型更容易满足 5 秒、取消和资源预算；代价是需要维护训练资产、数据
许可与模型版本兼容性。

该决策修订 Harmony Analysis Studio 规格中“首版机器学习重排序不在范围内”的限制，但不改变
ADR 0052 的 Studio/Viewer 隔离、Managed Score Copy 不可变、来源和弦优先或导出语义。

ADR 0064 在不改变本决策 Top-8 ranker 的前提下，进一步允许量化 MLP 在冻结的最终 range 上选择
primary；两类模型、规则分与 confidence 保持独立语义。
