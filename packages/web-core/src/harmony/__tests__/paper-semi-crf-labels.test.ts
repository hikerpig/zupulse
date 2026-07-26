import { describe, expect, it } from "vitest";
import {
  createPaperSemiCrfLabelInventory,
  PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
  paperSemiCrfChordToLabel,
} from "../paper-semi-crf-labels";

describe("paper semi-CRF label inventory", () => {
  it("keeps the complete frozen inventory in stable order without a Top-8 cutoff", () => {
    const labels = [
      "C:maj",
      "C:min",
      "C:dim",
      "D:maj",
      "D:min",
      "D:dim",
      "E:maj",
      "E:min",
      "E:dim",
      "F:maj",
      "F:min",
      "F:dim",
    ];

    const inventory = createPaperSemiCrfLabelInventory(labels);

    expect(inventory.mappingVersion).toBe(PAPER_SEMI_CRF_LABEL_MAPPING_VERSION);
    expect(inventory.labels).toHaveLength(12);
    expect(inventory.labels.map((label) => [label.id, label.normalizedLabel])).toEqual(
      labels.map((label, id) => [id, label]),
    );
  });

  it("normalizes reference enharmonics before stable deduplication", () => {
    const inventory = createPaperSemiCrfLabelInventory(["C#:maj7", "Db:maj7", "Eb:min", "D#:min"]);

    expect(inventory.labels.map((label) => label.normalizedLabel)).toEqual(["Db:maj7", "D#:min"]);
  });

  it("maps generic-added-note labels losslessly to ChordSymbol", () => {
    const inventory = createPaperSemiCrfLabelInventory(["Bb:maj7", "F#:min6", "D#:dim7", "A:min4", "C:aug"]);

    const supported = inventory.labels.map((label) => {
      expect(label.status).toBe("supported");
      if (label.status !== "supported") throw new Error("expected supported paper label");
      return {
        label: label.normalizedLabel,
        chord: label.chord,
        roundTrip: paperSemiCrfChordToLabel(label.chord),
      };
    });

    expect(supported).toEqual([
      {
        label: "Bb:maj7",
        chord: {
          root: { step: "B", alter: -1 },
          kind: "major",
          extension: 7,
          degrees: [],
        },
        roundTrip: "Bb:maj7",
      },
      {
        label: "F#:min6",
        chord: {
          root: { step: "F", alter: 1 },
          kind: "minor",
          extension: 6,
          degrees: [],
        },
        roundTrip: "F#:min6",
      },
      {
        label: "D#:dim7",
        chord: {
          root: { step: "D", alter: 1 },
          kind: "diminished",
          extension: 7,
          degrees: [],
        },
        roundTrip: "D#:dim7",
      },
      {
        label: "A:min4",
        chord: {
          root: { step: "A", alter: 0 },
          kind: "minor",
          degrees: [{ operation: "add", value: 4, alter: 0 }],
        },
        roundTrip: "A:min4",
      },
      {
        label: "C:aug",
        chord: {
          root: { step: "C", alter: 0 },
          kind: "augmented",
          degrees: [],
        },
        roundTrip: "C:aug",
      },
    ]);
  });

  it("retains labels that the product ChordSymbol cannot represent and reports why", () => {
    const inventory = createPaperSemiCrfLabelInventory(["C:ger6", "not-a-chord"]);

    expect(inventory.labels).toEqual([
      {
        id: 0,
        referenceLabel: "C:ger6",
        normalizedLabel: "C:ger6",
        status: "unsupported",
        reason: "unsupported-chord-kind",
      },
      {
        id: 1,
        referenceLabel: "not-a-chord",
        normalizedLabel: "not-a-chord",
        status: "unsupported",
        reason: "unsupported-syntax",
      },
    ]);
  });
});
