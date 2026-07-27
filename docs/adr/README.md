# ADR 状态索引

本表只索引仍有维护价值的架构决策。已删除的实验方案和 Feature 实现历史不在 ADR 中保留；
当前行为以代码、测试、Feature Contract 与架构文档为准。

## Current

- `0018`：Electron Renderer 与 Node 隔离。
- `0021`：Preload 只暴露经过校验的领域 Bridge。
- `0022`：Bridge 类型从运行时 schema 推导。
- `0023`：外部文件使用一次性 token。
- `0030`：Desktop 包内要求 Bridge schema 精确匹配。
- `0031`：Desktop 本地优先并推迟同步。
- `0032`：按 packages/apps 组织 monorepo。
- `0033`：使用 Zod 4 定义运行时契约。
- `0034`：共享 Viewer UI 全部位于 web-viewer。
- `0036`、`0037`、`0038`：MusicXML 与播放位置模型。
- `0039`：共享 Viewer 使用 React 应用壳。
- `0040`–`0051`：Managed Score Copy、Library 身份/路由、双宿主 Repository、迁移与故障恢复。
- `0054`：UI Locale Preference 由各宿主持久化；Desktop 由 Main 在 Renderer 挂载前解析并提供。
- `0055`：generated Loop name 从结构化范围和当前 locale 派生，不作为持久化文案事实。
- `0056`：生产 UI 只展示本地化 Application Issue，不直接展示原始异常或任意技术详情。
- `0057`：Renderer 与 Electron Main 共用 `@zupulse/app-i18n` 中的 i18next core catalog。
- `0058`–`0063`：iPad 薄 SwiftUI/WKWebView 壳、单一版本化 Bridge、token 二进制数据面、受控网络、
  Zod contract 事实源与构建时 Web 资产。
- `0064`：在单一 alphaTab 纵向布局上协调连续跟随、屏幕翻页、谱面点击与播放进度。
- `0065`：共享 Viewer UI 使用受约束的 Tailwind utility layer；运行时 semantic token 与 Base UI
  所有权保持不变。
- `0066`：延期 Desktop dropped-file capability，保持 Preload 与一次性 token trust boundary。

## Proposed

- 当前没有。

## Superseded

- `0004`、`0008` 的首版 CloudKit/同步承诺由 `0031` 取代。
- `0013`–`0017` 中 Apple Web/Native Shell 交付结构由 Electron Desktop Shell 和 `0032` 取代。
- `0046` 取代任何把 Viewer Session ID 放入 URL 的早期路由描述。
- `0048`、`0049`、`0051` 取代临时 Viewer 文件或通用 key-value store 作为馆藏事实源的设计。
- `0065` 取代 `0039` 中“暂不引入 Tailwind”的局部决定；`0039` 的其余 React 应用壳决策继续有效。

## 维护规则

- 新 ADR 必须包含 YAML frontmatter：`status: proposed|accepted|superseded|historical`。
- 取代旧决策时，在新旧 ADR 中互相链接，并更新本索引。
- Accepted 不代表永久正确；当前实现发生变化时同步更新状态，不能只新增一份冲突文档。
