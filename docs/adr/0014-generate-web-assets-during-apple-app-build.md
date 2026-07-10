---
status: superseded by ADR-0017
---

# Apple App 构建时生成 Web 资源

Apple Shell 的可运行构建通过统一脚本生成 Apple Web 入口并将产物复制到 App Bundle，不把 `dist/` 提交到 Git；Xcode Build Phase 与 CI 调用同一脚本，失败时终止应用构建。产物携带 Web 版本与资源 hash 清单，以便诊断 Shell 和 Web 协议不匹配。该方案以本地 App 构建依赖 Node/npm 为代价，避免提交生成物以及开发机、CI 和发布包之间的资源漂移。
