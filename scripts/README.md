# Repository scripts

以下命令从仓库根目录运行。

## Repository checks

`pnpm check:context`、`check:arch`、`check:design`、`check:docs` 与 `check:i18n` 检查仓库契约。
`pnpm verify:fast` 继续执行格式、类型与单元测试，`pnpm verify` 另外构建 Browser 与 Desktop。

## Fixture tools

```bash
pnpm fixtures:gp
pnpm fixtures:musicxml
pnpm benchmark:musicxml
pnpm benchmark:harmony
```

Harmony 不再由仓库根部脚本维护第二套实现。检查、数据集评测和 Semi-CRF 离线训练统一通过：

```bash
pnpm -s harmony:cli --help
```

`pnpm benchmark:harmony` 默认对 `K331-3_reviewed.mxl` 先 warm-up 一次，再执行五次生产
`analyzeHarmony`，输出包含环境、原始样本、median、RSS、workload 和 result checksum 的 JSON。
该命令是显式性能门禁，不属于 `verify:fast`。可以传入其他 score 或减少本地诊断样本：

```bash
pnpm benchmark:harmony -- test-fixtures/musicxml/generated/simple.mxl --runs 1 --warmup-runs 0
```

命令说明见 [`tools/harmony-cli/README.md`](../tools/harmony-cli/README.md)。
