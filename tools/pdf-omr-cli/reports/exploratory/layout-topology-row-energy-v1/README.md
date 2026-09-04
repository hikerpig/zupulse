# Layout topology row-energy candidate v1

本实验使用 composer-isolated topology slice 训练 compact row-energy candidate，目的是验证 DWD 启发的稀疏 center
target 能否同时恢复 system centers 与动态 1/2/3-staff topology。实验不读取 frozen holdout，也没有运行 OLiMPiC
development 或修改产品 runtime。

## Runs

第一个 two-head prototype 预测 aggregated system center 与 staff center。3 epochs 后 staff-center validation Dice 为
`0.7553`，system-center Dice 为 `0.4330`。固定连续-component 解码下，staff centers 达到 121/128 page exact；使用
oracle system bands 时，staff count 为 1-staff `40/40`、2-staff `69/69`、3-staff `366/373`。但 system centers
只有 8/128 page exact；最佳全局 smoothing/NMS decoder 的完整 topology 为 107/128，并完全漏掉密集 1-staff pages。

- checkpoint SHA-256: `ffdb810d448c3d9da8d5f9a05ee95702d60ee3d27758848b7163555c6f17fc4d`
- raw training summary SHA-256: `0cbc17f64386c5081a7a63fa6c34eae557fa7565e2b3b226ef95f1a124f5a5b3`

随后按 OLA object-class 思路把 system energy 拆成 1/2/3-staff channels。cold-start 版本的 class channels 正负分布
塌缩，因此不做 threshold tuning。唯一 warm-start correction 从 two-head checkpoint 初始化共享 backbone，将旧 system
head 复制到三个 count channels、旧 staff head 复制到 staff channel，再以 learning rate `1e-4` 训练 3 epochs。

warm-start 后正负位置 AUC 为 class 1 `0.897`、class 2 `0.877`、class 3 `0.942`、staff `0.999`，但三个 system
channels 仍在各 staff 附近重复响应。逐 channel component 解码无法形成 exact page；不用 truth、只以 count-channel
logit 对连续 staff peaks 做 1–3 staff 动态规划，最终也只有 70/128 topology-exact pages，各类 system exact 为
1-staff `3/40`、2-staff `39/69`、3-staff `206/373`。

- warm checkpoint SHA-256: `6c40870077ee34fae39ca0adb112bef6c168c1b433feac47743830ba3c5cfef4`
- raw warm training summary SHA-256: `596260e8e272fb340a3eb70e27c773425d6c1ca027dffaee945f480a88c5ccd0`
- architecture parameters: 30,108
- train / validation pages: 510 / 128；两个非严格 row-order train pages 按 target audit 明确排除

## Decision

`STOP_ROW_ENERGY`

staff-center evidence 已证明可学习，但把整页 feature 沿 width 做全局平均后，system head 无法稳定区分“同一 system 的
多个 staffs”和“多个相邻 single-staff systems”。继续调阈值、gap 或 partition penalty 只会重新引入 page-density
heuristics，不能修复表示缺失。因此本候选在 synthetic gate 停止，不运行 OLiMPiC。

下一候选必须保留二维 instance context，回到 OLA/region-based layout analysis 支持的 system/staff box-object 方向；
优先做最小 2D target/runtime probe，未证明必要前不新增 Ultralytics、torchvision 或产品 dependency。
