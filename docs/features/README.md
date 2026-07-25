# Feature Contracts

Feature Contract 描述当前可观察的产品与领域行为，帮助开发者和 AI 区分已经实现的能力、进行中的
目标差异和明确非目标。它是面向 Feature 的导航与行为摘要，不替代运行时代码、schema、测试、
Architecture、ADR 或 UI 契约。

## 当前索引

| Feature       | Contract                                                   | Status    | Delivery  |
| ------------- | ---------------------------------------------------------- | --------- | --------- |
| Sheet Library | [`contracts/sheet-library.md`](contracts/sheet-library.md) | `current` | `partial` |

新 Contract 从 [`templates/feature-contract.md`](templates/feature-contract.md) 复制。仍属于产品的
Feature 保持 `contracts/<feature-slug>.md` 稳定路径；只有已移除或被取代、仅供追溯的 Feature 才
移入 `archive/`。

## 文档分工

| 文档             | 回答的问题                             |
| ---------------- | -------------------------------------- |
| Feature Contract | 用户现在能做什么，行为和领域边界是什么 |
| Architecture     | 系统当前如何实现                       |
| ADR              | 为什么选择一项长期且难以逆转的决策     |
| Spec             | 某次变更准备实现什么                   |
| Plan / issue     | 具体按什么步骤实施、当前进度如何       |
| `DESIGN.md`      | UI、交互与视觉系统必须遵循什么         |
| `CONTEXT.md`     | 产品和领域术语是什么意思               |

Contract 不复制完整 schema、SQL、Bridge payload 或实现细节，而是通过证据地图链接到这些事实源。
结构门禁、PR 影响提示和周期语义审计的稳定用法见
[`docs/conventions/documentation-gardening.md`](../conventions/documentation-gardening.md)。

## 状态

`status` 表示 Contract 能否作为当前行为导航：

- `draft`：仍在形成，不得作为当前事实依据。
- `current`：已经核对当前实现，可以作为行为导航。
- `deprecated`：Feature 仍存在但正在退出，必须说明替代方案。
- `historical`：只用于追溯，不得指导当前实现。

`delivery` 表示 Feature 的交付程度：

- `planned`：尚未形成可用竖切。
- `in_progress`：正在实现，但尚未形成稳定可用能力。
- `partial`：已有稳定能力，仍存在明确缺口。
- `available`：当前承诺范围已经交付。
- `retired`：能力已经移除。

`status: current` 与 `delivery: partial` 可以同时成立：文档准确描述现状，但 Feature 尚未全部
交付。`last_verified` 只在重新核对相关代码/schema，并运行与风险匹配的可重复验证后更新。

## AI 阅读规则

1. 处理现存或进行中的 Feature 前，先读本索引和对应 Contract。
2. 只有 `status: current` 的 Contract 可以作为当前行为导航。
3. “进行中的目标差异”与 `planned` 内容不得被当作当前运行时行为。
4. 沿证据地图继续核对相关代码、schema、数据库约束和测试；发生冲突时以更高事实源为准，并指出
   Contract 已漂移。
5. Architecture 解释实现结构，ADR 解释决策，Spec 解释目标变化；不得用其中任一类文档冒充运行时
   验证。

## 维护流程

1. 新 Feature 使用模板创建 `contracts/<feature-slug>.md`，默认
   `status: draft`、`delivery: planned`。
2. 已有 Feature 先从代码、schema、数据库约束和测试建立证据地图，再记录当前行为。
3. 实施中的目标只写入“进行中的目标差异”，并链接当前 Spec 或 issue。
4. 行为变化通过验证后，同步更新当前行为、平台矩阵、已知差距、证据地图和 `last_verified`。
5. Feature 被替代或移除时，填写替代关系，改为 `historical` / `retired`，再移入 `archive/`。
