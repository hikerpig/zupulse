# Desktop MVP 本地优先并推迟同步

Internal Acceptance Build 只使用按 Score Identity 保存的本地持久 JSON，不包含 SQLite 或云同步；下一条桌面竖切再用 SQLite 增加本地索引、最近打开、收藏和同步状态基础，但仍不启用云端。同步退出当前 Desktop MVP，未来必须以 macOS/Windows 对等的 provider-neutral 能力重新设计；CloudKit 只在独立 Mobile App 或新的跨平台方案中重新评估。Practice Sidecar 保持独立、可迁移的数据格式，避免未来同步被当前本地存储绑定。

该决策替代 ADR-0004 的第一版同步承诺，以及 ADR-0008 中 SQLite、CloudKit 与第一版同时交付的时序；保留 SQLite 作为后续本地索引、JSON sidecar 作为练习数据载体的方向。
