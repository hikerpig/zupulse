import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { runEngineProcess, type EngineProcessResult } from "../engine-runner";
import { combineProcessResourceUsage, type ProcessResourceUsage } from "../resource-metrics";
import {
  normalizeRokotOutput,
  parseRokotSystemBundle,
  validateRokotAbc,
  type RokotSystemBundle,
} from "../normalizers/rokot";
import { encodeRgbaPng, renderPdfPages, type RenderedPdfPage } from "../render-pdf-pages";
import {
  STAFF_SYSTEM_SEGMENTATION_PARAMETERS,
  segmentStaffSystems,
  type StaffSystem,
  type StaffSystemSegmentation,
} from "../staff-system-segmentation";
import type { OmrEngineAdapter } from "./types";

const defaultModelRevision = "7add305aade6fb3a64ad4dde77d410fa68381089";
const defaultModelSha256 = "df53948ada1a4a584b4c7c81cc7e3293d3457f2e5ec9688271693459eb950f25";
const defaultMmprojSha256 = "1074d47f6fd864bffa9d8843bbae30e6aa696ad0d55535ebd77053d81c699bd0";
const defaultLlamaBuild = "b10200-5f55650a7";
const abcConverterVersion = "1.0.1";
const prompt = "Transcribe this staff to rokot-ABC.";

export type RokotAdapterOptions = {
  llamaCliPath?: string;
  modelPath?: string;
  mmprojPath?: string;
  abc2xmlPythonPath?: string;
  abc2xmlRunnerPath?: string;
  modelRevision?: string;
  modelSha256?: string;
  mmprojSha256?: string;
  llamaBuild?: string;
  environment?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type RokotAbcConversionRequest = {
  pythonExecutable: string;
  runnerPath: string;
  inputPath: string;
  outputPath: string;
  environment?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export function createRokotAdapter(options: RokotAdapterOptions): OmrEngineAdapter {
  return {
    async inspectEnvironment(signal) {
      const configuration = requireConfiguration(options);
      const processOptions = {
        ...(options.environment === undefined ? {} : { env: options.environment }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
      };
      const [modelHash, mmprojHash, llamaVersion, converter] = await Promise.all([
        streamingSha256(configuration.modelPath).catch((error: unknown) => {
          throw unavailable("model-unreadable", error);
        }),
        streamingSha256(configuration.mmprojPath).catch((error: unknown) => {
          throw unavailable("mmproj-unreadable", error);
        }),
        runEngineProcess({ command: configuration.llamaCliPath, args: ["--version"], ...processOptions }, signal).catch(
          (error: unknown) => {
            if (isInterrupted(error)) throw error;
            throw unavailable("llama-build-mismatch", error);
          },
        ),
        runEngineProcess(
          {
            command: configuration.abc2xmlPythonPath,
            args: [configuration.abc2xmlRunnerPath, "inspect", "--expected-version", abcConverterVersion],
            ...processOptions,
          },
          signal,
        ).catch((error: unknown) => {
          if (isInterrupted(error)) throw error;
          throw unavailable("abc-converter-unavailable", error);
        }),
      ]);
      if (modelHash !== configuration.modelSha256) throw unavailable("model-hash-mismatch");
      if (mmprojHash !== configuration.mmprojSha256) throw unavailable("mmproj-hash-mismatch");
      const actualLlamaBuild = parseLlamaBuild(`${llamaVersion.stdout}\n${llamaVersion.stderr}`);
      if (actualLlamaBuild !== configuration.llamaBuild) throw unavailable("llama-build-mismatch");
      if (parseConverterVersion(converter.stdout) !== abcConverterVersion) {
        throw unavailable("abc-converter-unavailable");
      }

      return {
        id: "rokot",
        version: configuration.modelRevision,
        executable: basename(configuration.llamaCliPath),
        modelSha256: modelHash,
        parameters: {
          abcConverterLicense: "LGPL-3.0-only",
          abcConverterPackage: "abc-xml-converter",
          abcConverterVersion,
          concurrency: 1,
          llamaCppBuild: actualLlamaBuild,
          maxNewTokens: 1600,
          modelRevision: configuration.modelRevision,
          prompt,
          reasoning: "off",
          segmentationAllowFragmentedRuns: true,
          segmentationAllowLandscape: true,
          segmentationStaffLayout: "auto",
          segmentationCropPaddingMultiplier: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.cropPaddingMultiplier,
          segmentationContinuousRowCoverage: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.continuousRowCoverage,
          segmentationDetectorVersion: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion,
          segmentationFragmentedRowCoverage: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedRowCoverage,
          segmentationFragmentedRunContainmentRatio: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedRunContainmentRatio,
          segmentationFragmentedSpacingToleranceRatio:
            STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedSpacingToleranceRatio,
          segmentationHorizontalRunCoverage: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.horizontalRunCoverage,
          segmentationMaximumGrandStaffGapMultiplier:
            STAFF_SYSTEM_SEGMENTATION_PARAMETERS.maximumGrandStaffGapMultiplier,
          segmentationMaximumStaffSpacingPx: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.maximumStaffSpacingPx,
          segmentationMinimumConnectorCoverage: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumConnectorCoverage,
          segmentationMinimumCurvedConnectorCoverage:
            STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumCurvedConnectorCoverage,
          segmentationMinimumGrandStaffGapMultiplier:
            STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumGrandStaffGapMultiplier,
          segmentationMinimumStaffSpacingPx: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumStaffSpacingPx,
          segmentationSpacingToleranceRatio: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.spacingToleranceRatio,
          temperature: 0,
          visionProjectorSha256: mmprojHash,
        },
        commandTemplate: [
          "-m",
          "<model.gguf>",
          "-mm",
          "<mmproj.gguf>",
          "--image",
          "<system.png>",
          "-p",
          prompt,
          "-n",
          "1600",
          "--temp",
          "0",
          "--single-turn",
          "--reasoning",
          "off",
          "--no-display-prompt",
          "--no-show-timings",
          "-o",
          "<system.abc>",
        ],
        license: {
          id: "CC-BY-NC-4.0",
          source: "https://huggingface.co/rokotmidi/rokot-omr-2b",
        },
      };
    },

    async recognize(request) {
      const configuration = requireConfiguration(options);
      const processOptions = {
        ...(options.environment === undefined ? {} : { env: options.environment }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
      };
      const inputBytes = await readFile(request.inputPath).catch((error: unknown) => {
        throw new PdfOmrError("INVALID_INPUT", "input PDF cannot be read", {
          context: { reason: "unreadable-pdf" },
          cause: error,
        });
      });
      const pages = await renderPdfPages(inputBytes, {
        targetWidth: 1400,
        allowLandscape: true,
        ...(request.standardFontDirectory === undefined
          ? {}
          : { standardFontDirectory: request.standardFontDirectory }),
        ...(request.wasmDirectory === undefined ? {} : { wasmDirectory: request.wasmDirectory }),
      });
      const inputScope = request.inputScope ?? "full-page";
      let segmentation: StaffSystemSegmentation;
      try {
        segmentation =
          inputScope === "system-crop"
            ? systemCropSegmentation(pages, request.staffLayout)
            : segmentStaffSystems(pages, {
                allowFragmentedRuns: true,
                staffLayout: request.staffLayout ?? "auto",
              });
      } catch (error) {
        await writeSegmentationFailureEvidence(request.outputDirectory, pages, error);
        throw error;
      }
      const systems = [...segmentation.systems].sort(
        (left, right) => left.pageIndex - right.pageIndex || left.systemIndex - right.systemIndex,
      );
      const systemsDirectory = join(request.outputDirectory, "systems");
      await mkdir(systemsDirectory, { recursive: true });
      const artifacts: Array<{ relativePath: string; bytes: Uint8Array }> = [];
      const bundleSystems: RokotSystemBundle["systems"] = [];
      const segmentationSystems: Array<Record<string, unknown>> = [];
      let durationMs = 0;
      const resourceUsages: ProcessResourceUsage[] = [];

      for (const [systemOffset, system] of systems.entries()) {
        const stem = systemStem(system.pageIndex, system.systemIndex);
        const pngBytes = encodeRgbaPng(system.pixelBBox.width, system.pixelBBox.height, system.cropPixels);
        const pngPath = join(systemsDirectory, `${stem}.png`);
        const rawAbcPath = join(systemsDirectory, `${stem}.raw.abc`);
        const canonicalAbcPath = join(systemsDirectory, `${stem}.abc`);
        const musicXmlPath = join(systemsDirectory, `${stem}.musicxml`);
        await writeFile(pngPath, pngBytes, { flag: "wx" });
        const inference = await runEngineProcess(
          {
            command: configuration.llamaCliPath,
            args: [
              "-m",
              configuration.modelPath,
              "-mm",
              configuration.mmprojPath,
              "--image",
              pngPath,
              "-p",
              prompt,
              "-n",
              "1600",
              "--temp",
              "0",
              "--single-turn",
              "--reasoning",
              "off",
              "--no-display-prompt",
              "--no-show-timings",
              "-o",
              rawAbcPath,
            ],
            ...processOptions,
          },
          request.signal,
        );
        const rawAbcBytes = await readFile(rawAbcPath).catch((error: unknown) => {
          throw invalidOutput("invalid-rokot-abc-envelope", error);
        });
        let abc: string;
        try {
          abc = extractCanonicalAbc(rawAbcBytes, system.staffLayout);
        } catch (error) {
          await writeInferenceFailureEvidence(request.outputDirectory, stem, pngBytes, rawAbcBytes, error);
          throw error;
        }
        const abcBytes = new TextEncoder().encode(abc);
        await writeFile(canonicalAbcPath, abcBytes, { flag: "wx" });
        const conversion = await convertRokotAbc(
          {
            pythonExecutable: configuration.abc2xmlPythonPath,
            runnerPath: configuration.abc2xmlRunnerPath,
            inputPath: canonicalAbcPath,
            outputPath: musicXmlPath,
            ...(options.environment === undefined ? {} : { environment: options.environment }),
            ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
            ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
          },
          request.signal,
        );
        const musicXmlBytes = await readFile(musicXmlPath);
        const musicXml = new TextDecoder("utf-8", { fatal: true }).decode(musicXmlBytes);
        durationMs += inference.durationMs + conversion.durationMs;
        resourceUsages.push(inference.resourceUsage, conversion.resourceUsage);
        bundleSystems.push({
          pageIndex: system.pageIndex,
          systemIndex: system.systemIndex,
          source: {
            staffLayout: system.staffLayout,
            staffCount: system.staffCount,
            pixelBbox: system.pixelBBox,
            pdfPointBbox: system.pdfPointBBox,
            cropSha256: system.cropSha256,
          },
          abcUtf8: abc,
          musicXmlUtf8: musicXml,
        });
        segmentationSystems.push({
          pageIndex: system.pageIndex,
          systemIndex: system.systemIndex,
          staffLayout: system.staffLayout,
          staffCount: system.staffCount,
          pageRenderSha256: system.pageRenderSha256,
          localStaffSpacingPx: system.localStaffSpacingPx,
          pixelBBox: system.pixelBBox,
          pdfPointBBox: system.pdfPointBBox,
          cropSha256: system.cropSha256,
          cropPngSha256: sha256Bytes(pngBytes),
          staffLineYs: system.staffLineYs,
        });
        artifacts.push(
          { relativePath: `systems/${stem}.png`, bytes: pngBytes },
          { relativePath: `systems/${stem}.abc`, bytes: abcBytes },
          { relativePath: `systems/${stem}.musicxml`, bytes: musicXmlBytes },
        );
        request.onProgress?.({ unit: "system", completed: systemOffset + 1, total: systems.length });
      }

      const bundleBytes = new TextEncoder().encode(
        canonicalJson({ schemaVersion: "1.0.0", systems: bundleSystems } satisfies RokotSystemBundle),
      );
      parseRokotSystemBundle(bundleBytes);
      const segmentationBytes = new TextEncoder().encode(
        canonicalJson({
          schemaVersion: "1.0.0",
          inputScope,
          detectorVersion: segmentation.detectorVersion,
          parameters: segmentation.parameters,
          systems: segmentationSystems,
        }),
      );
      const resourceUsage = combineProcessResourceUsage(resourceUsages);
      return {
        normalizationBytes: bundleBytes,
        nativeArtifacts: [{ relativePath: "segmentation.json", bytes: segmentationBytes }, ...artifacts],
        diagnostics: [],
        durationMs,
        ...(resourceUsage === undefined ? {} : { resourceUsage }),
      };
    },

    normalize(recognition) {
      return normalizeRokotOutput(recognition.normalizationBytes);
    },
  };
}

function systemCropSegmentation(
  pages: readonly RenderedPdfPage[],
  staffLayout: "auto" | "single-staff" | "grand-staff" | undefined,
): StaffSystemSegmentation {
  if (staffLayout === undefined || staffLayout === "auto") {
    throw new PdfOmrError("INVALID_CLI_ARGUMENT", "system crop requires an explicit staff layout", {
      context: { reason: "system-crop-requires-staff-layout" },
    });
  }
  const staffCount = staffLayout === "single-staff" ? 1 : 2;
  const systems: StaffSystem[] = [...pages]
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .map((page) => ({
      staffLayout,
      staffCount,
      pageIndex: page.pageIndex,
      systemIndex: 0,
      pageRenderSha256: page.renderSha256,
      localStaffSpacingPx: 0,
      pixelBBox: { x: 0, y: 0, width: page.pixelWidth, height: page.pixelHeight },
      pdfPointBBox: { x: 0, y: 0, width: page.pdfWidth, height: page.pdfHeight },
      cropPixels: page.pixels,
      cropSha256: sha256Bytes(page.pixels),
      staffLineYs: [],
    }));
  return {
    detectorVersion: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion,
    parameters: STAFF_SYSTEM_SEGMENTATION_PARAMETERS,
    systems,
  };
}

async function writeSegmentationFailureEvidence(
  outputDirectory: string,
  pages: readonly RenderedPdfPage[],
  error: unknown,
): Promise<void> {
  const directory = join(outputDirectory, "failure-debug");
  await mkdir(directory, { recursive: true });
  const canonical =
    error instanceof PdfOmrError
      ? error.toJSON()
      : new PdfOmrError("ENGINE_OUTPUT_INVALID", "staff-system segmentation failed").toJSON();
  await writeFile(
    join(directory, "segmentation-error.json"),
    canonicalJson({ schemaVersion: "1.0.0", error: canonical }),
    { flag: "wx" },
  );
  for (const page of pages.slice(0, 4)) {
    await writeFile(
      join(directory, `page-${String(page.pageIndex + 1).padStart(3, "0")}.png`),
      encodeRgbaPng(page.pixelWidth, page.pixelHeight, page.pixels),
      { flag: "wx" },
    );
  }
}

async function writeInferenceFailureEvidence(
  outputDirectory: string,
  stem: string,
  pngBytes: Uint8Array,
  rawResponse: Uint8Array,
  error: unknown,
): Promise<void> {
  const directory = join(outputDirectory, "failure-debug");
  await mkdir(directory, { recursive: true });
  const canonical =
    error instanceof PdfOmrError
      ? error.toJSON()
      : new PdfOmrError("ENGINE_OUTPUT_INVALID", "Rokot inference output is invalid").toJSON();
  await Promise.all([
    writeFile(join(directory, `${stem}.png`), pngBytes, { flag: "wx" }),
    writeFile(join(directory, `${stem}.raw.txt`), rawResponse.subarray(0, 256 * 1024), { flag: "wx" }),
    writeFile(join(directory, `${stem}.error.json`), canonicalJson({ schemaVersion: "1.0.0", error: canonical }), {
      flag: "wx",
    }),
  ]);
}

export async function convertRokotAbc(
  request: RokotAbcConversionRequest,
  signal?: AbortSignal,
): Promise<EngineProcessResult> {
  const processOptions = {
    ...(request.environment === undefined ? {} : { env: request.environment }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    ...(request.maxOutputBytes === undefined ? {} : { maxOutputBytes: request.maxOutputBytes }),
  };
  let result: EngineProcessResult;
  try {
    result = await runEngineProcess(
      {
        command: request.pythonExecutable,
        args: [
          request.runnerPath,
          "convert",
          "--expected-version",
          abcConverterVersion,
          "--input",
          request.inputPath,
          "--output",
          request.outputPath,
        ],
        ...processOptions,
      },
      signal,
    );
  } catch (error) {
    if (isInterrupted(error)) throw error;
    throw invalidOutput("abc-conversion-failed", error);
  }
  const xml = await readFile(request.outputPath).catch((error: unknown) => {
    throw invalidOutput("abc-conversion-failed", error);
  });
  if (xml.byteLength === 0) throw invalidOutput("empty-abc-conversion-output");
  try {
    let parseError: string | undefined;
    const document = new DOMParser({
      onError(level, message) {
        if (level === "error" || level === "fatalError") parseError = message;
      },
    }).parseFromString(new TextDecoder("utf-8", { fatal: true }).decode(xml), "application/xml");
    const root = document.documentElement;
    if (parseError !== undefined || root === null || root.nodeName !== "score-partwise") {
      throw new Error(parseError ?? "unexpected MusicXML root");
    }
  } catch (error) {
    throw invalidOutput("invalid-abc-conversion-xml", error);
  }
  return result;
}

type RequiredConfiguration = {
  llamaCliPath: string;
  modelPath: string;
  mmprojPath: string;
  abc2xmlPythonPath: string;
  abc2xmlRunnerPath: string;
  modelRevision: string;
  modelSha256: string;
  mmprojSha256: string;
  llamaBuild: string;
};

function requireConfiguration(options: RokotAdapterOptions): RequiredConfiguration {
  const defaultRunnerPath = fileURLToPath(new URL("../../engines/rokot-abc2xml-runner.py", import.meta.url));
  const configuration = {
    llamaCliPath: options.llamaCliPath,
    modelPath: options.modelPath,
    mmprojPath: options.mmprojPath,
    abc2xmlPythonPath: options.abc2xmlPythonPath,
    abc2xmlRunnerPath: options.abc2xmlRunnerPath ?? defaultRunnerPath,
    modelRevision: options.modelRevision ?? defaultModelRevision,
    modelSha256: options.modelSha256 ?? defaultModelSha256,
    mmprojSha256: options.mmprojSha256 ?? defaultMmprojSha256,
    llamaBuild: options.llamaBuild ?? defaultLlamaBuild,
  };
  if (
    [
      configuration.llamaCliPath,
      configuration.modelPath,
      configuration.mmprojPath,
      configuration.abc2xmlPythonPath,
    ].some((value) => value === undefined || value.trim().length === 0)
  ) {
    throw unavailable("missing-rokot-configuration");
  }
  return configuration as RequiredConfiguration;
}

async function streamingSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function parseLlamaBuild(output: string): string {
  const match = /version:\s*(\d+)\s*\(([0-9a-f]+)\)/i.exec(output);
  return match === null ? "" : `b${match[1]}-${match[2]}`;
}

function parseConverterVersion(output: string): string {
  try {
    const value: unknown = JSON.parse(output);
    if (typeof value === "object" && value !== null && "version" in value && typeof value.version === "string") {
      return value.version;
    }
  } catch {
    // The caller maps malformed inspection output to the stable availability reason.
  }
  return "";
}

function extractCanonicalAbc(bytes: Uint8Array, staffLayout: "single-staff" | "grand-staff"): string {
  let output: string;
  try {
    output = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return validateRokotAbc(bytes);
  }
  const wrapper = `User:\n${prompt}\n\nAssistant:\n`;
  const payload = output.startsWith(wrapper) ? output.slice(wrapper.length) : output;
  const canonical = staffLayout === "single-staff" ? canonicalizeUnvoicedSingleStaffAbc(payload) : payload;
  return validateRokotAbc(new TextEncoder().encode(canonical));
}

function canonicalizeUnvoicedSingleStaffAbc(abc: string): string {
  const lines = abc.split(/\r?\n/);
  const hasTempoHeader = /^Q:[^\r\n]+$/.test(lines[4] ?? "");
  const keyHeaderIndex = hasTempoHeader ? 5 : 4;
  const headersValid =
    lines[0] === "%%rokot-abc 0.1" &&
    /^X:[^\r\n]+$/.test(lines[1] ?? "") &&
    /^M:[^\r\n]+$/.test(lines[2] ?? "") &&
    /^L:[^\r\n]+$/.test(lines[3] ?? "") &&
    /^K:[^\r\n]+$/.test(lines[keyHeaderIndex] ?? "");
  const contentLines = lines.slice(keyHeaderIndex + 1).filter((line) => line.length > 0);
  if (
    !headersValid ||
    contentLines.length === 0 ||
    contentLines.some((line) => /^(?:V:|\[V:)/.test(line)) ||
    contentLines.some((line) => !/^w:/.test(line) && !/(?:\||:\||\|\])\s*$/.test(line))
  ) {
    return abc;
  }
  return [
    ...lines.slice(0, keyHeaderIndex + 1),
    "V:1 clef=treble",
    ...contentLines.map((line) => (line.startsWith("w:") ? line : `[V:1] ${line}`)),
    "",
  ].join("\n");
}

function systemStem(pageIndex: number, systemIndex: number): string {
  return `page-${String(pageIndex + 1).padStart(3, "0")}-system-${String(systemIndex + 1).padStart(3, "0")}`;
}

function isInterrupted(error: unknown): error is PdfOmrError {
  return error instanceof PdfOmrError && error.code === "INTERRUPTED";
}

function unavailable(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("ENGINE_UNAVAILABLE", "Rokot environment is unavailable", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}

function invalidOutput(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "Rokot ABC conversion output is invalid", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}
