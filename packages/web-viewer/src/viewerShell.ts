export function renderViewerShell(ownerDocument: Document): void {
  ownerDocument.body.innerHTML = `
    <main class="app-shell">
      <header class="context-bar">
        <div class="context-main">
          <p class="app-kicker">Tab Viewer</p>
          <h1 id="summary" class="context-title" aria-live="polite">未打开乐谱</h1>
          <p class="context-subtitle">Studio-style practice workspace for score reading, playback, and loop training.</p>
        </div>
        <div class="context-actions">
          <div class="theme-toggle" role="group" aria-label="主题切换">
            <button id="theme-light" class="theme-toggle-button" type="button" aria-pressed="false">Light</button>
            <button id="theme-dark" class="theme-toggle-button" type="button" aria-pressed="true">Dark</button>
          </div>
          <p id="status" class="status-chip" role="status">等待选择文件</p>
          <button id="open-score" class="primary-button" type="button">打开 GP 文件</button>
        </div>
      </header>

      <section class="transport-bar" aria-label="播放控制">
        <div class="transport-actions">
          <button id="play-toggle" class="primary-button" type="button" disabled>播放</button>
          <button id="play-stop" type="button" disabled>停止</button>
        </div>

        <div class="transport-progress">
          <span class="time-readout"><span id="play-current-time">0:00</span> / <span id="play-duration">0:00</span></span>
          <input id="play-progress" aria-label="播放进度" type="range" min="0" max="1000" value="0">
        </div>

        <div class="transport-tools">
          <label class="speed-control">
            <span>速度</span>
            <input id="play-speed" aria-label="速度" type="range" min="25" max="200" step="5" value="100">
            <output id="play-speed-value">100%</output>
          </label>
          <p id="audio-status" class="status-chip subtle">音频准备中</p>
          <button id="soundfont-retry" type="button" hidden>重试音频</button>
        </div>
      </section>

      <section class="workspace">
        <section class="score-stage" aria-label="乐谱工作区">
          <div class="score-stage-frame">
            <section id="alpha-tab" class="score-viewer" aria-label="乐谱预览">
              <div class="score-empty-state">
                <p class="empty-title">打开一份 Guitar Pro 乐谱开始练习</p>
                <p class="empty-copy">支持 .gp3 .gp4 .gp5 .gpx .gp，本地读取，不上传文件。</p>
              </div>
            </section>
          </div>
        </section>

        <aside class="practice-panel" aria-label="练习设置">
          <section class="panel-section">
            <div class="panel-header">
              <p class="panel-title">Loop</p>
              <label class="toggle-row"><input id="loop-enabled" type="checkbox"><span>启用循环</span></label>
            </div>
            <div class="panel-content">
              <div class="button-row">
                <button id="loop-set-a" type="button">设为 A</button>
                <button id="loop-set-b" type="button">设为 B</button>
                <button id="loop-save" type="button">保存区间</button>
              </div>
              <label>
                <span>边界吸附</span>
                <select id="loop-snap-mode">
                  <option value="off">关闭</option>
                  <option value="beat" selected>按拍</option>
                  <option value="measure">按小节</option>
                </select>
              </label>
              <label><span>A 点</span><input id="loop-start" type="range" min="0" max="1000" value="0"></label>
              <label><span>B 点</span><input id="loop-end" type="range" min="0" max="1000" value="0"></label>
              <div id="loop-list" class="item-list"></div>
            </div>
          </section>

          <section class="panel-section">
            <div class="panel-header">
              <p class="panel-title">Tracks</p>
            </div>
            <div id="track-list" class="panel-content item-list"></div>
          </section>

          <p id="playback-persistence-status" class="persistence-status" aria-live="polite"></p>
        </aside>
      </section>
    </main>`;
}
