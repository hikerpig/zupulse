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
```

Harmony 不再由仓库根部脚本维护第二套实现。检查、数据集评测和 Semi-CRF 离线训练统一通过：

```bash
pnpm -s harmony:cli --help
```

命令说明见 [`tools/harmony-cli/README.md`](../tools/harmony-cli/README.md)。
