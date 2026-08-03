// One-off generator for .design_library/tab-viewer-te-braun-theme/runtime-token-map.json.
// Verifies every candidate mapping against both CSS sources; fails on any drift.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceCss = readFileSync(join(root, ".design_library/tab-viewer-te-braun-theme/colors_and_type.css"), "utf8");
const runtimeCss = readFileSync(join(root, "packages/web-viewer/src/styles/tokens.css"), "utf8");

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

const sourceScopes = cssVariableScopes(sourceCss);
const runtimeScopes = cssVariableScopes(runtimeCss);

const LIGHT = ':root[data-shell="device"][data-theme="light"]';
const DARK = ':root[data-shell="device"][data-theme="dark"]';
const DEVICE = ':root[data-shell="device"]';
const CONTRACT_DARK = '[data-mode="dark"]';

const lightPrimitives = [
  "--device-body-light",
  "--device-body-mid",
  "--device-body-dark",
  "--device-body-glare",
  "--device-edge-highlight",
  "--device-edge-shade",
  "--device-texture-grain",
  "--device-plate-light",
  "--device-plate-dark",
  "--device-keybed",
  "--device-label",
  "--device-key-dark-face-hi",
  "--device-key-dark-face-lo",
  "--device-key-dark-edge",
  "--device-key-dark-text",
  "--device-key-light-face-hi",
  "--device-key-light-face-lo",
  "--device-key-light-edge",
  "--device-key-light-text",
  "--device-key-orange-face-hi",
  "--device-key-orange-face-lo",
  "--device-key-orange-edge",
  "--device-key-orange-glow",
  "--device-key-red-face-hi",
  "--device-key-red-face-lo",
  "--device-key-red-edge",
  "--device-key-travel",
  "--device-key-press",
  "--device-lcd-bg-hi",
  "--device-lcd-bg-mid",
  "--device-lcd-bg-lo",
  "--device-lcd-amber",
  "--device-lcd-amber-dim",
  "--device-lcd-glow",
  "--device-lcd-glare",
  "--device-lcd-signal-blue",
  "--device-lcd-signal-pink",
  "--device-lcd-signal-yellow",
  "--device-fader-rail",
  "--device-fader-fill",
  "--device-fader-cap-hi",
  "--device-fader-cap-lo",
  "--device-fader-indicator",
  "--device-readout-bg-hi",
  "--device-readout-bg-lo",
  "--device-readout-text",
  "--device-led-on",
  "--device-led-on-glow",
  "--device-led-off",
  "--device-radius-body",
  "--device-radius-panel",
  "--device-radius-lcd",
  "--device-radius-key",
  "--device-radius-inset",
];

const darkPrimitives = [
  "--device-body-light",
  "--device-body-mid",
  "--device-body-dark",
  "--device-body-glare",
  "--device-edge-highlight",
  "--device-edge-shade",
  "--device-texture-grain",
  "--device-plate-light",
  "--device-plate-dark",
  "--device-keybed",
  "--device-label",
  "--device-key-dark-face-hi",
  "--device-key-dark-face-lo",
  "--device-key-dark-edge",
  "--device-key-dark-text",
  "--device-key-light-edge",
  "--device-fader-rail",
  "--device-fader-cap-hi",
  "--device-fader-cap-lo",
  "--device-readout-bg-hi",
  "--device-readout-bg-lo",
  "--device-led-off",
];

const lightSemantics = [
  ["--device-body-mid", "--bg-app"],
  ["--device-plate-light", "--bg-panel"],
  ["--device-plate-dark", "--bg-panel-muted"],
  ["--device-key-light-face-hi", "--bg-elevated"],
  ["--device-key-light-face-lo", "--bg-control"],
  ["--device-score-paper-hi", "--bg-score"],
  ["--device-label", "--text-secondary"],
  ["--device-led-off", "--text-tertiary"],
  ["--device-key-light-edge", "--border-strong"],
  ["--device-key-orange-face-lo", "--accent-primary"],
  ["--device-key-orange-face-hi", "--accent-bright"],
  ["--device-fader-rail", "--meter-track"],
  ["--device-lcd-signal-blue", "--signal-blue"],
  ["--device-key-light-face-lo", "--transport-key-secondary-bg"],
  ["--device-key-light-text", "--transport-key-secondary-text"],
];

const darkSemantics = [
  [CONTRACT_DARK, "--device-body-mid", "--bg-app"],
  [CONTRACT_DARK, "--device-plate-light", "--bg-panel"],
  [CONTRACT_DARK, "--device-plate-dark", "--bg-panel-muted"],
  [CONTRACT_DARK, "--device-key-dark-face-hi", "--bg-elevated"],
  [CONTRACT_DARK, "--device-key-dark-face-lo", "--bg-control"],
  [CONTRACT_DARK, "--device-key-dark-text", "--text-primary"],
  [CONTRACT_DARK, "--device-label", "--text-secondary"],
  [CONTRACT_DARK, "--device-fader-cap-hi", "--border-strong"],
  [CONTRACT_DARK, "--device-fader-rail", "--meter-track"],
  [CONTRACT_DARK, "--device-key-dark-face-lo", "--transport-key-secondary-bg"],
  [CONTRACT_DARK, "--device-key-dark-text", "--transport-key-secondary-text"],
  [":root", "--device-score-paper-hi", "--bg-score"],
  [":root", "--device-key-orange-face-lo", "--accent-primary"],
  [":root", "--device-key-orange-face-hi", "--accent-bright"],
  [":root", "--device-lcd-signal-blue", "--signal-blue"],
];

const mappings = [
  ...lightPrimitives.map((token) => ({ sourceScope: ":root", source: token, runtimeScope: DEVICE, runtime: token })),
  ...darkPrimitives.map((token) => ({
    sourceScope: CONTRACT_DARK,
    source: token,
    runtimeScope: DARK,
    runtime: token,
  })),
  ...lightSemantics.map(([source, runtime]) => ({ sourceScope: ":root", source, runtimeScope: LIGHT, runtime })),
  ...darkSemantics.map(([sourceScope, source, runtime]) => ({
    sourceScope,
    source,
    runtimeScope: DARK,
    runtime,
  })),
];

const errors = [];
for (const mapping of mappings) {
  const sourceValue = resolveCssVariable(sourceScopes, mapping.sourceScope, mapping.source);
  const runtimeValue = resolveCssVariable(runtimeScopes, mapping.runtimeScope, mapping.runtime);
  if (sourceValue === undefined) errors.push(`missing source ${mapping.sourceScope} ${mapping.source}`);
  else if (runtimeValue === undefined) errors.push(`missing runtime ${mapping.runtimeScope} ${mapping.runtime}`);
  else if (sourceValue !== runtimeValue)
    errors.push(`drift ${mapping.source}/${mapping.runtime}: ${sourceValue} != ${runtimeValue}`);
}
if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

const outPath = join(root, ".design_library/tab-viewer-te-braun-theme/runtime-token-map.json");
writeFileSync(outPath, `${JSON.stringify({ mappings }, null, 2)}\n`);
console.log(`wrote ${mappings.length} mappings to ${outPath}`);
