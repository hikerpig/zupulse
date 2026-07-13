# Task: <可验证的结果>

## Goal

一句话描述用户或系统最终获得什么。

## Non-goals

- 明确本轮不做的相邻能力。

## Canonical context

- 相关 Current ADR、架构章节、schema 和现有实现。

## Scope

- 可能修改的目录与关键文件。
- 应复用的同类实现和测试。

## Acceptance criteria

- [ ] 可观察的行为结果。
- [ ] 必须保持的架构/安全不变量。

## Verification

- 最小测试：`pnpm ...`
- 完成门禁：`pnpm verify:fast`
- 需要时的 build/E2E/人工证据。

## Open decisions

- 只有会实质改变实现方向、且无法从事实源回答的问题。
