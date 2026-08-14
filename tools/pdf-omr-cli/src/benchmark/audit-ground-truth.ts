import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { validateDraft } from "../validate-draft";

type InventoryEntry = {
  item: { id: string };
  source: { groundTruthPath: string };
};

export async function auditBenchmarkGroundTruth(
  entries: readonly InventoryEntry[],
  sourceRoot: string,
): Promise<{
  schemaVersion: "1.0.0";
  items: Array<{
    itemId: string;
    ready: boolean;
    readiness?: { harmony: string; musicXml: string };
    diagnosticCodes?: string[];
    errorCode?: string;
  }>;
}> {
  const items = [];
  for (const entry of entries) {
    try {
      const bytes = await readFile(resolve(sourceRoot, entry.source.groundTruthPath));
      const validation = validateDraft(normalizeAudiverisMusicXml(bytes));
      items.push({
        itemId: entry.item.id,
        ready: validation.readiness.harmony !== "blocked" && validation.readiness.musicXml !== "blocked",
        readiness: validation.readiness,
        diagnosticCodes: validation.diagnostics.map((diagnostic) => diagnostic.code),
      });
    } catch (error) {
      items.push({
        itemId: entry.item.id,
        ready: false,
        errorCode:
          typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
            ? error.code
            : "GROUND_TRUTH_PARSE_FAILED",
      });
    }
  }
  return { schemaVersion: "1.0.0", items };
}
