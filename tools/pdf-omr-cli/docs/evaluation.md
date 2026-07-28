# PDF OMR CLI evaluation

## 当前状态

- Development protocol: completed
- Holdout protocol: frozen
- App decision: not evaluated

本评测只覆盖 CLI 技术链路，不设计或批准任何 `apps/*` 集成。

## Development corpus

`corpus/evaluation/manifest.json` 包含两个自建 CC0 work。`melody-eight` 的 clean、low-contrast 和
blur 三个 variant 全部属于 development；`piano-eight` 的两个 variant 全部属于 holdout。按
`workId` 隔离，任何同源 variant 都不会跨 split。

该 corpus 只验证冻结流程和基础印刷谱识别，不能代表真实扫描、手写谱、复杂复调或大编制。
因此即使 holdout 通过，也只能支持扩大 corpus 的 `INVESTIGATE`，不能凭五个 synthetic items
直接批准产品化。

## Development decisions

固定比较：

- Audiveris 5.10.2，DMG SHA-256
  `727c46b4ca4766349be1f582b67cc5aa0d7306113dcf4a18be169d75959f4288`
- Transcoda code
  `d4e2e687d5679ae96ca4aa6f01e06a5b338cd488`
- Transcoda checkpoint SHA-256
  `3ce7387b94776cd0edc4e5b70fbc2e28ac0f4c812d5f978d1ef26e236dccdafc`
- preprocessing: `none`
- Transcoda: grammar constrained、layout normalization、greedy、`maxLength=512`、
  `repetitionPenalty=1.1`
- 每个成功 item 重复两次计算 Draft hash agreement

被拒绝的变体：

- 不使用 `repetitionPenalty`：极简 smoke 出现重复 clef token。
- legacy `hum2xml`：当前 macOS toolchain 无法可复现构建，改用隔离的
  `converter21==3.5.0` / `music21==9.9.1` process。
- 一小节短谱表 smoke：Audiveris 无法构成 system，仅保留为管线 smoke，不进入 evaluation
  corpus。

## Development results

Canonical aggregate reports：

- `reports/development/audiveris.json`
- `reports/development/transcoda.json`

Audiveris：

- 3/3 item 完成 process、MXL export 和 normalization；
- Draft reproducibility agreement `1.0`；
- joint F1 `0`，valid measure rate `0`；
- MusicXML generation/parse/structural capability rate 均为 `0`，因为 Draft 被 blocking
  diagnostics 阻断；
- wall-time P50 约 `14.2s`，P95 约 `14.3s`。

Transcoda：

- 0/3 item 形成 Draft；
- 三项均稳定失败为 `ENGINE_OUTPUT_INVALID / inconsistent-spine-count`；
- 失败发生在 `**kern` validation，未进入 converter、Harmony 或 MusicXML generation；
- 无可报告的 symbolic、runtime aggregate 或 reproducibility metric。

Development 结论是不调低 validator 或 gate。两个引擎目前都没有证明能生成可用 Draft；
Transcoda 的 native invalid output 也不能用语法猜测修复。Holdout 仍应按原 gate 运行，用于验证
冻结机制和确认失败结论，而不是继续针对 holdout 调参。

## Frozen holdout protocol

`corpus/evaluation/protocol.json` 在 benchmark commit
`98410a85953e2682e0444dd354334130bb7f28ce` 上冻结。它锁定 manifest SHA、两个 engine version、
Transcoda model SHA/decoder parameters、`none` preprocessing 和八项 gate。Holdout runner 会读取
同目录 protocol，拒绝 hash、manifest、engine 或 preprocessing 不匹配的请求。

## Holdout result

两个冻结组合都完成运行、写出完整 report，并返回 exit code 9：

- Audiveris report SHA-256:
  `81f0f7902abb0587987ea8c70f0cd85626d1f84f9933a833899deca8fb61e45a`
- Transcoda report SHA-256:
  `ffa4b4b91ac90fa8251f13fd8325e37d835bd0e9e7fb2bba9d62a3e19f196c17`

两份 aggregate 均已从 item artifacts 重算并得到相同 hash。冻结 gate 的唯一结论为 `STOP`；
完整解释见 `docs/evaluation/pdf-omr.md`。该结论停止当前 engine 进入 App discovery，不禁止未来以
新 engine、更大真实 corpus 和新 protocol 重新立项。
