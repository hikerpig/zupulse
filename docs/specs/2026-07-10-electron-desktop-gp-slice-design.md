---
status: implemented
---

# Electron Desktop GP Slice 设计

## 状态

已确认，待拆分实施计划。

## 目标

在现有 Web Core、Browser Demo 和 GP 播放练习能力上，增加面向 macOS 与 Windows 的 Electron Desktop Shell。首条竖切让用户通过系统文件选择器打开 Guitar Pro 文件，在离线桌面应用中完成看谱、播放、定位、变速、命名循环、轨道显示与混音，并在应用重启后恢复练习设置和本机播放位置。

该竖切验证桌面宿主、跨进程 Bridge、离线资源、文件权限和本地持久化，不扩展 Viewer 的练习功能。Browser Demo 继续保留，桌面端与浏览器端共享同一套 Viewer UI 和领域逻辑。

## 产品边界

### 本次包含

- Electron 单实例、单 Viewer 窗口。
- macOS arm64 内部可安装验收包。
- Windows x64 持续构建、自动化 smoke test 和随后进行的人工验收。
- GP3、GP4、GP5、GPX 与 `.gp` 文件选择入口。
- 系统文件选择器、macOS `⌘O` 和 Windows `Ctrl+O`。
- alphaTab 离线渲染、SoundFont 播放及现有练习控件。
- 严格隔离的 Main、Preload、Renderer 进程边界。
- Zod schema 驱动的 typed Bridge。
- Practice Sidecar 与 Local Playback Resume 的持久 JSON adapter。
- 本地隐私化诊断日志。
- Electron Forge 开发打包和跨平台测试基线。

### 本次不包含

- MIDI 文件入口、MIDI Analyzer、piano-roll 或基础钢琴谱。
- SQLite、本地曲库、最近打开和收藏。
- 文件关联、双击打开、拖放、安全书签式持久文件引用或自动重开。
- 多窗口、多谱并行或托盘后台运行。
- 云同步、CloudKit 或任何账号能力。
- 原生音频引擎。
- 正式代码签名、公证、自动更新、公开发布或崩溃上报。
- Intel Mac、Windows ARM 或 32 位 Windows 产物。
- iOS；未来 Mobile App 独立设计。

## 前置准入

Desktop Shell 开始集成前先完成 GP 准入验收。最小素材包括：

- 已授权的 `Treasure.gp5` 多轨样本。
- 从该样本确定性导出的现代 `.gp` 样本。
- 标题和至少一个轨道名为中文的派生样本。
- 测试运行时通过截断合法 fixture 生成的损坏样本。

准入至少覆盖渲染、SoundFont、播放/暂停/停止、定位、`25%–200%` 变速、两个命名循环、显示轨道、静音/独奏/音量和重新打开恢复。派生样本只解除 Desktop Shell 的前置门槛，不代表 GP3、GP4、GPX 和独立真实 `.gp` 的完整兼容矩阵已经通过。

## 仓库结构

仓库按可复用包与可运行应用分层：

```text
packages/
  web-core/       领域模型、GP、播放、Bridge schema、持久 payload schema
  web-viewer/     共享 Viewer UI、presenter、控件、样式、资源配置
apps/
  web-demo/       浏览器文件选择、mock Bridge、开发入口
  desktop-shell/  Electron Main、Preload、Renderer 入口、Forge 配置
test-fixtures/
  gp/             授权原始样本和确定性派生样本
  midi/           后续 MIDI 竖切素材
```

继续使用 pnpm workspace、根 `pnpm-lock.yaml` 和 TypeScript project references：

```json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

不引入 Turborepo、Nx 或第二套 Renderer bundler。Rspack 构建 Browser Demo 与 Electron Renderer；Electron Forge 负责 package、maker 和后续签名生命周期。

`test-fixtures/` 不进入 Browser Demo 或 Desktop Shell 的生产资源。应用不内置示例曲目。

## 运行时架构

```text
System Menu / Dialog
        |
        v
Electron Main Process
  - window and app lifecycle
  - custom app protocol
  - file tokens and byte reads
  - JSON persistence
  - local diagnostics
        |
        | validated IPC
        v
Sandboxed Preload
  - contextBridge only
  - request/event validation
        |
        | window.tabViewerBridge
        v
Electron Renderer
  - production host entry
  - shared web-viewer UI
        |
        v
web-core
  - Viewer Session
  - GP and playback domains
  - alphaTab adapters
```

### Main Process

Main Process 独占系统能力：应用与窗口生命周期、系统文件选择器、文件读取、本地持久化、自定义资源协议和诊断日志。Main 不包含 Viewer 领域状态，不解释循环、轨道或播放设置含义。

### Preload

Preload 在 sandbox 与 context isolation 下运行，只暴露领域 Bridge。它不向 Renderer 暴露 `ipcRenderer`、Electron channel、Node 模块或任意 `send`、`invoke`、`on` 能力。

### Renderer

Renderer 设置 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。除原生应用菜单、系统对话框和窗口生命周期外，标题区、打开入口、播放控制、轨道面板、循环与可恢复错误全部由共享 `web-viewer` 绘制。

Browser Demo 与 Desktop Shell 使用独立 host entry。Browser 入口注入浏览器文件选择和 mock Bridge；Desktop 入口只接受 Preload Bridge，连接失败时显示启动级错误，不得降级到 mock。

## Bridge 合约

### 唯一真相源

Bridge 请求、响应、事件、capabilities、错误和持久 payload 使用 Zod 4 定义运行时 schema，并从 schema 推导 TypeScript 类型。Preload 和 Main 分别验证进入自身信任边界的消息；非法消息返回稳定的 `INVALID_BRIDGE_MESSAGE`，不得进入业务 handler。

Bridge envelope 保留：

```ts
type BridgeMessage<T> = {
  bridgeVersion: string;
  type: string;
  correlationId: string;
  payload: T;
};
```

`type` 只能取共享 schema 中的判别值。Renderer 不能指定 Electron IPC channel。

### Renderer 暴露面

Preload 只暴露等价于以下形态的 API：

```ts
window.tabViewerBridge.request(message);
window.tabViewerBridge.subscribe(listener);
```

`subscribe` 只传递验证后的领域事件并返回取消订阅函数。所有返回值必须剥离 Electron event、真实路径、Node `Error`、`Buffer` 特有行为和其他宿主对象；文件字节统一为可结构化克隆的 `Uint8Array`。

### 启动握手

握手包含：

- 应用版本。
- Bridge schema 版本。
- Renderer 构建 hash。
- capabilities。

同一安装包内 Main、Preload 与 Renderer 的 Bridge schema 必须精确匹配；不一致属于启动级致命错误。Capabilities 只表达实现能力，不用于掩盖协议不兼容。

Desktop GP Slice 的能力为：

```ts
{
  fileAccess: {
    openExternalFile: true,
    persistentFileReferences: false,
    localLibraryImport: false
  },
  storage: {
    sqliteIndex: false,
    sidecarPayload: true
  },
  sync: {
    available: false,
    provider: "none"
  },
  audio: {
    webAudio: true,
    nativeBridge: false
  }
}
```

跨平台合约不暴露安全书签、CloudKit、SQLite 路径等具体平台机制。

## 文件打开流程

文件选择归 Desktop Shell 所有；Viewer 只表达 Open Score Intent。

1. 用户点击 Viewer 空状态的打开按钮，或使用平台菜单/快捷键。
2. Renderer 通过 Bridge 请求打开谱文件。
3. Main 显示系统文件选择器，只列出当前启用的 GP 格式。
4. 用户取消时返回取消结果，不产生错误提示。
5. Main 校验文件扩展名、文件类型、普通文件属性和 64 MiB 大小上限。
6. Main 创建不可猜测、一次性的 `fileToken`，返回文件名、大小和 token，不返回路径。
7. Renderer 用 token 调用 `file.readBytes`。
8. Main 读取完整文件并返回 `Uint8Array`；读取成功后 token 立即失效。
9. Web Core 根据内容创建 Score Identity，加载 GP、sidecar 和本机恢复位置。
10. SoundFont 就绪后允许播放；打开文件不会自动播放。

Token 在读取成功、取消、超时、窗口关闭或应用退出时清除。首版不做分块读取；只有真实文件证明 64 MiB 或 IPC 内存复制成为问题时才设计流式协议。

首版不保存 Score File Reference。应用重启后，用户重新选择同一文件，系统依靠内容确定的 Score Identity 恢复练习数据。

## 内置资源与网络边界

Desktop Shell 使用 `tab-viewer://app/` 只读自定义协议提供 Renderer、alphaTab、字体和 SoundFont，不使用 `file://`。

协议约束：

- 使用 Electron 当前 `protocol.handle` API。
- 只映射生产 Renderer 资源根目录。
- URL 解码和路径规范化后仍必须位于资源根目录内。
- 按实际需要注册 standard、secure、Fetch 和流式资源能力。
- 不启用 `bypassCSP`。
- 返回正确 MIME 类型与明确的缺失资源响应。
- 生产包不包含 mock Bridge 或 test fixture。

Renderer 使用严格 CSP。默认禁止网络、插件、任意 frame、导航、弹窗和权限请求；仅为 alphaTab worker、字体和 SoundFont 开放经测试证明必需的最小来源。用户明确点击且通过 URL 校验的 HTTPS 外链可以交给系统默认浏览器，不能在 Renderer 中加载。

## 持久化

### 数据分离

Practice Sidecar 与 Local Playback Resume 使用独立目录，按 `ScoreIdentity.contentHash` 命名，存放于 Electron `userData` 范围内。真实目录只由 Main Process 知道。

Practice Sidecar 保存可迁移的练习设置，包括全谱速度、命名循环、显示轨道、静音和音量。Local Playback Resume 只保存当前设备的上次播放位置和更新时间，不进入 sidecar。

首条竖切不使用 SQLite。下一条桌面竖切再用 SQLite 提供本地索引、最近打开、收藏和同步状态基础；JSON sidecar 继续作为独立 payload。

### 写入规则

- Practice Sidecar 在变化稳定 500 ms 后防抖保存。
- Local Playback Resume 在播放期间最多每 5 秒保存一次。
- 暂停、停止、换谱和关闭窗口时立即保存恢复位置。
- 换谱前必须等待两类待写入任务完成。
- 同一 Score Identity 的写入串行化，旧快照不得覆盖新状态。
- 使用同目录临时文件和原子替换。
- 每个 payload 带 schema 版本并经过 Zod 校验。
- 不提供手动保存按钮或未保存星号。

### 损坏恢复

无法解析或不符合 schema 的 JSON 移动为带时间戳的 `.corrupt` 副本，不被静默覆盖。Viewer 使用默认练习状态继续打开谱面，并显示一次可恢复警告。恢复位置损坏不得阻止看谱；原始 GP 文件始终只读且不受影响。

## 窗口、播放与系统生命周期

- 首版获取单实例锁，只创建一个 Viewer 窗口。
- 第二次启动聚焦现有窗口。
- Viewer Session 属于窗口作用域，不建立应用级“当前谱”单例。
- 打开另一份谱时先停止旧播放、flush 待写入状态、取消旧订阅，再替换 Session。
- 失焦或最小化时继续播放、位置推进和循环。
- 系统休眠或锁屏时暂停并立即保存位置。
- 系统恢复后保持暂停，等待用户明确继续。
- 关闭唯一窗口时停止播放、flush 状态并退出应用。
- 首版不常驻托盘，也不在关闭窗口后后台播放。

原生菜单命令转换为 Viewer command，不直接操作 alphaTab。播放状态仍由 `PlaybackController` 统一拥有。

## 错误与诊断

错误展示按可恢复性分层：

- 文件不支持、GP 解析失败、SoundFont 失败、sidecar 无效和播放失败等可恢复 Viewer 错误由 Renderer 内容区展示。
- 文件选择取消不算错误。
- Renderer 资源加载失败、Preload 不可用、Bridge schema 不匹配等启动级错误由 Desktop Shell 的致命错误界面展示。
- Main 只返回稳定错误码、用户可读消息、`recoverable` 和经过筛选的 details，不泄漏路径、堆栈或原始系统异常。

Internal Acceptance Build 不联网、不接入遥测、崩溃上报或设备标识。Main 写有大小与保留期限制的本地结构化日志；Renderer 只能提交预定义诊断事件。日志不得记录真实路径、文件名、谱内容或 sidecar payload，可以记录应用版本、平台、Bridge 版本、稳定错误码、耗时和必要的 content hash 前缀。用户可以主动打开日志目录并自行决定是否分享。

开发环境允许 DevTools；生产验收包不开放远程调试入口，不能因关闭 DevTools 而改变应用行为。

## 构建与打包

Rspack 继续负责 Browser Demo 与 Desktop Renderer。共享资源构建必须验证以下内容进入 Desktop 产物：

- alphaTab script/worker。
- Bravura 等 alphaTab 字体。
- `sonivox.sf3`。
- alphaTab、字体和 SoundFont 所需许可证。
- Renderer 构建 hash 清单。

Electron Forge 负责：

- macOS arm64 package/maker。
- Windows x64 package/maker。
- 应用名、图标和版本元数据。
- 后续签名与公证 hook。

首个里程碑只要求内部可安装验收包。`dist/`、`out/` 和其他生成物不提交 Git。Electron、Zod 与打包工具精确锁定在 `pnpm-lock.yaml`；公开发布前再升级到当时受支持的稳定 Electron，并单独设计签名、公证、更新与回滚。

## 测试策略

### Vitest

Vitest 继续承担主要自动化覆盖：

- Bridge schema 的合法、非法、未知类型和版本不匹配。
- Preload 暴露面与参数过滤。
- Main handler 的发送者校验和错误映射。
- 一次性 token 的成功、重复使用、超时、超限和窗口销毁。
- 自定义协议的路径规范化、路径穿越、MIME 和缺失资源。
- Practice Sidecar 和 Local Playback Resume 的防抖、节流、串行写入、原子替换与损坏隔离。
- 单实例、换谱、系统挂起和关闭时的状态编排。
- 现有 Web Core、PlaybackController、alphaTab adapter 和共享 Viewer UI。

### Playwright Electron

Playwright Electron 只覆盖少量关键跨进程链路：

- 应用启动、自定义协议加载和 Bridge 握手。
- 替换系统文件选择器结果后打开固定 GP fixture。
- 修改练习设置、关闭、重启和恢复。
- Renderer 无 Node/Electron 权限。
- 非法 IPC、任意导航、弹窗和网络请求被拒绝。
- 打包前 smoke test。

测试通过 Main Process stub 替换原生文件对话框，不试图自动操作系统对话框。Playwright Electron 仍属实验能力，因此不能成为唯一质量门槛。

### CI 与人工验收

- macOS CI：typecheck、Vitest、Renderer build、Forge package、Electron smoke。
- Windows CI：同样的构建、打包和 smoke，从首条实现开始持续运行。
- macOS 人工验收先完成完整 GP 流程。
- Windows 随后使用同一验收矩阵完成人工播放测试。
- 真实音频、系统休眠/恢复、原生文件选择器和安装体验保留人工验证。

## 完成标准

Desktop GP Slice 完成必须同时满足：

1. GP 准入素材和自动化基线通过。
2. macOS arm64 内部包可安装并完成完整交互验收。
3. Windows x64 构建、打包、smoke 和人工核心流程通过。
4. Browser Demo 继续工作，且未引入 Electron 依赖或行为回退。
5. Renderer 中不存在 Node、Electron、真实路径或通用 IPC 暴露。
6. 应用断网时可以加载全部资源并完成播放练习。
7. 重启后可以通过重新选择同一文件恢复 Practice Sidecar 和 Local Playback Resume。
8. 非法消息、损坏 JSON、损坏 GP 和资源缺失都有确定、可恢复或明确致命的结果。
9. Desktop 生产产物不包含 mock Bridge、test fixtures、遥测或远程代码。

只完成 macOS 不构成 Desktop Shell MVP。完整 GP 格式兼容矩阵仍按独立样本逐项记录，不能由派生 fixture 或单元测试替代。

## 后续阶段

### SQLite 本地库竖切

增加 SQLite adapter、本地索引、最近打开、收藏和持久 Score File Reference。该阶段仍保持本地优先，不自动引入云同步。

### MIDI Viewer 竖切

实现 MIDI Analyzer、piano-roll、量化、左右手分配、基础钢琴谱和异常小节提示，完成独立测试素材与验收后再开放 MIDI 文件入口。

### 桌面发布竖切

设计 macOS 签名与公证、Windows 签名、安装器、更新渠道、回滚、Electron 安全升级节奏和公开发布支持。

### 跨平台同步

同步必须按 macOS/Windows 对等的 provider-neutral 能力重新设计。CloudKit 不属于当前 Desktop MVP；未来 Mobile App 可以根据移动端产品形态独立评估。

### Mobile App

iOS 等移动端不承诺复用 Electron 运行时或桌面交互结构。可以复用稳定的数据格式和领域语义，但文件、音频、生命周期和界面需重新设计。

## 决策索引

本设计主要落实以下 ADR：

- ADR-0017：桌面端采用 Electron，移动端独立设计。
- ADR-0018：Renderer 与 Node.js 严格隔离。
- ADR-0019：通过受限自定义协议加载 Renderer。
- ADR-0020：Electron Forge 与 Rspack 分工。
- ADR-0021～0023：领域 Bridge、运行时 schema 与一次性文件 token。
- ADR-0024～0027：损坏恢复、单窗口、自动保存和播放生命周期。
- ADR-0028～0030：分层测试、零遥测和精确协议匹配。
- ADR-0031：Desktop MVP 本地优先并推迟同步。
- ADR-0032～0034：monorepo 结构、Zod 4 和共享 Viewer UI。

ADR-0010、0011、0012、0014 与 0015 中的 WKWebView、Apple App Bundle 和 Swift 原生部署决策已由 ADR-0017 替代。
