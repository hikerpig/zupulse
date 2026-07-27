# Harmony Analysis 性能优化总结

## 结论

Harmony Analysis 的 production analysis-only 中位耗时从 `27.87 s` 降至 `4.91 s`，约提升
`5.7×`；最大 RSS 从 `516,849,664 bytes` 降至 `484,098,048 bytes`。优化前后输出均为 121 个
segments，canonical checksum 完全一致。

本轮没有引入 WASM。性能剖析表明瓶颈主要来自重复区间扫描、字符串查表和临时对象分配，而不是一个
适合迁移到 WASM 的集中数值内核。消除这些 TypeScript 层面的结构性浪费后，已经满足 5 秒目标。

## 优化方式

### 1. 先建立可重复的性能基线

基准测试使用固定 K331 输入，每个样本在独立 process 中执行，并记录：

- analysis-only 耗时；
- 最大 RSS；
- segments 数量；
- canonical checksum。

checksum 是优化的正确性护栏：只有性能改善且结果逐字节等价，优化才成立。

### 2. 将字符串权重编译为数值表

热路径原本反复使用 feature name 做字符串查找。初始化时将 feature weights 编译为数字索引和 typed
tables 后，分析循环只进行数组访问。

收益来自减少字符串哈希、对象属性访问和临时值处理；这种优化适合 feature 集合稳定、但评分次数极多
的场景。

### 3. 跨 label 复用 range evidence

同一个 event range 会被多个 harmony labels 反复评分，但音符覆盖、bass 和节拍等区间事实并不会随
label 改变。把这些事实按 range 缓存后，只计算一次，再由各 label 复用。

核心原则是把：

```text
range × label × 重复扫描
```

改成：

```text
range × 一次取证 + label × 轻量评分
```

### 4. 用 prefix evidence 消除区间重复扫描

figuration、role coverage、duration 和 pitch-class evidence 改为 prefix-addressable typed arrays。
任意区间统计由两次前缀读取和一次减法得到，不再遍历区间内的全部事件。

同时使用 bitmask、紧凑整数数组、数组式 label lookup 和无分配 helper，减少热循环中的对象创建与
垃圾回收压力。duration 在数值安全时使用 `Uint32Array`，否则回退到 `Float64Array`；accent 使用
`Float32Array`，因为当前权值可以被精确表示。

### 5. 将分析移入 Worker

Web 和 Desktop 通过相同的 module Worker 执行分析：

- Renderer 主线程不再被数秒计算阻塞；
- `AbortController` 取消时直接终止 Worker；
- 新分析替换旧分析、离开页面和 dispose 都能可靠取消；
- 协议使用 Zod 校验，并返回稳定错误码。

Worker bundle 使用窄入口，避免通过 package barrel 意外把 alphaTab 等浏览器依赖打入 Worker。
真实 Chromium/Electron E2E 中，分析期间事件循环最大延迟不超过 `50 ms`，取消后保留已保存的
Document。

## 结果

测试环境为 Apple M2 Max、Node `v22.22.1`，目标 commit 为
`ce98a2914e7dfe70d37f51991e28711d6575a32a`。一次 warm-up 后，在隔离 process 中采集五个样本：

| Sample | Analysis-only |
| -----: | ------------: |
|      1 | `5,054.43 ms` |
|      2 | `4,797.78 ms` |
|      3 | `4,925.84 ms` |
|      4 | `4,913.62 ms` |
|      5 | `4,774.76 ms` |

| 指标     |              优化前 |              优化后 |
| -------- | ------------------: | ------------------: |
| 中位耗时 |           `27.87 s` |            `4.91 s` |
| 相对速度 |                `1×` |           约 `5.7×` |
| 最大 RSS | `516,849,664 bytes` | `484,098,048 bytes` |
| 输出     |        121 segments |        121 segments |
| checksum |         基准 golden |      与基准完全一致 |

输入规模为 1,607 个 pitched notes、793 个 basic events、62 个 labels、最长 20-event span，共
971,540 个 segment-label potentials。

## 为什么不使用 WASM

优化后的 cold profile 总耗时为 `4.887 s`，最大 self-time entry
`collectPaperSemiCrfSegmentFeatures` 为 `1.093 s`，约占 22%；其后的 figuration `forRange` 和
`addPrefixRange` 分别为 `0.448 s` 与 `0.350 s`。

没有单一、连续、typed-array-ready 的数值内核达到 40% WASM spike 门槛。即使把最大 entry 假设为
零成本，整体增量收益也不足 30% adoption gate。此时引入 Rust/WASM 会增加：

- 第二套构建与调试链路；
- JS/WASM 数据交换和内存管理成本；
- Browser、Electron 与测试环境的部署复杂度。

因此当前保留 TypeScript。只有未来 profile 出现占比足够高、边界清晰且数据布局稳定的数值内核时，
才值得重新评估 WASM。

## 可复用经验

1. 先用稳定输入、隔离进程和 golden checksum 建立可信基线。
2. 优先优化算法的数据复用方式，而不是先换运行时。
3. 热路径中先消除重复扫描、字符串查找和对象分配。
4. prefix sum、typed arrays 和 bitmask 很适合大量重叠区间统计。
5. Worker 改善的是交互响应和取消能力，不等同于缩短 CPU 计算时间。
6. 是否采用 WASM 应由 profile 和收益门槛决定，而不是凭“计算密集”直觉决定。

完整评测数据见 [`semi-crf.md`](./semi-crf.md)，系统边界与并发语义见
[`harmony-analysis-system.md`](../architecture/harmony-analysis-system.md)。
