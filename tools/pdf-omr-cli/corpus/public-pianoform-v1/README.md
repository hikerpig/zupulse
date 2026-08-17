# Public pianoform v1

此目录只定义公开 pianoform benchmark 的生成入口，不提交 OLiMPiC、FP-GrandStaff archive、模型或生成的
输入文件。真实 `selection.json` 与 manifests 必须由锁定 release 的本地 inventory 生成，随后与对应 assets
一起放在独立 corpus root 中运行。

```bash
python3 tools/pdf-omr-cli/scripts/build_public_pianoform_benchmark.py \
  --inventory /absolute/path/to/public-pianoform.inventory.json \
  --output-directory /absolute/path/to/public-pianoform-v1
```

同一 inventory 重复执行必须产生 byte-identical 输出。生成后的 manifest 仍会在 benchmark 启动前逐项验证
相对路径与 SHA-256；selection 成功不表示 assets、ground truth 或 engine 已 ready。

`olimpic-selection.json` 还包含 report-only 的 `position-supplement-development`：它选择
`standard-development` works 中尚未覆盖的 10 个 ready middle systems。锁定 release 的 4 个 ready last
systems 已全部进入标准集，因此无法继续增加 last 样本；标准集与补充集并集为 first 31、middle 11、last 4。

候选 selector 的 development-only 协议见 `repair-selector-protocol.json`。它按 `workId` 锁定 18/18
calibration/validation split，validation selection 在冻结 candidate hash 前不得读取 GT；即使通过至少 35 个候选、
零回归、95% Wilson lower bound 不低于 0.90 的 gate，也只允许进入独立 runtime design review，不允许自动应用。
