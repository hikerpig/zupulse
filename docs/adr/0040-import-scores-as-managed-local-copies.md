---
status: accepted
---

# Import scores as managed local copies

Sheet Library 导入会把谱文件复制为 Desktop Shell 托管的本地副本，而不是只保存外部文件路径或持久文件引用。这会额外占用磁盘空间，且外部原文件后续变更不会自动进入曲谱库；但它保证 Library Score 在原文件被移动、重命名或删除后仍可离线打开，符合用户对“已导入”的持久馆藏预期。
