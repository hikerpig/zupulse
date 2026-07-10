# 文件访问能力按可见行为建模

Bridge 的文件访问能力使用 `openExternalFile` 和 `persistentFileReferences`，不使用含义模糊的 `externalReferences` 或 Apple 专属的 `securityBookmarks`。首条 macOS Shell 可以临时选择外部文件，但不能持久保存文件引用，因此分别报告 `true` 和 `false`；安全书签等平台机制留在 Shell 内部。该模型让后续 iOS 与 Windows 能以不同机制表达相同的用户可见能力。
