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

详细验收、依赖与文件范围见 [tasks/plan.md](plan.md)。

### Phase 1: Shared foundation

- [x] Task 1：创建 `@zupulse/app-i18n` workspace package。
- [x] Task 2：实现 locale resolver、catalog contract 与 instance factory。
- [x] Task 3：建立 Browser locale host 与 document controller。
- [x] Task 4：注入 per-app i18n 与 AppHeader 语言入口。
- [x] Checkpoint A：基础切换、focused tests、typecheck 与阶段提交。

### Phase 2: Locale-neutral domain boundary

- [x] Task 5：导入诊断改为 code/context。
- [x] Task 6：Loop sidecar 与 Playback state 去本地化。
- [x] Task 7：ViewerApplication 与 presenter 改为 semantic issue/view model。
- [x] Checkpoint B：领域边界、focused tests、typecheck 与阶段提交。

### Phase 3: Shared UI vertical slices

- [x] Task 8：迁移 Sheet Library。
- [x] Task 9：迁移 Viewer 与 Playback controls。
- [x] Task 10：迁移 Studio 页面与状态文案。
- [x] Task 11：迁移 Harmony editor 与 range workspace。
- [x] Checkpoint C：双语 shared UI、build 与阶段提交。

### Phase 4: Desktop and Browser hosts

- [x] Task 12：扩展 Bridge locale contract。
- [x] Task 13：实现 Desktop preference store。
- [x] Task 14：同步 Main、Renderer、菜单和文件 Dialog。
- [x] Task 15：完成 Browser 静态 fallback 与 runtime metadata。
- [x] Checkpoint D：宿主同步、build/E2E 与阶段提交。

### Phase 5: Enforcement and completion

- [x] Task 16：添加 hardcoded UI copy gate。
- [x] Task 17：文档、E2E 与最终验收。
- [x] Checkpoint E：`pnpm verify:fast`、`pnpm verify`、`pnpm verify:e2e`、手工双语验收与最终提交。

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

## Progress

### 2026-07-24 — Checkpoint A

- 完成共享 `@zupulse/app-i18n`、同步 bundled catalog、locale resolver、missing-key 与 plural contract。
- 完成 Browser preference adapter、document metadata controller、per-app Provider/store 与 Header 语言入口。
- 验证：27 个 focused tests、`pnpm typecheck`、`pnpm demo:build`、`pnpm desktop:build`、`git diff --check`
  全部通过。

### 2026-07-24 — Checkpoint B

- 导入诊断、应用错误与 Demo 状态改为稳定 code/context；原始错误只进入诊断上报，不进入 UI snapshot。
- Loop 与 Playback state 移除生成式中文标签；轨道名保留为可选用户/曲谱数据，默认标签交由 UI 本地化。
- Playback presenter 输出 semantic state，旧 sidecar 位置迁移不产生额外持久化写入。
- 验证：68 个测试文件、301 个测试、`pnpm typecheck`、`pnpm demo:build`、`pnpm desktop:build` 与
  `web-core` 非测试源码中文扫描全部通过。

### 2026-07-24 — Checkpoint C

- Sheet Library、Viewer/Playback、Studio 与 Harmony 编辑工作区的可见文案、状态和动态 ARIA 迁入 catalog。
- 相对时间和标题排序跟随 Effective Locale；生成 Loop、默认轨道名随语言切换，曲谱与用户内容保持原样。
- 测试环境使用真实默认 i18n instance，覆盖中文既有旅程和应用内英文切换。
- 验证：27 个测试文件、132 个测试、`pnpm typecheck`、`pnpm demo:build`、`pnpm desktop:build` 与
  `git diff --check` 全部通过。

### 2026-07-24 — Checkpoint D

- Bridge 升级为 4.0.0，handshake、capability 与 `app.locale.setPreference` 使用严格 locale schema。
- Desktop preference 使用独立版本化 JSON、`0o600` 临时文件与原子 rename；损坏文档隔离后回退 system。
- Main 在窗口前恢复 locale，保存成功后同步内存、菜单与后续文件 Dialog；Renderer 仅使用 handshake。
- Browser 静态 metadata/no-JS fallback 改为英文，运行时继续由 Effective Locale 更新全部受管 metadata。
- 验证：19 个测试文件、59 个测试、`pnpm typecheck`、双端 build，以及 Desktop locale 重启/Menu E2E
  全部通过。

### 2026-07-24 — Checkpoint E

- 新增 TypeScript AST hardcoded-copy 门禁，覆盖 JSX text 与用户可见静态属性，并接入 `verify:fast`。
- 新增当前 i18n 架构文档，记录 locale ownership、catalog/领域边界、Bridge、测试和扩展流程。
- Browser E2E 覆盖英文 Library→Viewer→Studio 持久化，以及播放中切换、Practice 状态保留、
  768/1024/1440 px 和 Light 主题可达性；Desktop E2E 覆盖重启后 Renderer/Menu 一致。
- 验证：`pnpm verify:fast`（112 个测试文件、428 个测试）、`pnpm verify`、`pnpm verify:e2e`
  （Browser 7 个、Desktop 6 个）与 `git diff --check` 全部通过。
