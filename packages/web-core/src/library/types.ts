import type { z } from "zod";
import type { ScoreFormat } from "../score/types";
import type {
  libraryFileNameSchema,
  libraryMetadataSchema,
  libraryPracticeSummarySchema,
  libraryScoreIdSchema,
  libraryScoreIdentitySchema,
  libraryTimestampSchema,
} from "./schemas";

export type LibraryScoreId = z.infer<typeof libraryScoreIdSchema>;
export type LibraryScoreIdentity = z.infer<typeof libraryScoreIdentitySchema>;
export type LibraryTimestamp = z.infer<typeof libraryTimestampSchema>;
export type LibraryMetadata = z.infer<typeof libraryMetadataSchema>;
export type LibraryPracticeSummary = z.infer<typeof libraryPracticeSummarySchema>;
export type StoredScoreFile = { fileName: z.infer<typeof libraryFileNameSchema>; bytes: Uint8Array };

export type LibraryScoreSummary = {
  id: LibraryScoreId;
  scoreIdentity: LibraryScoreIdentity;
  fileName: string;
  format: Exclude<ScoreFormat, "midi">;
  title: string;
  artist?: string;
  durationMs?: number;
  importedAt: LibraryTimestamp;
  lastOpenedAt?: LibraryTimestamp;
  isFavorite: boolean;
  practice: LibraryPracticeSummary;
};

export type LibraryScore = LibraryScoreSummary & {
  parsedTitle?: string;
  parsedArtist?: string;
  metadata: LibraryMetadata;
};

export type ValidatedLibraryScoreDraft = {
  id: LibraryScoreId;
  scoreIdentity: LibraryScoreIdentity;
  file: StoredScoreFile;
  format: Exclude<ScoreFormat, "midi">;
  parsedTitle?: string;
  parsedArtist?: string;
  durationMs?: number;
  importedAt: LibraryTimestamp;
};

export type ScoreImportSource = { fileName: string; readBytes(): Promise<Uint8Array> };
export type LibraryImportErrorCode =
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "INVALID_SCORE"
  | "READ_FAILED"
  | "STORAGE_QUOTA_EXCEEDED"
  | "LIBRARY_UNAVAILABLE"
  | "UNKNOWN";
export type LibraryImportError = { code: LibraryImportErrorCode };
export type ImportItemResult =
  | { status: "created" | "existing"; score: LibraryScore }
  | { status: "failed"; fileName: string; error: LibraryImportError };
