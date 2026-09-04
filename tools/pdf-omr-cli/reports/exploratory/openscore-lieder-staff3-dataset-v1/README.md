# OpenScore Lieder ≤3-staff dataset v1

状态：`build-complete`。该数据集只用于 shared detector research，不是产品 runtime artifact，也不构成真实扫描准入结果。

## 结果

- 固定 OpenScore/Lieder revision `6b2dc542ce2e8aa4b78c8ee62103b210efc07015` 与 source-plan SHA-256
  `808893162928fcc434d3b21da81310516ac00aa2fd32213f99371744620ae195`。
- 只保留 declared staff count ≤ 3：1,169 scores（1,038 train / 131 validation）；渲染前排除 108 scores，分布为
  4:61、5:10、6:31、7:2、8:3、9:1。
- 5,670 pages 中 5,628 eligible；42 页因无 `StaffLines` fail closed。共 19,835 systems，staff count 分布为
  1:128、2:868、3:18,839。
- 仅 train 生成一个 seeded augmentation，共 5,100 augmented pages；validation 保持 clean。
- manifest SHA-256 为 `c9cfdea3b7af3842de9acb68c0b8e2ca838eefdc747e42c3cd208ac7e186b94b`；逐项验证
  32,184 个 image/mask/annotation 文件通过。

## Determinism evidence

MuseScore 4.7.4 的直接 PNG export 在独立运行间出现少量 anti-aliasing 漂移，因此最终 raster boundary 改为：MuseScore
只导出 SVG，随后用 resvg 0.48.1、MuseScore bundled fonts、禁用 system fonts，固定 width 1400 转为 grayscale PNG。

MuseScore 仍可能随机改变同一 SVG paint class 内元素顺序。builder 只在各 class 的原槽位内稳定排序，保持跨 class 的
layering。两套独立 MuseScore exports 的全部 5,670 个 SVG 规范化后逐字节比较为 0 differences；已知异常页另做像素级
回归，两次 raster 完全一致。为避免重复计算，第二套全量 raster/augmentation 在确认完整输入等价后停止；最终 B build
独立完成 manifest 与全部 artifact hash verification。

## Visual audit

人工查看 canonical 与 mask：score `6162644` page 2（1 staff）、`4920211` page 2（2 staff）、`4904021`
page 1（3 staff），并查看后两者的 augmented image/mask。staff-line mask 与页面 staff topology 对齐，几何增强同步，未见
越界或非 staff ink 被标入 mask。

## Reproduce

```bash
python3 tools/pdf-omr-cli/scripts/build_openscore_layout_dataset.py \
  --source-plan tools/pdf-omr-cli/corpus/openscore-lieder-layout-train-v1/source-plan.json \
  --source-root /path/to/OpenScore-Lieder \
  --musescore-executable '/Applications/MuseScore 4.app/Contents/MacOS/mscore' \
  --resvg-executable /opt/homebrew/bin/resvg \
  --font-directory '/Applications/MuseScore 4.app/Contents/Resources/fonts' \
  --output-root /path/to/output
```

默认 seed 为 `20260829`。环境为 MuseScore4 4.7.4、resvg 0.48.1、Pillow 12.2.0、NumPy 2.4.4；22 个
bundled font files 的 declaration SHA-256 为
`59ea551408dcff3efd5a46ce7fcb7cbb0cb280e3c69217cfe451c55edbf0cafc`。

## Boundary

完整数据 bytes 与 6.5 MiB manifest 不提交仓库。75 个已记录 evaluation score IDs 保持排除，frozen holdout 未读。
synthetic validation 只用于训练回归；模型仍须通过 OLiMPiC 6 works / 29 pages 的真实扫描 development gate。
