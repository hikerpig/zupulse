# OLiMPiC compact multi-head layout candidate v1

本候选是 oracle 判定旧 staff-line mask 不足后的唯一 learned fallback。`compact-layout-unet-v1` 有 30,090
parameters，在同一个模型中输出 `staff_line_logits` 与 `system_band_logits`；训练仍使用既有 OpenScore Lieder
development slice，不读取 frozen holdout。system-band mask 由已有 `normalizedBBox` 生成，并与 staff-line mask
共享同一 annotation 和透视变换。

固定 post-processing 对 system-band row score 使用 `gaussianSigma=6`、`minimumCenterDistance=100`、
`minimumCenterScore=0.5`。因为本 development corpus 的 121 个 systems 经复核全部为 3-staff，研究候选固定
输出 3-staff topology；这不是通用 staff-count detector，禁止据此进入产品 runtime。

结果：

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Topology-exact pages | 0 / 29 | 22 / 29 |
| Works with exact page | 0 / 6 | 6 / 6 |
| Boundary materialization | 29 / 29 | 29 / 29 |

- checkpoint SHA-256: `03fe737f663a3381c4a26e21b083c00176e0b64fb746b3215ab0d905798aac15`
- deterministic ONNX SHA-256: `e3d9ee80beeaf91a5a08a5e8747df888dd88479112b973b24e119656f530b209`
- ONNX candidate report SHA-256: `f63c3eae2bede7c2d6fc5f08534938740553022a06a637ff9a9713e19d51ed35`
- materialization SHA-256: `ef1624021539cc1a06f2d59fdf914f9678b61037347cd09f2c935d2550c257a3`
- repeated runs: byte-identical report, overlay hashes, materialization and ordered crop hashes

Synthetic validation 的 system-band Dice 为 `0.9297`，staff-line Dice 仅 `0.4577`。因此本结果只证明
system-band 定位在这个 development corpus 上跨过 `20/29` investment checkpoint；它没有解决通用
staff-count/line reconstruction，也没有 system-aligned MusicXML quality evidence。产品决策保持 `STOP`，
不新增 `onnxruntime-node`，不修改 App、Bridge 或 detector default。
