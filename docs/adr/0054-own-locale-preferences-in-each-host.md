---
status: accepted
---

# Own locale preferences in each host

Zupulse 把 UI Locale Preference 定义为设备级宿主偏好，而不是共享 React UI、Sheet Library 或领域模型拥有的状态。Browser host 使用浏览器本地偏好存储；Desktop 由 Electron Main 通过应用数据目录下独立、版本化的 `preferences.json` 持久化偏好，在创建菜单和文件 Dialog 前解析 Effective Locale，并通过 handshake 把 Preference 与 Effective Locale 交给 Renderer。Renderer 修改偏好时必须经过受校验的 Bridge 请求，由 Main 先持久化并返回新的 locale state，再驱动 Renderer 更新。

`preferences.json` 使用运行时 schema 校验和临时文件原子替换；缺失时回退 `system`，损坏时隔离原文件后回退，不阻断应用启动。偏好修改采用事务式语义：宿主成功持久化后才更新 Effective Locale、Main 菜单和 Renderer；写入失败时所有表面保持旧语言并报告可恢复错误，不允许只在当前会话临时切换。

`system` Preference 只在应用启动和用户主动重新选择“跟随系统”时解析；运行中的 Browser 与 Desktop 不监听系统语言变化。这样两个宿主保持一致，也避免练习或编辑期间因外部系统设置突然切换整套 UI；系统语言的新值在下一次启动时生效。

该边界让 Desktop 原生界面与 Renderer 从启动第一帧保持一致，也使偏好不依赖 Sheet Library SQLite 的初始化或 migration；代价是 Browser 与 Desktop 需要各自的宿主适配器，`web-viewer` 不能再把 `localStorage` 当作 locale 事实源。
