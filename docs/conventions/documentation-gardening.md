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

## 语义审计 Runbook

本节约束人工或 Codex 执行的单次语义审计。它不授权定期任务、GitHub 写入或绕过人工审核。

### 选择 Contract

Contract 总数不超过 8 时检查全部 Current Contract；超过 8 时每次最多检查 3 个，依次按以下
条件选择：`implementation_paths` 最近变化、`last_verified` 最旧、存在进行中目标差异、相关
Current ADR/架构/证据路径最近变化。不得审计模板或把 Historical Contract 当作当前事实。

### 单个 Contract 的执行步骤

1. 读取根和相关子树 `AGENTS.md`、`docs/architecture/README.md`、`docs/features/README.md` 与目标
   Contract。
2. 把声明拆为用户行为、领域不变量、平台差异、非目标和已知差距。
3. 沿 `implementation_paths`、证据地图、Current ADR 和当前架构文档核对代码、schema、数据库
   约束和测试。Git 历史只帮助缩小范围，不能替代读取当前实现。
4. 每条重要声明记录分类、原声明、仓库相对证据路径、置信度和建议动作。
5. 运行证据地图中的最小相关测试，再运行：

   ```bash
   pnpm check:docs
   pnpm exec prettier --check docs/features/contracts/<feature>.md
   git diff --check
   ```

6. 按下表决定产物。不得直接写入 `main`，不得在 gardening 变更中修产品代码，不得静默解决 ADR
   冲突，也不得在证据不足时更新 `last_verified`。

### Finding 与证据门槛

| Classification          | 最低证据                                                        | 允许动作                       |
| ----------------------- | --------------------------------------------------------------- | ------------------------------ |
| `confirmed_drift`       | 代码/schema 与可重复测试表达同一语义，且 Current 决策无冲突     | 只在 Draft PR 中修正文档       |
| `completed_gap`         | 已知差距的实现和相应通过测试均存在，且 Current 决策无冲突       | Draft PR 移入当前行为/平台矩阵 |
| `stale_evidence`        | 链接、路径或测试引用可机械证明失效，并找到当前替代证据          | Draft PR 修复证据引用          |
| `undocumented_behavior` | 稳定可观察行为同时有实现与测试证据，且不扩大已批准 Feature 范围 | Draft PR 提议补充              |
| `source_conflict`       | 代码、测试、Current ADR 或当前架构给出相反事实                  | 停止修改并报告冲突             |
| `unverifiable_claim`    | 只有单一事实源，或缺少表达相同语义的可重复测试                  | 报告；不改声明或验证日期       |
| `no_drift`              | 重要声明抽样与实现、测试、Current 决策一致                      | 不写仓库、不建 PR/issue        |

自动修正文档还必须满足：不发明新目标、不扩大范围，且最小测试、`check:docs`、Prettier 和
`git diff --check` 全部通过。运行时代码优先级不能把疑似回归自动合法化；与 Current ADR 或当前架构
冲突时只能归类为 `source_conflict`。

只有审计了 Current Contract 的所有重要章节、证据地图有效、最小相关测试通过，且没有未解决的
`source_conflict` 或高风险 `unverifiable_claim`，才能更新 `last_verified`。只运行结构、格式或
链接检查不能更新日期。

### 输出格式

高置信度文档修正使用 Draft PR，每个 PR 最多修改 3 个 Contract，且默认只含文档。标题使用
`docs: reconcile feature contracts` 或具体 Feature 名称，正文至少包含：

```markdown
## Finding

- Contract: docs/features/contracts/<feature>.md
- Classification: <classification>
- Claim: <original claim>
- Confidence: <high|medium|low>

## Evidence

- Runtime/schema: <repository-relative path>
- Tests: <repository-relative path>
- Current decision docs: <repository-relative path or none>
- Commands run: <exact command and result>

## Change

<what changed and why>
```

`source_conflict` 或重要的 `unverifiable_claim` 使用 gardening issue，正文沿用 Finding/Evidence，
并增加 `## Decision needed`。相同 Contract、声明和证据组合不得重复创建 issue；GitHub 写入不可用
时在任务结果中输出相同内容，并明确“未创建 issue”。

`no_drift` 只在任务结果中列出已检查的 Contract、实际验证命令和分类；不创建 PR、issue、不更新
日期，也不新增仓库报告文件。
