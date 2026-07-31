import { describe, expect, it } from "vitest";
import { parseRokotSystemBundle, rokotSystemBundleSchema, validateRokotAbc } from "../normalizers/rokot";

const validAbc = `%%rokot-abc 0.1
X:1
M:2/4
L:1/8
K:C
V:1 clef=treble
V:1b
V:2 clef=bass
[V:1] C2 z2 |
[V:1b] z4 |
[V:2] C,2 Z2 |
`;

const hash = "a".repeat(64);

function system(pageIndex: number, systemIndex: number) {
  return {
    pageIndex,
    systemIndex,
    source: {
      pixelBbox: { x: 0, y: 10, width: 1400, height: 300 },
      pdfPointBbox: { x: 0, y: 4.2, width: 612, height: 131.1 },
      cropSha256: hash,
    },
    abcUtf8: validAbc,
    musicXmlUtf8: "<score-partwise />",
  };
}

function expectReason(action: () => unknown, reason: string): void {
  expect(action).toThrowError(
    expect.objectContaining({
      code: "ENGINE_OUTPUT_INVALID",
      context: { reason },
    }),
  );
}

describe("validateRokotAbc", () => {
  it("accepts the fixed envelope, allowed voices, pitched notes and rests", () => {
    expect(validateRokotAbc(new TextEncoder().encode(validAbc))).toBe(validAbc);
  });

  it("rejects invalid UTF-8 with a stable reason", () => {
    expectReason(() => validateRokotAbc(Uint8Array.from([0xc3, 0x28])), "invalid-abc-utf8");
  });

  it.each([
    ["leading prose", `Assistant:\n${validAbc}`],
    ["Markdown fences", `\`\`\`abc\n${validAbc}\`\`\`\n`],
    ["headers in the wrong order", validAbc.replace("M:2/4\nL:1/8", "L:1/8\nM:2/4")],
    ["a duplicate header", validAbc.replace("K:C\n", "K:C\nM:2/4\n")],
  ])("rejects %s as an invalid envelope", (_name, abc) => {
    expectReason(() => validateRokotAbc(new TextEncoder().encode(abc)), "invalid-rokot-abc-envelope");
  });

  it("rejects an unknown declared voice with a stable reason", () => {
    const abc = validAbc.replace("V:1b", "V:3");

    expectReason(() => validateRokotAbc(new TextEncoder().encode(abc)), "unknown-rokot-voice");
  });

  it("rejects an unknown inline voice with a stable reason", () => {
    const abc = validAbc.replace("[V:1]", "[V:3]");

    expectReason(() => validateRokotAbc(new TextEncoder().encode(abc)), "unknown-rokot-voice");
  });

  it("rejects a header-only score with a stable reason", () => {
    const abc = `%%rokot-abc 0.1
X:1
M:2/4
L:1/8
K:C
V:1 clef=treble
V:2 clef=bass
`;

    expectReason(() => validateRokotAbc(new TextEncoder().encode(abc)), "empty-rokot-abc");
  });
});

describe("RokotSystemBundle boundary", () => {
  it("parses a strict, ordered bundle from normalization bytes", () => {
    const bundle = {
      schemaVersion: "1.0.0",
      systems: [system(0, 0), system(0, 1), system(1, 0)],
    };

    expect(parseRokotSystemBundle(new TextEncoder().encode(JSON.stringify(bundle)))).toEqual(bundle);
  });

  it("rejects unknown fields at nested boundaries", () => {
    const bundle = {
      schemaVersion: "1.0.0",
      systems: [{ ...system(0, 0), confidence: 0.9 }],
    };

    expect(rokotSystemBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it.each([
    ["duplicate indices", [system(0, 0), system(0, 0)]],
    ["descending page order", [system(1, 0), system(0, 0)]],
    ["descending system order", [system(0, 1), system(0, 0)]],
  ])("rejects %s", (_name, systems) => {
    expect(rokotSystemBundleSchema.safeParse({ schemaVersion: "1.0.0", systems }).success).toBe(false);
  });

  it("rejects malformed source coordinates and crop hashes", () => {
    const malformed = system(0, 0);
    malformed.source.pixelBbox.width = 0;
    malformed.source.cropSha256 = "not-a-sha256";

    expect(rokotSystemBundleSchema.safeParse({ schemaVersion: "1.0.0", systems: [malformed] }).success).toBe(false);
  });

  it("maps malformed JSON or bundle shape to a stable boundary error", () => {
    expectReason(() => parseRokotSystemBundle(new TextEncoder().encode("{")), "invalid-rokot-system-bundle");
    expectReason(
      () => parseRokotSystemBundle(new TextEncoder().encode(JSON.stringify({ schemaVersion: "1.0.0", systems: [] }))),
      "invalid-rokot-system-bundle",
    );
  });

  it("validates each embedded ABC payload before accepting a bundle", () => {
    const invalid = system(0, 0);
    invalid.abcUtf8 = validAbc.replace("V:1b", "V:9");

    expectReason(
      () =>
        parseRokotSystemBundle(
          new TextEncoder().encode(JSON.stringify({ schemaVersion: "1.0.0", systems: [invalid] })),
        ),
      "unknown-rokot-voice",
    );
  });
});
