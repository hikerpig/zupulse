---
status: accepted
---

# Separate Library Score ID from Score Identity

Library Score 使用独立的不透明 UUID 作为 Library Score ID，同时以唯一的内容哈希作为 Score Identity；不用内容哈希兼任数据库主键、Studio 路由参数和未来馆藏同步身份。这一分离使内容去重与馆藏生命周期保持独立：彻底删除后重新导入相同内容会创建新 Library Score ID，而当前设备仍使用 Score Identity 的唯一性防止重复馆藏。
