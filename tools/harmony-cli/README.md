# @zupulse/harmony-cli

Node.js 下的 Harmony 检查与结构回归工具。它直接调用 `@zupulse/web-core` 的 MusicXML 投影和生产分析逻辑，不启动浏览器，也不维护第二套算法。

## Inspect

从仓库根运行。给人阅读时可省略 `-s`；给 agent 或 JSON 管道使用时必须加 `-s`，避免 pnpm banner 混入 stdout。

```bash
# model + result
pnpm -s harmony:cli inspect path/to/score.mxl

# 只看 MXL 投影后的 HarmonyAnalysisInput
pnpm -s harmony:cli inspect path/to/score.mxl --view model

# 只看最终 HarmonySegment[]
pnpm -s harmony:cli inspect path/to/score.mxl --view result
```

兼容旧形式：

```bash
pnpm -s harmony:cli path/to/score.mxl --view result
```

stdout 是版本化 JSON envelope：

```json
{
  "schemaVersion": "1.0.0",
  "command": "inspect",
  "source": { "name": "score.mxl", "sha256": "..." },
  "model": {},
  "result": []
}
```

`--view model|result` 会省略另一个 payload，但始终保留版本和 source SHA-256。alphaTab parser warning 写到 stderr。

## Eval

```bash
# 默认 manifest
pnpm -s harmony:cli eval

# 指定 manifest
pnpm -s harmony:cli eval path/to/manifest.json
```

默认读取 `test-fixtures/harmony/regressions/manifest.json`。manifest 中的 score 路径相对 manifest 自身解析，并由 SHA-256 防止 fixture 被静默替换。

- 全部通过：exit code 0，JSON `summary.failed` 为0。
- 任一结构回归失败：exit code 1，stdout 仍是 JSON，每个失败字段包含 expected/actual。
- manifest、文件或 schema 无效：exit code 1，错误写 stderr。

当前 Turkish March case 是 `structural-regression`：它只锁定解析模型和算法结果摘要，不代表和弦正确。只有人工审核的时间区间与和弦标签才能成为 accuracy gold。

### Dataset eval

Phase 8 的 v2 manifest 把带专家 gold 的 accuracy、只有谱面结构的 ingestion robustness、只有标签的 prior corpus 分开。外部数据不进 git；下载并解压到本地目录后运行：

```bash
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json --data-root /path/to/harmony-data
```

`data-root` 下必须同时存在 manifest 声明的 archive 和解压目录。CLI 先校验 archive SHA-256，再运行 adapter。DCML 报告包含作品级 split、mapping/unsupported、Top-1/Top-8、resolved precision/coverage、boundary F1、ECE、facets、chord-family slices 和最多 50 条错误定位。当前固定 Mozart 数据为 v2.3；K331 整首奏鸣曲强制属于 eval。可用 `--case <id>` 只运行一个 corpus。

dataset manifest 当前为 `2.0.0`，生成的 eval report 为 `2.1.0`。report 的 `diagnostics` 提供全量错误簇、family outcome、confidence bins 和 post-decision precision/coverage curve；`errors` 只保存每类有限的定位样本，不用于统计簇大小。

冻结基线比较会锁定 split/gold 数量；mapping、Top-1/Top-8、precision、coverage、boundary F1 只允许在容差内下降，ECE 只允许在容差内上升：

```bash
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data > /tmp/current.json
pnpm -s harmony:cli compare \
  test-fixtures/harmony/baselines/dcml-cross-corpus.json /tmp/current.json
```

`compare` 始终输出逐字段 JSON diff；有回退时 `summary.failed > 0` 且 exit code 为 1。基线当前容差为 0.005。跨作曲家切片把 common triad/seventh、inversion、applied/chromatic、augmented-sixth、Neapolitan、extended/altered 和 unsupported 分开，避免总分掩盖特定和弦族退化。

当前 v2 manifest 还包含两个独立角色：

- `pop909-piano-v1`：从 MIDI 与 beat 网格构造 model，再映射 chord intervals；4 首 pilot 按完整歌曲 split，流行域指标单独冻结在 `pop909-piano-v1.json`。
- `asap-musicxml-v1.1`：5 首 MusicXML 的 ingestion 样本，只输出 parsed/failed、notes、measures、segments 和 runtime，不输出 chord accuracy。

ChoCo 与 WJazzD 保持 `label-prior-corpus` 角色，不在 active 端到端报告中。任何 label-only prior 必须由 `buildTrainLabelPrior` 从 train-only records 生成；传入 tune/eval 会失败。数据角色、adapter、指标和当前基线见 [`docs/evaluation.md`](docs/evaluation.md)，完整调优顺序和产物规范见 [`docs/tuning-loop.md`](docs/tuning-loop.md)。

## Manifest

```json
{
  "schemaVersion": "1.0.0",
  "id": "harmony-regressions-v1",
  "cases": [
    {
      "id": "turkish-march-structure",
      "kind": "structural-regression",
      "score": "../../musicxml/K331-3_reviewed.mxl",
      "sha256": "...",
      "expected": {
        "model": { "measures": 147, "tracks": 1, "staves": 2, "notes": 1736 },
        "result": { "segments": 365, "resolved": 305, "unresolved": 60 }
      }
    }
  ]
}
```

不要提交完整 result snapshot 或把当前算法输出复制成 gold。算法行为有意变化时，先查看字段 diff，再人工更新小型摘要。

## Development

```bash
pnpm --filter @zupulse/harmony-cli test
pnpm --filter @zupulse/harmony-cli typecheck
```

测试包含参数/Schema、真实 MXL 投影、Turkish March manifest，以及实际进程的 stdout 和 exit code。
