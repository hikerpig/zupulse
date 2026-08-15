import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 120,
  insertFinalNewline: true,
  singleQuote: false,
  trailingComma: "all",
  sortPackageJson: false,
  ignorePatterns: [
    "**/dist",
    "**/out",
    "**/test-results",
    "**/playwright-report",
    "**/.codex-design",
    "test-fixtures",
    "packages/web-core/src/harmony/harmony-paper-semi-crf-model.json",
    "tools/pdf-omr-cli/corpus/public-pianoform-v1/*.json",
    "tools/pdf-omr-cli/reports/development",
    "tmp/",
  ],
  sortTailwindcss: {
    stylesheet: "./packages/web-viewer/src/styles.css",
  },
});
