# OLiMPiC full-page development evidence

该目录记录 `olimpic-scanned-full-page-dev-v1` 在 2026-08-06 的可重算停止证据。它不是质量 gate，也不代表
Rokot 可以处理整页输入。

## Frozen inputs

- manifest SHA-256: `4cbd78411f15f73bf548a50f2af125e29c6cc42297b43a8616934a08a2cb0a1f`
- protocol SHA-256: `d1b6beeb912350eb134524cf3100c8d49ee908578825c95fc1171bfacbce4782`
- engine: Rokot revision `7add305aade6fb3a64ad4dde77d410fa68381089`
- segmentation: `rokot-grand-staff-v2`, `full-page`, fragmented-row mode enabled

## C05 segmentation pilot

`olimpic-scanned-full-page-v1-segmentation-pilot/segmentation.json` 保留 29 页的逐页结果，canonical SHA-256
为 `1fa116866674160f494e06310592b8f56a92e580ae21b464a4098fe9d6254d86`。29/29 pages 均 fail closed，没有
生成可供 inference 使用的 system crop；每个 page 都记录了 `ambiguous-system-segmentation`、stage、page index
以及必要的 gap/group context。失败阶段包括 `staff-groups`、`staff-spacing` 和
`grand-staff-pairing`，因此没有人工 crop 或运行中修补。

Ground-truth readiness 同时由 benchmark 为每个 work 写出 `ground-truth-validation.json` 和
`evaluation-limitation.json`。`4945954`、`4976604`、`4985990`、`5862368`、`6011095` 被
`VOICE_DURATION_MISMATCH`、`MISSING_EVENT_TIMING`、`INVALID_TIE` 或 `UNRESOLVED_TIE` blocking diagnostics
阻断；只有 `6007571` 的 GT readiness 通过，但其 full-page segmentation 仍因 `staff-groups` 而失败。

## C06 repeated development runs

两次使用同一 frozen protocol、manifest、Rokot runtime 和 `none` preprocessing 的 run 结果完全一致：

- run 2 report SHA-256: `bd77eced58d6bb39b6d15cd4b510d0ece62ef61c589fe0e3193cab8dafa9330c`
- run 3 report SHA-256: `bd77eced58d6bb39b6d15cd4b510d0ece62ef61c589fe0e3193cab8dafa9330c`
- 两次均为 `0/6` succeeded、`6/6` failed、gate `NOT_EVALUATED`，没有 symbolic/Harmony quality metrics。
- 5 个 work 以 `BENCHMARK_EVALUATION_LIMITATION` 结束；`6007571` 以
  `ENGINE_OUTPUT_INVALID / ambiguous-system-segmentation` 结束。

该结果冻结为 `STOP`：不进入 decoder/model 单变量实验，也不读取新的 holdout。要重新开始，必须先修复
full-page detector 或取得一批 timing-ready、rights-reviewed 的 ground truth，并以新的 protocol 重新评测。
