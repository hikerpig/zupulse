export function renderViewerShell(ownerDocument: Document): void {
  ownerDocument.body.innerHTML = `
    <main class="app-shell">
      <header class="file-bar"><button id="open-score" type="button">打开 GP 文件</button><p id="status" role="status">等待选择文件</p></header>
      <section id="summary" class="summary" aria-live="polite"></section>
      <section class="transport" aria-label="播放控制">
        <button id="play-toggle" type="button" disabled>播放</button><button id="play-stop" type="button" disabled>停止</button>
        <span><span id="play-current-time">0:00</span> / <span id="play-duration">0:00</span></span>
        <input id="play-progress" aria-label="播放进度" type="range" min="0" max="1000" value="0">
        <input id="play-speed" aria-label="速度" type="range" min="25" max="200" step="5" value="100"><output id="play-speed-value">100%</output>
        <button id="soundfont-retry" type="button" hidden>重试音频</button>
      </section>
      <section class="workspace"><section id="alpha-tab" class="score-viewer"></section><aside class="inspector">
        <input id="loop-enabled" type="checkbox"><button id="loop-set-a">设为 A</button><button id="loop-set-b">设为 B</button><button id="loop-save">保存区间</button>
        <select id="loop-snap-mode"><option value="off">关闭</option><option value="beat" selected>按拍</option><option value="measure">按小节</option></select>
        <input id="loop-start" type="range" min="0" max="1000"><input id="loop-end" type="range" min="0" max="1000">
        <div id="loop-list"></div><div id="track-list"></div><p id="playback-persistence-status"></p>
      </aside></section>
    </main>`;
}
