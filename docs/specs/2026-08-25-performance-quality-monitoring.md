---
status: draft
last-reviewed: 2026-08-26
feature: anonymous-telemetry
---

# 三端启动耗时（ponytail 修订）

目标：能看见 Browser / Desktop / iPad 打开有多慢。不是监测平台，不新开 SDK，不改隐私模型。

当前事实：`application_ready` 和 `workspace_session_started` 已经在发，只是没有耗时。Home
（`#/`）不读曲库；真正会慢的是曲库初始化、Desktop/iPad 宿主前置、打开曲谱。现行遥测禁止
performance tracing；iPad 保持 No-op（ADR 0068）。

## 做

1. 各宿主 Web 入口第一行记 `const startedAt = performance.now()`。模块级变量即可，不引入
   `StartupClock`。
2. 给现有事件加可选 `durationMs`（整数毫秒，上限 120000，超出则省略该字段，不另发明
   `durationCapped`）：
   - `application_ready`：`startedAt → library settle`
   - `workspace_session_started`：`open 请求 → viewer/studio ready`
3. Lab 只跑两条现有 E2E 路径（production 构建，不是 dev server）：
   - 冷启动到 Home 或 Library 可见，记下墙钟和 `application_ready` duration
   - 打开 bundled sample，等到 Viewer ready，记下 `workspace_session_started` duration
4. Browser / Desktop 用已有 Playwright。iPad 用同一 JS 时间戳；Simulator 在现有
   `ipad:verify` 旅程里读一次，不新开 XCTest 套件，真机不进 CI。
5. PostHog 对这两个字段做 p50/p95 insight。不新建 dashboard 文档，不改隐私开关。

## 不做

- `StartupClock`、milestone 枚举、双 rAF、`TTFPS`、`product_surface_committed`
- 新事件 `startup_surface_ready` / `score_surface_painted`
- handshake `hostPreloadMs`、iPad native 耗时、Bridge 新 capability
- `startKind`、`librarySizeBucket`、10ms 量化、Lab JSON schema、`readStartupSnapshot()`
- 五套 fixture、CI p95 门禁、Performance Quality dashboard、隐私文案改写
- iPad Field 遥测、Web Vitals、应用内 HUD

Desktop 从进程拉起到窗口：Playwright 墙钟已经包含 Main。需要拆 Main vs Renderer 时再加
`hostPreloadMs`。谱面首帧已有 `renderFinished`；Lab 觉得 Viewer ready 不够再加，不先发 Field。

`initialSurface` 把 `/` 标成 `library` 是既有偏差，本变更不顺手改。

## 口径

| 数字                       | 定义                                   | 三端                       |
| -------------------------- | -------------------------------------- | -------------------------- |
| Shell ready                | `application_ready.durationMs`         | Lab + Field（iPad 仅 Lab） |
| Workspace ready            | `workspace_session_started.durationMs` | 同上                       |
| Wall-clock to first chrome | E2E 从 launch 到 Home/Library 可见     | 仅 Lab                     |

报表继续写 Anonymous Installation / Application Session。Ubuntu CI 与 iPad 真机只比各自
delta，不比绝对值。v1 只记录，不 fail PR。

## 约束

- `durationMs` 走现有 `TelemetryPort` Zod allowlist；缺失则省略。
- 采集失败不得影响启动、导入、渲染、播放、保存、关闭。
- 开发 / 测试 / Internal Acceptance / iPad 远程遥测仍为 No-op。
- 事件 cardinality 不变。禁止路径、score id、曲名、视口、资源 URL。

## 验收

- `application_ready` 与 `workspace_session_started` 在启用遥测时携带 `durationMs`，fake-ingestion
  E2E 能读到。
- Browser 与 Desktop 各有一条 production-build Playwright 打印上述两个数字。
- iPad Simulator 一次旅程能读到同一 JS 时间戳。
- 无新依赖、无新 workspace 包、无新 Bridge 方法。

## 何时加回被砍掉的东西

| 加                                     | 当                                               |
| -------------------------------------- | ------------------------------------------------ |
| `hostPreloadMs`                        | Desktop Lab 显示慢、且墙钟分不出 Main / Renderer |
| `score_surface_painted`                | Viewer ready 很快但谱面空白仍被抱怨              |
| iPad Field / handshake                 | 先改 ADR 0068 与隐私评审                         |
| CI p95 门禁                            | 同一 runner 上已有可重复 baseline                |
| Home 专用首屏 / `initialSurface: home` | Home 冷启动本身成为瓶颈（bundle 解析）           |
