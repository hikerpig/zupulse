import { useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import { Music2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PianoKeyHintEvent } from "@zupulse/web-core";
import type { ViewerSessionHandle } from "../../../host";
import { projectPianoKeyFrame, type PianoKeyFrame } from "../model/piano-key-projection";
import { createPianoKeyVisualizationRuntime } from "../runtime/piano-key-visualization-runtime";
import { PianoKeyVisualizationResizeHandle } from "./PianoKeyVisualizationResizeHandle";
import styles from "./PianoKeyVisualization.module.css";

const HIGHWAY_HEIGHT = 128;
const KEYBOARD_HEIGHT = 52;
const SVG_HEIGHT = HIGHWAY_HEIGHT + KEYBOARD_HEIGHT;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type VisualizationSource = {
  events: readonly PianoKeyHintEvent[];
  getTick(): number;
};
type Playback = NonNullable<ViewerSessionHandle["playback"]>;

export function PianoKeyVisualization({
  source,
  playback,
  containerRef,
  height,
  onHeightChange,
  onClose,
}: {
  source: VisualizationSource;
  playback: Playback;
  containerRef: RefObject<HTMLElement | null>;
  height: number;
  onHeightChange(height: number): void;
  onClose(): void;
}) {
  const { t } = useTranslation("viewer");
  const hintLayerRef = useRef<SVGGElement>(null);
  const keyLayerRef = useRef<SVGGElement>(null);
  const geometry = useMemo(() => createKeyboardGeometry(source.events), [source.events]);

  useLayoutEffect(() => {
    const hintLayer = hintLayerRef.current;
    const keyLayer = keyLayerRef.current;
    if (!hintLayer || !keyLayer) return;
    const renderer = createPianoKeySvgRenderer(hintLayer, keyLayer, geometry);
    renderer.render(projectPianoKeyFrame(source.events, source.getTick(), playback.getState().pianoPractice.mode));
    const runtime = createPianoKeyVisualizationRuntime({
      events: source.events,
      readTick: source.getTick,
      readMode: () => playback.getState().pianoPractice.mode,
      render: renderer.render,
    });
    runtime.start();
    return () => {
      runtime.stop();
      renderer.destroy();
    };
  }, [geometry, playback, source]);

  return (
    <section
      className={styles.visualization}
      role="region"
      aria-label={t("playback.pianoKeyboardRegion")}
      style={{ "--piano-key-height": `${height}px` } as CSSProperties}
    >
      <PianoKeyVisualizationResizeHandle
        containerRef={containerRef}
        height={height}
        label={t("playback.resizeKeyboardHints")}
        onHeightChange={onHeightChange}
      />
      <header className={styles.header}>
        <span className={styles.title}>
          <Music2 aria-hidden="true" />
          {t("playback.keyboardTaskTitle")}
        </span>
        <span className={styles.legend} aria-hidden="true">
          <i data-hand="left" />
          {t("playback.leftHandShort")}
          <i data-hand="right" />
          {t("playback.rightHandShort")}
        </span>
        <button type="button" aria-label={t("playback.closeKeyboardHints")} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      <svg
        className={styles.keyboard}
        viewBox={`0 0 ${geometry.whiteKeyCount} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="piano-black-key-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a4642" />
            <stop offset="0.65" stopColor="#262422" />
            <stop offset="1" stopColor="#141312" />
          </linearGradient>
          <linearGradient id="piano-highway-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={styles.highwayFadeStart} />
            <stop offset="0.4" className={styles.highwayFadeEnd} />
          </linearGradient>
        </defs>
        <g ref={hintLayerRef} className={styles.hints} data-hint-layer />
        <rect
          className={styles.highwayFade}
          x="0"
          y="0"
          width={geometry.whiteKeyCount}
          height={HIGHWAY_HEIGHT}
          fill="url(#piano-highway-fade)"
          pointerEvents="none"
        />
        <g ref={keyLayerRef} className={styles.keys}>
          {geometry.keys
            .filter((key) => !key.black)
            .map((key) => (
              <rect
                key={key.pitch}
                data-key-pitch={key.pitch}
                className={styles.whiteKey}
                x={key.x}
                y={HIGHWAY_HEIGHT}
                width={key.width}
                height={KEYBOARD_HEIGHT}
              />
            ))}
          {geometry.keys
            .filter((key) => key.black)
            .map((key) => (
              <rect
                key={key.pitch}
                data-key-pitch={key.pitch}
                className={styles.blackKey}
                x={key.x}
                y={HIGHWAY_HEIGHT}
                width={key.width}
                height={KEYBOARD_HEIGHT * 0.62}
              />
            ))}
        </g>
        <line
          className={styles.strikeLine}
          x1="0"
          x2={geometry.whiteKeyCount}
          y1={HIGHWAY_HEIGHT}
          y2={HIGHWAY_HEIGHT}
        />
      </svg>
    </section>
  );
}

type KeyGeometry = { pitch: number; x: number; width: number; black: boolean };
export type KeyboardGeometry = { keys: KeyGeometry[]; byPitch: Map<number, KeyGeometry>; whiteKeyCount: number };

export function createKeyboardGeometry(events: readonly PianoKeyHintEvent[]): KeyboardGeometry {
  const pitches = events.map((event) => event.pitch);
  const minimum = Math.max(21, Math.min(...pitches) - 2);
  const maximum = Math.min(108, Math.max(...pitches) + 2);
  let start = Math.max(21, minimum - modulo(minimum, 12));
  let end = Math.min(108, maximum + (11 - modulo(maximum, 12)));
  while (end - start + 1 < 36 && (start > 21 || end < 108)) {
    if (start > 21) start = Math.max(21, start - 12);
    if (end < 108 && end - start + 1 < 36) end = Math.min(108, end + 12);
  }
  const keys: KeyGeometry[] = [];
  let whiteIndex = 0;
  for (let pitch = start; pitch <= end; pitch += 1) {
    const black = isBlackKey(pitch);
    const key = black ? { pitch, black, x: whiteIndex - 0.31, width: 0.62 } : { pitch, black, x: whiteIndex, width: 1 };
    keys.push(key);
    if (!black) whiteIndex += 1;
  }
  return { keys, byPitch: new Map(keys.map((key) => [key.pitch, key])), whiteKeyCount: whiteIndex };
}

export function createPianoKeySvgRenderer(
  hintLayer: SVGGElement,
  keyLayer: SVGGElement,
  geometry: KeyboardGeometry,
): { render(frame: PianoKeyFrame): void; destroy(): void } {
  const keysByPitch = new Map<number, SVGRectElement>();
  keyLayer.querySelectorAll<SVGRectElement>("[data-key-pitch]").forEach((key) => {
    keysByPitch.set(Number(key.dataset.keyPitch), key);
  });
  const hintPool: SVGRectElement[] = [];
  let activePitches = new Set<number>();

  return {
    render(frame) {
      const nextActivePitches = new Set(frame.activePitches);
      for (const pitch of activePitches) {
        if (!nextActivePitches.has(pitch)) keysByPitch.get(pitch)?.removeAttribute("data-active");
      }
      for (const pitch of nextActivePitches) {
        if (!activePitches.has(pitch)) keysByPitch.get(pitch)?.setAttribute("data-active", "");
      }
      activePitches = nextActivePitches;

      let visibleHintCount = 0;
      for (const hint of frame.hints) {
        const key = geometry.byPitch.get(hint.pitch);
        if (!key) continue;
        const rect = hintPool[visibleHintCount] ?? createPooledHint(hintLayer, hintPool);
        if (rect.style.display) rect.style.removeProperty("display");
        const onsetY = HIGHWAY_HEIGHT * (1 - hint.startRatio);
        const endY = HIGHWAY_HEIGHT * (1 - hint.endRatio);
        setAttributeIfChanged(rect, "x", String(key.x + key.width * 0.08));
        setAttributeIfChanged(rect, "y", String(endY));
        setAttributeIfChanged(rect, "width", String(key.width * 0.84));
        setAttributeIfChanged(rect, "height", String(Math.max(2, onsetY - endY)));
        setAttributeIfChanged(rect, "data-pitch", String(hint.pitch));
        setAttributeIfChanged(rect, "data-hand", hint.hand);
        visibleHintCount += 1;
      }
      for (let index = visibleHintCount; index < hintPool.length; index += 1) {
        if (hintPool[index]!.style.display !== "none") hintPool[index]!.style.display = "none";
      }
    },
    destroy() {
      for (const pitch of activePitches) keysByPitch.get(pitch)?.removeAttribute("data-active");
      activePitches.clear();
      for (const hint of hintPool) hint.remove();
      hintPool.length = 0;
    },
  };
}

function createPooledHint(hintLayer: SVGGElement, hintPool: SVGRectElement[]): SVGRectElement {
  const rect = hintLayer.ownerDocument.createElementNS(SVG_NAMESPACE, "rect");
  rect.setAttribute("rx", "0.12");
  hintLayer.append(rect);
  hintPool.push(rect);
  return rect;
}

function setAttributeIfChanged(element: SVGElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(modulo(pitch, 12));
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
