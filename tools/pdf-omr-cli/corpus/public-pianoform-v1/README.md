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
