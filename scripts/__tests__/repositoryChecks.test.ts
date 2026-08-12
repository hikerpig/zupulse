import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkArchitecture,
  checkContext,
  checkDesign,
  checkDocumentation,
  readFeatureContracts,
  runRepositoryCheck,
} from "../repository-checks.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("readFeatureContracts", () => {
  it("discovers contracts and parses the supported scalar and list frontmatter", async () => {
    const root = await fixture({
      "docs/features/contracts/sheet-library.md": `---
feature: sheet-library
title: Sheet Library
status: current
delivery: partial
last_verified: 2026-07-24
hosts:
  - browser
  - desktop
implementation_paths:
  - packages/web-core/src/library
supersedes: []
---

# Sheet Library
`,
      "docs/features/templates/feature-contract.md": `<!-- instructions -->

---
feature: feature-slug
status: draft
---
`,
    });

    await expect(readFeatureContracts(root)).resolves.toEqual({
      contracts: [
        {
          path: "docs/features/contracts/sheet-library.md",
          location: "contracts",
          contents: expect.stringContaining("# Sheet Library"),
          frontmatter: {
            feature: "sheet-library",
            title: "Sheet Library",
            status: "current",
            delivery: "partial",
            last_verified: "2026-07-24",
            hosts: ["browser", "desktop"],
            implementation_paths: ["packages/web-core/src/library"],
            supersedes: [],
          },
        },
      ],
      errors: [],
    });
  });

  it("returns stable errors for duplicate keys and unsupported nested structures", async () => {
    const root = await fixture({
      "docs/features/contracts/duplicate.md": `---
feature: first
feature: second
---
`,
      "docs/features/contracts/nested.md": `---
feature: nested
metadata:
  owner: docs
---
`,
      "docs/features/contracts/inline-list.md": `---
feature: inline-list
hosts: [browser, desktop]
---
`,
      "docs/features/contracts/missing-list-items.md": `---
feature: missing-list-items
hosts:
status: draft
---
`,
    });

    await expect(readFeatureContracts(root)).resolves.toEqual({
      contracts: [],
      errors: [
        "docs/features/contracts/duplicate.md:3: duplicate frontmatter key feature",
        "docs/features/contracts/inline-list.md:3: unsupported frontmatter value for hosts",
        "docs/features/contracts/missing-list-items.md:3: frontmatter list hosts requires at least one item or []",
        "docs/features/contracts/nested.md:4: unsupported nested frontmatter",
      ],
    });
  });
});

describe("checkDocumentation", () => {
  it("accepts valid current, draft and historical lifecycle combinations", async () => {
    const root = await fixture({
      "docs/features/README.md": `# Feature Contracts

## Current Index

| Feature | Contract | Status | Delivery |
| --- | --- | --- | --- |
| Current | [Current](contracts/current.md) | current | partial |
`,
      "docs/features/contracts/current.md": `---
feature: current-feature
title: Current Feature
status: current
delivery: partial
last_verified: 2026-07-24
hosts:
  - browser
implementation_paths:
  - packages/current
supersedes: []
---

# Current Feature

## 一句话契约
## 用户入口
## 当前已实现行为
## 领域不变量
## 进行中的目标差异
## 明确非目标
## 验收契约
## 证据地图
## 相关资料
## 维护触发器
`,
      "packages/current/index.ts": "",
      "docs/features/contracts/draft.md": `---
feature: draft-feature
title: Draft Feature
status: draft
delivery: planned
last_verified: 2026-07-24
hosts: []
implementation_paths: []
supersedes: []
---

# Draft Feature

## 进行中的目标差异
`,
      "docs/features/archive/retired.md": `---
feature: retired-feature
title: Retired Feature
status: historical
delivery: retired
last_verified: 2026-07-24
hosts: []
implementation_paths: []
supersedes: []
---
`,
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("reports invalid metadata fields without guessing their meaning", async () => {
    const root = await fixture({
      "docs/features/README.md": "# Feature Contracts\n\n## Current Index\n",
      "docs/features/contracts/invalid.md": `---
feature: Not Valid
title: []
status: accepted
delivery: done
last_verified: 2026-02-30
hosts: browser
implementation_paths: packages/example
supersedes: old-feature
extra_field: value
---
`,
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [
        "docs/features/contracts/invalid.md: expected delivery: planned|in_progress|partial|available|retired",
        "docs/features/contracts/invalid.md: expected feature to be a non-empty kebab-case slug",
        "docs/features/contracts/invalid.md: expected hosts to be a string list",
        "docs/features/contracts/invalid.md: expected implementation_paths to be a string list",
        "docs/features/contracts/invalid.md: expected last_verified to be a valid YYYY-MM-DD date",
        "docs/features/contracts/invalid.md: expected status: draft|current|deprecated|historical",
        "docs/features/contracts/invalid.md: expected supersedes to be a string list",
        "docs/features/contracts/invalid.md: expected title to be a non-empty string",
        "docs/features/contracts/invalid.md: unsupported frontmatter key extra_field",
      ],
      warnings: [],
    });
  });

  it("reports invalid lifecycle directories and delivery combinations", async () => {
    const root = await fixture({
      "docs/features/README.md": "# Feature Contracts\n\n## Current Index\n",
      "docs/features/contracts/retired.md": `---
feature: retired-in-contracts
title: Retired
status: historical
delivery: retired
last_verified: 2026-07-24
hosts: []
implementation_paths: []
supersedes: []
---
`,
      "docs/features/archive/current.md": `---
feature: current-in-archive
title: Current
status: current
delivery: partial
last_verified: 2026-07-24
hosts: []
implementation_paths: []
supersedes: []
---

## 一句话契约
## 用户入口
## 当前已实现行为
## 领域不变量
## 已知差距
## 明确非目标
## 验收契约
## 证据地图
## 相关资料
## 维护触发器
`,
      "docs/features/archive/available.md": `---
feature: available-in-archive
title: Available
status: deprecated
delivery: available
last_verified: 2026-07-24
hosts: []
implementation_paths: []
supersedes: []
---
`,
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [
        "docs/features/archive/available.md: archived contract must not have delivery: available",
        "docs/features/archive/current.md: archived contract must have status: deprecated|historical",
        "docs/features/archive/current.md: current contract must be in docs/features/contracts",
        "docs/features/contracts/retired.md: historical retired contract must be in docs/features/archive",
      ],
      warnings: [],
    });
  });

  it("reports missing required sections and warns when current verification is stale", async () => {
    const root = await fixture({
      "docs/features/README.md": `# Feature Contracts

## Current Index

| Feature | Contract | Status | Delivery |
| --- | --- | --- | --- |
| Stale | [Stale](contracts/stale.md) | current | partial |
`,
      "docs/features/contracts/stale.md": `---
feature: stale-feature
title: Stale Feature
status: current
delivery: partial
last_verified: 2026-06-01
hosts: []
implementation_paths: []
supersedes: []
---

## 一句话契约
## 用户入口
## 当前已实现行为
## 领域不变量
## 明确非目标
## 验收契约
## 证据地图
## 相关资料
`,
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [
        "docs/features/contracts/stale.md: delivery partial requires ## 进行中的目标差异 or ## 已知差距",
        "docs/features/contracts/stale.md: missing required section ## 维护触发器",
      ],
      warnings: ["docs/features/contracts/stale.md: last_verified 2026-06-01 is older than 30 days"],
    });
  });

  it("reports duplicate feature slugs and invalid current index entries", async () => {
    const root = await fixture({
      "docs/features/README.md": `# Feature Contracts

## Current Index

| Feature | Contract | Status | Delivery |
| --- | --- | --- | --- |
| Current | [Current](contracts/current.md) | current | available |
| Current again | [Current](contracts/current.md) | current | available |
| Missing | [Missing](contracts/missing.md) | current | available |
`,
      "docs/features/contracts/current.md": completeCurrentContract({
        feature: "duplicate-feature",
        title: "Current",
      }),
      "docs/features/contracts/draft.md": `---
feature: duplicate-feature
title: Draft
status: draft
delivery: planned
last_verified: 2026-07-24
hosts: []
implementation_paths: []
supersedes: []
---

## 进行中的目标差异
`,
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [
        "docs/features/README.md: duplicate current index entry docs/features/contracts/current.md",
        "docs/features/README.md: indexed contract docs/features/contracts/missing.md does not exist",
        "feature duplicate-feature is declared by docs/features/contracts/current.md, docs/features/contracts/draft.md",
      ],
      warnings: [],
    });
  });

  it("reports index entries whose status or delivery drift from the contract frontmatter", async () => {
    const root = await fixture({
      "docs/features/README.md": `# Feature Contracts

## Current Index

| Feature | Contract | Status | Delivery |
| --- | --- | --- | --- |
| Current | [Current](contracts/current.md) | \`current\` | \`partial\` |
| Other | [Other](contracts/other.md) | \`draft\` | \`available\` |
`,
      "docs/features/contracts/current.md": completeCurrentContract({
        feature: "current-feature",
        title: "Current",
      }),
      "docs/features/contracts/other.md": completeCurrentContract({
        feature: "other-feature",
        title: "Other",
      }),
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [
        "docs/features/README.md: index entry docs/features/contracts/current.md delivery partial does not match contract delivery available",
        "docs/features/README.md: index entry docs/features/contracts/other.md status draft does not match contract status current",
      ],
      warnings: [],
    });
  });

  it("reports a current contract missing from the feature index", async () => {
    const root = await fixture({
      "docs/features/README.md": "# Feature Contracts\n\n## Current Index\n",
      "docs/features/contracts/current.md": completeCurrentContract({
        feature: "current-feature",
        title: "Current",
      }),
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: ["docs/features/contracts/current.md: current contract is missing from docs/features/README.md index"],
      warnings: [],
    });
  });

  it("reports missing implementation paths and local link targets without rejecting fragments or external links", async () => {
    const root = await fixture({
      "docs/features/README.md": `# Feature Contracts

## Current Index

| Feature | Contract | Status | Delivery |
| --- | --- | --- | --- |
| Current | [Current](contracts/current.md) | current | available |

[Missing guide](missing-guide.md)
`,
      "docs/features/contracts/current.md": `${completeCurrentContract({
        feature: "current-feature",
        title: "Current",
        implementationPaths: ["packages/missing"],
      })}

[Missing evidence](../../../missing-evidence.md)
[Existing evidence](../../../CONTEXT.md#current-scope)
[External evidence](https://example.com/docs)
`,
      "CONTEXT.md": "# Context\n",
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [
        "docs/features/README.md: local link target docs/features/missing-guide.md does not exist",
        "docs/features/contracts/current.md: implementation path packages/missing does not exist",
        "docs/features/contracts/current.md: local link target missing-evidence.md does not exist",
      ],
      warnings: [],
    });
  });

  it("ignores Markdown links inside fenced code examples", async () => {
    const root = await fixture({
      "docs/features/README.md": `# Feature Contracts

## Current Index

| Feature | Contract |
| --- | --- |
| Current | [Current](contracts/current.md) |

\`\`\`markdown
[Example only](missing-index-example.md)
\`\`\`
`,
      "docs/features/contracts/current.md": `${completeCurrentContract({
        feature: "current-feature",
        title: "Current",
      })}

\`\`\`markdown
[Example only](../../../missing-contract-example.md)
\`\`\`
`,
    });

    await expect(checkDocumentation(root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      errors: [],
      warnings: [],
    });
  });
});

describe("runRepositoryCheck", () => {
  it("returns success for documentation warnings", async () => {
    const root = await fixture({
      "docs/features/README.md": `# Feature Contracts

## Current Index

| Feature | Contract |
| --- | --- |
| Current | [Current](contracts/current.md) |
`,
      "docs/features/contracts/current.md": completeCurrentContract({
        feature: "current-feature",
        title: "Current",
        lastVerified: "2026-06-01",
      }),
    });

    await expect(runRepositoryCheck("docs", root, { now: new Date("2026-07-25T00:00:00.000Z") })).resolves.toEqual({
      exitCode: 0,
      stdout: "docs check passed\n- docs/features/contracts/current.md: last_verified 2026-06-01 is older than 30 days",
      stderr: "",
    });
  });

  it("returns failure for documentation errors", async () => {
    const root = await fixture({
      "docs/features/README.md": "# Feature Contracts\n\n## Current Index\n",
      "docs/features/contracts/current.md": completeCurrentContract({
        feature: "current-feature",
        title: "Current",
      }),
    });

    await expect(runRepositoryCheck("docs", root)).resolves.toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "- docs/features/contracts/current.md: current contract is missing from docs/features/README.md index",
    });
  });

  it("returns usage error for an unknown command", async () => {
    await expect(runRepositoryCheck("unknown", "/unused")).resolves.toEqual({
      exitCode: 2,
      stdout: "",
      stderr: "Usage: node scripts/repository-checks.mjs <context|arch|design|docs>",
    });
  });
});

describe("checkContext", () => {
  it("reports missing context files and historical documents without status", async () => {
    const root = await fixture({
      "AGENTS.md": "# Agent context\n",
      "docs/architecture/viewer-architecture-overview.md": "# Old design\n",
    });

    const errors = await checkContext(root, {
      requiredFiles: ["AGENTS.md", "CONTEXT.md"],
      historicalFiles: ["docs/architecture/viewer-architecture-overview.md"],
    });

    expect(errors).toEqual([
      "CONTEXT.md: required context file is missing",
      "docs/architecture/viewer-architecture-overview.md: expected frontmatter status: historical",
    ]);
  });

  it("accepts complete context and explicitly historical documents", async () => {
    const root = await fixture({
      "AGENTS.md": "# Agent context\n",
      "CONTEXT.md": "# Product context\n",
      "docs/old.md": "---\nstatus: historical\n---\n\n# Old\n",
    });

    await expect(
      checkContext(root, {
        requiredFiles: ["AGENTS.md", "CONTEXT.md"],
        historicalFiles: ["docs/old.md"],
      }),
    ).resolves.toEqual([]);
  });
});

describe("checkArchitecture", () => {
  it("reports workspace deep imports and platform imports across runtime boundaries", async () => {
    const root = await fixture({
      "packages/web-core/src/core.ts": 'import React from "react";\n',
      "packages/web-core/src/dom.ts": 'import { createPortal } from "react-dom";\n',
      "packages/web-viewer/src/view.ts": 'import fs from "fs";\n',
      "apps/desktop-shell/src/renderer.ts": 'import { dialog } from "electron";\n',
      "apps/web-demo/src/main.ts": 'import { openScore } from "@zupulse/web-core/src/import/openScore";\n',
    });

    expect(await checkArchitecture(root)).toEqual([
      'apps/desktop-shell/src/renderer.ts:1: Desktop Renderer must not import "electron"',
      'apps/web-demo/src/main.ts:1: cross-workspace src deep import "@zupulse/web-core/src/import/openScore"',
      'packages/web-core/src/core.ts:1: web-core must not import "react"',
      'packages/web-core/src/dom.ts:1: web-core must not import "react-dom"',
      'packages/web-viewer/src/view.ts:1: web-viewer must not import "fs"',
    ]);
  });

  it("ignores platform and test imports inside allowed test and Main boundaries", async () => {
    const root = await fixture({
      "apps/desktop-shell/src/main/files.ts": 'import { readFile } from "node:fs/promises";\n',
      "apps/desktop-shell/src/main/__tests__/files.test.ts": 'import { it } from "vitest";\n',
      "packages/web-viewer/src/__tests__/styles.test.ts": 'import { readFile } from "node:fs/promises";\n',
    });

    await expect(checkArchitecture(root)).resolves.toEqual([]);
  });

  it("reports test framework imports and test types exposed to runtime modules", async () => {
    const root = await fixture({
      "packages/web-core/src/runtime.ts": 'import { expect } from "vitest";\n',
      "packages/web-core/tsconfig.json": JSON.stringify({ compilerOptions: { types: ["node", "vitest"] } }),
    });

    expect(await checkArchitecture(root)).toEqual([
      'packages/web-core/src/runtime.ts:1: runtime module must not import test framework "vitest"',
      'packages/web-core/tsconfig.json: runtime compiler types must not include "vitest"',
    ]);
  });
});

describe("checkDesign", () => {
  it("accepts a current design contract whose adopted tokens match", async () => {
    const root = await fixture({
      "DESIGN.md": "---\nstatus: current\n---\n\n# Design\n",
      "theme.css":
        '@import url("font.css");\n/* theme tokens */\n:root { --brand-accent: #f26b4f; --brand-radius: 6px; }\n.dark { --brand-accent: #f5826a; }\n',
      "runtime.css":
        ':root { --radius-sm: 6px; }\n:root[data-theme="light"] { --accent-primary: #f26b4f; }\n:root[data-theme="dark"] { --accent-primary: #f5826a; }\n',
      "token-map.json": JSON.stringify({
        mappings: [
          {
            sourceScope: ":root",
            source: "--brand-radius",
            runtimeScope: ":root",
            runtime: "--radius-sm",
          },
          {
            sourceScope: ":root",
            source: "--brand-accent",
            runtimeScope: ':root[data-theme="light"]',
            runtime: "--accent-primary",
          },
          {
            sourceScope: ".dark",
            source: "--brand-accent",
            runtimeScope: ':root[data-theme="dark"]',
            runtime: "--accent-primary",
          },
        ],
      }),
    });

    await expect(
      checkDesign(root, {
        designPath: "DESIGN.md",
        sourceCssPath: "theme.css",
        runtimeCssPath: "runtime.css",
        mapPath: "token-map.json",
      }),
    ).resolves.toEqual([]);
  });

  it("reports missing endpoints and values that drift", async () => {
    const root = await fixture({
      "DESIGN.md": "# Design\n",
      "theme.css": ":root { --brand-accent: #f26b4f; }\n",
      "runtime.css": ':root[data-theme="light"] { --accent-primary: #000000; }\n',
      "token-map.json": JSON.stringify({
        mappings: [
          {
            sourceScope: ":root",
            source: "--brand-accent",
            runtimeScope: ':root[data-theme="light"]',
            runtime: "--accent-primary",
          },
          {
            sourceScope: ":root",
            source: "--missing",
            runtimeScope: ":root",
            runtime: "--also-missing",
          },
        ],
      }),
    });

    expect(
      await checkDesign(root, {
        designPath: "DESIGN.md",
        sourceCssPath: "theme.css",
        runtimeCssPath: "runtime.css",
        mapPath: "token-map.json",
      }),
    ).toEqual([
      "DESIGN.md: expected frontmatter status: current",
      "token-map.json: source token :root --missing is missing",
      'token-map.json: token drift :root --brand-accent (#f26b4f) != :root[data-theme="light"] --accent-primary (#000000)',
    ]);
  });

  it("reports undefined CSS variables while allowing fallbacks and Base UI runtime variables", async () => {
    const root = await fixture({
      "DESIGN.md": "---\nstatus: current\n---\n\n# Design\n",
      "theme.css": ":root { --brand-accent: #f26b4f; }\n",
      "runtime.css": ":root { --accent-primary: #f26b4f; }\n",
      "token-map.json": JSON.stringify({ mappings: [] }),
      "viewer/component.css": [
        ".defined { color: var(--accent-primary); }",
        ".fallback { color: var(--component-local, red); }",
        ".positioner { transform-origin: var(--transform-origin); }",
        ".missing { color: var(--missing-token); }",
      ].join("\n"),
    });

    expect(
      await checkDesign(root, {
        designPath: "DESIGN.md",
        sourceCssPath: "theme.css",
        runtimeCssPath: "runtime.css",
        mapPath: "token-map.json",
        stylesDir: "viewer",
      }),
    ).toEqual(["viewer/component.css:4: undefined CSS variable --missing-token"]);
  });

  it("rejects Tailwind utilities that bypass the semantic theme", async () => {
    const root = await fixture({
      "DESIGN.md": "---\nstatus: current\n---\n\n# Design\n",
      "theme.css": ":root { --brand-accent: #f26b4f; }\n",
      "runtime.css": ":root { --accent-primary: #f26b4f; }\n",
      "token-map.json": JSON.stringify({ mappings: [] }),
      "viewer/Component.tsx":
        '<div className="tw:bg-slate-500 tw:bg-[#fff] tw:rounded-2xl tw:font-mono tw:shadow-xl tw:bg-surface" />\n',
      "viewer/Component.test.tsx": 'expect(source).toMatch(/tw:shrink-0[^"]*tw:whitespace-nowrap[^"]*/);\n',
    });

    expect(
      await checkDesign(root, {
        designPath: "DESIGN.md",
        sourceCssPath: "theme.css",
        runtimeCssPath: "runtime.css",
        mapPath: "token-map.json",
        stylesDir: "viewer",
      }),
    ).toEqual([
      'viewer/Component.tsx:1: forbidden Tailwind utility "tw:bg-[#fff]"',
      'viewer/Component.tsx:1: forbidden Tailwind utility "tw:bg-slate-500"',
      'viewer/Component.tsx:1: forbidden Tailwind utility "tw:font-mono"',
      'viewer/Component.tsx:1: forbidden Tailwind utility "tw:rounded-2xl"',
      'viewer/Component.tsx:1: forbidden Tailwind utility "tw:shadow-xl"',
    ]);
  });

  it("rejects shared title eyebrows and glowing active status dots", async () => {
    const root = await fixture({
      "DESIGN.md": "---\nstatus: current\n---\n\n# Design\n",
      "theme.css": ":root { --brand-accent: #f26b4f; }\n",
      "runtime.css": ":root { --accent-primary: #f26b4f; }\n",
      "token-map.json": JSON.stringify({ mappings: [] }),
      "viewer/component.css": [
        ".panelTitle { letter-spacing: 0.08em; text-transform: uppercase; }",
        ".ledDot[data-active] { box-shadow: 0 0 6px var(--accent-primary); }",
      ].join("\n"),
    });

    expect(
      await checkDesign(root, {
        designPath: "DESIGN.md",
        sourceCssPath: "theme.css",
        runtimeCssPath: "runtime.css",
        mapPath: "token-map.json",
        stylesDir: "viewer",
      }),
    ).toEqual([
      "viewer/component.css:1: shared panel title must not use eyebrow typography",
      "viewer/component.css:2: active status dot must not use an outer glow",
    ]);
  });

  it("rejects legacy action classes and feature-owned Base UI anatomy", async () => {
    const root = await fixture({
      "DESIGN.md": "---\nstatus: current\n---\n\n# Design\n",
      "theme.css": ":root { --brand-accent: #f26b4f; }\n",
      "runtime.css": ":root { --accent-primary: #f26b4f; }\n",
      "token-map.json": JSON.stringify({ mappings: [] }),
      "viewer/features/library/Library.tsx": '<button className="primary-button">Retry</button>\n',
      "viewer/features/playback/Bpm.tsx": 'import { Popover } from "@base-ui/react/popover";\n',
      "viewer/components/ScoreViewer.tsx": 'import { Popover } from "@base-ui/react/popover";\n',
      "viewer/features/library/__tests__/Library.test.tsx": 'expect(source).not.toContain("secondary-button");\n',
    });

    expect(
      await checkDesign(root, {
        designPath: "DESIGN.md",
        sourceCssPath: "theme.css",
        runtimeCssPath: "runtime.css",
        mapPath: "token-map.json",
        stylesDir: "viewer",
      }),
    ).toEqual([
      'viewer/features/library/Library.tsx:1: legacy action class "primary-button" must use a shared action primitive',
      'viewer/features/playback/Bpm.tsx:1: feature must not import Base UI anatomy "@base-ui/react/popover"',
    ]);
  });
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-repository-checks-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const absolute = join(root, path);
      await mkdir(join(absolute, ".."), { recursive: true });
      await writeFile(absolute, contents);
    }),
  );
  return root;
}

function completeCurrentContract(input: {
  feature: string;
  title: string;
  implementationPaths?: string[];
  lastVerified?: string;
}): string {
  const paths = input.implementationPaths ?? [];
  return `---
feature: ${input.feature}
title: ${input.title}
status: current
delivery: available
last_verified: ${input.lastVerified ?? "2026-07-24"}
hosts: []
implementation_paths:${paths.length === 0 ? " []" : `\n${paths.map((path) => `  - ${path}`).join("\n")}`}
supersedes: []
---

# ${input.title}

## 一句话契约
## 用户入口
## 当前已实现行为
## 领域不变量
## 明确非目标
## 验收契约
## 证据地图
## 相关资料
## 维护触发器
`;
}
