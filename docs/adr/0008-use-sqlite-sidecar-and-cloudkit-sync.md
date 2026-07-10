---
status: superseded by ADR-0031
---

# ADR 0008：采用 SQLite、JSON sidecar 与 CloudKit 同步适配器

## 状态

已接受

## 背景

第一版采用本地文件优先和轻量同步。App 需要查询最近打开、收藏、文件引用、练习统计和同步状态，同时需要保存可迁移的练习元数据。

纯 JSON sidecar 容易调试，但查询能力弱。纯 CloudKit record 会让本地离线和调试不够直接。SQLite + JSON sidecar payload 可以兼顾本地 App 体验和同步迁移。

## 决策

第一版采用：

- SQLite 保存本地索引、最近打开、收藏、文件引用、同步状态和练习统计摘要。
- JSON sidecar payload 保存练习元数据和轻编辑结果。
- CloudKit 或等价 Apple 系统同步能力同步 sidecar 与索引元数据。
- Web Viewer Core 通过 Bridge API 读写，不直接访问 SQLite 或 CloudKit。

文件访问采用混合模型：

- 默认外部文件引用。
- 用户可选择导入本机库。
- sidecar 仍绑定内容指纹。

## 后果

正面影响：

- 本地查询和离线体验稳定。
- sidecar payload 可版本化迁移。
- macOS 与 iOS 可以先用 Apple 系统同步快速打通。
- 后续 Windows 可增加自有后端同步适配器。

负面影响：

- Native Shell 需要维护 SQLite schema 和 sidecar schema 迁移。
- CloudKit 冲突处理需要产品化。
- 同步元数据和本地索引之间需要一致性校验。

## 非目标

第一版不同步原始 GP / MIDI 文件。

第一版不建立完整云曲库。
