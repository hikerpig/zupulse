import { describe, expect, it } from "vitest";
import { buildLegatoPageContextPrefix } from "../engines/legato-page-context";

describe("buildLegatoPageContextPrefix", () => {
  it("carries a canonical ABC unit length, meter, and key prefix", () => {
    expect(
      buildLegatoPageContextPrefix(`X:7
T:Previous system
L:1/8
M:4/4
I:linebreak $
K:C
V:1 treble
C2 D2 E2 F2 |]
`),
    ).toBe(`X:1
L:1/8
M:4/4
K:C
`);
  });

  it.each([
    ["missing meter", "X:1\nL:1/8\nK:C\nC2 |]\n"],
    ["non-metered page", "X:1\nL:1/8\nM:none\nK:C\nC2 |]\n"],
    ["duplicate meter", "X:1\nL:1/8\nM:4/4\nM:3/4\nK:C\nC2 |]\n"],
    ["malformed unit length", "X:1\nL:any\nM:4/4\nK:C\nC2 |]\n"],
    ["unsupported key", "X:1\nL:1/8\nM:4/4\nK:none\nC2 |]\n"],
  ])("fails closed for %s", (_name, abc) => {
    expect(buildLegatoPageContextPrefix(abc)).toBeUndefined();
  });
});
