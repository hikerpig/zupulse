# OLiMPiC scanned system corpus v1

这是一个只用于 PDF OMR 研究评测的真实扫描 corpus。输入页来自 OLiMPiC 1.0 scanned release 的原始
system crop，使用 `sips` 封装为单页 PDF；没有重新渲染乐谱或改变像素。每个 item 都保留对应的原始
PNG，便于复查 PDF 封装是否改变输入。

- Dataset: [OLiMPiC 1.0 scanned](https://github.com/ufal/olimpic-icdar24)
- Release archive: `olimpic-1.0-scanned.2024-02-12.tar.gz`
- Archive SHA-256: `a84091b50154251b66d37b50806f98d8a6d758b4195d2aa9805d1b9cb78e6993`
- License: CC BY-SA 4.0；使用时需要同时注明 OLiMPiC 与 OpenScore Lieder 来源。
- Development: `6586696/p1-s1`
- Holdout: `6245974/p1-s1`

## Scope limitation

v1 是 system-level corpus，不是 full-page corpus；`protocol.json` 因此冻结了
`segmentation.scope = "system-crop"`。它可以验证真实扫描输入、MusicXML normalization、decoder 和
逐 item metrics，但不能证明整页 segmentation 或跨 system joining。任何 full-page 结论必须使用新的
corpus/protocol，不能把 v1 结果升级为产品 gate。

Manifest 的 `provenance` 保存 source split、sample ID、release 和 archive hash；item 的 PDF、PNG 与
ground-truth MusicXML hash 均记录在 `manifest.json`。
