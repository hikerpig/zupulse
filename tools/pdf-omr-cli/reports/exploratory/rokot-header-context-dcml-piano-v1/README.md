# Rokot header-context DCML piano v1

> Status: development evidence。使用 DCML Mozart v2.3 `reviewed/*.mscx`，经 MuseScore 4.7.4 导出 MXL/PDF。
> 类别为 `derived-controlled-grand-staff`，不是独立扫描。不读取 holdout，不改变 frozen `STOP` 或 runtime default。
> 谱面 bytes 不进入 Git（CC-BY-NC-SA-4.0）。

## 方法

同一套 header-context 协议只比较：

| Policy                           | 上下文                       |
| -------------------------------- | ---------------------------- |
| `previous-prediction-headers-v1` | 当前 runtime：安全的 `L/M/K` |
| `previous-lm-headers-v1`         | 只传 `L/M`                   |

输入由 `reviewed/*.mscx` → MusicXML → PDF，与 K331 fixture 的生成器相同。Crops 使用
`rokot-staff-system-v2`、`allowFragmentedRuns=false`；runtime pairing 在多页 `grand-staff-pairing`
fail closed，因此 materializer 只在本实验启用 `pairAdjacentUnpairedGroups`。这不是 runtime detector
恢复，recognize 仍走 `inputScope=system-crop`。

## K310-1

Piano Sonata no. 8 in A minor，第一乐章。44 个 oracle crops。runtime 在第 7 个 crop 以
`ENGINE_OUTPUT_INVALID / unknown-rokot-voice` fail closed，非法 token 为 `V:1=1/2`。该 crop 仍是合法
grand-staff system，失败来自 Rokot ABC 合同，不是 pairing。因此 K310-1 **不能**进入 L/M vs L/M/K 质量比较。

## K280-1

Piano Sonata no. 2 in F major，第一乐章。书面调号为 1 个降号。48 个 oracle crops，GT 每 staff 144
measures。

| Policy     |      Pitch |      Onset |   Duration |      Joint |      Staff |      Voice |      Valid | Key sequence           |
| ---------- | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: | ---------------------- |
| `L/M/K`    | **0.7500** | **0.9080** | **0.8980** | **0.4131** | **0.6914** | **0.4151** | **48/288** | 21×`C` 后卡住 `G`      |
| 只传 `L/M` |     0.4730 |     0.6807 |     0.5870 |     0.1929 |     0.3466 |     0.1978 |     39/288 | 首个 `C`，随后全是 `F` |

只传 `L/M` 时 predicted key 更接近书面 F 大调，但 Pitch/Joint/valid measures 全面下降，并且小节数变成
148/148。当前 runtime 虽然把错误的 `C` 再传到 `G`，符号质量仍更高。

这与 K331-3 相反：K331 上去掉 `K` 之后模型写出 `A`，Pitch/Joint 上升。K280-1 证明该收益不能外推到另一份
合同内钢琴谱。

## 决策

`previous-lm-headers-v1` **不得**替换 runtime default。K331 的 L/M-only 提升保持为单 work 观察。下一份对照必须
先能在当前 ABC 合同下跑完整谱，不能把 K310-1 的 voice fail-closed 解释成 header 策略结论。

结构化结果见 [`summary.json`](summary.json)。
