# Harmony structured records checkpoint

## 合同

- Feature / transition feature：`semi-crf-linear-v1`
- Search：dense boundaries、`maxQuarterNotes=8`、Top-8
- Supervision：`contiguous-representable-subpaths-v1`
- Train/tune 只通过各自 role entry point；regression/final-holdout 被拒绝。
- Candidate miss、unsupported label、缺失边界和超长 segment 只切断监督窗口，不向产品候选注入 gold。

## 分片布局

首版把全部作品保留在单个对象中，完整 train 在约 4 GB V8 heap 上 OOM。已否定该布局，改为一个 manifest 加每乐章一个 shard：

- 每个 shard 独立 strict-schema parse、SHA-256、byte length、identity 与 count 校验。
- Manifest 只保存 provenance、aggregate 与 shard 索引。
- Loader 使用 async iterator，一次只保留一个乐章。
- 单组两次生成得到相同 manifest SHA `60a774d54d883ba6102358f6323a2bee210094901f41c3f272dad1b6337f2a03`。

## Mozart v2.3 资产

| split | pieces | windows |  ranges | candidates | gold segments | excluded | total bytes |
| ----- | -----: | ------: | ------: | ---------: | ------------: | -------: | ----------: |
| train |     30 |   1,793 | 402,139 |  3,208,482 |         6,223 |    2,497 | 939,626,188 |
| tune  |      9 |     411 | 110,778 |    884,030 |         1,560 |      597 | 259,023,326 |

Manifest SHA：

- train：`aadb6e2e0111a1a65bf3bcf9dac7a07e99c891de5eebfc837c95d35a6ea09d99`
- tune：`88518cbcc3fec918d0157afe131ed99d107fd8e068cea0ba7aaf1dc9e35b127f`

Train 总体积约 `0.94 GB`，低于 Task 27 朴素物化预算 `2.11 GB × 1.25 = 2.64 GB`。完整 train/tune 均通过 `harmony:structured-verify` 的 streaming round-trip。

## Checkpoint F

通过：

- Feature、transition、search 和 supervision version 在 manifest/shard 中固定。
- Gold 只标注已有 candidate index，不影响 lattice 或候选生成。
- Train/tune role 隔离与 final/regression 拒绝有单测。
- 资产可重复、可流式读取，体积在预算内。
