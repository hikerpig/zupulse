# Neural OMR engine 选型

## 阶段结论

首轮第二引擎唯一选择 **Transcoda 59M zero-shot v1**。这里的“选择”只表示把它接入 CLI
并进入统一 development benchmark，不表示质量、许可证或产品分发已经通过。

截至 2026-07-29，产品引擎选型仍为 `INVESTIGATE`。不得把首轮 benchmark 选择解释为
Desktop、Browser、服务端或其他消费级产品已经决定采用 Transcoda。

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

## LEGATO follow-up

2026-07-28 的后续验证重新打开 LEGATO 1。官方 `guangyangmusic/legato-demo` 已提供可锁定的
三页 PDF → ABC → MusicXML 链路，且同一份 `Dive-in-D.pdf` 在官方 Space 上得到比 Audiveris 和
Transcoda 更完整的可读结果。因此 CLI 增加 `legato` adapter 进入 development benchmark，但这不
推翻“首轮第二引擎选择 Transcoda”的历史结论，也不批准任何 App 集成。

当前状态：

- adapter、registry、artifact contract 和 fake-process tests 已实现；
- `guangyangmusic/legato` revision、model hash、Demo revision 和 Python dependencies 已锁定；
- ModelScope 的固定 base-model mirror revision 与五个 shard hash 已锁定；本地运行只保留并加载
  `MllamaVisionModel` 实际需要的 `vision_model.*` tensor，source shard hash 与锁定 mirror 一致；
- 2026-08-07 的整份三页输入虽然进程成功退出，但固定 `2048` decoder budget 在右手结束后生成 EOS，
  合并 MusicXML 的 P2 为空；该 run 不构成有效识别；
- 2026-08-08 改为逐页推理和转换，并在合并前拒绝任何页面的空 part。在 64 GB M2 Max 上以 MPS
  float16、`max_length=2048`、`num_beams=10`、`repetition_penalty=1.1` 完成三页
  `flower_day.pdf`，wall time `636.79s`，峰值 RSS 约 `5.31 GB`；
- 合并 MusicXML 的 P1 为 72 小节、614 个 note，P2 为 65 小节、592 个 note。双手不再为空，但 Draft
  validation 仍报告多个 blocking `VOICE_DURATION_MISMATCH`；该单例证明 runtime 可运行，不代表识别
  质量或可导出性通过，也不改变产品 `INVESTIGATE` / `STOP` 结论；
- float32 vision attention 会在 MPS 上 OOM；config-driven mixed bfloat16/float32 会触发 Metal
  linear abort，因此 GPU 路径统一使用与官方 CUDA Demo 一致的 float16。

完整锁定项见 `../engines/legato-environment.json`。在统一 development corpus 和 ground-truth
quality evaluation 完成前，LEGATO 状态仍为 `INVESTIGATE`。

## 消费级产品 follow-up

2026-07-29 复盘了本轮安装与运行成本。目标从“能否作为 development benchmark 运行”收紧为
“能否在普通消费级设备本地分发和推理”。当前记录如下：

| 候选         | 实际产品负担                                                                 | 当前判断                                                                |
| ------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| LEGATO       | adapter 权重约 410 MB，但仍依赖 Llama 3.2 11B Vision；基座下载约 21 GB       | 端侧安装体积和内存成本过高，只保留研究或可选云端路径                    |
| LEGATO-Small | 自身为 10.9M parameters / 43.7 MB，仍加载同一个 Llama 3.2 11B Vision encoder | 不能按小模型看待；官方还标注约 15 GB+ full-precision GPU memory         |
| Transcoda    | 58.8M parameters；F32 checkpoint 约 240 MB，且不依赖十亿级外部基座           | 当前最接近端侧候选，但尚未完成量化、性能、质量和许可证的产品 acceptance |
| Audiveris    | 不依赖大型神经基座，但需要 Java runtime                                      | 已对 `Dive-in-D.pdf` 实测；结果质量未达到本轮主观预期                   |
| HOMR/Oemer   | 小模型加分割、规则或 Transformer pipeline，可本地输出 MusicXML               | 仅列为后续调查项；尚未在统一 corpus 实测，且需单独审查 AGPL 与符号覆盖  |

本轮可复现事实：

- 官方 LEGATO Space 对 `Dive-in-D.pdf` 生成了 ABC 和 MusicXML，主观可读性优于本轮 Audiveris 与
  Transcoda 输出；artifact 保存在 `tmp/legato/`，但远端 Demo 结果不能算本地 runtime acceptance。
- LEGATO adapter、registry、运行环境检查和 fake-process tests 已接入 CLI；LEGATO 自身权重和隔离
  Python runtime 已安装。
- Meta gated access 在 CLI 上持续返回 `requires approval`，因此没有下载 11B vision encoder，也
  没有完成本地 `Dive-in-D.pdf` 端到端推理。
- Transcoda 已在 Apple Silicon / MPS 完成 smoke；模型可运行并生成 `**kern`，但该 smoke 输出存在
  repeated clef tokens，不能据此宣称质量通过。
- Audiveris 已完成真实文件运行，但主观效果不佳；仍可作为 benchmark baseline 或结构型 fallback，
  不能据此自动进入产品。

后续决策前必须补齐：

1. 用同一批真实 PDF 对 Transcoda、Audiveris 和候选小模型执行统一 benchmark。
2. 对 Transcoda 验证 ONNX/Core ML 可行性、8-bit/4-bit 量化、安装体积、峰值内存和 CPU/MPS 延迟。
3. 单独评估整页输入与 system/staff segmentation 的质量和复杂度。
4. 审查 Transcoda `AGPL-3.0-only` code 与 `CC-BY-4.0` weights 对预期分发方式的影响。
5. 在质量、性能、许可证和维护成本都有数据前，不作最终产品引擎决策。

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
