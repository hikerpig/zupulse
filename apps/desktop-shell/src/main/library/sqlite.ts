import { createRequire } from "node:module";

type SqliteDatabase = {
  exec(sql: string): void;
  close(): void;
};

type DatabaseSyncConstructor = new (path: string) => SqliteDatabase;

export function openSqliteDatabase(filePath: string): SqliteDatabase {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync?: DatabaseSyncConstructor };
  if (!DatabaseSync) throw new Error("NODE_SQLITE_UNAVAILABLE");
  return new DatabaseSync(filePath);
}

export function verifySqliteAvailable(): void {
  const database = openSqliteDatabase(":memory:");
  try {
    database.exec("CREATE TABLE smoke (value INTEGER); INSERT INTO smoke VALUES (1);");
  } finally {
    database.close();
  }
}
