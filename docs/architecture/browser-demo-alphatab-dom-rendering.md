# Browser Demo alphaTab DOM Rendering

## 范围

浏览器 demo 是 GP 渲染的第一个可手动试用入口。它允许用户选择本地 Guitar Pro 文件，并用 alphaTab 渲染到页面 DOM 容器。

## 构建

```bash
npm install
npm run check
npm run demo:build
```

## 试用

```bash
npm run demo:dev
```

打开 Rspack dev server 输出的本地地址，选择 `.gp3`、`.gp4`、`.gp5`、`.gpx` 或 `.gp` 文件。

## 当前能力

- 本地文件选择。
- GP 扩展名校验。
- alphaTab DOM 渲染。
- 文件加载状态。
- score summary 展示。

## 当前边界

- 不包含 SoundFont 播放配置。
- 不包含 SwiftUI / WKWebView 壳层。
- 不保存 sidecar。
- 不同步文件或元数据。
- 不支持 MIDI。
