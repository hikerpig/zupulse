# K331 piano-grand-staff-v1 segmentation

Status: layout gate `pass`。CLI identity `piano-grand-staff-v1` 在 K331 六页上交出 27 个 2-staff
crops，双跑 hash 一致。未改 Desktop default，未训练，未读 holdout。

## Identity

```ts
{
  id: "piano-grand-staff-v1",
  detectorVersion: "rokot-staff-system-v2",
  staffLayout: "grand-staff",
  allowFragmentedRuns: false,
  pairAdjacentUnpairedGroups: false,
}
```

CLI：`pnpm pdf-omr -- recognize <input.pdf> --engine rokot --output <dir> --segmentation piano-grand-staff-v1`。
省略该 flag 时仍是今天的 fragmented auto。与冲突的 `--staff-layout` 或 `--input-scope system-crop`
fail-close 为 `INVALID_CLI_ARGUMENT`。

## Layout gate

输入：`test-fixtures/musicxml/K331-3_reviewed.pdf`（SHA-256
`22cec1f974dc4bbef64c3e8968e98dcae68d229769d70fa66a21b8c8d56ae8a7`）。
Truth：`tools/pdf-omr-cli/corpus/k331-piano-grand-staff-dev-v1/source-mapping.json`，compact canonical
SHA-256 `0f9b66aa464d4985087b5dc6c56e530a2f95e20f5c99c09c02c72e935ec1f0e8`。

| Check                         | Result                                                             |
| ----------------------------- | ------------------------------------------------------------------ |
| topology-exact pages          | 6 / 6                                                              |
| systems                       | `6/6/1/6/6/2` = 27，全部 `staffCount=2`                            |
| dual-run crop sequence        | identical                                                          |
| canonical report SHA-256      | `c692c043d396e38568ab7e29577555a56ff83bcdbe7d2d41d6dccbcd05a50b57` |
| default fragmented auto tests | unchanged                                                          |

Crops 不进 Git；可用

```bash
pnpm exec vite-node tools/pdf-omr-cli/scripts/materialize-k331-piano-grand-staff.ts \
  test-fixtures/musicxml/K331-3_reviewed.pdf \
  tools/pdf-omr-cli/corpus/k331-piano-grand-staff-dev-v1/source-mapping.json \
  <output-directory>
```

复现。结构化结果见 [`summary.json`](summary.json) 与 [`run.json`](run.json)。

## Recognition

Layout 门通过后，用同一 27-system 分母跑 Rokot `previous-prediction-headers-v1`（L/M/K）。LEGATO 有
system-crop 入口，但没有把 27 个独立 system 输出拼回 K331 全谱再算 F1 的现成路径，本轮记缺口，不把
process success 写成质量。

| Engine / baseline                   | Pitch F1 | Onset F1 | Duration F1 | Joint F1 | Valid measures |
| ----------------------------------- | -------: | -------: | ----------: | -------: | -------------: |
| verified-systems，无 header context |   0.4919 |   0.7632 |      0.7182 |   0.1567 |         19/274 |
| header-context `L/M/K`（冻结对照）  |   0.7525 |   0.9162 |      0.9484 |   0.3768 |         57/274 |
| **Rokot + piano-grand-staff-v1**    |   0.7525 |   0.9162 |      0.9484 |   0.3768 |         57/274 |
| LEGATO joined F1                    |        — |        — |           — |        — |            gap |

Rokot 数字与冻结 header-context 对照逐项重合：layout identity 交出了同一分母，没有额外识别增益。产品
runtime 保持 `STOP`。下一投资是 2-staff 识别，不是再训练 layout，也不是改 Desktop default。
