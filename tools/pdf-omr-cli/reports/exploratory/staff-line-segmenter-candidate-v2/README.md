# Staff-line segmenter candidate v2

状态：`synthetic-line-gate-passed`。v1 的两次 pooling 在 512-width 输入上把 3–5 px staff spacing 压缩到不足
1 pixel，预测退化为 staff bands。v2 只修正这一根因：使用无下采样的 dilated CNN，其他 slice、seed、loss、epoch 与
设备保持不变。

- Architecture：`compact-dilated-staff-line-cnn-v2`，1,841 parameters。
- Training：512 train / 128 validation、MPS、3 epochs、batch size 2、seed `20260901`。
- Validation Dice：0.7436、0.7379、0.7692。
- Checkpoint SHA-256：`e7f71ae048b91beddcc0ce383bcd51173b891e8e24199950fc1cd4e3c40de02b`。
- 固定 row evidence（probability 0.90、horizontal coverage 0.30、y tolerance 2 px）：precision 0.9883、
  recall 0.9994、F1 0.9938，88/128 pages raw line-exact。
- 只接受五条完整等距 evidence 的 deterministic template filter 后：precision 1.0000、recall 0.9968、F1
  0.9984，124/128 pages line-exact；其余页面 fail closed，不做猜测性补线。

该结果通过 synthetic line extraction checkpoint，但尚未证明 staff→system topology，也未运行 OLiMPiC。下一阶段复用
页面左侧 connector evidence 组合 1–3 staves，并在真实扫描 development set 上运行两遍。

```bash
python3 tools/pdf-omr-cli/scripts/train_staff_line_segmenter.py \
  --dataset-root /path/to/openscore-staff3-dataset \
  --slice /path/to/staff-line-training-slice-v1.json \
  --output /path/to/candidate-v2 \
  --architecture compact-dilated-staff-line-cnn-v2 \
  --epochs 3 \
  --batch-size 2 \
  --device mps
```
