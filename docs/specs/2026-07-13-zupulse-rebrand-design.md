# Zupulse 品牌更名设计

## 目标

将尚未上线的 Tab Viewer 全面更名为英文品牌 `Zupulse`、中文品牌“逐拍”。本次允许 Breaking Change，不保留旧品牌内部标识兼容性，也不迁移旧版 Browser 数据。

## 范围

- 用户可见的产品标题、页面文案、应用名称和当前项目说明统一使用 `Zupulse`；需要中文品牌时使用“逐拍”，双语场景使用“Zupulse 逐拍”。
- workspace 包名统一改为 `@zupulse/web-core`、`@zupulse/web-viewer`、`@zupulse/web-demo` 和 `@zupulse/desktop-shell`，同步更新源码、测试、脚本和锁文件中的引用。
- Electron 自定义协议由 `tab-viewer://` 改为 `zupulse://`。
- IPC channel 由 `tab-viewer:*` 改为 `zupulse:*`，Preload 暴露的全局对象由 `window.tabViewerBridge` 改为 `window.zupulseBridge`。
- Browser IndexedDB、临时目录前缀、应用标识及其他运行时持久化名称由 `tab-viewer-*` 改为 `zupulse-*`。
- 当前设计系统名称、CSS token 和相关消费配置统一由 `tab-viewer-*` 改为 `zupulse-*`，配色、排版和组件视觉不变。
- 更新当前维护的 `README`、`CONTEXT.md`、`AGENTS.md` 和架构说明。

## 不在范围内

- 不设计新 Logo、图标、配色、字体或品牌视觉语言。
- 不兼容旧的 Electron 协议、IPC channel、全局 Bridge 或数据库名称。
- 不迁移 `tab-viewer-library` 中的数据；更名后的 Browser 产品使用全新的 Zupulse 数据库。
- 不改写历史 ADR、历史实施计划和 Git 历史中的旧品牌名称，它们继续反映当时的项目状态。
- 不重命名本地仓库目录或远端 Git 仓库；这类操作属于仓库外部管理。

## 实现原则

更名只改变品牌与标识，不改变领域模型、Bridge 消息结构、数据流或业务行为。跨进程边界继续使用现有 Zod schema 校验；本次不新增依赖或兼容层。已有用户改动和未跟踪设计产物保持不动，只修改与品牌更名直接相关的文件。

## 验证

- 搜索活动源码、配置、测试和当前文档，确认没有应被替换的 `Tab Viewer`、`tab-viewer`、`tabViewer` 残留。
- 运行 `pnpm check`。
- 运行 `pnpm demo:build`。
- 运行 `pnpm desktop:build`。
- 运行 `pnpm format:check`；若失败，仅报告未触及文件的历史格式债务。
- 与协议、IPC、Bridge、数据库相关的现有测试同步更新，并继续验证安全边界。
