import { execFile } from "node:child_process";
import { extname } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { readFeatureContracts } from "./repository-checks.mjs";

const execFileAsync = promisify(execFile);

export function analyzeDocumentationImpact(contracts, changedFiles) {
  const changedPaths = [...new Set(changedFiles.map(normalizePath))].sort((left, right) => left.localeCompare(right));
  return contracts
    .filter(
      (contract) =>
        contract.location === "contracts" &&
        contract.frontmatter.status === "current" &&
        Array.isArray(contract.frontmatter.implementation_paths),
    )
    .map((contract) => {
      const implementationPaths = contract.frontmatter.implementation_paths.map(normalizePath);
      const matchedPaths = changedPaths.filter((changedPath) =>
        implementationPaths.some((implementationPath) => matchesImplementationPath(implementationPath, changedPath)),
      );
      return {
        contractPath: contract.path,
        contractUpdated: changedPaths.includes(contract.path),
        feature: contract.frontmatter.feature,
        title: contract.frontmatter.title,
        changedPaths: matchedPaths,
      };
    })
    .filter((finding) => finding.changedPaths.length > 0)
    .sort((left, right) => left.contractPath.localeCompare(right.contractPath));
}

export function renderDocumentationImpact(findings) {
  if (findings.length === 0) return "no feature contracts affected";
  return findings
    .map((finding) => {
      const lines = [
        `${finding.title} may require review:`,
        ...finding.changedPaths.map((path) => `- ${path} changed`),
      ];
      if (finding.contractUpdated) lines.push(`- ${finding.contractPath} contract updated`);
      else lines.push(`- ${finding.contractPath} was not changed`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export async function runDocumentationImpact(root, args, options = {}) {
  if (args.length !== 2 || args[0] !== "--base" || args[1] === "") {
    return {
      exitCode: 2,
      output: "Usage: pnpm docs:impact --base <commit>",
    };
  }
  const gitChangedFiles = options.gitChangedFiles ?? readGitChangedFiles;
  const [contracts, changedFiles] = await Promise.all([readFeatureContracts(root), gitChangedFiles(root, args[1])]);
  if (contracts.errors.length > 0) {
    return {
      exitCode: 1,
      output: contracts.errors.map((error) => `- ${error}`).join("\n"),
    };
  }
  return {
    exitCode: 0,
    output: renderDocumentationImpact(analyzeDocumentationImpact(contracts.contracts, changedFiles)),
  };
}

async function readGitChangedFiles(root, base) {
  const { stdout } = await execFileAsync("git", gitDiffArguments(base), {
    cwd: root,
    encoding: "utf8",
  });
  return stdout.split(/\r?\n/).filter(Boolean);
}

export function gitDiffArguments(base) {
  return ["diff", "--name-only", "--diff-filter=ACDMR", `${base}...HEAD`];
}

function matchesImplementationPath(implementationPath, changedPath) {
  if (implementationPath === changedPath) return true;
  return extname(implementationPath) === "" && changedPath.startsWith(`${implementationPath}/`);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runDocumentationImpact(process.cwd(), process.argv.slice(2));
  console.log(result.output);
  process.exitCode = result.exitCode;
}
