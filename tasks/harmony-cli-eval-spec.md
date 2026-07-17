# Spec: Harmony CLI and agent evaluation layout

## Objective

把现有一次性 Harmony CLI 整理成同时适合人和自动化 agent 的 Node.js 工具：

- 人可以检查 MusicXML/MXL 投影后的内部 model 和最终分析结果；
- agent 可以通过稳定 JSON 协议、manifest 和退出码执行回归；
- 结构回归与带人工标准答案的准确率评估明确分开；
- CLI 直接复用 `web-core` 生产投影与分析，不复制算法、不启动浏览器。

本次重组不修改和声算法，也不把当前 Turkish March 输出声明为“正确答案”。

## Assumptions

1. 第一版只接收 `.musicxml`、`.xml` 和 `.mxl`，GP/MIDI 留给独立扩展。
2. JSON 是 stdout 的唯一机器协议；日志和 alphaTab warning 只写 stderr。
3. `test-fixtures/musicxml/` 保存原始曲谱，`test-fixtures/harmony/` 保存评估元数据，不复制曲谱文件。
4. 没有人工 gold label 的谱例只能做结构/行为回归，不能计算准确率。
5. manifest 和 CLI 输出都使用显式 `schemaVersion`，破坏性变更必须升级版本。

## Commands

```bash
# 人工检查；默认输出 envelope 中的 model 和 result
pnpm harmony:cli inspect path/to/score.mxl
pnpm harmony:cli inspect path/to/score.mxl --view model
pnpm harmony:cli inspect path/to/score.mxl --view result

# 自动执行版本化回归 manifest；失败时 exit code 非 0
pnpm harmony:cli eval
pnpm harmony:cli eval test-fixtures/harmony/regressions/manifest.json

# CLI 自身验证
pnpm vitest run scripts/harmony
```

兼容期内保留旧命令 `pnpm harmony:cli <score> --view ...`，内部映射到 `inspect`；README 只推荐新形式。

## Output contract

`inspect` stdout：

```json
{
  "schemaVersion": "1.0.0",
  "command": "inspect",
  "source": {
    "name": "score.mxl",
    "sha256": "..."
  },
  "model": {},
  "result": []
}
```

- `--view model|result` 只省略不需要的 payload 字段，保留 envelope、source 和版本。
- 不输出绝对路径，避免本机路径污染快照。
- 默认 pretty JSON；后续只有出现明确性能需求时才增加 compact flag。

`eval` stdout：

```json
{
  "schemaVersion": "1.0.0",
  "command": "eval",
  "manifest": "harmony-regressions-v1",
  "summary": { "passed": 1, "failed": 0 },
  "cases": [
    {
      "id": "turkish-march",
      "status": "passed",
      "checks": []
    }
  ]
}
```

- 所有 case 通过时 exit code 为 0；manifest/schema/文件错误或任一 case 失败时非 0。
- stdout 即使失败也尽量输出结构化报告；面向人的错误摘要写 stderr。

## Project structure

```text
scripts/harmony/
  cli.ts                 # 极薄进程入口：stdout、stderr、exit code
  command.ts             # 参数解析与 inspect/eval 分派
  inspectScore.ts        # MXL -> HarmonyAnalysisInput -> HarmonySegment[]
  evaluateManifest.ts    # manifest 校验、执行和结构化 diff
  schemas.ts             # CLI envelope 与 manifest 的 Zod schema
  README.md              # 面向人和 agent 的完整协议与示例
  __tests__/
    command.test.ts      # 参数、view、错误与兼容入口
    inspectScore.test.ts # 真实 MXL 投影链
    evaluateManifest.test.ts
    process.test.ts      # stdout JSON 和 exit code 的进程级验证

test-fixtures/musicxml/
  rondo-alla-turca-turkish-march.mxl

test-fixtures/harmony/regressions/
  manifest.json          # 文件引用、SHA-256、回归类型与期望摘要
  turkish-march.gold.json # 将来人工审核后才创建；不先生成伪 gold
```

根 `scripts/README.md` 只保留入口导航，详细 CLI 协议下沉到 `scripts/harmony/README.md`。现有 UCI/CMU/train/benchmark 脚本暂不搬迁，避免把目录整理扩大成无关重构。

## Manifest contract

```json
{
  "schemaVersion": "1.0.0",
  "id": "harmony-regressions-v1",
  "cases": [
    {
      "id": "turkish-march-structure",
      "kind": "structural-regression",
      "score": "../../musicxml/rondo-alla-turca-turkish-march.mxl",
      "sha256": "...",
      "expected": {
        "model": {
          "measures": 147,
          "tracks": 1,
          "staves": 2,
          "notes": 1736
        },
        "result": {
          "segments": 365,
          "resolved": 305,
          "unresolved": 60
        }
      }
    }
  ]
}
```

- `structural-regression` 只检查解析和算法输出是否意外变化。
- `accuracy` case 必须引用人工审核的 gold 文件，报告 Top-1、Top-8、precision/coverage 和 boundary 指标。
- manifest 路径相对 manifest 自身解析；SHA-256 防止同名 fixture 被静默替换。
- 期望值使用小而可审查的字段，不提交巨大 result snapshot 或不透明 hash 作为唯一断言。

## Code style

命令层只做解析和分派，领域工作保持为可直接测试的函数：

```ts
const report = await inspectHarmonyScore({ path, view });
return harmonyInspectReportSchema.parse(report);
```

- named export、Prettier 双引号、`exactOptionalPropertyTypes`。
- 文件系统和 `process` 仅出现在 CLI/eval 边界；分析函数返回数据，不直接打印。
- 不新增 CLI 框架或参数解析依赖；两个子命令用最小显式解析即可。

## Testing strategy

- 小测试：参数解析、schema、摘要 diff 和错误分支。
- 中测试：使用真实 `simple.mxl` 与 Turkish March 跑 Node 投影/分析。
- 进程测试：启动实际 CLI，断言 stdout 可直接 `JSON.parse`，stderr 与 exit code 符合协议。
- Turkish March 测试不捕获完整输出，只通过 manifest 检查可审查摘要。
- accuracy gold 在人工标注前保持缺席，测试不得把当前算法结果复制成 gold。

## Boundaries

### Always

- 校验 CLI 输出和 manifest schema。
- stdout 保持纯 JSON；warning/error 写 stderr。
- fixture 读取、解析、分析失败时返回非零退出码。
- 提交前实际运行 `inspect`、`eval`、相关测试和项目门禁。

### Ask first

- 修改和声算法或当前发布阈值。
- 引入新的 CLI/parser/runtime 依赖。
- 把自动分析结果认定为人工 gold。

### Never

- 在 manifest 中写绝对路径。
- 为方便测试复制同一份谱子。
- 用结构回归通过率冒充准确率。
- 让 Node CLI 走一套不同于 Browser/Desktop 的分析算法。

## Success criteria

- `inspect` 的三种 view 都输出符合 schema 的纯 JSON envelope。
- `eval` 默认读取 regression manifest，并通过退出码可靠表示成败。
- Turkish March fixture 的 SHA、model 摘要和 result 摘要由 manifest 管理，不散落在测试代码中。
- 一个故意错误的 manifest 能产生结构化失败报告和非零退出码。
- 进程级测试证明 pnpm 命令可被人和 agent 直接消费。
- 旧 CLI 调用在兼容期仍可用。
- 相关测试、typecheck 和仓库架构检查通过；无关格式债务单独报告。

## Open questions

- Turkish March 的 accuracy gold 需要后续人工确认和弦区间；在此之前只纳入 structural regression。
- alphaTab 的 `Unsupported forward/backup` warning 是否对应实际音符丢失，需要通过 `model` 输出与原始 MusicXML 对照，属于 CLI 重组后的下一项诊断，不在本次目录重构中修复。
