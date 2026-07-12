import type { z } from "zod";
import type { practicePlaybackSidecarSchema } from "./schemas";

export type TimedValue<T> = {
  value: T;
  updatedAt: string;
};

export type PersistedTrackMix = {
  muted: boolean;
  volume: number;
  muteUpdatedAt: string;
  volumeUpdatedAt: string;
};

export type PracticePlaybackSidecar = z.infer<typeof practicePlaybackSidecarSchema>;

export function createDefaultPlaybackSidecar(now: string): PracticePlaybackSidecar {
  return {
    scoreSpeed: { value: 1, updatedAt: now },
    loops: [],
    visibility: { additionalTrackIds: [], updatedAt: now },
    tracks: {},
  };
}

export function mergePlaybackSidecar(
  local: PracticePlaybackSidecar,
  remote: PracticePlaybackSidecar,
): PracticePlaybackSidecar {
  const loopMap = new Map(local.loops.map((loop) => [loop.id, loop]));
  for (const loop of remote.loops) {
    const current = loopMap.get(loop.id);
    if (!current || loop.updatedAt > current.updatedAt) {
      loopMap.set(loop.id, loop);
    }
  }

  const trackIds = new Set([...Object.keys(local.tracks), ...Object.keys(remote.tracks)]);
  const tracks: PracticePlaybackSidecar["tracks"] = {};
  for (const id of trackIds) {
    const left = local.tracks[id];
    const right = remote.tracks[id];
    if (!left) {
      if (right) tracks[id] = right;
      continue;
    }
    if (!right) {
      tracks[id] = left;
      continue;
    }
    tracks[id] = {
      muted: right.muteUpdatedAt > left.muteUpdatedAt ? right.muted : left.muted,
      muteUpdatedAt: right.muteUpdatedAt > left.muteUpdatedAt ? right.muteUpdatedAt : left.muteUpdatedAt,
      volume: right.volumeUpdatedAt > left.volumeUpdatedAt ? right.volume : left.volume,
      volumeUpdatedAt: right.volumeUpdatedAt > left.volumeUpdatedAt ? right.volumeUpdatedAt : left.volumeUpdatedAt,
    };
  }

  return {
    scoreSpeed: remote.scoreSpeed.updatedAt > local.scoreSpeed.updatedAt ? remote.scoreSpeed : local.scoreSpeed,
    loops: [...loopMap.values()].sort((a, b) => a.start.tick - b.start.tick),
    visibility: remote.visibility.updatedAt > local.visibility.updatedAt ? remote.visibility : local.visibility,
    tracks,
  };
}
