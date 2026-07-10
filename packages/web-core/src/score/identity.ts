import { detectScoreFormat } from "./format";
import type { ScoreIdentity } from "./types";

export async function createContentHash(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
