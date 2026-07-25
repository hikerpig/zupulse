# Documentation Gardening

本文定义当前已经落地的确定性文档门禁和非阻塞变更影响提示。语义漂移审计和定期自动化不在本文
的当前承诺中。

## 日常使用

从仓库根目录运行：

```bash
pnpm check:docs
```

该命令也属于 `pnpm verify:fast`。结构错误以退出码 1 阻断验证；警告会输出但保持退出码 0。
无效命令行用法返回退出码 2。

## 当前检查范围

检查器读取 `docs/features/contracts/*.md` 和 `docs/features/archive/*.md`，不读取模板，并验证：

- frontmatter 只使用模板支持的标量和列表结构，字段、枚举与日期合法；
- Contract 的 `status`、`delivery` 和所在目录符合生命周期规则；
- Current Contract 包含必需章节，非 Current Contract 包含“进行中的目标差异”；
- `docs/features/README.md` 的“当前索引”与 Current Contract 一一对应；
- `feature` slug 不重复，索引没有重复项或悬空目标；
- `implementation_paths` 和 Contract、Feature 索引中的本地 Markdown 链接存在。

`last_verified` 距检查日期超过 30 天时只产生警告。它不是自动的新鲜度证明：只有在重新核对实现
事实并完成与风险匹配的验证后，才可更新该日期。

## 修正顺序

发现错误时先判断事实源冲突。运行时代码、Zod schema、数据库约束和可重复测试高于 Feature
Contract；若实现是当前事实，应修正文档。若实现本身不符合已批准的 Current ADR 或产品约束，
应单独处理实现问题，不通过改写 Contract 掩盖冲突。

修改 Contract 后至少运行 `pnpm check:docs`。若改动同时涉及用户可观察行为、领域不变量或平台
能力，还应运行相关最小测试，并按风险升级到仓库验证命令。

## PR 影响提示

本地检查某个 Git base 以来可能受影响的 Current Contract：

```bash
pnpm docs:impact --base origin/main
```

命令以 `implementation_paths` 为唯一机器可读匹配来源：目录匹配后代文件，文件路径只精确
匹配。报告列出命中的实现文件，并说明对应 Contract 是否也在同一 diff 中更新；没有命中时输出
`no feature contracts affected`。

PR CI 使用 pull request 的 base SHA 运行同一命令，并将结果追加到 GitHub Step Summary。Contract
被提示复核不会让命令失败；提示只是复核入口，不证明存在语义漂移，也不替代人工核对事实源。
