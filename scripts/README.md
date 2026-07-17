# Harmony scripts

以下命令都从仓库根目录运行。需要 Node.js 与 pnpm；UCI/CMU 脚本会用 manifest 中的 SHA-256 校验数据归档。

## 快速开始

```bash
# 不依赖外部数据的 synthetic 正确性基线
pnpm harmony:eval

# 真实标注语料的独立评估
pnpm harmony:eval:uci /path/to/bach-choral-harmony.zip
pnpm harmony:eval:cmu /path/to/cma-dataset.zip

# 5,000-note 性能测试（默认 20 次，报告 P95）
pnpm harmony:benchmark
```

省略 UCI/CMU zip 路径时，评估脚本会从对应 manifest 的 `source` 下载归档；为了离线复现和避免重复下载，推荐显式传入本地文件。

数据清单：

- `test-fixtures/harmony/uci-bach-manifest.json`
- `test-fixtures/harmony/cmu-cma-manifest.json`
- `test-fixtures/harmony/corpus.json`（synthetic baseline）

## Synthetic baseline

```bash
pnpm harmony:eval
pnpm harmony:eval test-fixtures/harmony/corpus.json
```

参数是可选的 corpus JSON 路径，默认使用 `test-fixtures/harmony/corpus.json`。它用于验证固定 golden cases 和指标管线，不代表真实音乐上的准确率。

报告包含 Top-8 recall、resolved precision/coverage、boundary F1、ECE、分项准确率和性能摘要。

## UCI Bach 评估

```bash
pnpm harmony:eval:uci /path/to/bach-choral-harmony.zip

# 也可通过环境变量提供路径
HARMONY_UCI_ZIP=/path/to/bach-choral-harmony.zip pnpm harmony:eval:uci
```

语料按 chorale 分组为 train/tune/eval，默认报告隔离的 eval split。完整数据共 5,665 个事件，当前切分为 3,331/1,157/1,177。

## CMU CMA 评估

```bash
pnpm harmony:eval:cmu /path/to/cma-dataset.zip

# 也可通过环境变量提供路径
HARMONY_CMU_ZIP=/path/to/cma-dataset.zip pnpm harmony:eval:cmu
```

当前使用流行/键盘子集，排除 General MIDI channel 10 percussion。20 个文件含 1,911 个可解析和弦事件，当前 train/tune/eval 为 1,011/157/743。Precision、coverage 和 ECE 按标注窗口时长加权。

### 评估选项

UCI 和 CMU 脚本都支持：

```bash
# 只报告指定 split；可选 train、tune、eval
HARMONY_REPORT_SPLIT=tune pnpm harmony:eval:uci /path/to/uci.zip

# 只计算 candidate oracle，跳过完整序列解码
HARMONY_ORACLE_ONLY=1 pnpm harmony:eval:cmu /path/to/cmu.zip

# 实验性调整 alternatives 的学习排序权重，默认 20
HARMONY_RANKER_WEIGHT=10 pnpm harmony:eval:uci /path/to/uci.zip
```

注意：`HARMONY_REPORT_SPLIT` 的非默认诊断不会拥有完整 train calibration 上下文，不应拿它的 ECE 替代默认完整 eval 报告。`HARMONY_ORACLE_ONLY=1` 也只衡量正确标签是否出现在候选中，不衡量生产序列结果。

## 训练本地 ranker

先输出到临时文件检查，避免无意覆盖仓库中的生产模型：

```bash
pnpm harmony:train \
  /path/to/bach-choral-harmony.zip \
  /path/to/cma-dataset.zip \
  /tmp/harmony-ranker-model.json
```

也可以用环境变量提供两个输入：

```bash
HARMONY_UCI_ZIP=/path/to/uci.zip \
HARMONY_CMU_ZIP=/path/to/cmu.zip \
pnpm harmony:train
```

未提供第三个参数时，脚本会覆盖：

```text
packages/web-core/src/harmony/harmony-ranker-model.json
```

训练只使用非 eval group，并在模型中记录 corpus SHA-256、training groups 摘要、特征版本和算法版本。提交新模型前至少运行：

```bash
pnpm verify:fast
pnpm harmony:eval:uci /path/to/uci.zip
pnpm harmony:eval:cmu /path/to/cmu.zip
pnpm harmony:benchmark
```

## 性能 benchmark

```bash
pnpm harmony:benchmark

# 缩短本地迭代；最终证据应保留默认 20 次
HARMONY_BENCHMARK_SAMPLES=3 pnpm harmony:benchmark
```

输入是合成的 5,000-note、40 小节、四声部密集 C–E–G–B 音高集合。它只测运行性能，不测真实识别准确率。输出包括：

- `analysisP95Ms`：完整分析 P95，预算 5,000 ms。
- `previewReducerP95Ms`：Preview play/pause reducer P95。
- `cancelFeedbackP95Ms`：取消反馈 P95；两项 UI 预算均为 100 ms。
- `heapDeltaMb`：进程采样前后的 heap 差值，仅作资源门禁诊断。

## 指标解释

- `top8OracleRecall`：正确标签是否出现在独立生成的前八候选中。
- `top1Accuracy`：候选第一名是否正确。
- `resolvedPrecision`：被系统判定为 resolved 的结果中有多少正确。
- `resolvedCoverage`：有多少标注区间被判定为 resolved。
- `boundaryF1`：预测和弦边界与标注边界的一致程度。
- `expectedCalibrationError`：confidence 与实际正确率的偏差，越低越好。
- `precisionCoverageCurve`：不同拒识阈值下 precision 与 coverage 的权衡。

当前生产实现用规则候选进行主序列解码，本地 TypeScript ranker 只扩充和排序 Top-8 alternatives。评估脚本不要将 candidate oracle 与完整序列的 resolved/boundary 指标混为一谈。
