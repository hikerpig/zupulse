# DETR v1 OLiMPiC topology probe v1

Status: completed / `STOP_DETR_V1_OLIMPIC`。本轮只读取
`olimpic-scanned-full-page-dev-v1` development split 与冻结的 `compact-layout-unet-v1` 22/29 基线；未读取
holdout，未搜索 threshold / epoch，未修改产品 runtime。

## Protocol

把已训练的 `facebook-detr-resnet-50-layout-v1` 直接放到 29 个真实扫描页上，比较与 UNet 相同的 OLiMPiC
topology 合同：reading-order 数量一致、预测 `staffCount` 来自 class label 而不是写死常量、system 中心落在
truth 纵带内。1-staff synthetic gate 不再作为是否运行 OLiMPiC 的条件，因为这 29 页、121 个 system 全部是
3-staff。

固定参数与 DETR v1 注册协议相同：score threshold `0.5`、shortest/longest edge `512/768`、softmax 三类
`system-1-staff / system-2-staff / system-3-staff`、CPU、eval 模式。checkpoint SHA-256
`3b33d1160ac00a508725d1fab0843bc2541809ff26453ea12df71db67d030061`。渲染页与 diagnostic truth 分别锁定为
UNet 报告中的 `fbc55413a9a5503bcb46a6cbbc57dbfc8662123c431dba6eba62df122adc81bc` 与
`977ae09486dd420bfaa7089fd7e071c03d65cbecf01a8af72f58c6a8e8b3526f`。

## Result

| Metric                          | compact-layout-unet-v1 |        DETR v1 |       Gate |
| ------------------------------- | ---------------------: | -------------: | ---------: |
| Topology-exact pages            |                22 / 29 |    **16 / 29** |  > 22 / 29 |
| Works with exact page           |                  6 / 6 |      **5 / 6** |      6 / 6 |
| Localization-exact pages        |                    n/a |        17 / 29 | diagnostic |
| Predicted classes `1/2/3-staff` |              fixed `3` | `0 / 10 / 112` |          — |
| 3-staff class exact             |              hardcoded |          0.826 | diagnostic |

两次无 overlay 的 CPU run 得到相同 `predictionsSha256`
`dd62611ed161a238ed1c05d23f85af73974f80daef3e33fbe92545413c020096`，canonical report SHA-256
`158d70e4018feb6523ac7a1fb6d2d955e93c9e8dfd7fdd7fc95a3f274c897187`。Y-band topology 与 DETR 二维
containment 同为 16/29，因此失败不是「中心在带内但 x 出框」。

失败 13 页：`center-out-of-band` 9、`count-mismatch` 3、`class-mismatch` 1。唯一的 class-mismatch 是
`6011095` 第 0 页把第一个 3-staff system 预测成 2-staff；localization 仍正确。也就是说，挡住 DETR 的不是
staff-count 头，而是真实扫描上的 system 切分与中心漂移。

与 UNet 的页集合并不嵌套：

| Overlap       | Pages |
| ------------- | ----: |
| both admitted |    13 |
| UNet only     |     9 |
| DETR only     |     3 |
| neither       |     4 |

DETR 在 `5862368` 第 3–5 页恢复了 UNet 失败的密集页，二维 box 在相邻 system 粘连处比 filled-band 更稳。它同时把
UNet 全过的 `4985990`（5/5）打成 0/5：第一页把人声谱表从 3-staff mixed system 里拆成额外 box，后续页中心漂移或
把末个 system 降成 2-staff。`4985990` 是 works-covered 从 6 降到 5 的原因。

## Decision

`STOP_DETR_V1_OLIMPIC`

跳过 1-staff synthetic gate 再跑真实集，这一步是对的：合成 3-staff exact 0.973 并没有变成真实扫描上的 22/29。
DETR v1 不能替换 `compact-layout-unet-v1`。产品 runtime 保持 `STOP`，不搜索 threshold，不把 Deformable DETR
或 OLA-style 配方再送到这 29 页。

下一步若继续 layout，应针对 UNet 剩下的 7 个真实失败页做 scan-domain 数据，而不是继续换 detector 家族。DETR
只证明二维 instance 对其中 3 页有互补，不足以成为新的投资主线。

完整逐页对照见 [`summary.json`](summary.json)。overlay 与 raw boxes 留在本机 cache，不提交 Git。
