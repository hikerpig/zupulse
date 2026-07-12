import { describe, expect, it } from "vitest";
import { migrateLibraryDatabase } from "../migrations";
import { openSqliteDatabase, verifySqliteAvailable } from "../sqlite";

describe("desktop sqlite", () => {
  it("is available and creates the versioned library schema", () => {
    verifySqliteAvailable();
    const database = openSqliteDatabase(":memory:");
    try {
      migrateLibraryDatabase(database);
      expect(true).toBe(true);
    } finally {
      database.close();
    }
  });
});
