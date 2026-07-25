import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONTEXT = {
  requiredFiles: [
    "AGENTS.md",
    "CONTEXT.md",
    "DESIGN.md",
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

const DEFAULT_DESIGN = {
  designPath: "DESIGN.md",
  sourceCssPath: ".design_library/zupulse-te-braun-theme/colors_and_type.css",
  runtimeCssPath: "packages/web-viewer/src/styles/tokens.css",
  mapPath: ".design_library/zupulse-te-braun-theme/runtime-token-map.json",
};

const DEFAULT_DOCUMENTATION = {
  contractsDir: "docs/features/contracts",
  archiveDir: "docs/features/archive",
};

const FEATURE_CONTRACT_KEYS = new Set([
  "feature",
  "title",
  "status",
  "delivery",
  "last_verified",
  "hosts",
  "implementation_paths",
  "supersedes",
]);
const FEATURE_CONTRACT_STATUSES = ["draft", "current", "deprecated", "historical"];
const FEATURE_DELIVERY_STATUSES = ["planned", "in_progress", "partial", "available", "retired"];
const CURRENT_CONTRACT_SECTIONS = [
  "一句话契约",
  "用户入口",
  "当前已实现行为",
  "领域不变量",
  "明确非目标",
  "验收契约",
  "证据地图",
  "相关资料",
  "维护触发器",
];

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

export async function readFeatureContracts(root, options = DEFAULT_DOCUMENTATION) {
  const contracts = [];
  const errors = [];
  for (const [location, directory] of [
    ["contracts", options.contractsDir],
    ["archive", options.archiveDir],
  ]) {
    let entries;
    try {
      entries = await readdir(join(root, directory), { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT" && location === "archive") continue;
      if (error?.code === "ENOENT") {
        errors.push(`${directory}: feature contract directory is missing`);
        continue;
      }
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const path = join(directory, entry.name).replaceAll("\\", "/");
      const contents = await readFile(join(root, path), "utf8");
      const parsed = parseFrontmatter(contents, path);
      if (parsed.errors.length > 0) {
        errors.push(...parsed.errors);
        continue;
      }
      contracts.push({
        path,
        location,
        contents,
        frontmatter: parsed.frontmatter,
      });
    }
  }
  return {
    contracts: contracts.sort((left, right) => left.path.localeCompare(right.path)),
    errors: errors.sort(),
  };
}

export async function checkDocumentation(root, options = {}) {
  const settings = { ...DEFAULT_DOCUMENTATION, ...options };
  const result = await readFeatureContracts(root, settings);
  const errors = [...result.errors];
  const warnings = [];
  for (const contract of result.contracts) {
    const validation = validateFeatureContract(contract, settings.now ?? new Date());
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);
  }
  return {
    errors: errors.sort(),
    warnings: warnings.sort(),
  };
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

export async function checkDesign(root, options = DEFAULT_DESIGN) {
  const errors = [];
  const design = await read(join(root, options.designPath));
  const sourceCss = await read(join(root, options.sourceCssPath));
  const runtimeCss = await read(join(root, options.runtimeCssPath));
  const mapContents = await read(join(root, options.mapPath));

  for (const [path, contents] of [
    [options.designPath, design],
    [options.sourceCssPath, sourceCss],
    [options.runtimeCssPath, runtimeCss],
    [options.mapPath, mapContents],
  ]) {
    if (contents === undefined) errors.push(`${path}: required design file is missing`);
  }
  if (design !== undefined && !/^---\r?\n[\s\S]*?^status: current\r?$/m.test(design)) {
    errors.push(`${options.designPath}: expected frontmatter status: current`);
  }
  if (sourceCss === undefined || runtimeCss === undefined || mapContents === undefined) return errors.sort();

  let mappings;
  try {
    mappings = JSON.parse(mapContents).mappings;
  } catch {
    return [...errors, `${options.mapPath}: expected valid JSON`].sort();
  }
  if (!Array.isArray(mappings)) return [...errors, `${options.mapPath}: expected a mappings array`].sort();

  const sourceScopes = cssVariableScopes(sourceCss);
  const runtimeScopes = cssVariableScopes(runtimeCss);
  for (const mapping of mappings) {
    const sourceValue = resolveCssVariable(sourceScopes, mapping.sourceScope, mapping.source);
    if (sourceValue === undefined) {
      errors.push(`${options.mapPath}: source token ${mapping.sourceScope} ${mapping.source} is missing`);
      continue;
    }
    const runtimeValue = resolveCssVariable(runtimeScopes, mapping.runtimeScope, mapping.runtime);
    if (runtimeValue === undefined) {
      errors.push(`${options.mapPath}: runtime token ${mapping.runtimeScope} ${mapping.runtime} is missing`);
      continue;
    }
    if (sourceValue !== runtimeValue) {
      errors.push(
        `${options.mapPath}: token drift ${mapping.sourceScope} ${mapping.source} (${sourceValue}) != ${mapping.runtimeScope} ${mapping.runtime} (${runtimeValue})`,
      );
    }
  }
  return errors.sort();
}

function validateFeatureContract(contract, now) {
  const { frontmatter, path, location, contents } = contract;
  const errors = [];
  const warnings = [];
  for (const key of Object.keys(frontmatter)) {
    if (!FEATURE_CONTRACT_KEYS.has(key)) errors.push(`${path}: unsupported frontmatter key ${key}`);
  }
  if (typeof frontmatter.feature !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.feature)) {
    errors.push(`${path}: expected feature to be a non-empty kebab-case slug`);
  }
  if (typeof frontmatter.title !== "string" || frontmatter.title.trim() === "") {
    errors.push(`${path}: expected title to be a non-empty string`);
  }
  if (!FEATURE_CONTRACT_STATUSES.includes(frontmatter.status)) {
    errors.push(`${path}: expected status: ${FEATURE_CONTRACT_STATUSES.join("|")}`);
  }
  if (!FEATURE_DELIVERY_STATUSES.includes(frontmatter.delivery)) {
    errors.push(`${path}: expected delivery: ${FEATURE_DELIVERY_STATUSES.join("|")}`);
  }
  const verifiedAt = parseDate(frontmatter.last_verified);
  if (verifiedAt === undefined) {
    errors.push(`${path}: expected last_verified to be a valid YYYY-MM-DD date`);
  }
  for (const key of ["hosts", "implementation_paths", "supersedes"]) {
    if (!Array.isArray(frontmatter[key]) || !frontmatter[key].every((value) => typeof value === "string")) {
      errors.push(`${path}: expected ${key} to be a string list`);
    }
  }

  if (frontmatter.status === "current" && location !== "contracts") {
    errors.push(`${path}: current contract must be in docs/features/contracts`);
  }
  if (location === "contracts" && frontmatter.status === "historical" && frontmatter.delivery === "retired") {
    errors.push(`${path}: historical retired contract must be in docs/features/archive`);
  }
  if (location === "archive") {
    if (frontmatter.status !== "deprecated" && frontmatter.status !== "historical") {
      errors.push(`${path}: archived contract must have status: deprecated|historical`);
    }
    if (frontmatter.delivery === "available") {
      errors.push(`${path}: archived contract must not have delivery: available`);
    }
  }

  const sections = new Set([...contents.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1]));
  if (frontmatter.status === "current") {
    for (const section of CURRENT_CONTRACT_SECTIONS) {
      if (!sections.has(section)) errors.push(`${path}: missing required section ## ${section}`);
    }
  }
  if (["planned", "in_progress", "partial"].includes(frontmatter.delivery)) {
    if (!sections.has("进行中的目标差异") && !sections.has("已知差距")) {
      errors.push(`${path}: delivery ${frontmatter.delivery} requires ## 进行中的目标差异 or ## 已知差距`);
    }
  }
  if (frontmatter.status === "current" && verifiedAt !== undefined) {
    const ageDays = Math.floor((startOfUtcDay(now).getTime() - verifiedAt.getTime()) / 86_400_000);
    if (ageDays > 30) warnings.push(`${path}: last_verified ${frontmatter.last_verified} is older than 30 days`);
  }
  return { errors, warnings };
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? undefined : date;
}

function startOfUtcDay(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseFrontmatter(contents, path) {
  const lines = contents.split(/\r?\n/);
  if (lines[0] !== "---") {
    return {
      frontmatter: {},
      errors: [`${path}:1: expected frontmatter opening delimiter`],
    };
  }
  const closing = lines.indexOf("---", 1);
  if (closing === -1) {
    return {
      frontmatter: {},
      errors: [`${path}: expected frontmatter closing delimiter`],
    };
  }

  const frontmatter = {};
  const errors = [];
  let listKey;
  let listLineNumber;
  for (let index = 1; index < closing; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (line.trim() === "") continue;
    const listItem = line.match(/^ {2}- (.+)$/);
    if (listItem) {
      if (listKey === undefined) {
        errors.push(`${path}:${lineNumber}: frontmatter list item has no key`);
        continue;
      }
      frontmatter[listKey].push(listItem[1]);
      continue;
    }
    if (/^\s/.test(line)) {
      errors.push(`${path}:${lineNumber}: unsupported nested frontmatter`);
      listKey = undefined;
      listLineNumber = undefined;
      continue;
    }
    if (listKey !== undefined && frontmatter[listKey].length === 0) {
      errors.push(`${path}:${listLineNumber}: frontmatter list ${listKey} requires at least one item or []`);
    }
    listKey = undefined;
    listLineNumber = undefined;

    const field = line.match(/^([a-z][a-z0-9_]*):(.*)$/);
    if (!field) {
      errors.push(`${path}:${lineNumber}: malformed frontmatter field`);
      continue;
    }
    const key = field[1];
    const value = field[2].trim();
    if (Object.hasOwn(frontmatter, key)) {
      errors.push(`${path}:${lineNumber}: duplicate frontmatter key ${key}`);
      continue;
    }
    if (value === "") {
      frontmatter[key] = [];
      listKey = key;
      listLineNumber = lineNumber;
      continue;
    }
    if (value === "[]") {
      frontmatter[key] = [];
      continue;
    }
    if (/^[\[{\]|>]/.test(value)) {
      errors.push(`${path}:${lineNumber}: unsupported frontmatter value for ${key}`);
      continue;
    }
    frontmatter[key] = value;
  }
  if (listKey !== undefined && frontmatter[listKey].length === 0) {
    errors.push(`${path}:${listLineNumber}: frontmatter list ${listKey} requires at least one item or []`);
  }
  return { frontmatter, errors };
}

function cssVariableScopes(css) {
  const scopes = new Map();
  const normalized = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@import[^\r\n]*\r?\n/gm, "");
  for (const block of normalized.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim();
    const variables = new Map();
    for (const declaration of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      variables.set(declaration[1], declaration[2].trim().toLowerCase());
    }
    if (variables.size > 0) scopes.set(selector, variables);
  }
  return scopes;
}

function resolveCssVariable(scopes, scope, token, seen = new Set()) {
  const key = `${scope} ${token}`;
  if (seen.has(key)) return undefined;
  seen.add(key);
  const value = scopes.get(scope)?.get(token) ?? (scope === ":root" ? undefined : scopes.get(":root")?.get(token));
  const reference = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
  return reference === undefined ? value : resolveCssVariable(scopes, scope, reference, seen);
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
    command === "context"
      ? await checkContext(root)
      : command === "arch"
        ? await checkArchitecture(root)
        : command === "design"
          ? await checkDesign(root)
          : [];
  if (command !== "context" && command !== "arch" && command !== "design") {
    console.error("Usage: node scripts/repository-checks.mjs <context|arch|design>");
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
