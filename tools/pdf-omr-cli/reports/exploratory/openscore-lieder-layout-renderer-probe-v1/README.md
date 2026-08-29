# OpenScore Lieder layout renderer probe v1

状态：`completed-go`。本报告是 2026-08-29 的 development evidence，不是产品 runtime 结论。

## Result

固定选择 15 个 OpenScore Lieder scores，实际覆盖 2/3/4-staff topology。MuseScore 两次批量导出共得到 60 页；60 页 raster bytes 全部一致，59 个有效乐谱页的 canonical annotations 全部一致。1 个无 `StaffLines` 的纯文本尾页按规则排除。

| 指标                              |    结果 |
| --------------------------------- | ------: |
| Scores                            |      15 |
| Pages                             |      60 |
| Eligible music pages              |      59 |
| Excluded text-only pages          |       1 |
| Systems                           |     207 |
| 2-staff systems                   |      33 |
| 3-staff systems                   |     133 |
| 4-staff systems                   |      41 |
| Raster hash matches               | 60 / 60 |
| Canonical annotation hash matches | 59 / 59 |

10 页的 raw SVG bytes 在两次导出间不同，差异来自与 layout truth 无关的 `LyricsLineSegment` element order。探针因此分别记录 raw SVG hash，并以 raster bytes 与 canonical staff geometry 作为确定性门禁，不把无语义的 XML element order 当作训练数据变化。

## Annotation findings

- Hidden empty staves 使 visible staff count 小于 source-declared staff count，因此不能按固定数量切分整页 `StaffLines`。
- Curly brace 既可能使用 page coordinates，也可能使用局部坐标加 `matrix(...)`；truth extraction 必须应用该 transform。
- 非对称声部间距下不能用 brace midpoint 分组；按有序 brace bottom extent 截止 visible staffs 能稳定重建 system。
- Square bracket 由一条竖直 `polyline` 与两个 hook `path` 共同组成；竖直 `polyline` 是优先的 system extent evidence。
- 无 staff lines 的页面 fail closed 排除，不生成空训练标注。

## Manual audit

人工查看了 9 个 score 的第一页，每类 topology 各 3 页；system 顺序、每个 system 的 visible staff count 与 staff-line 覆盖均正确。

| Topology | Score IDs                       | Page-1 system topology        |
| -------- | ------------------------------- | ----------------------------- |
| 2 staff  | `6158642`, `6158825`, `6159273` | `2/2/2`, `2/2/2/2`, `2/2/2/2` |
| 3 staff  | `4904021`, `4919673`, `4919879` | `3/3/3/3`（三页相同）         |
| 4 staff  | `5062143`, `5092551`, `5093434` | `4/4`, `4/4/4`, `4/4/4`       |

`render-manifest.json` 是自动探针结束时的原始证据，所以其中 `manualAuditComplete` 保持 `false`；随后完成的人工审计记录在本报告及 `summary.json` 中，不改写原始运行输出。

## Reproduce

```bash
python3 tools/pdf-omr-cli/scripts/probe_musescore_layout_renderer.py \
  --source-plan tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/source-plan.json \
  --source-root /path/to/OpenScore-Lieder-at-pinned-revision \
  --musescore-executable /opt/homebrew/bin/mscore \
  --output-root /tmp/zupulse-openscore-layout-probe-v1 \
  --per-staff-count 5 \
  --max-items 15
```

- OpenScore revision: `6b2dc542ce2e8aa4b78c8ee62103b210efc07015`
- MuseScore: `4.7.4`, build `7688c00`
- Raster target: width 1400, export DPI 169
- Bundled font files: 22
- Bundled font declaration SHA-256: `b1098f4c89ea17956a82bfdb3cfdb65e23693934bd430a21c9e921208ce84869`
- Committed render manifest SHA-256: `e9de8c807cf1da7937f5a64b4988fad13c5e621e46470e82a082e89637c280bd`

## Decision

`Go`：SVG truth 能稳定表达当前实际出现的 2/3/4-staff visible topology，且 raster 与 canonical geometry 通过双跑确定性检查。下一阶段可以生成完整 1,144 train / 133 validation 数据集；真实扫描 OLiMPiC development gate 和 frozen holdout 边界不变。
