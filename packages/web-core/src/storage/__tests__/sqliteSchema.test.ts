import { describe, expect, it } from "vitest";
import { SQLITE_SCHEMA, requiredSqliteTables } from "../sqliteSchema";

describe("SQLITE_SCHEMA", () => {
  it("contains the first-version local index tables", () => {
    expect(requiredSqliteTables()).toEqual(["scores", "file_refs", "sidecars", "score_index"]);

    for (const table of requiredSqliteTables()) {
      expect(SQLITE_SCHEMA).toContain(`CREATE TABLE ${table}`);
    }
  });

  it("stores sidecar payload as JSON text", () => {
    expect(SQLITE_SCHEMA).toContain("payload_json TEXT NOT NULL");
    expect(SQLITE_SCHEMA).toContain("schema_version TEXT NOT NULL");
  });
});
