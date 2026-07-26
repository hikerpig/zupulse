---
status: accepted
---

# 共享 Viewer UI 使用受约束的 Tailwind utility layer

## 背景

ADR 0039 选择 React 与 Base UI 时，`web-viewer` 的共享组件和响应式组合仍然很少，因此暂缓引入
Tailwind。当前实现已经增长到多个 500 行级 feature CSS Module，布局、间距、排版、控件尺寸和
交互状态出现明显重复；运行时 semantic token 也出现了组件引用未定义变量、而 `check:design`
仍然通过的治理盲区。ADR 0039 中约定的 Tailwind 重新评估条件已经成立。

Zupulse 已有清晰的产品设计事实源：`DESIGN.md` 定义产品取舍，theme library 提供上游品牌原语，
`packages/web-viewer/src/styles/tokens.css` 提供运行时 semantic token。引入 utility framework
不能建立第二套产品主题，也不能改变 Base UI、alphaTab 或宿主边界的所有权。

## 决策

`packages/web-viewer` 引入 Tailwind CSS 作为受约束的 utility layer，用于应用壳、基础控件和 feature
组件中的布局、间距、排版、响应式与视觉状态组合。

- `DESIGN.md`、theme library 与 `tokens.css` 的事实源顺序不变。Tailwind theme 只把已批准的
  runtime semantic token 投影为 utility class，不独立保存产品色值或视觉规则。
- 不加载 Tailwind Preflight。现有 `common.css` 继续拥有 reset、原生 button/input、focus 与共享
  accessibility base styles。
- 不向产品代码开放 Tailwind 默认 color、font、radius 和 shadow vocabulary。应用使用
  `bg-surface`、`text-foreground`、`border-border`、`rounded-control` 等 semantic utilities；
  raw product colors 和静态 arbitrary aesthetic values 由 repository check 阻断。
- Base UI 继续拥有 ARIA、键盘、焦点、Portal、collision handling、定位和组件状态。项目 UI
  primitives 集中组合 Base UI parts 与 Tailwind classes，feature 不在已有 primitive 时重复第三方
  component anatomy。
- CSS Modules 继续用于 alphaTab 生成 DOM、Score surface、splitter/slider geometry、scrollbar、
  keyframes、高频音乐可视化和依赖动态 CSS variables 的专用样式。一个组件的同一 property/state
  只能有一个样式所有者；迁移完成时删除失去所有权的 selectors。
- 不在 CSS Modules 中建立以 `@apply` 为主的第二种 utility 写法。Tailwind 主要在 TSX `className`
  中消费，专用 CSS 直接消费 runtime variables。
- Tailwind source detection 使用显式 monorepo 路径；动态 variants 使用完整静态 class maps，不依赖
  运行时字符串拼接。
- 使用项目 formatter 统一 utility class 顺序。只有真实 primitive override 需求证明必要时，才增加
  class conflict merge dependency。

## 迁移

先验证 Rspack、Browser、Desktop 和 iPad Web Assets 的 production build pipeline，并确认没有
Preflight 或 CSS layer 回归。随后建立 semantic theme projection 和 design checks，再实现
Button、IconButton、Field、Panel、Status 与 Overlay primitives。

页面迁移从 App Header、Base UI overlay 和 Playback Transport 三个代表性垂直切片开始。只有
light/dark、desktop/narrow、keyboard、三宿主构建与净复杂度门槛都通过，才扩大到其余 Library、
Studio 和 Viewer。迁移不承担视觉重设计；observable behavior 的改变必须独立评审。

## 结果

本 ADR 只取代 ADR 0039 中“暂不引入 Tailwind”的决定。ADR 0039 对 React、React Router、Base UI、
Zustand、ViewerApplication 生命周期和领域状态所有权的其余决定继续有效。

Tailwind 成为可替换的 build-time styling tool，不成为产品设计或运行时主题事实源。停止使用
Tailwind 时，semantic runtime tokens、Base UI behavior 和专用 CSS 边界仍然有效。

## 参考

- [Zupulse 设计契约](../../DESIGN.md)
- [React 应用系统](../architecture/react-application-system.md)
- [ADR 0039](0039-use-react-for-shared-viewer-application-shell.md)
- [Tailwind theme variables](https://tailwindcss.com/docs/theme)
- [Tailwind Preflight](https://tailwindcss.com/docs/preflight)
- [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)
- [Base UI styling](https://base-ui.com/react/handbook/styling)
