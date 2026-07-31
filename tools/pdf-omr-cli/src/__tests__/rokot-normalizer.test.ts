import { describe, expect, it } from "vitest";
import {
  normalizeRokotOutput,
  parseRokotSystemBundle,
  rokotSystemBundleSchema,
  validateRokotAbc,
} from "../normalizers/rokot";
import { validateDraft } from "../validate-draft";

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

type XmlMeasure = {
  attributes?: boolean;
  duration?: number;
  pitch?: string;
  tie?: "start" | "stop";
  tuplet?: boolean;
};

function musicXml(parts: Readonly<Record<string, readonly XmlMeasure[]>>): string {
  const partList = Object.keys(parts)
    .map((id) => `<score-part id="P${id}"><part-name>${id}</part-name></score-part>`)
    .join("");
  const partBodies = Object.entries(parts)
    .map(
      ([id, measures]) =>
        `<part id="P${id}">${measures
          .map((measure, index) => {
            const attributes = measure.attributes
              ? "<attributes><divisions>4</divisions><key><fifths>2</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>"
              : "";
            const pitch = measure.pitch ?? "C4";
            const event =
              measure.duration === undefined
                ? ""
                : `<note><pitch><step>${pitch[0]}</step><octave>${pitch[1]}</octave></pitch><duration>${measure.duration}</duration><voice>1</voice>${measure.tie === undefined ? "" : `<tie type="${measure.tie}"/>`}${measure.tuplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : ""}</note>`;
            return `<measure number="${index + 1}">${attributes}${event}</measure>`;
          })
          .join("")}</part>`,
    )
    .join("");
  return `<score-partwise><part-list>${partList}</part-list>${partBodies}</score-partwise>`;
}

function bundleSystem(pageIndex: number, systemIndex: number, xml: string) {
  return { ...system(pageIndex, systemIndex), musicXmlUtf8: xml };
}

function normalizeSystems(...systems: ReturnType<typeof bundleSystem>[]) {
  return normalizeRokotOutput(new TextEncoder().encode(JSON.stringify({ schemaVersion: "1.0.0", systems })));
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

describe("normalizeRokotOutput", () => {
  it("maps Rokot parts to two Draft staves and joins systems with global measure indices", () => {
    const first = musicXml({
      "1": [{ attributes: true, duration: 8, pitch: "C4", tie: "start", tuplet: true }],
      "1b": [{ attributes: true, duration: 8, pitch: "E4" }],
      "2": [{ attributes: true, duration: 8, pitch: "C3" }],
      "2b": [{ attributes: true, duration: 8, pitch: "E3" }],
    });
    const second = musicXml({
      "1": [{ attributes: true, duration: 8, pitch: "C4", tie: "stop" }],
      "2": [{ attributes: true, duration: 8, pitch: "C3" }],
    });

    const draft = normalizeSystems(bundleSystem(0, 0, first), bundleSystem(1, 0, second));

    expect(draft.parts).toHaveLength(1);
    expect(draft.parts[0]).toMatchObject({ id: "piano", name: "Piano" });
    expect(draft.parts[0]!.staves.map((staff) => staff.index)).toEqual([0, 1]);
    expect(draft.parts[0]!.staves[0]!.measures.map((measure) => measure.index)).toEqual([0, 1]);
    expect(draft.parts[0]!.staves[1]!.measures.map((measure) => measure.index)).toEqual([0, 1]);
    expect(draft.parts[0]!.staves[0]!.measures[0]!.voices.map((voice) => voice.index)).toEqual([1, 2]);
    expect(draft.parts[0]!.staves[1]!.measures[0]!.voices.map((voice) => voice.index)).toEqual([1, 2]);
    expect(draft.parts[0]!.staves[0]!.measures[1]!.voices.map((voice) => voice.index)).toEqual([1]);
    expect(draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]).toMatchObject({
      writtenPitch: { step: "C", alter: 0, octave: 4 },
      duration: { numerator: 1, denominator: 2 },
      tie: "start",
      tuplet: { actualNotes: 3, normalNotes: 2 },
      source: {
        pageIndex: 0,
        systemIndex: 0,
        bbox: { x: 0, y: 4.2, width: 612, height: 131.1 },
      },
    });
    expect(draft.parts[0]!.staves[0]!.measures[1]!.voices[0]!.events[0]).toMatchObject({
      tie: "end",
      source: { pageIndex: 1, systemIndex: 0 },
    });
  });

  it("drops an aligned header-only measure and carries its attributes to the next measure", () => {
    const xml = musicXml({
      "1": [{ attributes: true }, { duration: 8, pitch: "D4" }],
      "2": [{ attributes: true }, { duration: 8, pitch: "D3" }],
    });

    const draft = normalizeSystems(bundleSystem(0, 0, xml));

    expect(draft.parts[0]!.staves[0]!.measures).toHaveLength(1);
    expect(draft.parts[0]!.staves[0]!.measures[0]).toMatchObject({
      index: 0,
      timeSignature: { numerator: 2, denominator: 4 },
      duration: { numerator: 1, denominator: 2 },
      keySignature: { fifths: 2 },
      clef: { sign: "G", line: 2 },
    });
    expect(draft.parts[0]!.staves[1]!.measures[0]).toMatchObject({ index: 0 });
  });

  it("does not delete an eventless measure without explicit header attributes", () => {
    const xml = musicXml({
      "1": [{ attributes: true, duration: 8 }, {}, { duration: 8 }],
      "2": [{ attributes: true, duration: 8 }, {}, { duration: 8 }],
    });

    const draft = normalizeSystems(bundleSystem(0, 0, xml));

    expect(draft.parts[0]!.staves[0]!.measures.map((measure) => measure.index)).toEqual([0, 1, 2]);
    expect(draft.parts[0]!.staves[0]!.measures[1]!.voices).toEqual([]);
  });

  it("returns schema-valid blocked output for faithfully representable structural mismatches", () => {
    const xml = musicXml({
      "1": [
        { attributes: true, duration: 8, pitch: "C4" },
        { duration: 8, pitch: "D4" },
      ],
      "2": [{ attributes: true, duration: 4, pitch: "C3" }],
      "3": [{ attributes: true, duration: 8, pitch: "G2" }],
    });

    const draft = normalizeSystems(bundleSystem(0, 0, xml));

    expect(draft.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ROKOT_STAFF_MEASURE_COUNT_MISMATCH", severity: "blocking" }),
        expect.objectContaining({ code: "ROKOT_MEASURE_DURATION_MISMATCH", severity: "blocking" }),
        expect.objectContaining({ code: "ROKOT_UNSUPPORTED_VOICE", severity: "blocking" }),
      ]),
    );
    expect(validateDraft(draft).readiness).toEqual({ harmony: "blocked", musicXml: "blocked" });
  });

  it("blocks unsupported staff topology and ambiguous cross-part measure identities", () => {
    const xml = musicXml({
      "1": [{ attributes: true, duration: 8 }],
      "1b": [{ attributes: true, duration: 8 }],
    }).replace('<measure number="1"><attributes>', '<measure number="99"><attributes>');

    const draft = normalizeSystems(bundleSystem(0, 0, xml));

    expect(draft.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ROKOT_UNSUPPORTED_STAFF_TOPOLOGY", severity: "blocking" }),
        expect.objectContaining({ code: "ROKOT_SYSTEM_BOUNDARY_AMBIGUOUS", severity: "blocking" }),
      ]),
    );
  });

  it("blocks a header-only measure that is not aligned across the piano topology", () => {
    const xml = musicXml({
      "1": [{ attributes: true }, { duration: 8 }],
      "2": [{ attributes: true, duration: 8 }, { duration: 8 }],
    });

    const draft = normalizeSystems(bundleSystem(0, 0, xml));

    expect(draft.parts[0]!.staves[0]!.measures).toHaveLength(2);
    expect(draft.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ROKOT_SYSTEM_BOUNDARY_AMBIGUOUS", severity: "blocking" }),
    );
  });

  it("rejects invalid XML, ambiguous known-part mapping and zero-measure XML", () => {
    const duplicate = musicXml({
      "1": [{ attributes: true, duration: 8 }],
      "2": [{ attributes: true, duration: 8 }],
    }).replace("</score-partwise>", '<part id="P1"><measure number="1"/></part></score-partwise>');
    const empty = musicXml({ "1": [], "2": [] });

    expectReason(() => normalizeSystems(bundleSystem(0, 0, "<score-partwise>")), "invalid-musicxml");
    expectReason(() => normalizeSystems(bundleSystem(0, 0, duplicate)), "ambiguous-rokot-voice-mapping");
    expectReason(() => normalizeSystems(bundleSystem(0, 0, empty)), "empty-rokot-musicxml");
  });
});
