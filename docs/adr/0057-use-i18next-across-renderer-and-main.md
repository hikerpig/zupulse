---
status: accepted
---

# Use i18next across Renderer and Main

Zupulse 使用 `i18next` 作为跨运行环境的国际化核心，并在共享 React UI 中通过 `react-i18next` 接入。无 React、无 DOM、无 Electron 依赖的 `@zupulse/app-i18n` workspace package 拥有 supported locales、locale resolution、namespace、catalog 和按应用实例创建的 i18next instance；`web-viewer` 只拥有 React Provider/hook 集成，Electron Main 直接消费同一 core catalog。

该方案比自研字典完整覆盖复数、插值和 `Intl` 格式化，也避免 FormatJS/React Intl 以 React 为中心而让 Main 形成第二套运行时。代价是 i18next key、resource shape 和 formatter 约定会成为应用级基础设施；因此禁止 module singleton、HTTP backend 和组件内 source-language fallback，并通过类型与 catalog parity 测试约束使用。
