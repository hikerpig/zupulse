export const MIN_PIANO_KEY_HEIGHT = 180;
export const MAX_PIANO_KEY_HEIGHT = 420;
export const DEFAULT_PIANO_KEY_HEIGHT = 260;
export const PIANO_KEY_HEIGHT_STEP = 16;

const MIN_SCORE_HEIGHT = 180;
const SCORE_PIANO_REGION_GAP = 8;

export function clampPianoKeyHeight(value: number, workspaceHeight?: number): number {
  const workspaceMaximum =
    workspaceHeight !== undefined && Number.isFinite(workspaceHeight) && workspaceHeight > 0
      ? Math.max(MIN_PIANO_KEY_HEIGHT, workspaceHeight - MIN_SCORE_HEIGHT - SCORE_PIANO_REGION_GAP)
      : MAX_PIANO_KEY_HEIGHT;
  const maximum = Math.min(MAX_PIANO_KEY_HEIGHT, workspaceMaximum);
  return Math.round(Math.min(maximum, Math.max(MIN_PIANO_KEY_HEIGHT, value)));
}
