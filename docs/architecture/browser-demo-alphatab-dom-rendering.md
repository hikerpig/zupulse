# Browser Demo alphaTab DOM Rendering

## 范围

浏览器 demo 是 GP 渲染的第一个可手动试用入口。它允许用户选择本地 Guitar Pro 文件，并用 alphaTab 渲染到页面 DOM 容器。

## 构建

```bash
rtk npm install
rtk npm run check
rtk npm run demo:build
```

## 试用

```bash
rtk npm run demo:dev
```

默认打开 `http://127.0.0.1:5173`，选择 `.gp3`、`.gp4`、`.gp5`、`.gpx` 或 `.gp` 文件。谱文件只在当前浏览器进程中读取，不会上传。

## 当前能力

- 本地文件选择。
- GP 扩展名校验。
- alphaTab DOM 渲染。
- 文件加载状态。
- score summary 展示。
- 内置 `sonivox.sf3` 离线播放。
- 播放、暂停、停止和拖动定位。
- `25%–200%` 变速。
- 多个命名 AB 循环和每区间速度覆盖。
- 主显示轨道、附加显示轨道、静音、独奏和音量。
- mock Bridge sidecar 与本机恢复位置验证。
- 桌面和移动工作台布局。

## 当前边界

- 不包含 SwiftUI / WKWebView 壳层。
- Browser Demo 使用 mock Bridge，不写入真实 SQLite 或 CloudKit。
- 不同步原始文件或真实元数据。
- 不支持 MIDI。
- 不包含节拍器、倒计时或练习统计。

## 离线资源

Rspack 从锁定版本的 `@coderline/alphatab` 依赖复制以下资源：

- `alphaTab.mjs`
- Bravura 字体及许可证
- `sonivox.sf3`
- SoundFont 许可证

`rtk npm run demo:build` 会在构建后验证关键资源存在且非空。资源缺失时构建失败。
