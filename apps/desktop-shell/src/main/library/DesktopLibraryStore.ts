import type {
  LibraryMetadata,
  LibraryScore,
  LibraryScoreId,
  LibraryScoreIdentity,
  LibraryScoreSummary,
  SheetLibraryRepository,
  StoredScoreFile,
  ValidatedLibraryScoreDraft,
} from "@tab-viewer/web-core";
import { migrateLibraryDatabase } from "./migrations";
import { readManagedScore, removeManagedScore, writeManagedScore } from "./files";
import { openSqliteDatabase } from "./sqlite";
import { reconcileManagedScores } from "./reconcile";

type Row = {
  id: string;
  score_identity: string;
  file_name: string;
  format: "gp" | "musicxml";
  parsed_title: string | null;
  parsed_artist: string | null;
  title_override: string | null;
  artist_override: string | null;
  duration_ms: number | null;
  imported_at: string;
  last_opened_at: string | null;
  is_favorite: number;
  storage_state: string;
};

export class DesktopLibraryStore implements SheetLibraryRepository {
  private readonly database;
  constructor(
    databasePath: string,
    private readonly root: string,
  ) {
    this.database = openSqliteDatabase(databasePath);
  }
  async initialize(): Promise<void> {
    migrateLibraryDatabase(this.database);
    await reconcileManagedScores(this.database, this.root);
  }
  async list(): Promise<readonly LibraryScoreSummary[]> {
    return this.rows().map((row) => summary(row));
  }
  async get(id: LibraryScoreId): Promise<LibraryScore | undefined> {
    const row = this.row(id);
    return row && score(row);
  }
  async findByIdentity(identity: LibraryScoreIdentity): Promise<LibraryScore | undefined> {
    const row = this.database.prepare("SELECT * FROM library_scores WHERE score_identity = ?").get(identity) as
      Row | undefined;
    return row && score(row);
  }
  async add(draft: ValidatedLibraryScoreDraft): Promise<{ status: "created" | "existing"; score: LibraryScore }> {
    const existing = await this.findByIdentity(draft.scoreIdentity);
    if (existing) return { status: "existing", score: existing };
    this.database
      .prepare(
        "INSERT INTO library_scores (id, score_identity, file_name, format, parsed_title, parsed_artist, duration_ms, imported_at, storage_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      )
      .run(
        draft.id,
        draft.scoreIdentity,
        draft.file.fileName,
        draft.format,
        draft.parsedTitle ?? null,
        draft.parsedArtist ?? null,
        draft.durationMs ?? null,
        draft.importedAt,
      );
    try {
      await writeManagedScore(this.root, draft.id, draft.file);
      this.database.prepare("UPDATE library_scores SET storage_state = 'ready' WHERE id = ?").run(draft.id);
      return { status: "created", score: (await this.get(draft.id))! };
    } catch (error) {
      this.database.prepare("DELETE FROM library_scores WHERE id = ?").run(draft.id);
      throw error;
    }
  }
  async readScore(id: LibraryScoreId): Promise<StoredScoreFile> {
    const row = this.required(id);
    if (row.storage_state !== "ready") throw new Error("MANAGED_SCORE_NOT_READY");
    return readManagedScore(this.root, id, row.file_name);
  }
  async updateMetadata(id: LibraryScoreId, patch: LibraryMetadata): Promise<LibraryScore> {
    const row = this.required(id);
    const metadata = {
      titleOverride: patch.titleOverride ?? row.title_override ?? undefined,
      artistOverride: patch.artistOverride ?? row.artist_override ?? undefined,
    };
    this.database
      .prepare("UPDATE library_scores SET title_override = ?, artist_override = ? WHERE id = ?")
      .run(metadata.titleOverride ?? null, metadata.artistOverride ?? null, id);
    return (await this.get(id))!;
  }
  async setFavorite(id: LibraryScoreId, favorite: boolean): Promise<void> {
    this.required(id);
    this.database.prepare("UPDATE library_scores SET is_favorite = ? WHERE id = ?").run(favorite ? 1 : 0, id);
  }
  async markOpened(id: LibraryScoreId, openedAt: string): Promise<void> {
    this.required(id);
    this.database.prepare("UPDATE library_scores SET last_opened_at = ? WHERE id = ?").run(openedAt, id);
  }
  async delete(id: LibraryScoreId): Promise<void> {
    this.required(id);
    this.database.prepare("UPDATE library_scores SET storage_state = 'deleting' WHERE id = ?").run(id);
    await removeManagedScore(this.root, id);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM library_practice_sidecars WHERE library_score_id = ?").run(id);
      this.database.prepare("DELETE FROM library_playback_resume WHERE library_score_id = ?").run(id);
      this.database.prepare("DELETE FROM library_scores WHERE id = ?").run(id);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  close(): void {
    this.database.close();
  }
  private rows(): Row[] {
    return this.database.prepare("SELECT * FROM library_scores WHERE storage_state = 'ready'").all() as Row[];
  }
  private row(id: LibraryScoreId): Row | undefined {
    return this.database.prepare("SELECT * FROM library_scores WHERE id = ?").get(id) as Row | undefined;
  }
  private required(id: LibraryScoreId): Row {
    const row = this.row(id);
    if (!row) throw new Error("LIBRARY_SCORE_NOT_FOUND");
    return row;
  }
}

function score(row: Row): LibraryScore {
  return {
    ...summary(row),
    ...(row.parsed_title === null ? {} : { parsedTitle: row.parsed_title }),
    ...(row.parsed_artist === null ? {} : { parsedArtist: row.parsed_artist }),
    metadata: {
      ...(row.title_override === null ? {} : { titleOverride: row.title_override }),
      ...(row.artist_override === null ? {} : { artistOverride: row.artist_override }),
    },
  };
}
function summary(row: Row): LibraryScoreSummary {
  const title = row.title_override ?? row.parsed_title ?? row.file_name.replace(/\.[^.]+$/, "");
  const artist = row.artist_override ?? row.parsed_artist ?? undefined;
  return {
    id: row.id,
    scoreIdentity: row.score_identity,
    fileName: row.file_name,
    format: row.format,
    title,
    ...(artist === undefined ? {} : { artist }),
    ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
    importedAt: row.imported_at,
    ...(row.last_opened_at === null ? {} : { lastOpenedAt: row.last_opened_at }),
    isFavorite: Boolean(row.is_favorite),
    practice: { hasLoop: false },
  };
}
