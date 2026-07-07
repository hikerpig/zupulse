# ADR 0007：Bridge API 采用 RPC + 事件流混合风格

## 状态

已接受

## 背景

Web Viewer Core 需要调用 Native Shell 的平台能力，例如文件访问、sidecar 读写、安全书签和同步。Native Shell 也需要接收 Web Core 的播放状态、当前小节、错误状态和用户交互。

纯 RPC 对持续状态不自然。纯事件总线对文件读取和权限请求不够直观。

## 决策

Bridge API 采用混合风格。

RPC 用于：

- 文件读取。
- sidecar 读写。
- 权限与安全书签。
- 本机库导入。
- 文件重定位。
- 同步拉取和推送。
- capability discovery。

事件流用于：

- 播放状态。
- 当前小节或音符。
- 同步状态。
- 错误状态。
- 用户交互事件。

所有消息必须 typed、versioned，并带 correlation id。

## 后果

正面影响：

- 平台能力调用清晰。
- 播放和同步这类持续状态更自然。
- 后续 Windows 或原生音频桥可以复用协议形态。

负面影响：

- 消息命名和版本治理必须严格。
- 需要处理事件乱序、重复和取消。
- 调试工具需要能同时观察 RPC 和事件流。

## 约束

- Web Viewer Core 必须通过 capability discovery 判断平台能力。
- Native Shell 不应把 CloudKit、SQLite 等具体实现泄漏给 Web Core。
- 错误结构必须包含 code、message、recoverable 和可选 details。
