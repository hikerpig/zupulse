# PDF OMR CLI 冻结评测结论

## 决策

`STOP`

停止把当前 Audiveris 5.10.2 或 Transcoda 59M 路线推进到 App discovery。这里的 `STOP` 不是永久放弃
PDF OMR，而是表示当前 engine、输入预处理和 corpus 证据不足以支持产品化；后续若更换 engine、
训练数据、render pipeline 或显著扩大 corpus，必须建立新的 protocol，不能覆盖本次结果。

## 评测范围

- benchmark commit:
  `98410a85953e2682e0444dd354334130bb7f28ce`
- corpus manifest SHA-256:
  `598406d48e2bbb25a935003b2ad3450399f0831471df86111cb070c0dcc645bb`
- frozen protocol SHA-256:
  `4febcd2566f8602326480f74a414d48fc1c5a7dabd6459e5844a2391d20585c7`
- holdout: `piano-eight` clean 与 low-contrast 两个 variant
- preprocessing: `none`

当前 corpus 只有两个自建 synthetic work；它足以验证 CLI、artifact、hash、split 与 gate，但不足以
估计真实世界总体质量。本报告的结论是“当前证据不能进入 App”，不是对所有未来 OMR 技术的上限判断。

## 冻结结果

| Metric                          |     Gate |   Audiveris 5.10.2 |      Transcoda 59M |
| ------------------------------- | -------: | -----------------: | -----------------: |
| Item process success            | evidence |              2 / 2 |              2 / 2 |
| Note joint F1                   |  >= 0.90 |               0.00 |               0.00 |
| Valid measure rate              |  >= 0.95 |               0.00 |               0.00 |
| Generated MXL parse rate        |  >= 0.95 |               0.00 |               1.00 |
| Round-trip structural agreement |  >= 0.90 |               0.00 |               1.00 |
| Harmony precision delta         | >= -0.05 |              -1.00 |              -1.00 |
| False confident chord rate      |  <= 0.03 |               0.00 |               1.00 |
| Repeated Draft hash agreement   |   = 1.00 |               1.00 |               0.00 |
| Cancel latency P95              |    <= 2s | unavailable / fail | unavailable / fail |
| Wall time P50                   | evidence |              14.2s |              35.2s |
| Wall time P95                   | evidence |              14.8s |              42.1s |

两个 engine 的 gate decision 都是 `STOP`，并且均先写出完整 canonical report，再以 exit code 9
结束。报告可以从 item artifacts 重算为相同 SHA：

- Audiveris:
  `81f0f7902abb0587987ea8c70f0cd85626d1f84f9933a833899deca8fb61e45a`
- Transcoda:
  `ffa4b4b91ac90fa8251f13fd8325e37d835bd0e9e7fb2bba9d62a3e19f196c17`

## 解释

Audiveris 能稳定执行和导出，但当前 PDF render 上没有形成可通过 validator 的音符/节奏结构。
它的 Draft hash 可复现，但“稳定地产生错误或空结构”不能视为可用。

Transcoda 在 holdout 上能形成可转换、可 round-trip 的 Draft，但符号内容与 ground truth 不一致，
并且两次运行 Draft hash 不一致。结构可解析只证明 serialization pipeline 工作，不证明乐谱语义正确。
其 `false confident chord rate = 1.0` 对下游和弦分析尤其不可接受。

Cancel latency 没有进入 item aggregate，因此按冻结 gate 失败。即使移除这一项，joint F1、valid
measure 和 Harmony 指标仍足以得出 `STOP`；不得事后修改 gate 改写结论。

## 许可证与运行约束

- Audiveris code: `AGPL-3.0-only`
- Transcoda code: `AGPL-3.0-only`
- Transcoda weights: `CC-BY-4.0`
- Transcoda 是单页、固定输入几何模型；当前 adapter 对 multi-page 明确稳定失败

这些许可证只在隔离 CLI benchmark 中被评估，没有批准 Desktop、Browser、服务端或模型分发。

## 若未来重启

新的 discovery 至少需要：

1. 获取许可明确、包含真实印刷扫描与目标钢琴谱型的更大 corpus，并按 work 冻结 split。
2. 先解决 render/preprocessing domain gap，再比较 engine；不能用放宽 validator 掩盖错误。
3. 将 cancel、峰值 GPU/RSS 和逐阶段 wall time 纳入实际 item metrics。
4. 对 neural decoder 做可复现性诊断，并单独校准 confidence，禁止跨 engine 直接比较 raw score。
5. 使用新的 protocol/version；本次 frozen report 保持不可变。

本阶段没有修改 `apps/*`，也没有定义 UI、Bridge、Repository 或持久化模型。
