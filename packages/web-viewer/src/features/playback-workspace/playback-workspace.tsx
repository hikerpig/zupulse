import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PianoKeyHintEvent } from "@zupulse/web-core";
import type { ViewerSessionHandle } from "../../host";
import { DisabledPracticeDrawer } from "./components/disabled-practice-drawer";
import { PlaybackTransport } from "./playback-transport";
import { PracticeDrawer } from "./practice-drawer";
import { PianoKeyVisualization, DEFAULT_PIANO_KEY_HEIGHT, clampPianoKeyHeight } from "../piano-key-visualization";
import styles from "../PlaybackWorkspace.module.css";

export function PlaybackWorkspace({
  session,
  children,
}: {
  session: ViewerSessionHandle | undefined;
  children: ReactNode;
}) {
  return (
    <PlaybackLayout
      playback={session?.playback}
      navigation={session?.navigation}
      pianoKeyVisualization={session?.pianoKeyVisualization}
    >
      {children}
    </PlaybackLayout>
  );
}

function PlaybackLayout({
  playback,
  navigation,
  pianoKeyVisualization,
  children,
}: {
  playback: ViewerSessionHandle["playback"];
  navigation: ViewerSessionHandle["navigation"];
  pianoKeyVisualization: ViewerSessionHandle["pianoKeyVisualization"];
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [keyboardEvents, setKeyboardEvents] = useState<readonly PianoKeyHintEvent[]>();
  const [keyboardFailed, setKeyboardFailed] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(DEFAULT_PIANO_KEY_HEIGHT);
  const workspaceRef = useRef<HTMLElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef(false);

  useEffect(() => {
    if (drawerOpen) {
      drawerCloseRef.current?.focus();
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") setDrawerOpen(false);
      };
      window.addEventListener("keydown", closeOnEscape);
      wasDrawerOpen.current = true;
      return () => window.removeEventListener("keydown", closeOnEscape);
    }
    if (wasDrawerOpen.current) drawerToggleRef.current?.focus();
    wasDrawerOpen.current = false;
    return undefined;
  }, [drawerOpen]);

  useEffect(() => {
    setKeyboardEnabled(false);
    setKeyboardEvents(undefined);
    setKeyboardFailed(false);
    setKeyboardHeight(DEFAULT_PIANO_KEY_HEIGHT);
  }, [pianoKeyVisualization]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!keyboardEnabled || !workspace || typeof ResizeObserver === "undefined") return undefined;
    let frameHandle: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const workspaceHeight = entry.contentRect.height;
      // Defer the height update out of the observer callback: writing layout-affecting
      // state synchronously here re-triggers the observation in the same frame, which
      // the browser reports as "ResizeObserver loop completed with undelivered notifications".
      if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
      frameHandle = requestAnimationFrame(() => {
        frameHandle = undefined;
        setKeyboardHeight((current) => clampPianoKeyHeight(current, workspaceHeight));
      });
    });
    observer.observe(workspace);
    return () => {
      observer.disconnect();
      if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
    };
  }, [keyboardEnabled]);

  const activePianoKeyVisualization = useMemo(
    () =>
      pianoKeyVisualization && keyboardEvents
        ? { events: keyboardEvents, getTick: pianoKeyVisualization.getTick }
        : undefined,
    [keyboardEvents, pianoKeyVisualization],
  );

  const changeKeyboardEnabled = (enabled: boolean) => {
    if (!enabled) {
      setKeyboardEnabled(false);
      return;
    }
    const events = pianoKeyVisualization?.loadEvents();
    if (!events) {
      setKeyboardFailed(true);
      setKeyboardEnabled(false);
      return;
    }
    setKeyboardEvents(events);
    setKeyboardEnabled(true);
  };

  return (
    <>
      <PlaybackTransport
        playback={playback}
        navigation={navigation}
        drawerOpen={drawerOpen}
        drawerToggleRef={drawerToggleRef}
        onDrawerToggle={() => setDrawerOpen((open) => !open)}
        keyGuideAvailable={Boolean(playback) && Boolean(pianoKeyVisualization) && !keyboardFailed}
        keyGuideEnabled={keyboardEnabled}
        onKeyGuideToggle={() => changeKeyboardEnabled(!keyboardEnabled)}
      />
      <section ref={workspaceRef} className={styles.workspace} data-piano-keys={keyboardEnabled || undefined}>
        {children}
        {keyboardEnabled && activePianoKeyVisualization && playback ? (
          <PianoKeyVisualization
            source={activePianoKeyVisualization}
            playback={playback}
            containerRef={workspaceRef}
            height={keyboardHeight}
            onHeightChange={setKeyboardHeight}
            onClose={() => setKeyboardEnabled(false)}
          />
        ) : null}
        {drawerOpen ? (
          playback ? (
            <PracticeDrawer
              playback={playback}
              closeButtonRef={drawerCloseRef}
              keyboardAvailable={Boolean(pianoKeyVisualization) && !keyboardFailed}
              keyboardEnabled={keyboardEnabled}
              onKeyboardEnabledChange={changeKeyboardEnabled}
              onClose={() => setDrawerOpen(false)}
            />
          ) : (
            <DisabledPracticeDrawer closeButtonRef={drawerCloseRef} onClose={() => setDrawerOpen(false)} />
          )
        ) : null}
      </section>
    </>
  );
}
