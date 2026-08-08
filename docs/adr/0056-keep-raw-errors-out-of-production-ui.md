---
status: accepted
---

# Keep raw errors out of production UI

Zupulse 的生产 UI 不直接展示原始 `Error.message`、stack、Bridge details 或文件系统错误文本。应用边界把失败分类为稳定的 `ApplicationIssueCode`、recoverability 和显式白名单的安全 context；Renderer 只用这些结构选择本地化文案，未知错误显示 generic error。原始异常只进入宿主诊断日志，Browser 开发模式可以写入 console。

宿主诊断边界可以接收原始异常作为分类输入，但不得把原始 `message`、stack 或绝对路径持久化或放入 Diagnostic Export。持久化诊断只保留稳定错误码和显式白名单的安全字段；只有真实排查证据证明这些信息不足后，才能单独设计 stack 与 source map 方案。

该规则同时服务国际化与 Desktop 信任边界：错误消息不再成为第二套不可翻译文案，也不能借通用 `detail: string` 把绝对路径或内部实现泄漏给 Renderer。代价是生产错误页不提供任意技术详情，新增可操作错误时必须先定义 issue code、允许的 context、翻译和恢复动作。
