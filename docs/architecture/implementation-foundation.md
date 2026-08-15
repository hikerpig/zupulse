# 架构基础实现说明

## 范围

当前实现覆盖 Viewer 第一版的架构基础，以及共享 GP 播放练习能力的 Browser Demo 与 Electron Desktop 竖切：

- TypeScript Web Core。
- Score Model 共享类型。
- 文件格式识别。
- 内容指纹和 ScoreIdentity。
- Bridge API typed RPC / event 合约。
- JSON sidecar payload。
- SQLite schema 合约。
- Bridge mock 与一次性文件 token 测试。
- alphaTab GP DOM 渲染。
- 离线 SoundFont 播放。
- 播放状态机、定位和变速。
- 多个命名 AB 循环。
- 轨道显示、静音、独奏和音量。
- 播放练习 sidecar 与本机恢复位置合约。
- Electron Main/Preload/Renderer 安全边界、受限自定义协议和 typed IPC。
- 一次性文件 token、原子 JSON 持久化、隐私化诊断日志和桌面生命周期协调。
- Browser/Desktop 分发构建的 provider-neutral 匿名遥测边界、Main-owned identity、隐私告知与可退出设置。
- Tagged/manual release 的 source-map upload、`.map` artifact removal、credential/remote-host guards。
- macOS arm64 Internal Acceptance Build、Electron E2E 与 `app.asar` 资源校验。

当前实现不包含真实 MIDI Analyzer、SQLite adapter、跨平台同步 adapter、原生音频桥、正式签名/公证/自动更新。Windows x64 配置已保留，但尚未在 Windows 主机完成构建和人工验收。

## 代码入口

- `packages/web-core/src/index.ts`：Web Core 对外导出入口。
- `packages/web-core/src/score/types.ts`：Score Model 与 ScoreIdentity。
- `packages/web-core/src/score/format.ts`：GP / MIDI 文件格式识别。
- `packages/web-core/src/score/identity.ts`：内容 hash 与 ScoreIdentity 创建。
- `packages/web-core/src/score/session.ts`：ViewerSession 聚合。
- `packages/web-core/src/bridge/types.ts`：Bridge API 消息类型。
- `packages/web-core/src/bridge/mockNativeBridge.ts`：测试用 Native Bridge。
- `packages/web-core/src/storage/sidecar.ts`：sidecar payload codec。
- `packages/web-core/src/storage/sqliteSchema.ts`：SQLite schema 合约。
- `packages/web-core/src/playback/types.ts`：播放领域类型和引擎端口。
- `packages/web-core/src/playback/playbackController.ts`：播放练习状态机。
- `packages/web-core/src/playback/alphaTabPlaybackAdapter.ts`：alphaTab 播放适配器。
- `packages/web-core/src/playback/playbackSidecar.ts`：播放练习 sidecar 与合并规则。
- `packages/web-core/src/playback/playbackPersistence.ts`：Bridge 持久化 adapter。
- `packages/web-viewer/src/viewer-session/`：Viewer wiring、Session port 与 feature slices。
  `packages/web-viewer/src/features/playback-workspace/`：Viewer playback controls 与 practice UI。
- `apps/web-demo/src/main.ts`：Browser Demo 宿主入口。
- `apps/desktop-shell/src/main/main.ts`：Electron Main 组合入口。
- `apps/desktop-shell/src/preload.ts`：固定的 `request` / `subscribe` contextBridge 暴露面。
- `apps/desktop-shell/src/renderer.ts`：Electron Renderer 与共享 Viewer 挂载入口。

## 验证

运行：

```bash
pnpm check
pnpm demo:build
pnpm desktop:build
pnpm desktop:test:e2e
pnpm desktop:package
```

预期结果：

- TypeScript 编译通过。
- Vitest 单元测试全部通过。
- Rspack 生产构建通过。
- alphaTab script、字体、SoundFont 和许可证进入构建产物。
- Electron 离线/隔离、安全拒绝、真实 GP 打开与练习状态恢复 smoke 通过。
- 当前平台 Forge package 生成后，自动解包验证 CSP、运行时代码和离线资源，并拒绝测试 fixture、source map 与 MockNativeBridge 泄漏。
- Release workflow 还要求 source maps 能被独立校验、上传成功后从 public/package artifacts 删除，并拒绝无效
  PostHog host、remote script 和管理凭据；Browser/Desktop fake-ingestion journeys 验证刷新、relaunch 和 opt-out。

## 后续计划

下一步按以下顺序推进：

1. 在 Windows x64 主机执行同一自动化门槛与人工验收矩阵，并补齐 macOS/Windows 未自动覆盖的播放、轨道混音和系统生命周期项目。
2. 补充 GP3、GP4、GPX、独立现代 GP、中文文件名与损坏文件的已授权真实样本验收。
3. 接入真实 SQLite 本地索引、最近打开和收藏；Practice Sidecar 继续保持独立 JSON payload。
4. 单独实现 MIDI Analyzer heuristic、piano-roll、基础钢琴谱与测试素材，再开放 MIDI 文件入口。
5. 云同步退出当前 Desktop MVP；未来按 macOS/Windows 对等的 provider-neutral 能力重新设计。

Desktop GP Slice 保留 Browser Demo，并把仓库组织为 `packages/web-core`、`packages/web-viewer`、`apps/web-demo` 与 `apps/desktop-shell`。首个桌面版本是内部可安装验收包，不包含正式签名、公证或自动更新；Internal Acceptance 仍不启用分发遥测。

## GP alphaTab 竖切

GP 第一条竖切已经接入 `@coderline/alphatab@1.8.4`：

- `packages/web-core/src/gp/alphaTabAdapter.ts`
- `packages/web-core/src/gp/alphaTabBrowser.ts`
- `packages/web-core/src/gp/gpOpenFlow.ts`

当前实现验证 Web Core 可以通过 Bridge 获取 GP 文件字节、交给 alphaTab loader、提取稳定 summary，并通过 `AlphaTabPlaybackAdapter` 驱动播放练习领域状态。Browser Demo 与 Electron Desktop Shell 共用 Viewer host、控制器和持久化合约；Desktop 通过 Main 持有文件能力和本地状态，Renderer 不直接获得 Node.js 能力或文件路径。

## Browser Demo

浏览器 demo 位于 `apps/web-demo/`。它使用 Rspack 启动本地页面，通过 `@zupulse/web-core` 创建 alphaTab API，并把用户选择的 GP 文件渲染到 DOM 容器。

运行：

```bash
pnpm demo:dev
```

构建：

```bash
pnpm demo:build
```

真实文件验收矩阵见 `docs/architecture/gp-playback-practice-acceptance.md`。
