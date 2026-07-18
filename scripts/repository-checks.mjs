import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTEXT = {
  requiredFiles: [
    "AGENTS.md",
    "CONTEXT.md",
    "packages/web-core/AGENTS.md",
    "packages/web-viewer/AGENTS.md",
    "apps/web-demo/AGENTS.md",
    "apps/desktop-shell/AGENTS.md",
    "apps/desktop-shell/src/main/AGENTS.md",
    "docs/architecture/README.md",
    "docs/architecture/harmony-analysis-system.md",
    "docs/adr/README.md",
    "packages/web-core/docs/harmony.md",
    "tools/harmony-cli/docs/evaluation.md",
    "tasks/TEMPLATE.md",
  ],
  historicalFiles: [
    "docs/architecture/viewer-architecture-overview.md",
    "docs/architecture/score-model-bridge-storage-design.md",
  ],
};

const RUNTIME_TSCONFIGS = [
  "packages/web-core/tsconfig.json",
  "packages/web-viewer/tsconfig.json",
  "apps/web-demo/tsconfig.json",
  "apps/desktop-shell/tsconfig.json",
];

export async function checkContext(root, options = DEFAULT_CONTEXT) {
  const errors = [];
  for (const path of options.requiredFiles) {
    if ((await read(join(root, path))) === undefined) errors.push(`${path}: required context file is missing`);
  }
  for (const path of options.historicalFiles) {
    const contents = await read(join(root, path));
    if (contents !== undefined && !/^---\r?\n[\s\S]*?^status: historical\r?$/m.test(contents)) {
      errors.push(`${path}: expected frontmatter status: historical`);
    }
  }
  return errors.sort();
}

export async function checkArchitecture(root) {
  const errors = [];
  for (const absolute of await sourceFiles(root)) {
    const path = relative(root, absolute).replaceAll("\\", "/");
    const isTest = path.includes("/__tests__/") || path.includes("/e2e/");
    const contents = await readFile(absolute, "utf8");
    for (const [index, line] of contents.split(/\r?\n/).entries()) {
      for (const specifier of importSpecifiers(line)) {
        const location = `${path}:${index + 1}`;
        if (/^@zupulse\/(web-core|web-viewer)\/src(?:\/|$)/.test(specifier)) {
          errors.push(`${location}: cross-workspace src deep import "${specifier}"`);
        }
        if (!isTest && (specifier === "vitest" || specifier === "@playwright/test")) {
          errors.push(`${location}: runtime module must not import test framework "${specifier}"`);
        }
        if (!isTest && path.startsWith("packages/web-core/") && isWebCorePlatformImport(specifier)) {
          errors.push(`${location}: web-core must not import "${specifier}"`);
        }
        if (!isTest && path.startsWith("packages/web-viewer/") && isPlatformImport(specifier)) {
          errors.push(`${location}: web-viewer must not import "${specifier}"`);
        }
        if (!isTest && isDesktopRenderer(path) && isPlatformImport(specifier)) {
          errors.push(`${location}: Desktop Renderer must not import "${specifier}"`);
        }
      }
    }
  }
  for (const path of RUNTIME_TSCONFIGS) {
    const contents = await read(join(root, path));
    if (contents === undefined) continue;
    const types = JSON.parse(contents).compilerOptions?.types ?? [];
    if (types.includes("vitest")) errors.push(`${path}: runtime compiler types must not include "vitest"`);
  }
  return errors.sort();
}

function importSpecifiers(line) {
  return [...line.matchAll(/(?:from\s*|import\s*\(|import\s*)["']([^"']+)["']/g)].map((match) => match[1]);
}

function isWebCorePlatformImport(specifier) {
  return (
    isPlatformImport(specifier) ||
    specifier === "react" ||
    specifier.startsWith("react/") ||
    specifier === "react-dom" ||
    specifier.startsWith("react-dom/")
  );
}

function isPlatformImport(specifier) {
  return specifier === "electron" || specifier.startsWith("node:") || builtinModules.includes(specifier);
}

function isDesktopRenderer(path) {
  return path === "apps/desktop-shell/src/renderer.ts" || path.startsWith("apps/desktop-shell/src/renderer/");
}

async function sourceFiles(root) {
  const files = [];
  for (const directory of [
    "packages/web-core/src",
    "packages/web-viewer/src",
    "apps/web-demo/src",
    "apps/desktop-shell/src",
  ]) {
    await walk(join(root, directory), files);
  }
  return files;
}

async function walk(directory, files) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
}

async function read(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const command = process.argv[2];
  const errors =
    command === "context" ? await checkContext(root) : command === "arch" ? await checkArchitecture(root) : [];
  if (command !== "context" && command !== "arch") {
    console.error("Usage: node scripts/repository-checks.mjs <context|arch>");
    process.exitCode = 2;
    return;
  }
  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${command} check passed`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
