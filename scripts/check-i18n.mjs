import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const scanRoots = [path.join(root, "packages/web-viewer/src")];
const staticAttributes = new Set(["aria-label", "title", "placeholder", "alt"]);
const allowedText = new Set(["BPM", "BPM ·", "x", "ZUPULSE"]);

export function checkI18nSource(source, fileName = "source.tsx") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];

  const report = (node, text, kind) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const sourceLines = source.split(/\r?\n/);
    const ownLine = sourceLines[line] ?? "";
    const previousLine = sourceLines[line - 1] ?? "";
    if (`${previousLine}\n${ownLine}`.includes("i18n-ignore:")) return;
    violations.push({ file: fileName, line: line + 1, text, kind });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (text && /[\p{L}]/u.test(text) && !allowedText.has(text)) report(node, text, "JSX text");
    }
    if (
      ts.isJsxAttribute(node) &&
      staticAttributes.has(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      const text = node.initializer.text.trim();
      if (text) report(node, text, `static ${node.name.text}`);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function collectTsxFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") return [];
      return collectTsxFiles(target);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") ? [target] : [];
  });
}

export function checkRepositoryI18n() {
  return scanRoots.flatMap((directory) =>
    collectTsxFiles(directory).flatMap((file) =>
      checkI18nSource(fs.readFileSync(file, "utf8"), path.relative(root, file)),
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const violations = checkRepositoryI18n();
  if (violations.length) {
    for (const violation of violations) {
      console.error(
        `${violation.file}:${violation.line}: hardcoded ${violation.kind} "${violation.text}". Move user-visible copy to @zupulse/app-i18n or add an i18n-ignore comment with a reason.`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log("i18n hardcoded-copy check passed");
  }
}
