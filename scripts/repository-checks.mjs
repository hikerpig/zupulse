import { readFile, readdir, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
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
  stylesDir: "packages/web-viewer/src",
};

const EXTERNAL_CSS_VARIABLES = new Set(["--transform-origin"]);
const TAILWIND_PALETTE_NAMES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const FORBIDDEN_TAILWIND_PATTERNS = [
  /^tw:(?:\[|[^\s"'[]*-\[)/,
  new RegExp(
    `^tw:(?:bg|text|border|ring|outline|decoration|accent|caret|fill|stroke|from|via|to|shadow)-(?:${TAILWIND_PALETTE_NAMES})(?:-|$)`,
  ),
  /^tw:font-(?:sans|serif|mono)$/,
  /^tw:rounded-(?:none|xs|sm|md|lg|xl|2xl|3xl|full)$/,
  /^tw:shadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner|none)$/,
];

const DEFAULT_DOCUMENTATION = {
  contractsDir: "docs/features/contracts",
  archiveDir: "docs/features/archive",
  indexPath: "docs/features/README.md",
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
  errors.push(...duplicateFeatureErrors(result.contracts));
  errors.push(...(await validateFeatureIndex(root, result.contracts, settings.indexPath)));
  for (const contract of result.contracts) {
    errors.push(...(await validateImplementationPaths(root, contract)));
    errors.push(...(await validateLocalLinks(root, contract.path, contract.contents)));
  }
  const indexContents = await read(join(root, settings.indexPath));
  if (indexContents !== undefined) {
    errors.push(...(await validateLocalLinks(root, settings.indexPath, indexContents, { skipContractLinks: true })));
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
  if (options.stylesDir !== undefined) {
    errors.push(...(await checkStyleContract(root, options.stylesDir, runtimeCss)));
  }
  return errors.sort();
}

async function checkStyleContract(root, stylesDir, runtimeCss) {
  const errors = [];
  const files = [];
  await walkMatching(join(root, stylesDir), files, /\.(?:css|ts|tsx)$/);
  const contentsByFile = await Promise.all(
    files.map(async (absolute) => ({
      absolute,
      path: relative(root, absolute).replaceAll("\\", "/"),
      contents: await readFile(absolute, "utf8"),
    })),
  );
  const definedVariables = new Set([...runtimeCss.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  for (const file of contentsByFile) {
    if (!file.path.endsWith(".css")) continue;
    for (const match of file.contents.matchAll(/(--[\w-]+)\s*:/g)) definedVariables.add(match[1]);
  }
  for (const file of contentsByFile) {
    for (const [index, line] of file.contents.split(/\r?\n/).entries()) {
      if (file.path.endsWith(".css")) {
        for (const match of line.matchAll(/var\(\s*(--[\w-]+)\s*(,|\))/g)) {
          const [, variable, terminator] = match;
          if (terminator === ")" && !definedVariables.has(variable) && !EXTERNAL_CSS_VARIABLES.has(variable)) {
            errors.push(`${file.path}:${index + 1}: undefined CSS variable ${variable}`);
          }
        }
      }
      for (const utility of line.match(/\btw:[^\s"'`<>]+/g) ?? []) {
        const normalized = utility.replace(/[),;]+$/, "");
        if (FORBIDDEN_TAILWIND_PATTERNS.some((pattern) => pattern.test(normalized))) {
          errors.push(`${file.path}:${index + 1}: forbidden Tailwind utility "${normalized}"`);
        }
      }
    }
    if (file.path.endsWith(".css")) errors.push(...antiSlopCssErrors(file));
  }
  return [...new Set(errors)];
}

function antiSlopCssErrors(file) {
  const errors = [];
  for (const block of file.contents.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim();
    const declarations = block[2];
    const selectorIndex = block.index + Math.max(0, block[1].search(/\S/));
    if (
      /\.panelTitle\b/.test(selector) &&
      /(?:letter-spacing\s*:|text-transform\s*:\s*uppercase\b)/.test(declarations)
    ) {
      errors.push(
        `${file.path}:${lineNumberAt(file.contents, selectorIndex)}: shared panel title must not use eyebrow typography`,
      );
    }
    if (/\.ledDot\[data-active\]/.test(selector) && /box-shadow\s*:/.test(declarations)) {
      errors.push(
        `${file.path}:${lineNumberAt(file.contents, selectorIndex)}: active status dot must not use an outer glow`,
      );
    }
  }
  return errors;
}

function lineNumberAt(contents, index) {
  return contents.slice(0, index).split(/\r?\n/).length;
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

function duplicateFeatureErrors(contracts) {
  const pathsByFeature = new Map();
  for (const contract of contracts) {
    if (typeof contract.frontmatter.feature !== "string") continue;
    const paths = pathsByFeature.get(contract.frontmatter.feature) ?? [];
    paths.push(contract.path);
    pathsByFeature.set(contract.frontmatter.feature, paths);
  }
  return [...pathsByFeature.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(
      ([feature, paths]) =>
        `feature ${feature} is declared by ${paths.sort((left, right) => left.localeCompare(right)).join(", ")}`,
    );
}

async function validateFeatureIndex(root, contracts, indexPath) {
  const contents = await read(join(root, indexPath));
  if (contents === undefined) return [`${indexPath}: feature contract index is missing`];
  const currentSection = markdownSection(contents, "Current Index");
  const entries = currentSection === undefined ? [] : featureIndexEntries(currentSection, indexPath);
  const errors = [];
  const counts = new Map();
  for (const entry of entries) counts.set(entry.path, (counts.get(entry.path) ?? 0) + 1);
  for (const [path, count] of counts) {
    if (count > 1) errors.push(`${indexPath}: duplicate current index entry ${path}`);
  }

  const contractsByPath = new Map(contracts.map((contract) => [contract.path, contract]));
  for (const path of counts.keys()) {
    const contract = contractsByPath.get(path);
    if (!contract) {
      errors.push(`${indexPath}: indexed contract ${path} does not exist`);
      continue;
    }
    if (contract.location !== "contracts" || contract.frontmatter.status !== "current") {
      errors.push(`${indexPath}: indexed contract ${path} is not current`);
    }
  }
  for (const entry of entries) {
    const contract = contractsByPath.get(entry.path);
    if (!contract) continue;
    if (entry.status !== undefined && entry.status !== contract.frontmatter.status) {
      errors.push(
        `${indexPath}: index entry ${entry.path} status ${entry.status} does not match contract status ${contract.frontmatter.status}`,
      );
    }
    if (entry.delivery !== undefined && entry.delivery !== contract.frontmatter.delivery) {
      errors.push(
        `${indexPath}: index entry ${entry.path} delivery ${entry.delivery} does not match contract delivery ${contract.frontmatter.delivery}`,
      );
    }
  }
  for (const contract of contracts) {
    if (contract.location === "contracts" && contract.frontmatter.status === "current" && !counts.has(contract.path)) {
      errors.push(`${contract.path}: current contract is missing from ${indexPath} index`);
    }
  }
  return errors;
}

function markdownSection(contents, title) {
  const match = new RegExp(`^## ${escapeRegExp(title)}\\s*$`, "m").exec(contents);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const next = /^## .+$/m.exec(contents.slice(start));
  return contents.slice(start, next === null ? undefined : start + next.index);
}

function featureIndexEntries(contents, indexPath) {
  const entries = [];
  for (const line of withoutFencedCode(contents).split(/\r?\n/)) {
    const isTableRow = /^\s*\|.*\|\s*$/.test(line);
    for (const match of line.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
      const target = localLinkTarget(match[1]);
      if (target?.startsWith("contracts/") !== true) continue;
      const entry = { path: join(dirname(indexPath), target).replaceAll("\\", "/") };
      if (isTableRow) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        const linkIndex = cells.findIndex((cell) => cell.includes(`](${match[1]})`));
        if (linkIndex >= 0) {
          entry.status = featureIndexCellValue(cells[linkIndex + 1]);
          entry.delivery = featureIndexCellValue(cells[linkIndex + 2]);
        }
      }
      entries.push(entry);
    }
  }
  return entries;
}

function featureIndexCellValue(cell) {
  const value = cell?.replaceAll("`", "").trim();
  return value === undefined || value === "" ? undefined : value;
}

async function validateImplementationPaths(root, contract) {
  const paths = contract.frontmatter.implementation_paths;
  if (!Array.isArray(paths)) return [];
  const errors = [];
  for (const path of paths) {
    if (!isRepositoryRelative(path) || !(await exists(resolve(root, path)))) {
      errors.push(`${contract.path}: implementation path ${path} does not exist`);
    }
  }
  return errors;
}

async function validateLocalLinks(root, sourcePath, contents, options = {}) {
  const errors = [];
  for (const match of withoutFencedCode(contents).matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = localLinkTarget(match[1]);
    if (target === undefined || (options.skipContractLinks && target.startsWith("contracts/"))) continue;
    const absolute = resolve(root, dirname(sourcePath), target);
    const repositoryPath = relative(root, absolute).replaceAll("\\", "/");
    if (!isRepositoryRelative(repositoryPath) || !(await exists(absolute))) {
      errors.push(`${sourcePath}: local link target ${repositoryPath} does not exist`);
    }
  }
  return errors;
}

function localLinkTarget(rawTarget) {
  const trimmed = rawTarget.trim().replace(/^<|>$/g, "");
  if (trimmed.startsWith("#") || trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return undefined;
  }
  const target = trimmed.split("#", 1)[0].split("?", 1)[0];
  return target === "" ? undefined : target;
}

function withoutFencedCode(contents) {
  let fence;
  return contents
    .split(/\r?\n/)
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker && fence === undefined) {
        fence = marker[0];
        return "";
      }
      if (marker && marker[0] === fence) {
        fence = undefined;
        return "";
      }
      return fence === undefined ? line : "";
    })
    .join("\n");
}

function isRepositoryRelative(path) {
  return path !== "" && path !== ".." && !path.startsWith("../") && !path.startsWith("/") && !path.includes("\\");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  await walkMatching(directory, files, /\.(?:ts|tsx)$/);
}

async function walkMatching(directory, files, pattern) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walkMatching(path, files, pattern);
    else if (pattern.test(entry.name)) files.push(path);
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

export async function runRepositoryCheck(command, root, options = {}) {
  if (!["context", "arch", "design", "docs"].includes(command)) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "Usage: node scripts/repository-checks.mjs <context|arch|design|docs>",
    };
  }
  const result =
    command === "context"
      ? { errors: await checkContext(root), warnings: [] }
      : command === "arch"
        ? { errors: await checkArchitecture(root), warnings: [] }
        : command === "design"
          ? { errors: await checkDesign(root), warnings: [] }
          : await checkDocumentation(root, options);
  const { errors, warnings } = result;
  if (errors.length > 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: errors.map((error) => `- ${error}`).join("\n"),
    };
  }
  return {
    exitCode: 0,
    stdout: [`${command} check passed`, ...warnings.map((warning) => `- ${warning}`)].join("\n"),
    stderr: "",
  };
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = await runRepositoryCheck(process.argv[2], root);
  if (result.stdout !== "") console.log(result.stdout);
  if (result.stderr !== "") console.error(result.stderr);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
