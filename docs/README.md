# 文档组织

本文说明 Spec、实施进度与历史归档的职责边界。当前实现事实仍以运行时代码、schema、数据库约束、
可重复测试、Current ADR、当前架构文档和 Current Feature Contract 为准。

## 推荐目录

| 位置                              | 回答的问题                        | 内容边界                                                 |
| --------------------------------- | --------------------------------- | -------------------------------------------------------- |
| `docs/specs/`                     | 这次变更准备交付什么？            | 意图、范围、约束、验收标准和已批准的设计；不记录实时进度 |
| `tasks/`                          | 现在做到哪一步，下一步是什么？    | 当前实施步骤、checkbox、checkpoint 和临时验证证据        |
| `docs/archive/<category>/<year>/` | 哪些历史材料仍值得保留以便追溯？  | 已失效或被取代、但仍有追溯价值的一次性报告、调研或旧规格 |
| `docs/features/archive/`          | 已退出当前产品的 Feature 去哪里？ | `historical` / `retired` Feature Contract 的专用归档     |

`docs/archive/` 不是当前事实源，也不是完成任务后的默认落点。能由 Git 历史恢复、且没有持续追溯价值的
一次性计划和进度记录应直接删除。

## Spec

- 使用 `docs/specs/YYYY-MM-DD-<slug>.md`，一个文件描述一项有明确边界的变更。
- 记录目标、非目标、约束、验收标准和需要批准的设计决策；在开头声明 `draft`、`approved`、
  `implemented` 或 `superseded` 状态。
- Spec 描述变更意图，不证明功能已经实现。实现后的当前行为必须回写 Feature Contract、架构文档、
  ADR 或 `DESIGN.md`，并由代码和测试验证。
- 不在 Spec 中维护逐步 checkbox、每日进展或临时命令输出。若 Spec 被取代，链接替代 Spec 或当前
  事实源；仍有追溯价值时再移入 `docs/archive/specs/<year>/`。

## 实施进度

- `tasks/` 只保存正在进行的工作。单一 initiative 可使用 `tasks/plan.md`、`tasks/todo.md` 和必要的
  临时证据；并行 initiative 使用 `tasks/<initiative>/` 隔离，避免多个计划共用同一份 todo。
- 从 `tasks/TEMPLATE.md` 开始，checkbox 和 checkpoint 只表达当前执行状态，不承担产品需求或
  长期架构约束。
- 完成时先把稳定结论提升到对应的 Current 文档或自动检查，再删除该 initiative 的 plan、todo 和
  可由 Git 恢复的临时证据。只有确有长期审计或复盘价值的结果，才整理为独立历史文档后归档。

## 历史归档

- 通用归档按 `docs/archive/<category>/<year>/` 组织，例如 `specs`、`reports`、`research`；不要按
  执行工具或 Agent 名称建目录。
- 归档文档开头必须说明它是 historical、归档原因、归档日期，以及当前替代文档或“无替代”。
- Current 架构索引和执行任务不得把归档文档当作规范性依据。需要引用时，只把它作为决策背景或
  历史证据。
- Feature Contract 遵循自身生命周期，统一留在 `docs/features/archive/`。
