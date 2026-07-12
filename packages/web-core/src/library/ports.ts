import type {
  LibraryMetadata,
  LibraryScore,
  LibraryScoreId,
  LibraryScoreIdentity,
  LibraryScoreSummary,
  ScoreImportSource,
  StoredScoreFile,
  ValidatedLibraryScoreDraft,
} from "./types";

export interface SheetLibraryRepository {
  initialize(): Promise<void>;
  list(): Promise<readonly LibraryScoreSummary[]>;
  get(id: LibraryScoreId): Promise<LibraryScore | undefined>;
  findByIdentity(identity: LibraryScoreIdentity): Promise<LibraryScore | undefined>;
  add(draft: ValidatedLibraryScoreDraft): Promise<{ status: "created" | "existing"; score: LibraryScore }>;
  readScore(id: LibraryScoreId): Promise<StoredScoreFile>;
  updateMetadata(id: LibraryScoreId, patch: LibraryMetadata): Promise<LibraryScore>;
  setFavorite(id: LibraryScoreId, favorite: boolean): Promise<void>;
  markOpened(id: LibraryScoreId, openedAt: string): Promise<void>;
  delete(id: LibraryScoreId): Promise<void>;
}

export interface ScoreFileGateway {
  selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]>;
  saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled">;
}
