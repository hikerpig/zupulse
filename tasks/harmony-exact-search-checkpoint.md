# Harmony Semi-CRF Task 28 exact-search checkpoint

## 实现

- Production 默认仍是 `beamWidth=16`、`maxSpan=16`；只有显式 `sequenceSearchMode: "exact"` 才启用 exact semi-Markov Viterbi。
- Exact 按 canonical chord JSON key 为每个 end boundary 保留最佳前驱，分数相同时保留首次到达状态，结果确定。
- `maxSegmentQuarterNotes=8` 通过每个 end boundary 的最早合法 start index 实现，不再用 dense event 数量近似音乐时值。
- 解码状态使用 backpointer，不复制完整路径；不再可能成为前驱的 boundary states 会被及时释放。
- Range features 与 Top-8 在当前 end-boundary 窗口内惰性缓存，每个合法 range 最多构建一次。窗口结束即释放；已选 candidate 通过 `WeakMap` 取回 features，避免 postprocess 重算和全曲常驻缓存。

## Mozart tune 同合同 benchmark

命令：

```bash
pnpm -s harmony:structured-benchmark <beam|exact> /private/tmp/harmony-data
```

两种模式都固定 dense boundaries、`maxQuarterNotes=8`、Top-8、9 首 tune pieces，共 `256,103` ranges。结果是单进程依次处理全部作品的 P95 与进程最大 RSS：

| mode  | P95          | max RSS   | exact / beam |
| ----- | ------------ | --------- | ------------ |
| beam  | 69,800.90 ms | 965.84 MB | —            |
| exact | 47,203.66 ms | 423.61 MB | 0.68x        |

Exact 没有超过 `1.5x` runtime 门禁，峰值 RSS 也低于同合同 beam。这里的绝对时间包含 DCML 全曲上大量 range 的规则候选生成，后续 structured records 必须继续使用紧凑索引，不能物化 Task 27 的全语料槽位上界。

首版全曲 `Map` cache 曾在旧 beam 搜索合同下达到约 `2.37 GB` 最大 RSS，已否定。窗口 cache 将同一旧合同降到约 `627 MB`；最终同合同 exact benchmark 为上表结果。

## 验证

- 穷举式小 fixture 覆盖 narrow beam 丢失全局最优而 exact 找回。
- Stable tie 与 range contract 有确定测试。
- Analyzer diagnostics 验证每个合法 range builder 只执行一次。
- Harmony 单测与 TypeScript typecheck 通过。
