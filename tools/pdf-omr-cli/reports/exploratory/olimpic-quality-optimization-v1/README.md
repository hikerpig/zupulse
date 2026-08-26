# OLiMPiC PDF OMR quality optimization v1

> Status: completed development evidence，完成于 2026-08-26。只读取 development 与既有 immutable run；未读取
> holdout，未修改 Draft、engine artifact、runtime default 或 frozen protocol。

## 结论

本 initiative 的三个候选改进均未达到接入 gate，最终决策为 `STOP / NOT_ELIGIBLE`：

1. 四种 deterministic full-page preprocessing 在 6 works / 29 pages 上均为 0/29 segmentation success，全部仍在
   `grand-staff-pairing` fail closed。各 variant 两次运行的 canonical SHA-256 完全一致，因此保留 runtime default
   `none`。
2. Rokot development run 的 45 个成功 joining artifacts 全部来自单个 `system-crop`，没有 multi-system item。
   153 个 raw boundary 与 153 个 normalized boundary 数量相同且 source provenance 无缺失，但不能评估跨 system
   context propagation。`normalizeRokotOutput` 保持不变。
3. LEGATO topology audit、preprocessing 与 joining 都没有产生合法的新 Draft/comparison。cross-engine denominator
   仍为 46 attempted、Rokot 45 success、LEGATO 26 success、26 comparable；既有 81 candidates 的 oracle upper
   bound 仍为 28，Wilson lower bound `0.8794`，低于锁定的 35 与 `0.90` gate。

## Preprocessing ablation

| Variant                 | Changed pages | Segmentation | Systems | Observed wall time |
| ----------------------- | ------------: | -----------: | ------: | -----------------: |
| `none`                  |             0 |         0/29 |       0 |        3.10–3.15 s |
| `deskew-v1`             |            13 |         0/29 |       0 |        6.10–6.17 s |
| `local-contrast-v1`     |            29 |         0/29 |       0 |             3.95 s |
| `adaptive-threshold-v1` |            29 |         0/29 |       0 |        3.38–3.50 s |

Observed wall time 是两次本机 development run 的非 canonical 运行成本，不进入 report identity。deskew 估计角度
范围为 `-1.0°` 到 `0.5°`；16/29 pages 为 `0°`。所有 variant 都完整处理 29 pages，没有选择性覆盖失败页。

Canonical report SHA-256：

- `none`: `6af40c383588446cbeb57f134b5c97a5f23e9aa5414af374633a3f63a53292b9`
- `deskew-v1`: `c1d8310df87f14b91d4e1e7886437af5a4f6e90698599692154cc7dcefa2fc23`
- `local-contrast-v1`: `5cea5ffab76578b623ddbee52c7770554cba46d5162402929cc94f8a9cf32235`
- `adaptive-threshold-v1`: `0696a59e1f836010e7b2c41bbe66357761ac63c9362036f0055aa8799d188550`

## Joining census

Joining census 的 canonical SHA-256 为
`156911885844b2b3453be1bf63ed9afb817b5eb6519e6abc631ebbe74af32bab`，两次运行一致。source benchmark report
SHA-256 为 `b11b25a1a7048b69ba459d23f34cbe13e3eaf9b5d00464e5c27e29d57c832a87`，45 个 joining artifacts 的
ordered identity SHA-256 为 `b5ca185cab2d7347b4b700e26fcb16d2f6d24ab48e35d83a92a0c61f69cdcc68`。

由于 multi-system denominator 为 0，任何 continuity 规则都只能由 synthetic fixture 驱动，不能满足“基于真实
diagnostics 且无已知回归”的接入条件。本轮不新增 header propagation、duration rescale、rest synthesis 或 measure
deletion。

## Next action

下一步应单独设计 learned layout detector experiment，先锁定 model revision、weights license/hash、runtime、artifact
contract 与 distribution boundary。只有 real-scanned full-page segmentation 产生非零、可核对的 multi-system run
后，才重启 joining 优化和 cross-engine selector reassessment。实验边界已写入
`docs/specs/2026-08-26-pdf-omr-learned-layout-detector-proposal.md`，当前为 `status: proposed`，不构成依赖或权重接入批准。
