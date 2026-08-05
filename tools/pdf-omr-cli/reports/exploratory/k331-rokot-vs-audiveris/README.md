# rokot-omr-2b 在 K331-3 上的本地测试

> Status: exploratory evidence。本文及同目录 artifacts 不属于 frozen development / holdout
> protocol，不是 canonical aggregate report，也不修改当前 PDF OMR `STOP` 决策。当前解释见
> [`docs/evaluation/pdf-omr.md`](../../../../../docs/evaluation/pdf-omr.md)，评测目录说明见
> [`tools/pdf-omr-cli/docs/evaluation.md`](../../../docs/evaluation.md)。

## 结论

模型对干净或中等复杂度的钢琴双谱表 system 表现很好，但还不能直接承担整页 PDF 到可编辑 MusicXML 的无人值守转换。

- 3 个抽样 system、合计 217 个真值音符 token。
- 自定义 pitch NED：`20 / 217 = 0.092`（越低越好）。
- 自定义 pitch+duration NED：`37 / 217 = 0.171`（越低越好）。
- 三段 rokot-ABC 均可由 `abc2xml` 转成 MusicXML。
- 其中两段可被 MuseScore 4 导入；`p1-system-05-m20-26.xml` 被 MuseScore 4 拒绝。

这里的 NED 是对音符 token 序列做 Levenshtein edit distance，再除以真值 token 数；它不是模型作者排行榜所用的 full-MusicXML OMR-NED，不能横向比较。

## 分段结果

| 片段                        | 谱表   | 真值 / 输出 token | pitch NED | pitch+duration NED |
| --------------------------- | ------ | ----------------: | --------: | -----------------: |
| p1 system 1（0–5）          | treble |           34 / 33 |     0.029 |              0.059 |
| p1 system 1（0–5）          | bass   |           34 / 34 |     0.000 |              0.000 |
| p1 system 5（20–26，含 X2） | treble |           34 / 34 |     0.000 |              0.000 |
| p1 system 5（20–26，含 X2） | bass   |           43 / 41 |     0.093 |              0.186 |
| p5 system 3（105–109）      | treble |           36 / 32 |     0.222 |              0.306 |
| p5 system 3（105–109）      | bass   |           36 / 32 |     0.194 |              0.444 |

主要错误集中在密集的短倚音/装饰音、低音快速分解和弦、以及把红色分析标注附近的符号误判为装饰记号。普通主旋律、调号、拍号、双谱表分配、重复记号与多数和弦音高识别得很好。

## 环境与命令

- Apple Silicon, 64 GB RAM
- `llama.cpp 10200`
- `rokot-omr-2b-Q8_0.gguf` + `mmproj-rokot-omr-2b-f16.gguf`
- 输入：PDF 以 170 DPI 渲染为 1405 px 宽 PNG，并按单个 system 裁切
- prompt：`Transcribe this staff to rokot-ABC.`
- generation：`1600` tokens、temperature `0`
- 单段端到端约 15–23 秒（包含模型加载）

模型文件通过：

```bash
HF_XET_HIGH_PERFORMANCE=1 hf download rokotmidi/rokot-omr-2b \
  --include 'rokot-omr-2b-Q8_0.gguf' \
  --include 'mmproj-rokot-omr-2b-f16.gguf'
```

推理命令模板：

```bash
llama-cli \
  -m rokot-omr-2b-Q8_0.gguf \
  -mm mmproj-rokot-omr-2b-f16.gguf \
  --image system.png \
  -p 'Transcribe this staff to rokot-ABC.' \
  -n 1600 --temp 0 --single-turn --reasoning off
```

## 与 Audiveris 5.11.0 的同输入比较

Audiveris 对同一份 6 页 K331 PDF 完成了整页识别和 MXL 导出，用时约 `159.5s`。在 Rokot 抽样的同三个 system、同 217 个真值音符 token 上，以相同脚本计算：

| Engine            | pitch NED | pitch+duration NED |
| ----------------- | --------: | -----------------: |
| rokot-omr-2b Q8_0 |     0.092 |              0.171 |
| Audiveris 5.11.0  |     0.456 |              0.493 |

分段 Audiveris 结果：

| 片段                        | 谱表   | 真值 / 输出 token | pitch NED | pitch+duration NED |
| --------------------------- | ------ | ----------------: | --------: | -----------------: |
| p1 system 1（0–5）          | treble |           34 / 27 |     0.206 |              0.206 |
| p1 system 1（0–5）          | bass   |           34 / 34 |     0.000 |              0.147 |
| p1 system 5（20–26，含 X2） | treble |           34 / 20 |     0.412 |              0.412 |
| p1 system 5（20–26，含 X2） | bass   |           43 / 29 |     0.326 |              0.326 |
| p5 system 3（105–109）      | treble |            36 / 4 |     0.917 |              0.972 |
| p5 system 3（105–109）      | bass   |            36 / 8 |     0.861 |              0.889 |

因此在这个受控 K331 抽样上，Rokot 的 pitch NED 比 Audiveris 低约 `79.8%`，pitch+duration NED 低约 `65.3%`。这说明 Rokot 的符号识别质量明显更好；Audiveris 的优势是可直接处理整页、自动做 system segmentation，并一次导出整份 MXL。Rokot 当前仍需要外层裁切、逐 system 推理和拼接流水线。
