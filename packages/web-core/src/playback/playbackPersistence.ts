import type { LocalPlaybackResume } from "../bridge/types";
import { createBridgeRequest, parseBridgeResponse, type BridgeRequest } from "../bridge/schemas";
import type { ScoreIdentity } from "../score/types";
import type { SidecarPayload } from "../storage/sidecar";

export interface RpcBridge {
  request(message: BridgeRequest): Promise<unknown>;
}

export interface PlaybackPersistence {
  readSidecar(identity: ScoreIdentity): Promise<SidecarPayload | undefined>;
  writeSidecar(identity: ScoreIdentity, payload: SidecarPayload): Promise<void>;
  readResume(identity: ScoreIdentity): Promise<LocalPlaybackResume | undefined>;
  writeResume(identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void>;
}

export class BridgePlaybackPersistence implements PlaybackPersistence {
  private nextCorrelationId = 1;

  constructor(
    private readonly bridge: RpcBridge,
    private readonly libraryScoreId?: string,
  ) {}

  forLibraryScore(libraryScoreId: string): BridgePlaybackPersistence {
    return new BridgePlaybackPersistence(this.bridge, libraryScoreId);
  }

  async readSidecar(identity: ScoreIdentity): Promise<SidecarPayload | undefined> {
    const request = createBridgeRequest("sidecar.read", this.correlationId(), {
      identity,
      ...(this.libraryScoreId === undefined ? {} : { libraryScoreId: this.libraryScoreId }),
    });
    const response = parseBridgeResponse(request.type, await this.bridge.request(request));
    return response.payload;
  }

  async writeSidecar(identity: ScoreIdentity, payload: SidecarPayload): Promise<void> {
    const request = createBridgeRequest("sidecar.write", this.correlationId(), {
      identity,
      payload,
      ...(this.libraryScoreId === undefined ? {} : { libraryScoreId: this.libraryScoreId }),
    });
    parseBridgeResponse(request.type, await this.bridge.request(request));
  }

  async readResume(identity: ScoreIdentity): Promise<LocalPlaybackResume | undefined> {
    const request = createBridgeRequest("playbackResume.read", this.correlationId(), {
      identity,
      ...(this.libraryScoreId === undefined ? {} : { libraryScoreId: this.libraryScoreId }),
    });
    const response = parseBridgeResponse(request.type, await this.bridge.request(request));
    return response.resume;
  }

  async writeResume(identity: ScoreIdentity, resume: LocalPlaybackResume): Promise<void> {
    const request = createBridgeRequest("playbackResume.write", this.correlationId(), {
      identity,
      resume,
      ...(this.libraryScoreId === undefined ? {} : { libraryScoreId: this.libraryScoreId }),
    });
    parseBridgeResponse(request.type, await this.bridge.request(request));
  }

  private correlationId(): string {
    return `playback-${this.nextCorrelationId++}`;
  }
}
