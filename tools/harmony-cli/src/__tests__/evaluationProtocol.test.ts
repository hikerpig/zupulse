import { describe, expect, it } from "vitest";
import { assignDatasetSplit, assertNoEvaluationLeakage } from "../evaluationProtocol";
import { harmonyDatasetManifestSchema } from "../schemas";

const source = {
  url: "https://example.test/corpus.zip",
  revision: "v1.0.0",
  license: "CC-BY-NC-SA-4.0",
  sha256: "a".repeat(64),
};

describe("harmony dataset evaluation protocol", () => {
  it("keeps work groups together and forces declared holdouts into eval", () => {
    expect(assignDatasetSplit("K331", ["K331"])).toBe("eval");
    expect(assignDatasetSplit("K279", [])).toBe(assignDatasetSplit("K279", []));
  });

  it("rejects evaluation groups from training inputs", () => {
    expect(() => assertNoEvaluationLeakage([{ groupId: "K331", split: "eval" }])).toThrow(
      "eval group cannot enter training: K331",
    );
  });

  it("distinguishes accuracy, ingestion, and label-only datasets", () => {
    const manifest = harmonyDatasetManifestSchema.parse({
      schemaVersion: "2.0.0",
      id: "harmony-datasets-v2",
      cases: [
        {
          id: "mozart",
          kind: "accuracy-corpus",
          adapter: "dcml",
          datasetPath: "mozart",
          source,
          forcedEvalGroups: ["K331"],
        },
        {
          id: "asap",
          kind: "ingestion-corpus",
          adapter: "asap",
          datasetPath: "asap",
          source,
        },
        {
          id: "choco",
          kind: "label-prior-corpus",
          adapter: "choco",
          datasetPath: "choco",
          source,
        },
      ],
    });

    expect(manifest.cases.map((item) => item.kind)).toEqual([
      "accuracy-corpus",
      "ingestion-corpus",
      "label-prior-corpus",
    ]);
    expect(() =>
      harmonyDatasetManifestSchema.parse({
        schemaVersion: "2.0.0",
        id: "invalid",
        cases: [
          {
            id: "asap-as-accuracy",
            kind: "accuracy-corpus",
            adapter: "asap",
            datasetPath: "asap",
            source,
            forcedEvalGroups: [],
          },
        ],
      }),
    ).toThrow();
  });
});
