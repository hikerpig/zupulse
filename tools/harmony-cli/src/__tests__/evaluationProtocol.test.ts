import { describe, expect, it } from "vitest";
import {
  assignDatasetSplit,
  assignV3DatasetRole,
  assertV3CorpusGroups,
  assertNoEvaluationLeakage,
  hashDatasetGroups,
} from "../evaluationProtocol";
import { harmonyDatasetManifestSchema, harmonyEvaluationProtocolV3Schema } from "../schemas";

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

  it("distinguishes accuracy and ingestion datasets", () => {
    const manifest = harmonyDatasetManifestSchema.parse({
      schemaVersion: "2.0.0",
      id: "harmony-datasets-v2",
      cases: [
        {
          id: "mozart",
          adapterVersion: "1.0.0",
          kind: "accuracy-corpus",
          adapter: "dcml",
          datasetPath: "mozart",
          archivePath: "archives/mozart.zip",
          source,
          forcedEvalGroups: ["K331"],
        },
        {
          id: "asap",
          adapterVersion: "1.0.0",
          kind: "ingestion-corpus",
          adapter: "asap",
          datasetPath: "asap",
          archivePath: "archives/asap.zip",
          source,
        },
      ],
    });

    expect(manifest.cases.map((item) => item.kind)).toEqual(["accuracy-corpus", "ingestion-corpus"]);
    expect(() =>
      harmonyDatasetManifestSchema.parse({
        schemaVersion: "2.0.0",
        id: "invalid",
        cases: [
          {
            id: "asap-as-accuracy",
            adapterVersion: "1.0.0",
            kind: "accuracy-corpus",
            adapter: "asap",
            datasetPath: "asap",
            archivePath: "archives/asap.zip",
            source,
            forcedEvalGroups: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("reserves final holdouts before assigning development groups", () => {
    const policy = { finalHoldoutGroups: ["01"], regressionGroups: ["08", "23"] };
    expect(assignV3DatasetRole("01", policy)).toBe("final-holdout");
    expect(assignV3DatasetRole("08", policy)).toBe("regression");
    expect(assignV3DatasetRole("02", policy)).toBe(
      assignDatasetSplit("02", []) === "eval" ? "regression" : assignDatasetSplit("02", []),
    );
    expect(hashDatasetGroups(["23", "01", "08"])).toBe(hashDatasetGroups(["08", "23", "01"]));
  });

  it("rejects corpus group drift against the preregistration hash", () => {
    expect(() =>
      assertV3CorpusGroups(
        {
          caseId: "fixture",
          groupsSha256: hashDatasetGroups(["01", "02"]),
          finalHoldoutGroups: ["01"],
          regressionGroups: [],
        },
        ["01"],
      ),
    ).toThrow("fixture group set checksum mismatch");
  });

  it("rejects overlapping v3 holdout and regression groups", () => {
    const corpus = {
      caseId: "beethoven",
      sourceRevision: "v2.5",
      groupsSha256: "a".repeat(64),
      finalHoldoutGroups: ["01"],
      regressionGroups: ["01"],
    };
    expect(() =>
      harmonyEvaluationProtocolV3Schema.parse({
        schemaVersion: "3.0.0",
        id: "harmony-evaluation-v3",
        historicalRegressionCases: ["dcml-mozart-k331-pilot"],
        corpora: [corpus],
      }),
    ).toThrow("cannot be both final holdout and regression");
  });

  it("parses the preregistered v3 protocol", async () => {
    const protocol = harmonyEvaluationProtocolV3Schema.parse(
      JSON.parse(
        await readFile(new URL("../../../../test-fixtures/harmony/datasets/protocol-v3.json", import.meta.url), "utf8"),
      ),
    );
    expect(protocol.corpora.map((corpus) => [corpus.caseId, corpus.finalHoldoutGroups])).toEqual([
      ["dcml-mozart-v2.3", []],
      ["dcml-beethoven-sonatas-v2.5", ["01"]],
      ["dcml-chopin-mazurkas-v3.2", ["BI105"]],
      ["pop909-piano-v1", ["225"]],
    ]);
  });
});
import { readFile } from "node:fs/promises";
