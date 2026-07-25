import { describe, expect, it } from "vitest";
import { analyzeDocumentationImpact, renderDocumentationImpact } from "../documentation-impact.mjs";

describe("analyzeDocumentationImpact", () => {
  it("matches directory descendants and exact files without similar-prefix false positives", () => {
    const contracts = [
      contract("sheet-library", "Sheet Library", [
        "packages/web-core/src/library",
        "apps/desktop-shell/src/main/library/DesktopLibraryStore.ts",
      ]),
    ];

    expect(
      analyzeDocumentationImpact(contracts, [
        "packages/web-core/src/library/schemas.ts",
        "packages/web-core/src/library-old/schemas.ts",
        "apps/desktop-shell/src/main/library/DesktopLibraryStore.ts",
        "apps/desktop-shell/src/main/library/DesktopLibraryStore.test.ts",
      ]),
    ).toEqual([
      {
        contractPath: "docs/features/contracts/sheet-library.md",
        contractUpdated: false,
        feature: "sheet-library",
        title: "Sheet Library",
        changedPaths: [
          "apps/desktop-shell/src/main/library/DesktopLibraryStore.ts",
          "packages/web-core/src/library/schemas.ts",
        ],
      },
    ]);
  });

  it("sorts multiple impacted contracts and marks simultaneous contract updates", () => {
    const contracts = [
      contract("zebra", "Zebra", ["packages/shared"]),
      contract("alpha", "Alpha", ["packages/shared/alpha"]),
    ];

    expect(
      analyzeDocumentationImpact(contracts, [
        "packages/shared/zebra.ts",
        "docs/features/contracts/zebra.md",
        "packages/shared/alpha/index.ts",
      ]),
    ).toEqual([
      {
        contractPath: "docs/features/contracts/alpha.md",
        contractUpdated: false,
        feature: "alpha",
        title: "Alpha",
        changedPaths: ["packages/shared/alpha/index.ts"],
      },
      {
        contractPath: "docs/features/contracts/zebra.md",
        contractUpdated: true,
        feature: "zebra",
        title: "Zebra",
        changedPaths: ["packages/shared/alpha/index.ts", "packages/shared/zebra.ts"],
      },
    ]);
  });

  it("ignores non-current contracts", () => {
    expect(
      analyzeDocumentationImpact(
        [contract("draft", "Draft", ["packages/draft"], "draft")],
        ["packages/draft/index.ts"],
      ),
    ).toEqual([]);
  });
});

describe("renderDocumentationImpact", () => {
  it("renders stable findings including contract update state", () => {
    const findings = analyzeDocumentationImpact(
      [contract("sheet-library", "Sheet Library", ["packages/web-core/src/library"])],
      ["docs/features/contracts/sheet-library.md", "packages/web-core/src/library/schemas.ts"],
    );

    expect(renderDocumentationImpact(findings)).toBe(`Sheet Library may require review:
- packages/web-core/src/library/schemas.ts changed
- docs/features/contracts/sheet-library.md contract updated`);
  });

  it("renders a stable no-match result", () => {
    expect(renderDocumentationImpact([])).toBe("no feature contracts affected");
  });
});

function contract(feature: string, title: string, implementationPaths: string[], status = "current") {
  return {
    contents: "",
    frontmatter: {
      delivery: "available",
      feature,
      hosts: [],
      implementation_paths: implementationPaths,
      last_verified: "2026-07-25",
      status,
      supersedes: [],
      title,
    },
    location: "contracts",
    path: `docs/features/contracts/${feature}.md`,
  };
}
