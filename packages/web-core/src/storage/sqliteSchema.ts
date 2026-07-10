export const SQLITE_SCHEMA = `
CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT,
  artist TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE file_refs (
  id TEXT PRIMARY KEY,
  score_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path_hint TEXT,
  security_bookmark BLOB,
  local_library_path TEXT,
  last_accessed_at TEXT,
  FOREIGN KEY(score_id) REFERENCES scores(id)
);

CREATE TABLE sidecars (
  score_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_state TEXT NOT NULL,
  FOREIGN KEY(score_id) REFERENCES scores(id)
);

CREATE TABLE score_index (
  score_id TEXT PRIMARY KEY,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  practice_summary_json TEXT,
  FOREIGN KEY(score_id) REFERENCES scores(id)
);
`.trim();

export function requiredSqliteTables(): string[] {
  return ["scores", "file_refs", "sidecars", "score_index"];
}
