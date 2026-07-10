# 架构基础实现说明

## 范围

当前实现覆盖 Viewer 第一版的架构基础和 GP Browser Demo 播放练习竖切：

- TypeScript Web Core。
- Score Model 共享类型。
- 文件格式识别。
- 内容指纹和 ScoreIdentity。
- Bridge API typed RPC / event 合约。
- JSON sidecar payload。
- SQLite schema 合约。
- mock native bridge 打开文件流程。
- alphaTab GP DOM 渲染。
- 离线 SoundFont 播放。
- 播放状态机、定位和变速。
- 多个命名 AB 循环。
- 轨道显示、静音、独奏和音量。
- 播放练习 sidecar 与本机恢复位置合约。

当前实现不包含真实 MIDI Analyzer、Electron Desktop Shell、SQLite adapter、跨平台同步 adapter 或原生音频桥。

## 代码入口

- `web-core/src/index.ts`：Web Core 对外导出入口。
- `web-core/src/score/types.ts`：Score Model 与 ScoreIdentity。
- `web-core/src/score/format.ts`：GP / MIDI 文件格式识别。
- `web-core/src/score/identity.ts`：内容 hash 与 ScoreIdentity 创建。
- `web-core/src/score/session.ts`：ViewerSession 聚合。
- `web-core/src/bridge/types.ts`：Bridge API 消息类型。
- `web-core/src/bridge/mockNativeBridge.ts`：测试用 Native Bridge。
- `web-core/src/bridge/openFileFlow.ts`：mock 打开文件流程。
- `web-core/src/storage/sidecar.ts`：sidecar payload codec。
- `web-core/src/storage/sqliteSchema.ts`：SQLite schema 合约。
- `web-core/src/playback/types.ts`：播放领域类型和引擎端口。
- `web-core/src/playback/playbackController.ts`：播放练习状态机。
- `web-core/src/playback/alphaTabPlaybackAdapter.ts`：alphaTab 播放适配器。
- `web-core/src/playback/playbackSidecar.ts`：播放练习 sidecar 与合并规则。
- `web-core/src/playback/playbackPersistence.ts`：Bridge 持久化 adapter。
- `web-demo/src/playbackControls.ts`：Browser Demo 控件绑定。

## 验证

运行：

```bash
pnpm check
pnpm demo:build
```

预期结果：

- TypeScript 编译通过。
- Vitest 单元测试全部通过。
- Rspack 生产构建通过。
- alphaTab script、字体、SoundFont 和许可证进入构建产物。

## 后续计划

下一步按以下顺序推进：

1. 从已授权 GP5 生成现代 `.gp`、中文元数据和运行时损坏样本，完成 GP 准入验收。
2. 实现 Electron Desktop GP Slice：macOS arm64 先完成交互闭环，Windows x64 从第一天持续构建并随后完成人工验收。
3. 接入真实 SQLite 本地索引、最近打开和收藏；Practice Sidecar 继续保持独立 JSON payload。
4. 单独实现 MIDI Analyzer heuristic、piano-roll、基础钢琴谱与测试素材，再开放 MIDI 文件入口。
5. 云同步退出当前 Desktop MVP；未来按 macOS/Windows 对等的 provider-neutral 能力重新设计。

Desktop GP Slice 保留 Browser Demo，并把仓库组织为 `packages/web-core`、`packages/web-viewer`、`apps/web-demo` 与 `apps/desktop-shell`。首个桌面版本是内部可安装验收包，不包含正式签名、公证、自动更新或遥测。

## GP alphaTab 竖切

GP 第一条竖切已经接入 `@coderline/alphatab@1.8.4`：

- `web-core/src/gp/alphaTabAdapter.ts`
- `web-core/src/gp/alphaTabBrowser.ts`
- `web-core/src/gp/gpOpenFlow.ts`

当前实现验证 Web Core 可以通过 Bridge 获取 GP 文件字节、交给 alphaTab loader、提取稳定 summary，并通过 `AlphaTabPlaybackAdapter` 驱动播放练习领域状态。Electron Desktop Shell 仍在后续计划中。

## Browser Demo

浏览器 demo 位于 `web-demo/`。它使用 Rspack 启动本地页面，通过 `@tab-viewer/web-core` 创建 alphaTab API，并把用户选择的 GP 文件渲染到 DOM 容器。

运行：

```bash
pnpm demo:dev
```

构建：

```bash
pnpm demo:build
```

真实文件验收矩阵见 `docs/architecture/gp-playback-practice-acceptance.md`。
