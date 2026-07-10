import type {
  LocalPlaybackResume,
  ReadPlaybackResumeResponse,
  ReadSidecarResponse,
} from "../bridge/types";
import type { ScoreIdentity } from "../score/types";
import type { SidecarPayload } from "../storage/sidecar";

export interface RpcBridge {
  rpc<TResponse>(type: string, payload: unknown): Promise<TResponse>;
}

export interface PlaybackPersistence {
  readSidecar(identity: ScoreIdentity): Promise<SidecarPayload | undefined>;
  writeSidecar(identity: ScoreIdentity, payload: SidecarPayload): Promise<void>;
  readResume(identity: ScoreIdentity): Promise<LocalPlaybackResume | undefined>;
  writeResume(identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void>;
}

export class BridgePlaybackPersistence implements PlaybackPersistence {
  constructor(private readonly bridge: RpcBridge) {}

  async readSidecar(identity: ScoreIdentity): Promise<SidecarPayload | undefined> {
    const response = await this.bridge.rpc<ReadSidecarResponse>("sidecar.read", { identity });
    return response.payload;
  }

  async writeSidecar(identity: ScoreIdentity, payload: SidecarPayload): Promise<void> {
    await this.bridge.rpc("sidecar.write", { identity, payload });
  }

  async readResume(identity: ScoreIdentity): Promise<LocalPlaybackResume | undefined> {
    const response = await this.bridge.rpc<ReadPlaybackResumeResponse>(
      "playbackResume.read",
      { identity },
    );
    return response.resume;
  }

  async writeResume(identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void> {
    await this.bridge.rpc("playbackResume.write", { identity, resume });
  }
}
