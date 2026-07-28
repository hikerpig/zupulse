import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Bytes } from "../canonical-json";

describe("canonical JSON", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(
      canonicalJson({
        z: 1,
        nested: { second: true, first: "value" },
        list: [{ b: 2, a: 1 }, "end"],
      }),
    ).toBe(
      `${JSON.stringify(
        {
          list: [{ a: 1, b: 2 }, "end"],
          nested: { first: "value", second: true },
          z: 1,
        },
        null,
        2,
      )}\n`,
    );
  });

  it("produces a stable lowercase SHA-256", () => {
    expect(sha256Bytes(new TextEncoder().encode("zupulse"))).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Bytes(new TextEncoder().encode("zupulse"))).toBe(sha256Bytes(new TextEncoder().encode("zupulse")));
  });

  it("rejects values that JSON cannot represent deterministically", () => {
    expect(() => canonicalJson({ value: undefined })).toThrow("undefined");
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("finite");
  });
});
