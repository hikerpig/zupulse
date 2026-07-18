import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkArchitecture, checkContext, checkDesign } from "../repository-checks.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
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
