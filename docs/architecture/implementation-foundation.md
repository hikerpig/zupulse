# 架构基础实现说明

## 范围

当前实现只覆盖 Viewer 第一版的架构基础切片：

- TypeScript Web Core。
- Score Model 共享类型。
- 文件格式识别。
- 内容指纹和 ScoreIdentity。
- Bridge API typed RPC / event 合约。
- JSON sidecar payload。
- SQLite schema 合约。
- mock native bridge 打开文件流程。

当前实现不包含真实 alphaTab 渲染、真实 MIDI Analyzer、SwiftUI / WKWebView 壳层、CloudKit adapter 或 Web Audio 播放器。

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

## 验证

运行：

```bash
npm run check
```

预期结果：

- TypeScript 编译通过。
- Vitest 单元测试全部通过。

## 后续计划

后续应继续拆分以下实现计划：

- Browser demo + alphaTab DOM rendering。
- MIDI Analyzer heuristic + 测试素材。
- SwiftUI / WKWebView Apple Shell。
- CloudKit Sync Adapter。
- Playback Engine + Web Audio MVP。

## GP alphaTab 竖切

GP 第一条竖切已经接入 `@coderline/alphatab@1.8.4`：

- `web-core/src/gp/alphaTabAdapter.ts`
- `web-core/src/gp/alphaTabBrowser.ts`
- `web-core/src/gp/gpOpenFlow.ts`

当前实现验证 Web Core 可以通过 Bridge 获取 GP 文件字节、交给 alphaTab loader，并提取稳定 summary。真实浏览器页面、SoundFont、播放 UI 和 Apple 壳层仍在后续计划中。
