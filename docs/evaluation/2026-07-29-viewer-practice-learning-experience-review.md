# Viewer 跟练与学习体验评审

- 评审日期：2026-07-29
- 评审对象：Browser Viewer
- 目标用户：
  - 学琴半年、几乎不懂乐理的新手
  - 能看谱但不熟悉数字音乐工具的钢琴教师
- 评审方式：以新用户身份完成实际操作，不以代码能力推测产品体验

## 评审范围与限制

为继续验证 Viewer，本次从 Library 空态主动添加内置
`First Light Practice` 样例，并在同一 Viewer 中完成：

- 播放、暂停与停止；
- BPM 精确输入与 100% / 75% / 50% / 25% 预设；
- Loop Mode 开关；
- A/B 边界、按拍/按小节吸附、区间保存与命名；
- Continuous Follow / Page Turn 选择；
- 谱面宽度与缩放入口；
- 练习设置和轨道设置浏览。

短样例无法充分验证长谱翻页、复杂反复、多轨总谱与长时间播放。评审工具也没有对实际音色、
音频延迟和扬声器响度做主观评价。

## 当前体验结论

Viewer 已经是一款干净、克制、可用的跟随式乐谱播放器。它能够回答：

- 从哪里开始播放；
- 以什么速度播放；
- 重复哪一段；
- 谱面怎样跟随。

它还没有形成完整的学习闭环：

> 我应该练什么 → 应该怎样练 → 我弹得对不对 → 今天是否进步 → 老师如何继续指导

因此，下一阶段不宜只继续增加平级参数。产品应把既有 Transport、Loop 和 Track 能力组织成明确的
练习任务，并补上节拍准备、分手练习、演奏反馈和教师回传。

## 当前做得好的部分

### 乐谱与播放关系清楚

乐谱保持绝对视觉中心。播放头和当前区域高亮足以让用户理解“现在播到哪里”，底部 Transport
没有侵占谱面阅读面。

### 变速能力直接

实际 BPM 和相对速度同时出现，既适合教师使用节拍值，也允许新手选择 75% 或 50% 等直观预设。
精确输入和常用预设在同一浮层中，学习成本较低。

### Loop 已具备成为学习单元的基础

Loop 不是简单的时间 Slider。用户可以直接在谱面上看到 A/B、拖动边界、选择按拍或按小节吸附，
并把区间保存、命名和设置独立速度。这些能力适合继续升级为“练习片段”。

### 导航模式保持克制

Continuous Follow 与 Page Turn 放在低频入口，没有长期占据 Transport。对新手而言默认行为可直接
使用，对教师而言又保留稳定翻页选择。

## 主要体验问题

### 工具存在，但练习目标缺席

“练习设置”目前由播放速度、设置循环区间、选择主轨道组成。新手必须先理解 BPM、A/B 和 Track，
再自行组织练习。教师也无法把“右手练五遍，从 60 BPM 到 72 BPM”保存为一个明确任务。

### 开始播放没有准备阶段

本轮操作中没有发现节拍器和预备拍。用户点击播放后必须立即进入演奏。对需要把手放回琴键的新手，
以及需要建立稳定速度的学生，这是高频阻力。

### Track 不是钢琴教学语言

当前轨道任务提供主轨道、附加显示、Mute、Solo 和 Volume。它适合数字音乐工具用户，但钢琴师生
使用的是“左手、右手、双手”和“哪只手由系统示范”。钢琴 grand staff 保存在同一个 Track 时，
Track 级控制也无法表达分手练习。

### Loop 保存状态不够明确

点击“保存区间”后出现“当前”、自动名称和速度字段，但页面仍显示“练习设置尚未保存”。用户难以
判断区间已经保存、仍在草稿中，还是等待另一个提交动作。

### 本地深链缺少恢复路径

当 URL 中的 `libraryScoreId` 在当前设备或浏览器不可恢复时，页面只显示“重试”。它没有解释
馆藏只存在本地，也没有提供“重新定位文件”“返回曲谱库”“导入曲谱”或“使用样例”。

## 能力建议与优先级

| 优先级 | 能力                 | 新手价值                       | 教师价值                   |
| ------ | -------------------- | ------------------------------ | -------------------------- |
| P0     | 节拍器与预备拍       | 获得稳定拍点和开始准备时间     | 可明确教学速度与起拍方式   |
| P0     | 左手、右手、双手练习 | 降低双手合奏难度               | 直接布置分手练习           |
| P0     | 引导式练习任务       | 不必理解底层参数               | 保存区间、速度、次数与目标 |
| P0     | 自动递增速度训练     | 从可完成速度逐步达到目标       | 避免每轮手动调速           |
| P1     | Wait Mode 与演奏反馈 | 弹对才继续，理解错音和节奏问题 | 定位学生卡点               |
| P1     | 键盘、指法与节奏计数 | 建立谱面、琴键和手指联系       | 按学生水平开关辅助         |
| P1     | 录音对比与练习历史   | 听见问题并看到进步             | 收取演奏并按小节反馈       |
| P2     | 教师任务与学生回传   | 获得明确课后清单               | 形成布置、提交、评语闭环   |

## 首轮推荐范围

首轮优先交付：

1. 节拍器与一小节预备拍；
2. 双手示范、练右手、练左手；
3. 对应设置按 Library Score 保存在 Practice Sidecar；
4. Browser 与 Desktop 行为一致；
5. 明确音频不可用、非钢琴谱和手部结构不可识别时的降级。

这组范围能复用现有 `PlaybackController`、alphaTab、练习设置和持久化链路，同时第一次把产品从
通用 Track Mixer 推进到钢琴教学语言。

详细目标规格：
[`Viewer 基础练习能力产品 Spec`](../specs/2026-07-29-viewer-foundational-practice-tools-product-spec.md)。

## 竞品参考

- Soundslice：
  [Metronome and count-in](https://www.soundslice.com/help/en/player/basic/8/metronome-and-count-in/)
- Soundslice：
  [Speed training](https://www.soundslice.com/help/en/player/basic/286/speed-training/)
- Soundslice：
  [Looping](https://www.soundslice.com/help/en/player/basic/4/looping/)
- Soundslice：
  [Focus mode](https://www.soundslice.com/help/en/player/basic/277/focus-mode/)
- Soundslice：
  [Visual piano keyboard](https://www.soundslice.com/help/en/player/advanced/20/visual-keyboard/)
- Soundslice：
  [Practice tracking and history](https://www.soundslice.com/help/en/player/notebook/283/practice-tracking/)
- Soundslice：
  [Performances for Teacher accounts](https://www.soundslice.com/help/en/teaching/teaching/182/performances/)
- flowkey：
  [Wait Mode、分手、慢速与循环](https://www.flowkey.com/en)
