import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ViewerSessionHandle } from "../../host";
import { DisabledPracticeDrawer } from "./components/disabled-practice-drawer";
import { PlaybackTransport } from "./playback-transport";
import { PracticeDrawer } from "./practice-drawer";
import styles from "../PlaybackWorkspace.module.css";

export function PlaybackWorkspace({
  session,
  children,
}: {
  session: ViewerSessionHandle | undefined;
  children: ReactNode;
}) {
  return (
    <PlaybackLayout playback={session?.playback} navigation={session?.navigation}>
      {children}
    </PlaybackLayout>
  );
}

function PlaybackLayout({
  playback,
  navigation,
  children,
}: {
  playback: ViewerSessionHandle["playback"];
  navigation: ViewerSessionHandle["navigation"];
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  return (
    <>
      <PlaybackTransport
        playback={playback}
        navigation={navigation}
        drawerOpen={drawerOpen}
        drawerToggleRef={drawerToggleRef}
        onDrawerToggle={() => setDrawerOpen((open) => !open)}
      />
      <section className={styles.workspace}>
        {children}
        {drawerOpen ? (
          playback ? (
            <PracticeDrawer playback={playback} closeButtonRef={drawerCloseRef} onClose={() => setDrawerOpen(false)} />
          ) : (
            <DisabledPracticeDrawer closeButtonRef={drawerCloseRef} onClose={() => setDrawerOpen(false)} />
          )
        ) : null}
      </section>
    </>
  );
}
