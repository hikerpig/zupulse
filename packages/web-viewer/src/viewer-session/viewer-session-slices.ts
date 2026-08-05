import type {
  ViewerLoopEditorSlice,
  ViewerNavigationSlice,
  ViewerPlaybackSlice,
  ViewerSessionPort,
  ViewerSessionSlices,
} from "./viewer-session-types";

export function createViewerSessionSlices(session: ViewerSessionPort): ViewerSessionSlices {
  const snapshot = session.getSnapshot();
  const playback = snapshot.playback ? createPlaybackSlice(session) : undefined;
  const navigation = snapshot.navigation ? createNavigationSlice(session) : undefined;
  const loopEditor = snapshot.loopEditor ? createLoopEditorSlice(session) : undefined;
  return {
    ...(playback ? { playback } : {}),
    ...(navigation ? { navigation } : {}),
    ...(loopEditor ? { loopEditor } : {}),
    ...(snapshot.pianoKeyVisualization ? { pianoKeyVisualization: snapshot.pianoKeyVisualization } : {}),
  };
}

function createPlaybackSlice(session: ViewerSessionPort): ViewerPlaybackSlice {
  const getPlayback = () => {
    const playback = session.getSnapshot().playback;
    if (!playback) throw new Error("Viewer playback is unavailable");
    return playback;
  };
  return {
    getState: () => getPlayback().state,
    subscribe: (listener) => {
      const notify = () => listener(getPlayback().state);
      const unsubscribe = session.subscribe(notify);
      notify();
      return unsubscribe;
    },
    dispatch: (command) => session.dispatch({ type: "playback", command }),
    previewSeek: (position) => {
      void session.dispatch({ type: "preview-seek", position });
    },
    timeline: session.getSnapshot().playback!.timeline,
  };
}

function createNavigationSlice(session: ViewerSessionPort): ViewerNavigationSlice {
  const getNavigation = () => {
    const navigation = session.getSnapshot().navigation;
    if (!navigation) throw new Error("Viewer navigation is unavailable");
    return navigation;
  };
  return {
    getState: getNavigation,
    subscribe: session.subscribe,
    setMode: (mode) => {
      void session.dispatch({ type: "navigation", command: { type: "set-mode", mode } });
    },
    returnToPlayback: () => {
      void session.dispatch({ type: "navigation", command: { type: "return-to-playback" } });
    },
    movePage: (delta) => {
      void session.dispatch({ type: "navigation", command: { type: "move-page", delta } });
    },
  };
}

function createLoopEditorSlice(session: ViewerSessionPort): ViewerLoopEditorSlice {
  const getLoopEditor = () => session.getSnapshot().loopEditor;
  return {
    getMeasureBounds: () => getLoopEditor().measureBounds,
    getStaffBounds: () => getLoopEditor().staffBounds,
    subscribe: session.subscribe,
  };
}
