# Task: 建立应用级 i18n

## Goal

让 Zupulse 的 Browser Demo、Desktop Renderer 与 Electron 原生界面共享类型安全的
`zh-CN` / `en-US` 文案，并支持不打断当前工作区的实时语言切换。

## Non-goals

- 不接入在线翻译平台或运行时语言包下载。
- 不增加 `zh-TW`、日语或完整 RTL 验收。
- 不翻译用户内容、曲谱元数据、轨道名、和弦名与用户自定义 Loop 名称。
- 不借 i18n 迁移重设计 Library、Viewer 或 Studio。

## Canonical context

- `docs/superpowers/specs/2026-07-24-application-i18n-design.md`
- `docs/superpowers/plans/2026-07-24-application-i18n.md`
- `docs/architecture/README.md`
- `docs/architecture/react-application-system.md`
- `DESIGN.md`
- `packages/web-viewer/AGENTS.md`

## Scope

- `packages/app-i18n`
- `packages/web-core/src/import`、`packages/web-core/src/playback`、Bridge schema
- `packages/web-viewer/src/app`、`components`、`features`、presenter
- `apps/web-demo/index.html` 与 Browser E2E
- `apps/desktop-shell/src/main`、Renderer 与 Desktop E2E
- `scripts/check-i18n.mjs`、架构文档与验证脚本

## Task list

### Phase 1: Foundation

- [ ] Task 1：建立共享 catalog、locale resolver 与类型安全 i18next instance。
- [ ] Task 2：建立宿主 locale preference port、注入 Renderer Provider 并增加语言入口。
- [ ] Task 3：清理领域诊断、应用 issue 与 generated Loop 名称。

### Checkpoint: Foundation

- [ ] `web-core` 不再生成面向用户的本地化句子。
- [ ] 语言切换不销毁 Session 或触发领域 command。
- [ ] Catalog parity、focused tests、`pnpm typecheck` 通过。

### Phase 2: Shared UI

- [ ] Task 4：迁移 Sheet Library。
- [ ] Task 5：迁移 Viewer、Playback 与练习控制。
- [ ] Task 6：迁移 Studio、Harmony editor 与 range workspace。

### Checkpoint: Shared UI

- [ ] `zh-CN`、`en-US` 下 Library/Viewer/Studio 的可见文案与 ARIA 完整。
- [ ] generated Loop 名称随 locale 变化，用户标签不变。
- [ ] Browser 与 Desktop build 通过。

### Phase 3: Hosts and enforcement

- [ ] Task 7：同步 Electron Main、原生菜单、文件 Dialog 与 Browser metadata。
- [ ] Task 8：建立硬编码门禁、全量 E2E 与架构文档。

### Checkpoint: Complete

- [ ] `pnpm verify:fast`
- [ ] `pnpm verify`
- [ ] `pnpm verify:e2e`
- [ ] Light/Dark 与 768/1024/1440 px 双语言人工验收。
- [ ] Desktop menu/dialog 和 Renderer locale 同步。
- [ ] 无 missing-key、插值、ARIA 或未处理 Promise 错误。

## Resolved decisions

- Browser Demo 使用英文静态 no-JS/爬虫 fallback；运行时按 Effective Locale 更新 metadata，本期不做
  双语 URL、SSR 或 SEO 构建。
- 普通数字、日期、相对时间、列表和排序跟随 Effective Locale；日期沿用宿主时区，音乐时间格式不变。
- Locale 切换允许 Library 按新语言规则重新排序，但查询、筛选、选中项和 Dialog 状态必须保持。
- 偏好读取失败不阻断启动并回退 `system`；用户主动保存失败保持旧语言，不产生半切换。
- 已打开的原生 Dialog 不原地改语言；后续 Dialog 与应用自定义菜单使用新 locale，平台 role 菜单保持
  Electron/操作系统惯用文案。
- Catalog 与调用代码原子提交，中英文必须同时完整；本期不引入 TMS，也不使用巨型 snapshot 代替结构
  检查和双语用户旅程。
- Plural catalog 在两种语言中统一声明 `_one`、`_other`，组件只传 semantic base key 与 `count`；
  English 验证单复数分支，Chinese 允许两个变体同文。
