# GP alphaTab 竖切说明

## 范围

本竖切接入 `@coderline/alphatab@1.8.4`，验证 Web Core 可以从 Bridge 获取 GP 文件字节，交给 alphaTab loader，并提取稳定 summary。

## 已实现入口

- `web-core/src/gp/alphaTabAdapter.ts`：封装 `ScoreLoader.loadScoreFromBytes` 和 GP summary。
- `web-core/src/gp/alphaTabBrowser.ts`：封装 `AlphaTabApi` 创建和播放位置事件订阅。
- `web-core/src/gp/gpOpenFlow.ts`：串起 Bridge 打开文件与 GP summary。

## 当前边界

- 没有 fork alphaTab。
- 没有引入真实浏览器页面。
- 没有配置 SoundFont。
- 没有实现 SwiftUI / WKWebView 壳层。
- 没有提交真实 GP fixture。

## 下一步

下一步应实现一个浏览器 demo 页面，把 `createAlphaTabApi` 接到实际 DOM 容器，并通过文件选择器或 mock bridge 加载 GP 文件。
