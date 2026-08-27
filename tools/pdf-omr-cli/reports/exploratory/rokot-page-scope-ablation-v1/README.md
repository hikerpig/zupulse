# Rokot page-scope ablation v1

> Status: development evidence。仅覆盖 OLiMPiC dev work `6007571`，不读取 holdout，不改变 frozen `STOP`、
> App gate 或 runtime default。

## 问题与方法

本实验使用同一份 4 页、15 systems 的真实扫描输入和同一份 MusicXML truth，比较：

- `direct-page`：将每个完整页面作为一个 `system-crop / grand-staff` model unit，绕过 detector，直接送入 Rokot；
- `oracle-systems`：按照冻结的 `source-mapping.json` bbox 物化 15 个 system pages，逐 system 送入 Rokot，再由现有 normalizer joining。

两侧固定 Rokot model revision `7add305aade6fb3a64ad4dde77d410fa68381089`、prompt、`ctxSize=4096`、
`maxNewTokens=1600`、temperature `0` 与 ABC converter。`direct-page` 借用 `system-crop` 只用于回答模型输入粒度问题，
不得解释为合法 runtime topology。oracle PDF SHA-256 为
`944402dbd782f5dbc799a8bb5645b50bd8eef0e10984de7aceaf4e0e72184015`。

## 结果

Ground truth 每个 staff 有 57 measures。

| Variant        | Measures/staff | Diagnostics | Pitch F1 | Onset F1 | Duration F1 | Joint F1 | Valid measure | Elapsed |
| -------------- | -------------: | ----------: | -------: | -------: | ----------: | -------: | ------------: | ------: |
| direct-page    |          93/93 |         407 |   0.1645 |   0.2870 |      0.2408 |   0.0043 |        0.0000 |  107.5s |
| oracle-systems |          55/55 |         304 |   0.3622 |   0.1837 |      0.2744 |   0.0147 |        0.0000 |   76.6s |

`oracle-systems` 的 measure count 更接近 truth，Pitch、Duration、Joint F1 更高，diagnostics 和 wall time 更低；
`direct-page` 只有 Onset F1 更高。两侧均为 0 valid measures，且 oracle 输出仍出现 staff topology、duration 与
voice diagnostics。

复核第 1 页后确认，每个 source system 实际包含一条 vocal staff 与 piano grand staff，共 3 staves，超出当前 Rokot
只接受 single staff 或两条 grand staff 的合同。实验却把两侧都声明为 `grand-staff`，因此 topology mismatch 是固定
confound；这些数值不能隔离证明 system-level 输入本身更好。

## 决策

本次比较状态为 `NOT_ELIGIBLE`，不提升 direct full-page 或 oracle-system 路线。若要回答输入粒度问题，下一轮必须选择
合同内的纯 single-staff 或 piano grand-staff 页面，并保持两侧 topology 声明真实一致。当前 runtime default 不变。

结构化结果见 [`summary.json`](summary.json)。完整 crops、raw ABC、MusicXML fragments、Draft 和本地模型不进入 Git。
