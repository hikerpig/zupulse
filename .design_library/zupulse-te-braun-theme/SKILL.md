---
name: zupulse-design
description: Use this skill to generate future-facing, restrained, precise, warm-industrial, digitally playful interfaces for zupulse — Digital Music Practice Workspace. Contains colors, type, spacing, radius, shadow, and dashboard guidance.
user-invocable: true
---

# zupulse Design Skill

使用这个主题资料库辅助设计 Zupulse Digital Music Practice Workspace。先读项目根
`DESIGN.md` 确认当前产品契约；只有修改主题、token 或基础组件时，再用 `css.json`
理解品牌原语。应用运行时只消费 `packages/web-viewer/src/styles/tokens.css`，不得直接导入
本目录的 `colors_and_type.css`。

## Quick map

- `css.json` — 结构化 token 理解源。
- `colors_and_type.css` — 主题 CSS 投影，不是产品运行时入口。
- `runtime-token-map.json` — 已正式采用的主题原语到运行时语义 token 映射。
- `specs/reference-braun.png` — Braun-like order 参考。
- `specs/reference-teenage-engineering.png` — Teenage Engineering color rhythm 参考。
- `library-consumption.json` — 推荐读取顺序。

## Essentials at a glance

- 主色是 `#f26b4f`，珊瑚色动作信号；保持 future-facing、restrained、precise，不要改成冷蓝或渐变主视觉。
- 基础中性色从 `#f0ede8` 到 `#181818`；默认背景 `#f0ede8`，前景 `#181818`，表面 `#f5f2ed`，形成 warm-industrial 的灰暖白哑光与炭灰结构块。
- 字体以 `Space Grotesk` 为 display、heading、body；`IBM Plex Mono` 只给 mono、数字、节拍与参数读数。
- 字号层级固定为 `56/40/32/24/20/18/16/12/11/14px`，对应 display、h1、h2、h3、h4、lead、body、caption、eyebrow、mono。
- 间距以 `4px` 为基准，token 仅用 `4/8/12/16/24/32/48/64px`；默认导航高 `72px`，侧栏宽 `88px`，内容最大宽 `1440px`。
- 控件高度优先 `36/40/44/48px`；默认中号按钮高 `44px`，输入框高 `40px`，适合精确、数据化操作。
- 圆角使用 `6/10/14/20/9999px`；小控件偏硬朗，卡片与面板更柔和，但仍保持 restrained，而不是圆润消费感。
- 阴影是低金属、低对比的 5 层体系：从 `0 1px 2px rgba(24,24,24,0.06)` 到 `0 30px 72px -24px rgba(24,24,24,0.28)`，静态轻、浮层重。
- 深色模式把主色切到 `--zupulse-primary-400`，背景切到 `#1a1a1a`，表面 `#272727`，保留珊瑚色节奏与精密软件气质。
- 语气与文案参考 `播放 / 循环 / 轨道 / 速度 / 打开乐谱`：简短、功能导向、无修饰、无 emoji。
