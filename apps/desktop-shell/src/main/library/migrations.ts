import type { openSqliteDatabase } from "./sqlite";

type Database = ReturnType<typeof openSqliteDatabase>;

export function migrateLibraryDatabase(database: Database): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("CREATE TABLE IF NOT EXISTS library_schema (version INTEGER NOT NULL)");
    database.exec("INSERT INTO library_schema (version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM library_schema)");
    database.exec(`
      CREATE TABLE IF NOT EXISTS library_scores (
        id TEXT PRIMARY KEY,
        score_identity TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        format TEXT NOT NULL,
        parsed_title TEXT,
        parsed_artist TEXT,
        title_override TEXT,
        artist_override TEXT,
        duration_ms INTEGER,
        imported_at TEXT NOT NULL,
        last_opened_at TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        storage_state TEXT NOT NULL DEFAULT 'ready'
      );
      CREATE TABLE IF NOT EXISTS library_practice_sidecars (library_score_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS library_playback_resume (library_score_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS library_harmony_analyses (
        library_score_id TEXT PRIMARY KEY,
        document_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (library_score_id) REFERENCES library_scores(id)
      );
      UPDATE library_schema SET version = 2;
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
