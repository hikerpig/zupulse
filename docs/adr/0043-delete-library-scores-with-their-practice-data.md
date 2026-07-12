---
status: accepted
---

# Delete Library Scores with their practice data

从 Sheet Library 删除 Library Score 是一次彻底且不可恢复的删除：Desktop Shell 必须同时清除 Managed Score Copy、馆藏索引与元数据、Practice Sidecar 和 Local Playback Resume。本地练习数据不会在曲谱删除后隐藏保留，因此日后重新导入字节内容相同的文件也会从全新练习状态开始。这个语义优先保证用户对“删除”和本地存储占用的直观预期，而不是为未来可能的重新导入保留隐形数据。
