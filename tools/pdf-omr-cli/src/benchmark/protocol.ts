import { PdfOmrError } from "../errors";
import { sha256Schema } from "../schemas";
import type { CorpusItem, CorpusManifest } from "./corpus";

export type CorpusView = {
  schemaVersion: "1.0.0";
  corpusId: string;
  protocolVersion: string;
  mode: "development" | "holdout";
  items: CorpusItem[];
  holdout: {
    itemCount: number;
    details: "redacted" | "frozen-evaluation";
  };
};

export function createCorpusView(
  manifest: CorpusManifest,
  options:
    | { mode: "development" }
    | {
        mode: "holdout";
        frozenEvaluation?: { protocolSha256: string };
      },
): CorpusView {
  const holdout = manifest.items.filter((item) => item.split === "holdout");
  if (options.mode === "holdout") {
    const hash = options.frozenEvaluation?.protocolSha256;
    if (hash === undefined || !sha256Schema.safeParse(hash).success) {
      throw new PdfOmrError("INVALID_CLI_ARGUMENT", "holdout details require a frozen evaluation protocol", {
        context: { reason: "holdout-protocol-required" },
      });
    }
    return {
      schemaVersion: "1.0.0",
      corpusId: manifest.corpusId,
      protocolVersion: manifest.protocolVersion,
      mode: "holdout",
      items: holdout,
      holdout: { itemCount: holdout.length, details: "frozen-evaluation" },
    };
  }
  return {
    schemaVersion: "1.0.0",
    corpusId: manifest.corpusId,
    protocolVersion: manifest.protocolVersion,
    mode: "development",
    items: manifest.items.filter((item) => item.split === "development"),
    holdout: { itemCount: holdout.length, details: "redacted" },
  };
}
