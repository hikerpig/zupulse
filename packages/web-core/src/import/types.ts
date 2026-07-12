import type { Capabilities } from "../bridge/types";
import type { ImportDiagnostic } from "./diagnostics";
import type { ScoreDocument, ScoreFormat } from "../score/types";
import type { ViewerSession } from "../score/session";

export type AdapterOutput = {
  runtime: unknown;
  document: Omit<ScoreDocument, "identity" | "source">;
  diagnostics: ImportDiagnostic[];
  capabilities: { view: boolean; playback: boolean };
};

export type ScoreFormatAdapter = {
  format: Exclude<ScoreFormat, "midi">;
  parse(input: { fileName: string; bytes: Uint8Array; signal?: AbortSignal }): Promise<AdapterOutput>;
};

export type CandidateSession = { session: ViewerSession; document: ScoreDocument; runtime: unknown };
export type ImportResult =
  | { status: "success" | "success-with-warnings"; candidate: CandidateSession; diagnostics: ImportDiagnostic[] }
  | { status: "failure"; diagnostics: ImportDiagnostic[]; cause?: unknown };

export type OpenScoreInput = {
  fileName: string;
  bytes: Uint8Array;
  capabilities: Capabilities;
  adapters: readonly ScoreFormatAdapter[];
  signal?: AbortSignal;
};
