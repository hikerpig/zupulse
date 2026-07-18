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

## Manifest

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
