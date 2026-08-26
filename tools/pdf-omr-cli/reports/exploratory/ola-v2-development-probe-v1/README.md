# OLA v2 development probe v1

> Status: completed / `NOT_ELIGIBLE`，完成于 2026-08-26。只读取
> `olimpic-scanned-full-page-dev-v1` development split；未读取 holdout，未提交 weights、Python environment、rendered
> pages 或 raw inference output，也未修改 Rokot runtime。

## 结论

经用户明确授权后，本轮在隔离临时环境下载并执行 OLA v2。模型能够在 macOS arm64 CPU 上稳定输出 `staves`、
`systems` 与 `grand_staff` boxes，29-page prediction projection 两次运行的 SHA-256 均为
`4e3a212f27e7c3fb3e02bbcd5d54aaa33e437955fffceaf02b5ea712c65a132c`。这证明候选可从本地 weights 加载并具有
确定性 raw boxes，不证明它满足 Rokot segmentation contract。

固定 `confidence=0.25`、Ultralytics NMS IoU `0.7` 时，raw `systems` 共 62 个，仅 2/29 pages 的 count 与 121-system
development annotation 相同；raw `grand_staff` 共 42 个，没有 exact-count page。两者都缺少 contract 要求的
staff-line polylines，且存在重叠或跨 system boxes。

为排除默认阈值选择不当，额外做了两项 development-only global ablation：

- 112 个 `systems` / `grand_staff` confidence + NMS variants 中，最佳 variant 是 `grand_staff`、
  `confidence=0.01`、extra NMS IoU `0.1`：81 predictions、3 exact-count pages、39/121 GT boxes 达到 IoU 0.5，
  但只有 1 page / 1 work 完整匹配。
- 540 个 `staves` dedup + adjacent-pairing variants 中，最佳 variant 使用 `confidence=0.4`、vertical dedup `0.25`、
  horizontal overlap `0.5`、maximum gap ratio `2.0`：110 predictions、13 exact-count pages / 5 works，
  但只有 1 page / 1 work 的所有 pair boxes 达到 IoU 0.5。错误配对仍会把相邻 vocal/branch staff 当成 piano
  grand staff，不能仅凭 count 接入。

因此 OLA v2 没有达到 learned detector admission gate：没有至少两个 work 的完整合法输出，没有 deterministic crop
hashes 或 joining evidence；weights license 未由 OLA 单独声明，固定 Ultralytics stack 仍是 AGPL-3.0，不能进入
proprietary Desktop distribution。后续若继续 OLA，只能在取得适用许可后训练/微调面向目标 scan domain 的模型，
并让模型或受验证的 adapter 直接产生 staff-line topology；继续调 threshold 或忽略错误 boxes 没有足够证据。

机器可读结果位于 `summary.json`。所有 timing 均为单机 environment evidence，不进入 prediction identity。
