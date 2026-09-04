# Staff-line segmenter candidate v1

状态：`trained-needs-topology-postprocessing`。这是 shared detector 的第一个且唯一 compact candidate，保持 research-only。

- Architecture：`tiny-staff-line-unet-v1`，29,617 parameters。
- Slice：512 train / 128 validation；完整保留含 1/2-staff 的稀有训练页，只 hash-sample 63 个纯 3-staff 页。
- Training：MPS、3 epochs、batch size 2、seed `20260901`；未做 architecture sweep。
- Validation Dice：0.4659、0.4662、0.4631，第三轮没有继续改善。
- Checkpoint SHA-256：`b38394d76cfb84cd92d6da17a564ee3c32ef8f60f46b9cf363c5fd7c960fe4c4`。

对 128 页 validation 做固定 row-evidence probe：probability threshold 0.90、horizontal coverage 0.25、y tolerance 2
pixels 时，line precision 0.9848、recall 0.6784、F1 0.8034；未经 spacing reconstruction 只有 11/128 页达到
exact line count。可视审计显示预测形成连续 staff-line evidence，但密集音符处会漏线或变粗。

因此不增加 epoch、不扩大数据集。下一步按既定设计实现 deterministic spacing/group reconstruction，以高 precision
观测补齐同一 staff 内缺失的五线，再评估 synthetic topology；未通过前不运行产品 runtime 或 engine integration。

复现训练：

```bash
python3 tools/pdf-omr-cli/scripts/train_staff_line_segmenter.py \
  --dataset-root /path/to/openscore-staff3-dataset \
  --slice /path/to/staff-line-training-slice-v1.json \
  --output /path/to/candidate-v1 \
  --epochs 3 \
  --batch-size 2 \
  --device mps
```
