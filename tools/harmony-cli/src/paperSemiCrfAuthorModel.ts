import {
  PAPER_SEMI_CRF_FEATURE_VERSION,
  PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
  parsePaperSemiCrfLinearModel,
  type PaperSemiCrfLinearModel,
} from "@zupulse/web-core";

export async function importPaperSemiCrfAuthorModelFile(options: { inputPath: string; outputPath: string }) {
  const model = parsePaperSemiCrfAuthorModelText(await readFile(options.inputPath, "utf8"));
  const text = `${JSON.stringify(model, null, 2)}\n`;
  await writeFile(options.outputPath, text);
  return {
    command: "paper-semi-crf-import-author-model" as const,
    output: options.outputPath,
    sha256: createHash("sha256").update(text).digest("hex"),
    labels: model.labels.length,
    features: model.featureNames.length,
  };
}

export function parsePaperSemiCrfAuthorFeatureCounts(text: string, minFeatureCount: number): string[] {
  if (!Number.isSafeInteger(minFeatureCount) || minFeatureCount < 0) {
    throw new Error("paper Semi-CRF minFeatureCount must be a nonnegative integer");
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const match = /^(\S+)\s+(\d+)$/.exec(line);
      if (!match) throw new Error("invalid author feature-count row");
      return Number(match[2]) > minFeatureCount ? [match[1]!] : [];
    });
}

export function parsePaperSemiCrfAuthorModelText(text: string): PaperSemiCrfLinearModel {
  const maxSegmentLength = requiredInteger(text, /^Max span:\s*(\d+)\s*$/m, "Max span");
  const featureCount = requiredInteger(text, /^Num features:\s*(\d+)\s*$/m, "Num features");
  const labelsMatch = /Labels:\s*\n([\s\S]*?)\nNum features:/.exec(text);
  if (!labelsMatch) throw new Error("author model is missing labels");
  const labelEntries = labelsMatch[1]!
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = /^(.*?)\s+\(id:\s*(\d+)\)$/.exec(line);
      if (!match) throw new Error("invalid author model label");
      return { label: match[1]!, id: Number(match[2]) };
    });
  labelEntries.sort((left, right) => left.id - right.id);
  if (labelEntries.some((entry, index) => entry.id !== index)) {
    throw new Error("author model label ids must be contiguous");
  }
  const labels = labelEntries.map((entry) => entry.label);
  const featureSection = text.slice(text.indexOf("Features:", text.indexOf("Num features:")) + "Features:".length);
  const featureNames = Array.from({ length: featureCount }, () => "");
  const weights = Array.from({ length: featureCount }, () => Number.NaN);
  let featureType = "";
  for (const line of featureSection.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/^[A-Z][A-Z0-9_]*$/.test(trimmed)) {
      featureType = trimmed;
      continue;
    }
    if (featureType.length === 0) throw new Error("invalid author model feature section");
    const fields = trimmed.split(/\s+/);
    const booleanFeature = fields.length === 2;
    if (!booleanFeature && fields.length !== 3) throw new Error("invalid author model feature row");
    const id = Number(fields[booleanFeature ? 0 : 1]);
    const weight = Number(fields[booleanFeature ? 1 : 2]);
    if (!Number.isSafeInteger(id) || id < 0 || id >= featureCount) {
      throw new Error("author model feature ids must be contiguous");
    }
    if (!Number.isFinite(weight)) {
      throw new Error("invalid author model feature row");
    }
    featureNames[id] = booleanFeature ? featureType : `${featureType}_${fields[0]}`;
    weights[id] = weight;
  }
  if (featureNames.some((name) => name.length === 0) || weights.some((weight) => !Number.isFinite(weight))) {
    throw new Error("author model feature ids must be contiguous");
  }
  return parsePaperSemiCrfLinearModel({
    schemaVersion: "paper-semi-crf-linear-v1",
    labelMappingVersion: PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
    featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION,
    labels,
    featureNames,
    weights,
    maxSegmentLength,
  });
}

function requiredInteger(text: string, pattern: RegExp, name: string): number {
  const value = Number(pattern.exec(text)?.[1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`author model is missing ${name}`);
  return value;
}
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
