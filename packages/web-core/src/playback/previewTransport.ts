export type PreviewTransportState = {
  status: "stopped" | "paused" | "playing";
  positionTicks: number;
  speed: number;
  loop?: { startTicks: number; endTicks: number };
};
export type PreviewTransportCommand =
  | { type: "play" | "pause" }
  | { type: "seek"; positionTicks: number }
  | { type: "speed"; speed: number }
  | { type: "loop"; range?: { startTicks: number; endTicks: number } };

export function reducePreviewTransport(
  state: PreviewTransportState,
  command: PreviewTransportCommand,
): PreviewTransportState {
  if (command.type === "play") return { ...state, status: "playing" };
  if (command.type === "pause") return { ...state, status: "paused" };
  if (command.type === "seek") return { ...state, positionTicks: Math.max(0, command.positionTicks) };
  if (command.type === "speed") return { ...state, speed: Math.max(0.25, Math.min(4, command.speed)) };
  if (command.type !== "loop") return state;
  if (command.range === undefined) {
    const { loop: _loop, ...withoutLoop } = state;
    return withoutLoop;
  }
  return { ...state, loop: command.range };
}
