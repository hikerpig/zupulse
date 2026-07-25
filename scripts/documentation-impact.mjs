import { extname } from "node:path";

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

function matchesImplementationPath(implementationPath, changedPath) {
  if (implementationPath === changedPath) return true;
  return extname(implementationPath) === "" && changedPath.startsWith(`${implementationPath}/`);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}
