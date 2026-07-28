# Neural OMR engine 选型

## 结论

首轮第二引擎唯一选择 **Transcoda 59M zero-shot v1**。这里的“选择”只表示把它接入 CLI
并进入统一 development benchmark，不表示质量、许可证或产品分发已经通过。

锁定项如下：

- code revision:
  `d4e2e687d5679ae96ca4aa6f01e06a5b338cd488`
- model revision:
  `b529f8aa5d996d9224df3395b5b92d0867343c91`
- checkpoint SHA-256:
  `3ce7387b94776cd0edc4e5b70fbc2e28ac0f4c812d5f978d1ef26e236dccdafc`
- code license: `AGPL-3.0-only`
- weight license: `CC-BY-4.0`
- native output: Humdrum `**kern`

## 候选比较

| 候选      | Code / weights                                                   | Runtime 可用性                                                                    | 输出与接入成本                     | 结论                                                                |
| --------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| LEGATO 1  | MIT code；权重需接受 gated Llama 条款                            | reference environment 面向 Python 3.12、CUDA 12.4 和 11B vision model；本机未复现 | ABC；还需额外转换为 MusicXML       | 不选。访问、算力和转换链路都不适合作为首轮可复现 baseline           |
| LEGATO 2  | 论文公开；截至 2026-07-28 未找到公开可运行 repository/checkpoint | 不可复现                                                                          | 不能形成可锁定 adapter contract    | 不选。待公开 artifact 后可重新评估                                  |
| Transcoda | AGPL code；公开、非 gated 的 CC-BY-4.0 59M checkpoint            | 已在 macOS arm64 / MPS 实际运行                                                   | 原生 `**kern`，需要 `hum2xml` 转换 | 选择。它是当前唯一同时满足公开权重、可锁 hash、可在评测机运行的候选 |

许可证结论只允许在隔离的 CLI benchmark 中继续验证。`AGPL-3.0-only` 是未来分发风险，
本阶段不得据此批准 Desktop、Browser、服务端或任何 App 集成。

## 实际 smoke

在 Apple Silicon 评测机上，用 Python 3.11.9、PyTorch 2.9.1 和 MPS 加载锁定 checkpoint，
对由仓库 smoke MusicXML 渲染得到的一页 PDF 执行推理。checkpoint 下载后重新计算的 SHA-256
与 Hugging Face LFS 元数据一致。

执行结果：

- engine 和模型成功加载；
- PDF 页经过 rasterize 和 layout normalization 后完成推理；
- 生成 511 tokens，generation wall time 约 17.1 秒；
- 产出 `**kern` 文件；
- 输出出现重复 clef tokens，结构无效，不能算作质量通过。

这个结果满足“候选可运行”的选型门槛，同时把 `repetition / hit_max_length /
invalid native syntax` 固定为 development benchmark 必须独立统计的失败类别。真实质量结论只能来自
统一 corpus，不能由这份极简 smoke 推断。

## Environment bootstrap

以下步骤用于建立隔离环境；model 与外部 repository 不进入本仓库：

```bash
git clone https://github.com/btrkeks/transcoda.git
git -C transcoda checkout d4e2e687d5679ae96ca4aa6f01e06a5b338cd488
cd transcoda
uv sync --python python3.11 --no-dev
```

从固定 model revision 下载 `transcoda-59M-zeroshot-v1.ckpt` 后，必须先验证：

```text
sha256 = 3ce7387b94776cd0edc4e5b70fbc2e28ac0f4c812d5f978d1ef26e236dccdafc
```

Adapter 不直接依赖 checkout 的隐式当前状态。运行时通过显式 executable、checkpoint path、
model hash 和 decoder parameters 接入；外部 process 仍由 CLI 共用 cancellable runner 管理。
`**kern` 到 MusicXML 使用隔离的 `converter21==3.5.0` / `music21==9.9.1` process。选择这条路线是因为
Transcoda benchmark 引用的 legacy `hum2xml` 在当前 macOS toolchain 无法可复现构建；转换失败必须
保留为稳定失败，normalizer 不得猜测缺失音符或节奏。bootstrap 需要额外执行
`uv sync --group omr-ned`。

## 下一步约束

1. Adapter 保存 engine-native `**kern`、confidence sidecar 和 converter diagnostics。
2. `hit_max_length`、spine 数不一致、缺失 terminator 和 `hum2xml` failure 不得静默修复。
3. 只有可证明无歧义的 terminator 补全可以修复，并必须生成 repair diagnostic。
4. Development benchmark 同时比较 Audiveris 与 Transcoda；参数冻结后才能读取 holdout。
5. 若 Transcoda 质量通过但许可证不能接受，最终决策必须是 `INVESTIGATE`，而不是直接进入 App。
