# 执行状态

## 已完成（2026-09-16）

- 源提取支持连续谱线、复合小节线、明确起始反复线、位置限定的速度/小节编号、标准调号及基本临时升降号。
- 完整音高建议支持单声部内唯一和弦对应；保持数量不符、曲线、tie、tuplet、未知记号与移调保护。
- 无法归属的升降号使该页对应谱表调号证据失效，未知音乐记号拒绝整页，不向后传播旧上下文。
- 实验性 `--pitch-correction-python` 与共享 pipeline 显式选项已接线；保留原始 Draft 和源证据，修改仅涉及音高，
  校验及 MusicXML 回环失败时全部回退。默认、Desktop、Remote 和 benchmark 均未启用。
- 修复导出结构比较器将 JSON 属性插入顺序误判为音高差异的问题，增加独立回归。
- registry 支持 `legatoSourcePitchCorrection`，将任务配置中的 Python 传给共享纠错流程，不需要第二条宿主路径配置。
  产品配置尚未开启此开关。提取脚本物化到私有临时目录，避免外部 Python 无法读取 ASAR 资源。
- Remote 在现有私有结果 manifest 中保存原始 Draft、最终 Draft、原始 XML 和纠错证据；验证身份、哈希和
  32 MiB 总预算。保存失败不发布结果，删除与过期清理沿用原有对象生命周期，公开 snapshot 不增加证据。

## 独立源谱准入

`independent-protocol.json` 在下载谱面前冻结 Vienna 4x22 的三首非 Mozart 作品、上游版本、候选代码哈希、
推理配置、预算和验收门槛。`materialize-independent.mjs` 可在新目录下载固定源谱并执行准入。
本次产物位于 `tmp/pdfs/legato-independent-v1/`，文件哈希见 `materialization.json`，准入结果见 `admission.json`。

三首原版 PDF 均为栅格内容；三首 MuseScore 4.7.4 重排版均因未知记号或谱表布局拒绝。
实际准入为 0/3，状态为 `not-evaluable`，未启动模型推理、未读取 truth 比较，也不能计为零回归。
不得降低既定门槛或调整候选后继续把这些作品算作独立验收集。

### 拒绝原因定位

`trace-admission.py <materialization-root>` 在冻结提取器上只读追踪拒绝位置，不改变准入结果或生成纠错证据。
使用同一个已安装 PyMuPDF 的 Python 运行即可复现。

- Chopin op.10/3 两页首先拒绝编号 `16` 和 `20`；op.38 第一页拒绝 `18`；Schubert 拒绝 `20`。
  数字基线均位于谱表顶线之上约 2 个线间距，但编号包围盒未满足“整体位于谱号之前”的保护条件。
  已查看 Schubert 整页渲染，确认 `20` 是系统首小节编号，不是八度指令。
- 仅在内存诊断中跳过这些边缘编号后，依次遇到 `a tempo`、`Andantino`、`cresc.`；op.10/3 第二页仍有
  `unassigned-glyph`。该诊断不写入证据、不计入准入，也不是经过验证的修复。
- op.38 第二页提取到 41 条长水平线，违反每个完整双谱表系统 10 条谱线的条件。
  尚未确认多出一条的具体来源，不应直接丢弃它或放宽取模条件。

旧候选的追踪入口固定对应提交 `d68dcc8`；候选哈希改变后该脚本会主动拒绝，不能用新规则覆盖原准入结论。

### 开发候选更新

已按先失败后修复的顺序，增加编号一致性、完整非音高表情文字、系统大括号和 SMuFL 力度字符支持。
新增编号放行要求至少两个系统的编号与源小节计数具有相同偏移；孤立、冲突编号及裸八度数字仍拒绝。
表情文字仅接受完整的 `a tempo`、`Andantino`、`cresc.`、`decresc.`，不按前缀吞掉附加指令。
大括号必须使用已知字体，位于系统左侧，并与下谱表底线对齐；力度字符覆盖标准已定义区间，不包含保留码点。
字形语义依据 [SMuFL 大括号](https://smufl.formats.music/latest/tables/staff-brackets-and-dividers.html)、
[重音](https://smufl.formats.music/latest/tables/articulation.html) 与
[力度字符](https://smufl.formats.music/latest/tables/dynamics.html)。

Schubert 开发回归现在可提取 66 个谱表小节、336 个符头，其中 25 个小节通过源证据检查。
这是提取覆盖，不是正确修改或识别提升；三首作品均已退出独立验收用途。Chopin 的其他文字、跨页孤立编号和
op.38 第二页长水平线分组尚未解决，默认开关保持关闭。没有改变原始协议和产物。

Schubert 真实推理已完成一次，使用默认解码参数和本地 `llama-3.2-11b-vision-only-448` 基座。
输出目录为 `tmp/pdfs/legato-production/schubert-development-v2/`；原始 XML SHA-256 为
`628b6ed899bac9d2faaef19c935e4fc7636f7269c84013dbc81a5548ccd6ed75`。
源与预测各谱表均为 33 小节，生成 6 条降号修正建议，但 `outcome=validation-failed`、`appliedCount=0`。
`draft.json` 与 `raw-draft.json` 哈希相同：`109d3df7694fbeb8b383d28ccf4f9c0ad60b7460ec1e6fbc8441b0757b7b14f2`。
原始 Draft 的独立 `validate` 命令以 7 退出，已有 8 条 `INVALID_TIE`，均在上谱表；并非应用修正后才出现。
没有放宽校验、移除 tie 或把建议计作已应用收益。本次 `recognize succeeded` 不代表可导出或生产可用。

源证据交叉检查：按源小节顺序、谱表和 `(diatonic, alter)` 多重集合，与生成 PDF 的原始 MusicXML 直接比较。
25 个可用谱表小节包含 131 个符头，集合差异为 0；该检查不验证时值、事件对应或模型准确率。
将该 MusicXML 直接交给现有 normalizer 会因第 16 小节下谱表负 onset 失败；未改写源谱绕过此问题。
因此本轮只报告受限的源音高核对，不报告完整 truth Draft 评测。

### 第二批独立验收

`independent-protocol-v2.json` 在读取谱面前锁定 MuseTrainer 上游版本、三个作品、当前候选和原有验收门槛。
选曲只使用文件名目录；不从结果中替换版本、裁剪谱面或更改规则。上游 README 自述为公版集合，单个版本的
权利状态未独立核实，因此源文件仅作本地评测，不随提交分发。

三首作品共 7 页，实际准入为 0/3：BWV Anh.114 两页、Gymnopédie No.1 三页、A 小调圆舞曲两页，
均至少有一页被谱表布局或未知记号保护拒绝。状态为 `not-evaluable`，未启动推理、未比较 truth。
产物位于 `tmp/pdfs/legato-independent-v2/`，原始及渲染文件 SHA-256 见 `materialization.json`。
协议 SHA-256：`5e8995f5df63b54b0eb246d0dcde2dad8f35ca74251974911bc76841c9459160`。

两次冻结独立批次都未产生可评测作品；修复后的开发谱也没有成功应用修改。
当前证据不支持打开生产默认开关。停止继续替换作品寻找通过样本；下一阶段若扩大源谱解析器覆盖，
应作为明确的新研发范围确认，而不是把有限生产接线悄然扩展为长期解析器开发。

### 局部几何缺陷复核

扩大研发范围尚未确认，仍先检查既有范围内的可复现缺陷。op.38 第二页第 41 条候选谱线实际是
`smorzando` 的延续虚线：PDF drawing 保留 `[ 2.976378 2.986541 ] 0` dash pattern，旧提取器丢弃样式后
把整段几何长度视为连续谱线。已查看整页渲染并核对 drawing 数据。

现在仅将明确空 dash array 的线段作为连续谱线和小节线证据；未删除文字，也未忽略八度指令。
失败测试修复后通过，真实该页从 41 条候选线恢复为 40 条，但仍因 `smorzando` 未支持而拒绝。
这是局部实现缺陷修复，不是第二批独立验收通过或扩大解析器范围的替代批准。

## 真实输出回放

使用 PyMuPDF 1.26.3 和当前 normalizer，直接读取原始 PDF 与既有未经人工纠错的 LEGATO MusicXML；
不运行新推理，不读取 truth 或历史修正 Draft。复现入口：

```bash
pnpm exec vite-node tasks/legato-pitch-shadow/check-source.ts \
  tools/pdf-omr-cli/reports/development/piano-recognition-v1-20260905/score-9.pdf \
  tools/pdf-omr-cli/reports/development/legato-decoder-v1-20260913-r2/score-9/baseline/engine/converted.musicxml \
  /absolute/path/to/legato-venv/bin/python
```

- score-9：源谱 40 个谱表小节、186 个符头；预测两个谱表各 20 小节。
  20 小节一致、15 个因源曲线拒绝、4 个因多声部拒绝；1 处完整音高差异。
  `P2-m11-s0-v1-e4` 从 C4/MIDI 60 修正为 B3/MIDI 59，应用后通过真实导出回环。
  PDF SHA-256：`5b7c61a760c41fc7ba2f4ff00a8cbc10acc1f07fad9cc7830a85d59016ee3b4d`；
  raw XML SHA-256：`933f2509e3c0cab68bd6b24a86bed55fc38b8b6ec247e3777b44a84f19c2b949`。
  在命令末尾增加新的输出目录，可经 `DesktopPdfOmrRuntime` 执行同一回放。
  本地证据：`tmp/pdfs/legato-production/desktop-score-9-replay-v1/`；实际应用 1 处修改并导出 MXL，结束后恢复空闲。
  MXL SHA-256：`655e4702d613ef11589864d76451ccd25652f277fceff4f6be6bce5edd20dfc5`。
  这不是新模型推理、UI 操作或独立评测。
- score-4：源谱 184 个谱表小节、783 个符头，预测各谱表 99 小节而源谱 92 小节，整份拒绝对齐。
  收紧未归属升降号保护后仍需刷新各页可用音高覆盖；几何总数不等于可修正覆盖。
  PDF SHA-256：`5697fee05e9b695e2cf3ec68a63e6bef2a207e81b9de6a365e552256ccc57428`；
  raw XML SHA-256：`1559e6eefc7712550fad56c01471c679c0da71ff41d959c8afefd108bf5a3f04`。
- 额外源预检：K282 的两个本地排版版本均因未知记号拒绝；ASAP Mozart 11/3 因复合小节线/记号拒绝；
  K331 reviewed 因谱表布局、小节线或记号拒绝。它们不是独立正向识别证据，也不能计为零回归样本。

## 验证

- Python 源提取单测：29 项通过，不依赖模型，新增规则均先验证失败测试。
- TS 建议与应用测试：21 项通过，包含唯一地址保护、真实导出回环及原始对象不变。
- CLI/共享 pipeline 测试：15 项通过，覆盖修正 MXL、原始产物保留、默认不变、失败回退、互斥参数、取消、registry 传参及脚本副本清理。
  使用假 engine/提取进程，不代表真实模型或宿主接入。
- MusicXML 属性顺序回归：4 项通过。
- Remote worker 与证据读取测试：17 项通过，覆盖哈希、输入身份、预算、路径白名单、发布失败、删除和过期清理。
- `pnpm verify:fast`：通过 context、arch、design、docs、i18n、format、lint、typecheck；279 个测试文件、1,416 项测试通过。
- registry 测试：6 项通过；打包 smoke 单测：2 项通过，保留原有真实进程树取消回归。
- 最终记录更新后再次检查格式、文档和 `git diff --check`。
- `pnpm desktop:build`：通过 Main、Preload、Renderer 构建。
- `pnpm desktop:verify:pdf-omr-runtime`：macOS arm64 打包与常规 runtime smoke 通过。
- `node apps/desktop-shell/scripts/verify-pdf-omr-runtime.mjs /absolute/path/to/legato-venv/bin/python`：
  已使用真实 PyMuPDF 1.26.3 通过 ASAR 内资源执行验证。检查源证据及输入哈希，提取失败回退不能使此 gate 通过。
  输入是确定性非谱面 PDF，因此验证提取执行与安全拒绝，不验证打包后的正向纠错或 UI。
- 尚未运行宿主 UI E2E，未合并或发布。代码及两批独立准入失败记录已推送至 PR #70，
  PR 标题与说明已更新为默认关闭的 opt-in 接入，并明确标记生产默认验收未通过。

## 下一步与停止条件

1. 确认是否扩大为新的源谱解析器研发阶段。当前默认启用门槛未通过；不继续换曲或放宽验收。
2. 验证两个宿主完整路径；Remote 证据生命周期测试不等于真实对象存储或真实模型验收。
3. 运行真实生产路径正例及宿主预览/导出验证；独立门槛通过后才启用经过验证的输入范围。
4. 更新契约与 PR，分别报告代码集成、PR 推送与实际发布状态。

生产接入目标仍未完成。不得用默认关闭、所有独立谱拒绝、合成测试通过或单首开发谱收益代替默认准入。
