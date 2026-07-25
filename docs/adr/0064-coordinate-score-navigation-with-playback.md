---
status: accepted
---

# Coordinate score navigation with playback over one alphaTab layout

Viewer 将在同一个 alphaTab 纵向 Page layout 上提供设备级 `Continuous Follow Mode` 与
`Page Turn Mode`。前者按完整谱表行短动画跟随，后者把当前视口可容纳的完整谱表行投影为
`Screen Score Page` 并离散切换；两种模式不重建播放器或逐页重渲染 alphaTab。Viewer 在
`postRenderFinished` 后从 alphaTab 公开的 `boundsLookup.staffSystems` 生成导航投影，缩放或
视口变化后以播放头或用户浏览的谱表行重新计算。

启用的 Loop Region 跨越普通页边界时，如果涉及的完整谱表行可以同时放入当前视口，Viewer
临时围绕 Loop 重组 Screen Score Page，避免短循环每轮往返翻页；内容超过一屏时不缩放或拆行，
继续按正常页边界切换，关闭或更换 Loop 后恢复普通分页。

alphaTab 继续拥有音频时钟、播放游标、beat 命中和完整谱面坐标系；应用拥有手势解释、
Written Position 到 Playback Occurrence 的解析、Score Follow State 和视口导航。手动浏览进入
`Detached`，明确 seek、停止或“回到播放位置”恢复 `Following`。进度拖动通过按动画帧合并的
`Scrub Preview` 更新 alphaTab 游标，只在目标行或页变化时直接调整视口，松手后才提交正式 seek。

谱面单击先产生 Written Position，再解析成唯一 Playback Occurrence。存在多个 occurrence 时，
系统优先选择与当前播放头相同的反复或跳转路径；当前路径不存在该位置时选择播放头之后最近的一次，
之后也不存在时回退到首次 occurrence。定位保持 playing/paused transport 不变。应用拥有谱面手势
到播放命令的唯一解释权：单击或轻触产生 seek，拖动用于浏览，捏合用于缩放；alphaTab 不再通过
内建用户交互直接 seek 或把普通拖动改成播放区间。

`PlaybackController` 是 transport、Playback Occurrence、Loop、正式 seek 与持久化的语义入口；
Viewer DOM 边界中的 Score Navigation Coordinator 直接消费 alphaTab 公开的 beat bounds、游标
回调与用户导航意图。React 只展示导航模式、页码、Following 状态和降频后的 transport snapshot；
逐帧游标几何、滚动位置和 Scrub Preview 不进入 React state。除明确标记且不持久化的预览端口外，
用户定位不得绕过 PlaybackController。

该方案以一次布局和稳定坐标换取一致的播放、点击与翻页语义，并可复用 alphaTab lazy rendering；
代价是 Screen Score Page 只是一份随视口变化的临时布局投影，不能作为持久页码或打印分页。
首版不使用 alphaTab Horizontal 长卷布局，不逐页重载曲谱，也不自研谱表虚拟化。

Score Navigation Mode 是设备级 Viewer 偏好，不进入 Practice Sidecar。首次使用时 iPad 默认
Page Turn，Desktop 与 Browser 默认 Continuous Follow；用户选择后，窗口变化或设备旋转只触发
重分页，不自动切换模式。Following / Detached 只属于当前 Viewer Session。播放中切换模式不暂停、
不 seek、也不重建 alphaTab；系统取消旧导航动画，以当前播放头重建投影并恢复 Following。

## Initial validation scope

首轮实现只以 Web 为验收平台，覆盖 Browser Demo 的桌面与 iPad 尺寸视口、鼠标、触控板等价输入
和触控模拟。iOS WebView、Xcode、实体 iPad 与原生性能测试不属于本轮完成条件；它们在 iPad
Practice Player 进入对应实现阶段后独立验收。

Web 性能验收使用 Chromium 的 1440×900、768×1024 与 1024×768 视口。alphaTab 游标不经过
React 并保持流畅；Scrub 输入到视觉反馈目标低于 50ms，每帧最多处理一个最新预览；Controller
对 React 的常规 position snapshot 最多约 10Hz，transport、seek、换页与 Loop 边界立即发布。
普通翻页不排队，连续模式换行动画为 160–220ms。代表性长谱连续播放 30 分钟不得出现持续掉帧、
内存单调增长或滚动、翻页导致的音频中断。
