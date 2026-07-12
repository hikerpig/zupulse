---
status: accepted
---

# Treat changed score content as an independent score

MVP 将内容哈希不同的谱文件导入为独立 Library Score，即使它们具有相同文件名、标题或艺术家；不自动识别版本关系，也不在它们之间迁移练习数据。谱面内容变化可能重排小节、轨道与时间轴，自动继承 Loop 或播放位置会产生难以察觉的错误。如果后续需要版本管理，应通过显式“替换曲谱”流程另行定义可安全迁移的数据。
