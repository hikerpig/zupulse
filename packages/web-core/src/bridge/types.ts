import type { z } from "zod";
import type { localPlaybackResumeSchema } from "../storage/schemas";
import type { BridgeRequest, BridgeResponse } from "./schemas";

export type { BridgeError, BridgeEvent, BridgeRequest, Capabilities } from "./schemas";
export type ReadScoreFileResponse = BridgeResponse<"file.readBytes">;
export type ReadSidecarRequest = Extract<BridgeRequest, { type: "sidecar.read" }>["payload"];
export type WriteSidecarRequest = Extract<BridgeRequest, { type: "sidecar.write" }>["payload"];
export type ReadSidecarResponse = BridgeResponse<"sidecar.read">;
export type LocalPlaybackResume = z.infer<typeof localPlaybackResumeSchema>;
export type ReadPlaybackResumeRequest = Extract<BridgeRequest, { type: "playbackResume.read" }>["payload"];
export type ReadPlaybackResumeResponse = BridgeResponse<"playbackResume.read">;
export type WritePlaybackResumeRequest = Extract<BridgeRequest, { type: "playbackResume.write" }>["payload"];
