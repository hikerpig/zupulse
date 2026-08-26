# OLA v2 dependency gate

> Status: screening stopped，完成于 2026-08-26。未下载权重、未安装 Python dependency、未执行模型，也未读取
> frozen holdout。

## 结论

`v-dvorak/omr-layout-analysis` 的任务与当前瓶颈匹配：公开仓库标注 system、stave 与 grand-staff classes，
`ola-v2.0` release 提供一个 40,530,853-byte 权重文件，仓库 source license 为 MIT。但是该 release 使用
`ultralytics==8.3.4`，OLA 仓库没有单独声明 release weights license；Ultralytics 当前官方许可说明则把其代码、
模型与由其训练得到的模型默认置于 AGPL-3.0，proprietary/private use 需要商业许可。

因此该候选在 artifact 下载、依赖安装和 development inference 之前即命中 distribution/license `STOP`。不能因为
OLA source repository 是 MIT，就推断 `.pt` weights 与 Ultralytics inference stack 可以进入 Desktop。后续只有在
取得适用的商业许可，或替换为 source、weights、training data 和 runtime 均具有明确可分发许可的候选后，才能补齐
transitive licenses、architecture、unpacked size、CPU latency/RSS、offline 与 determinism probe。

机器可读 screening 位于 `summary.json`。它只记录候选淘汰证据，不是可运行的 model identity，也不构成 runtime
integration approval。
