---
status: implemented
last-reviewed: 2026-08-24
feature: web-remote-pdf-omr-p1
---

# Web Remote PDF 识谱 P1 体验优化 Spec

## 目标

在不改变 Recognition Server 的单租户、单 worker、SQLite + private S3 架构下，补齐 Browser Remote PDF OMR
在长任务和历史积累后的基本可恢复体验：上传可取消、SSE 断线可见且可手动刷新、历史可按 cursor 继续加载、
详情可查看 Attempt 历史。Desktop 本地工作台保持现状。

## 范围与交互

- Browser 上传期间显示明确的进行中状态，并允许在 Job 尚未创建时取消当前 HTTP request。由于 native `fetch`
  不提供可靠的上传进度事件，UI MUST NOT 显示伪造百分比。
- Remote adapter 暴露 `connecting / connected / reconnecting` 连接状态。详情页在重连时保留最后一份已验证
  snapshot，显示持久提示和手动刷新操作；收到下一份合法 snapshot 后恢复 connected。
- 历史页首次读取 20 项；存在 `nextCursor` 时显示“加载更多”，追加结果并按 `jobId` 去重。重新加载或删除后
  从第一页重新同步。
- Remote detail 使用现有 `RecognitionJobDetail.attempts` 展示 Attempt number、engine、status、开始/结束时间和
  semantic error code。没有历史能力的 Desktop 不显示该区域。
- API 操作错误继续只显示 semantic code 对应的安全文案，不呈现 raw exception。

## 技术边界

- 复用 `RecognitionJobPort`、`RecognitionHistoryPort`、shared recognition schemas、native `EventSource` 和
  `AbortController`；不新增依赖、endpoint、数据库字段、缓存层或全局状态库。
- Optional Remote capabilities MUST NOT force Desktop adapter 实现占位行为。
- 用户可见文案全部进入 `@zupulse/app-i18n`；状态不仅依赖颜色表达。
- 页面沿用现有高密度工作台和 semantic tokens；不新增嵌套滚动宿主。

## 测试策略与命令

- Adapter：`pnpm vitest run apps/web-demo/src/recognition/__tests__/RemoteRecognitionClient.test.ts`
- 页面：`pnpm vitest run packages/web-viewer/src/app/pages/__tests__/PdfOmrHistoryPage.test.tsx packages/web-viewer/src/app/pages/__tests__/PdfOmrPage.test.tsx`
- i18n：`pnpm check:i18n`
- 最终：`pnpm verify:fast`、`git diff --check`

## 验收标准

- 上传中取消会 abort request、回到可再次开始的状态，且不显示通用失败。
- SSE error 后显示“正在重新连接”和手动刷新；合法 snapshot 到达后提示消失。
- 历史列表可连续读取所有 cursor page，不重复行，并正确处理加载更多失败。
- Remote detail 显示所有已返回 Attempts；Desktop 不受影响。
- Light/Dark、键盘、窄屏继续复用现有控件和响应式结构，无新增横向溢出。

## 非目标

- 精确上传百分比、历史搜索/筛选、批量操作、队列位置、认证、配额、Remote MIDI correction、Library 导入。
