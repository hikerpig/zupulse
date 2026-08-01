---
status: draft
last-reviewed: YYYY-MM-DD
feature: <feature-slug>
---

# <功能名> 产品 Spec

## 定位与现状证据

说明本 Spec 的目标、对应 Current Feature Contract，以及它不代表功能已经实现。

- **实际体验**：记录真实 Browser 旅程中的关键观察，包括 route、viewport 和 sample/data state。
- **仓库事实**：记录 Current Contract、runtime、schema、test 与 `DESIGN.md` 中直接相关的当前行为。
- **证据限制**：只在关键体验无法验证时保留。

## 用户问题与范围

- **目标用户与场景**：谁在什么情况下遇到什么阻碍。
- **目标结果**：用户完成后获得什么，而不是只描述要新增的控件。
- **Non-goals**：明确本次不解决什么。
- **Assumptions**：只记录尚未证实但影响设计的假设。

## 方案

### 用户流程

1. 从真实入口开始，描述用户动作、系统反馈、完成状态和退出路径。
2. 补充失败、取消、重试与恢复流程。

### UI / UX

- 定义能力位于哪个现有表面和层级、为什么放在那里，以及主要操作和按需展开关系。
- 定义默认值、可见条件、反馈、持久化和与现有能力的交互。
- 定义必要的窄屏、键盘、焦点、Light/Dark 和 reduced-motion 行为。
- 只在空间关系难以用文字说明时加入简洁 wireframe。

### 状态

| State | Visible behavior | Available actions | Recovery / exit |
| ----- | ---------------- | ----------------- | --------------- |
|       |                  |                   |                 |

## 产品与工程约束

- 说明数据归属、持久化边界、跨宿主差异和必须保持的领域不变量。
- 系统文案由 `@zupulse/app-i18n` 持有；`web-core` 只返回 semantic code 和 context。
- 只有会约束实现时才加入 target schema、semantic error code 或 platform matrix。

## Feasibility Gate

仅在关键能力尚未证实时保留：写明问题、fixtures/platforms、pass/fail evidence，以及失败后的产品 fallback 或 stop condition。

## Acceptance Criteria

- The product MUST ...
- The product MUST NOT ...
- The product SHOULD ...

验收标准必须稳定、可观察、可测试，并覆盖主要流程、关键恢复路径及相关平台差异。

## 待确认决策

只保留会改变产品行为、架构、安全、兼容性或范围的未决项；没有则删除本节。
