---
status: accepted
---

# Generate iPad Web assets during the app build

iPad 的 HTML、React bundle、alphaTab、Worker、AudioWorklet、字体、SoundFont 与许可证资产不提交
到 Git。统一 workspace 脚本生成 iPad 专用 Web entry 和资源 manifest，并复制到 Xcode 构建目录；
Xcode Build Phase 与 CI 调用同一入口，缺失资源、hash 漂移或 Bridge 版本不兼容会使构建失败。

产物携带 Web build hash、Bridge schema version 和静态资源 hash。Debug 构建可以通过显式配置
连接本地开发服务器，Archive 与 Release 构建必须移除该能力并只打包本地生成资产。该方案避免
生成物与源码形成两份事实源，也保证直接从 Xcode 运行时不会继续使用陈旧 bundle；代价是本地
Xcode 构建与 Apple CI 都需要可重复的 Node/pnpm workspace 环境。

本决策为独立 iPad 产品重新确认构建边界，不恢复已被 ADR 0017 取代的 ADR 0014 Apple Shell
工程结构。

## Acceptance scope

2026-07-24 以 Xcode Build Phase、资源 manifest/hash 验证、Release 边界校验及 `ipad:verify` 为依据
接受。该决定不替代对首屏性能、长时播放或生产 Archive 的后续验收。
