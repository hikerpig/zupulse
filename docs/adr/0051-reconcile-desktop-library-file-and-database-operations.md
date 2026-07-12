---
status: accepted
---

# Reconcile Desktop Library file and database operations

Desktop Sheet Library 使用可恢复的 staging 状态流程协调 SQLite 与托管文件系统，而不假设二者共享一个事务。导入先写临时文件和 `pending` 记录，再原子移动文件并标记 `ready`；删除先标记 `deleting` 并把文件移入临时回收位置，再删除馆藏与练习数据。启动时必须对未完成状态与无主临时文件执行 reconciliation；`ready` 记录对应文件缺失时保留记录并报告损坏，不静默删除用户数据。Browser 实现则使用单个 IndexedDB transaction 原子更新索引、谱文件字节和练习数据。
