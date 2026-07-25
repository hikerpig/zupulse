# Documentation Gardening 设计

- 状态：已确认设计，尚未实施。
- 事实边界：运行时代码、Zod schema、数据库约束、可重复测试、Current ADR、当前架构文档和
  `status: current` 的 Feature Contract 高于本文。
- 本文描述准备建设的文档维护机制，不得被 AI 当作已经存在的命令、CI 或自动任务。

## 目标

为仓库建立持续的 Documentation Gardening 机制，使当前文档能够随实现变化被及时检查、报告和
修正，同时避免自动化把代码回归误判成“文档过时”。

首版成功意味着：

1. 每次 PR 都能机械检查 Feature Contract 的结构、索引、状态和本地证据路径。
2. 实现路径变化时能够列出可能受影响的 Contract，但不会因不确定的语义影响直接阻断 PR。
3. 每周由 Codex 语义审计当前 Contract，并以代码、schema、数据库约束和测试为证据。
4. 高置信度文档漂移生成小型 Draft PR；事实源冲突只报告，不静默修正文档。
5. 无漂移时不向仓库写入周期报告或制造无意义 PR。

机制服务于维护者和执行仓库任务的 AI。它不改变产品运行时行为，也不替代代码评审、测试或 ADR
决策。

## 当前基础

仓库已经具备：

- 根 `AGENTS.md` 中的事实源顺序和 Feature Contract 同步规则。
- `docs/features/README.md` 中的 Contract 状态、阅读与维护约定。
- `docs/features/templates/feature-contract.md` 模板。
- 首个 `status: current` 的 Sheet Library Contract 及证据地图。
- `scripts/repository-checks.mjs` 中的 context、architecture 和 design 确定性检查。
- `scripts/__tests__/repositoryChecks.test.ts` 的临时仓库 fixture 测试。
- `pnpm verify:fast` 和 `.github/workflows/verify.yml` 的普通 PR 门禁。

当前缺少：

- Contract frontmatter、索引、链接和实现路径的一致性检查。
- 基于 Git diff 的 Contract 影响提示。
- 定期读取实现和测试、判断语义漂移的审计任务。
- 文档自动修正的证据门槛和安全边界。

## 非目标

- 不让 LLM 成为新的事实源。
- 不让定时任务直接写入或推送主分支。
- 不因路径命中就强制要求修改 Contract。
- 不自动修改产品代码以迎合文档。
- 不自动改变 Current ADR 的决策或状态。
- 不自动把 Feature 范围、目标或非目标扩张为新的产品承诺。
- 不对 historical/superseded 规格做语义同步，只检查状态和链接完整性。
- 不在仓库中长期保存每次 gardening 的过程报告。
- 首版不引入文档 SaaS、向量数据库、Embedding 索引或新的 Markdown/YAML 解析依赖。

## 三环维护模型

### 1. 开发时同步

根 `AGENTS.md` 继续作为第一道约束：

> 用户可观察行为、领域不变量、平台能力或已知差距发生变化并通过验证后，同步更新对应 Feature
> Contract。

开发者或 AI 在实现 Feature 变化时负责同步 Contract。只有行为已经落地且通过与风险匹配的验证，
才能从“进行中的目标差异”移动到“当前已实现行为”或更新 `last_verified`。

本机制不新增重复的 `AGENTS.md` 长规则；稳定操作细节在实现完成后写入
`docs/conventions/documentation-gardening.md`。

### 2. PR 确定性检查与影响提示

确定性检查进入 `pnpm verify:fast`，用于阻止能够机械证明的文档错误。影响分析单独运行并只产生
提示，因为实现路径变化不必然表示用户或领域行为变化。

### 3. 周期性语义审计

Codex 自动任务每周运行一次。它沿 Contract 的实现路径和证据地图读取事实源、检查近期变化并运行
最小相关验证。

审计结果按证据强度分流：

- 高置信度漂移：创建文档修正 Draft PR。
- Current 事实源冲突或证据不足：创建/更新 issue；若 GitHub 写入能力不可用，则在自动任务结果中
  输出阻塞报告。
- 无漂移：只保留自动任务运行结果，不创建仓库文件、issue 或 PR。

## 确定性文档检查

### 命令

新增命令：

```bash
pnpm check:docs
```

其实现入口为：

```bash
node scripts/repository-checks.mjs docs
```

并加入：

```bash
pnpm verify:fast
```

### 检查范围

`check:docs` 必须检查：

#### Feature Contract frontmatter

- `feature` 是非空 kebab-case slug。
- `title` 是非空字符串。
- `status` 只能是 `draft | current | deprecated | historical`。
- `delivery` 只能是 `planned | in_progress | partial | available | retired`。
- `last_verified` 是合法的 `YYYY-MM-DD` 日期。
- `hosts`、`implementation_paths` 和 `supersedes` 是字符串列表。
- `feature` slug 在所有 Contract 中唯一。
- `implementation_paths` 中的仓库路径真实存在。

模板位于 `docs/features/templates/`，不得被当作真实 Contract 解析。

#### 生命周期与目录

- `contracts/` 中不得出现 `status: historical` 且 `delivery: retired` 的文件。
- `archive/` 中的文件必须是 `historical` 或 `deprecated`，且不得声明为 `available`。
- `status: current` 的 Contract 必须位于 `contracts/`。
- `status: current` 的 Contract 必须出现在 `docs/features/README.md` 当前索引中。
- 索引不得遗漏 Current Contract、重复 feature 或指向不存在的 Contract。

#### 必需结构

Current Contract 必须包含：

- `## 一句话契约`
- `## 用户入口`
- `## 当前已实现行为`
- `## 领域不变量`
- `## 明确非目标`
- `## 验收契约`
- `## 证据地图`
- `## 相关资料`
- `## 维护触发器`

`delivery: planned | in_progress | partial` 的 Contract 还必须包含
`## 进行中的目标差异` 或现有兼容标题 `## 已知差距`。

#### 链接与证据路径

- Contract 和 Feature 索引中的本地 Markdown 链接必须存在。
- 含 fragment 的链接必须至少验证目标文件存在；首版不实现 Markdown anchor 解析。
- 证据地图中的反引号路径如果使用仓库相对路径，首版只作为文本，不做猜测式解析。
- `implementation_paths` 是唯一用于变更影响扫描的机器可读路径来源。

#### 新鲜度

- `status: current` 且 `last_verified` 距当前日期超过 30 天时输出 warning。
- 新鲜度 warning 不使 `check:docs` 失败。
- 文档新鲜不等于正确；日期不得替代语义审计。

### 输出与退出码

- 结构、索引、路径或链接错误：逐行输出稳定错误信息并退出 `1`。
- 仅有新鲜度 warning：输出 warning 并退出 `0`。
- 全部通过：输出 `docs check passed` 并退出 `0`。
- 命令参数错误：退出 `2`。

错误按路径和内容排序，确保本地、CI 和测试输出稳定。

## PR 影响分析

### 命令

新增非阻塞命令：

```bash
pnpm docs:impact --base origin/main
```

命令读取 Git diff 和 Current Contract 的 `implementation_paths`，输出可能需要复核的 Contract。

示例：

```text
Sheet Library may require review:
- packages/web-core/src/library/schemas.ts changed
- apps/desktop-shell/src/main/library/DesktopLibraryStore.ts changed
- docs/features/contracts/sheet-library.md was not changed
```

### 规则

- 目录路径匹配其全部后代文件；文件路径只匹配该文件。
- Contract 自身在同一 diff 中变化时，仍列出命中的实现路径，但标记 `contract updated`。
- 没有 Contract 命中时输出 `no feature contracts affected`。
- 初期只写入 GitHub Step Summary 或普通日志，不作为 required check。
- 连续四周观察假阳性后，再决定是否引入更窄的 watch path 或人工 acknowledgment；首版不设计
  PR label、commit trailer 或空变更文件。

## 周期性语义审计

### 调度与选择

- 默认每周运行一次 Codex 自动任务。
- Contract 总数不超过 8 时，每次检查全部 Current Contract。
- 超过 8 时，每次最多检查 3 个，依次优先：
  1. `implementation_paths` 最近发生变化；
  2. `last_verified` 最旧；
  3. 存在进行中目标差异；
  4. 相关 Current ADR、架构文档或证据路径最近变化。
- 具体星期与时间属于自动任务运行配置，不写入产品或架构事实。

### 单个 Contract 的审计步骤

1. 读取根及相关子树 `AGENTS.md`、架构索引、Feature 索引和目标 Contract。
2. 把 Contract 声明拆为可核对的用户行为、领域不变量、平台差异、非目标和已知差距。
3. 沿 `implementation_paths`、证据地图、Current ADR 和当前架构文档读取事实源。
4. 查看目标实现路径和证据文件自上次验证日期以来的 Git 变化；日期只用于缩小范围，不限制继续
   读取当前实现。
5. 为每条重要声明记录分类、证据、置信度和建议动作。
6. 运行 Contract 证据地图中的最小相关测试，再运行文档格式、链接和 diff 检查。
7. 根据结果创建 Draft PR、报告冲突或无操作结束。

### Finding 分类

| 分类                    | 定义                                       | 默认动作               |
| ----------------------- | ------------------------------------------ | ---------------------- |
| `confirmed_drift`       | 代码/schema 与测试一致，Contract 已过时    | 修正文档 Draft PR      |
| `completed_gap`         | 已知差距已经落地并获得测试证据             | 更新当前行为和平台矩阵 |
| `stale_evidence`        | 链接、实现路径或测试证据失效               | 修复证据引用           |
| `undocumented_behavior` | 已有稳定、可观察行为未被 Contract 描述     | 提议补充               |
| `source_conflict`       | 代码、测试、Current ADR 或架构文档相互冲突 | 停止自动修正并报告     |
| `unverifiable_claim`    | 缺少足够实现或自动化证据                   | 报告，不更新验证日期   |
| `no_drift`              | 当前声明与证据一致                         | 无仓库写入             |

### 证据门槛

允许自动修正文档需要同时满足：

1. 运行时代码或 schema/数据库约束提供直接证据。
2. 至少一个可重复测试表达相同语义。
3. Current ADR 和当前架构文档没有表达相反约束。
4. 修正不扩大 Feature 范围，不发明新目标。
5. 相关最小测试、`pnpm check:docs`、Prettier 和 `git diff --check` 通过。

典型判断：

```text
代码/schema + 测试 + Current ADR/架构一致
→ 高置信度文档漂移，可以修正

代码与测试一致，但与 Current ADR 或当前架构冲突
→ source_conflict，必须人工决策

只有代码与 Contract 不同
→ 可能是未测试回归，标记 unverifiable_claim
```

AI 不得因为“运行时代码优先”而静默把可能的回归合法化为新文档事实。事实源冲突必须显式报告。

### `last_verified` 更新条件

只有满足以下全部条件才能更新：

- Current Contract 的所有重要章节已被抽样核对，而非只修复一个链接。
- 证据地图仍能导航到当前代码和测试。
- 最小相关测试实际运行并通过。
- 没有未解决的 `source_conflict` 或高风险 `unverifiable_claim`。

只运行 `check:docs`、Prettier 或链接检查不得更新 `last_verified`。

## 修正产物

### Draft PR

每个 gardening PR：

- 最多修改 3 个 Contract。
- 默认只修改文档和文档检查元数据。
- 不包含产品代码修复。
- 标题使用 `docs: reconcile feature contracts` 或更具体的 Feature 名称。
- 正文按 finding 提供分类、原声明、证据、修改和实际运行命令。

正文最小格式：

```markdown
## Finding

- Contract: Sheet Library
- Classification: completed_gap
- Claim: Desktop does not aggregate practice summaries

## Evidence

- Runtime: `path`
- Schema/constraint: `path`
- Tests: `path`
- Commands run: `command`

## Change

Moved the verified behavior from known gaps into current behavior and updated
the platform matrix.
```

### 冲突报告

`source_conflict` 或无法安全判断的重要声明：

- 不修改 Contract 来掩盖冲突。
- 创建或更新一个 gardening issue，包含双方证据和需要人工决定的问题。
- 不重复创建相同 Contract、相同声明、相同证据组合的 issue。
- GitHub 写入不可用时，在自动任务结果中输出同等信息并明确没有创建 issue。

### 无漂移

- 不创建 PR、issue、日期更新或仓库报告文件。
- 自动任务结果只列出检查的 Contract、验证命令和 `no_drift`。

## 项目结构

计划实现范围：

```text
package.json
  check:docs / docs:impact commands

scripts/
  repository-checks.mjs
    checkDocumentation()
  documentation-impact.mjs
  __tests__/
    repositoryChecks.test.ts
    documentation-impact.test.ts

.github/workflows/
  verify.yml
    deterministic check:docs through verify:fast

docs/
  features/
    README.md
    contracts/
    templates/
  conventions/
    documentation-gardening.md
      created only after implementation is verified
```

Codex 周期自动任务属于运行配置，不把其运行状态伪装成仓库文件。若未来采用 GitHub Actions 调用
模型，需要另行确认凭据、成本和安全边界；不属于首版。

## 实现风格

确定性检查沿用现有 `repository-checks.mjs` 风格：

```js
export async function checkDocumentation(root, options = DEFAULT_DOCUMENTATION) {
  const errors = [];
  const warnings = [];

  for (const contract of await readFeatureContracts(root, options)) {
    errors.push(...validateContract(contract));
  }

  return {
    errors: errors.sort(),
    warnings: warnings.sort(),
  };
}
```

约束：

- 使用 Node 标准库和现有依赖。
- 使用 named export，便于 Vitest 直接测试。
- 解析器只支持模板定义的 frontmatter scalar/list 子集；遇到未知或嵌套结构明确报错，不实现半套
  YAML。
- 文件遍历与输出排序必须确定。
- 检查函数接收 root/options，不依赖真实仓库全局状态，方便 fixture 测试。
- Git diff 与进程退出只放在 CLI 边界，核心匹配逻辑使用纯函数。

## 测试策略

### 确定性检查单测

使用临时目录 fixture 覆盖：

- 合法 Current/partial Contract。
- 缺失或非法 frontmatter。
- 重复 feature slug。
- Current Contract 未进入索引。
- 索引悬空或重复。
- `implementation_paths` 不存在。
- 本地 Markdown 链接失效。
- planned/partial 缺少目标差异章节。
- historical/retired 位于错误目录。
- 超过 30 天只 warning、不失败。
- 模板不被当作真实 Contract。

### 影响分析单测

使用显式 changed-file 列表测试纯匹配逻辑：

- 目录 implementation path 命中子文件。
- 文件 implementation path 精确命中。
- 相似前缀不误命中。
- 多个 Contract 同时命中。
- Contract 同时更新时正确标记。
- 无命中时输出稳定。

不在单测中依赖真实 Git history；CLI 只做一项最小集成测试或通过依赖注入验证 Git 输出解析。

### 语义审计演练

Sheet Library 作为首个评估样例，人工准备三个临时分支场景：

1. 修改 `MAX_LIBRARY_IMPORT_BYTES` 和相应测试，预期发现 `confirmed_drift`。
2. 实现 Desktop 练习摘要并补测试，预期发现 `completed_gap`。
3. 只重构 Repository 内部代码且行为测试不变，预期不要求修改 Contract。

语义演练不把故意漂移提交到主分支。连续四周记录假阳性和漏报，记录放在自动任务/PR/issue，不新增
仓库报告目录。

## 完整命令

实现后的预期命令：

```bash
pnpm check:docs
pnpm docs:impact --base origin/main
pnpm vitest run scripts/__tests__/repositoryChecks.test.ts
pnpm vitest run scripts/__tests__/documentation-impact.test.ts
pnpm verify:fast
pnpm format:check
git diff --check
```

语义审计按目标 Contract 追加其证据地图中的最小测试。涉及 Browser/Desktop 用户旅程时，按风险
升级到 `pnpm verify` 或 `pnpm verify:e2e`。

## 边界

### 始终执行

- 以代码、schema、数据库约束和测试作为语义审计证据。
- 区分当前行为、目标差异和非目标。
- 在修改 Contract 前检查 Current ADR 和当前架构文档。
- 为每个修正记录 finding 分类和实际证据。
- 修正文档后运行确定性文档检查和最小相关测试。
- 保持 Draft PR 小而可审阅。

### 必须先询问

- 修改 Current ADR 的决策或状态。
- 修改代码以解决发现的文档/实现冲突。
- 改变 Feature 范围、非目标或平台承诺。
- 归档 Current Contract 或把 draft 提升为 current。
- 添加第三方文档解析、模型调用或报告服务。
- 让 GitHub workflow 持有模型/API 凭据。
- 把影响提示升级为阻塞门禁。

### 绝不执行

- 定时任务直接推送主分支。
- 仅凭 Spec、计划或另一份摘要文档修改当前行为。
- 在没有运行验证时更新 `last_verified`。
- 把没有测试支持的代码差异自动认定为新产品事实。
- 静默解决代码、测试、ADR 或架构之间的冲突。
- 自动删除历史决策或规格证据。
- 在 PR、issue 或文档中泄露绝对路径、原始异常或环境敏感信息。

## 实施阶段

### 阶段一：结构门禁

- 实现 `checkDocumentation()`、frontmatter 子集解析、索引和链接检查。
- 增加 `pnpm check:docs` 并加入 `verify:fast`。
- 补齐 fixture 单测。
- 验证后创建 `docs/conventions/documentation-gardening.md`，只记录已经可用的命令和规则。

### 阶段二：影响提示

- 实现 `documentation-impact.mjs` 和纯匹配测试。
- 在 PR workflow 中输出非阻塞 Step Summary。
- 观察四周假阳性，不立即升级为门禁。

### 阶段三：每周语义审计

- 创建 Codex 周期自动任务。
- 用 Sheet Library 完成三个语义演练。
- 启用高置信度 Draft PR 和冲突 issue 分流。
- 四周后复盘选择策略、批次大小和证据门槛。

阶段必须按顺序实施；结构门禁稳定前不启用自动文档修正。

## 验收标准

- `pnpm check:docs` 对合法仓库退出 `0`。
- Contract 元数据、索引、目录、实现路径或本地链接损坏时退出 `1` 并输出确定错误。
- 过期 `last_verified` 只产生 warning。
- `pnpm verify:fast` 包含 `check:docs`。
- `docs:impact` 正确列出 Sheet Library 实现路径变化，并保持非阻塞。
- 周期任务能区分三个 Sheet Library 演练场景。
- 高置信度漂移只产生文档 Draft PR。
- 事实源冲突不自动修改文档。
- 无漂移运行不产生仓库文件、PR 或 issue。
- `last_verified` 不会因纯格式或链接检查被更新。
- 新增脚本和文档通过 Prettier、相关 Vitest、`pnpm verify:fast` 和 `git diff --check`。

## 待实施时确认的操作项

以下不是产品或架构歧义，不阻塞本规格评审：

- Codex 每周任务的具体星期和时间。
- GitHub connector 是否已授权创建 Draft PR 和 issue。
- GitHub Step Summary 在当前 CI 权限下的最终展示格式。
