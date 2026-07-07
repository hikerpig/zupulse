import { createHash } from "node:crypto";
import { detectScoreFormat } from "./format";
import type { ScoreIdentity } from "./types";

export async function createContentHash(bytes: Uint8Array): Promise<string> {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function createScoreIdentity(input: {
  fileName: string;
  bytes: Uint8Array;
  title?: string;
  artist?: string;
  durationMs?: number;
  trackNames?: string[];
  tempoSummary?: string;
}): Promise<ScoreIdentity> {
  const identity: ScoreIdentity = {
    contentHash: await createContentHash(input.bytes),
    format: detectScoreFormat(input.fileName),
  };

  if (input.title !== undefined) {
    identity.title = input.title;
  }
  if (input.artist !== undefined) {
    identity.artist = input.artist;
  }
  if (input.durationMs !== undefined) {
    identity.durationMs = input.durationMs;
  }

  const sourceHints: NonNullable<ScoreIdentity["sourceHints"]> = {
    fileName: input.fileName,
  };
  if (input.trackNames !== undefined) {
    sourceHints.trackNames = input.trackNames;
  }
  if (input.tempoSummary !== undefined) {
    sourceHints.tempoSummary = input.tempoSummary;
  }
  identity.sourceHints = sourceHints;

  return identity;
}
