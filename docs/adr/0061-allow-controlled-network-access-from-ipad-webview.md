---
status: accepted
---

# Allow controlled network access from the iPad WebView

iPad 发布版允许共享 React 应用访问构建时明确配置的 HTTPS 服务 allowlist，但 WKWebView 顶层页面
始终锁定在 Zupulse 的受信任应用 origin，不作为通用内嵌浏览器。用户明确点击的普通 HTTPS 外链
交给系统 Safari；未知自定义 scheme、`file://`、脚本弹窗、重定向和非 allowlist 网络请求被拒绝。
开发构建可以通过独立且不可进入发布产物的配置连接本地开发服务器。

发布版的 HTML、React bundle、alphaTab、Worker、AudioWorklet 和其他可执行 Web 代码必须随 App
Bundle 固定发布，不从网络远程替换或热更新。远程入口只承载经 schema 校验的数据与配置；App
启动时校验 Web build hash、Bridge 版本和原生壳版本的兼容关系。

该方案为未来更新、同步、帮助或遥测保留受控网络入口，同时保护持有 Bridge 能力的顶层页面不被
外部内容接管。核心 Library、曲谱解析、渲染和练习播放仍必须离线可用，任何未来在线能力都不得把
网络变成打开 Managed Score Copy 的前置条件。相比完全断网，它增加了 allowlist、内容安全策略和
导航委托测试；相比允许任意导航，它保持了 App Shell 的最小权限边界。

本决策不恢复已被 ADR 0017 取代的 ADR 0012；它为独立 iPad 产品重新定义网络与导航边界。

## Acceptance scope

2026-07-24 以 Release 边界校验、导航 policy 测试、CSP/allowlist 检查和 `ipad:verify` 为依据接受。
允许的远程服务目前仍应保持最小；性能、长期网络稳定性与生产服务接入不在本次个人原型验收范围。
