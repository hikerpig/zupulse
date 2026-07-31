import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import { PdfOmrError } from "../errors";
import { runEngineProcess, type EngineProcessResult } from "../engine-runner";
import type { OmrEngineEnvironment } from "./types";

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
};

export type RokotEnvironmentAdapter = {
  inspectEnvironment(signal?: AbortSignal): Promise<OmrEngineEnvironment>;
};

export type RokotAbcConversionRequest = {
  pythonExecutable: string;
  runnerPath: string;
  inputPath: string;
  outputPath: string;
  environment?: Readonly<Record<string, string>>;
  timeoutMs?: number;
};

export function createRokotAdapter(options: RokotAdapterOptions): RokotEnvironmentAdapter {
  return {
    async inspectEnvironment(signal) {
      const configuration = requireConfiguration(options);
      const processOptions = {
        ...(options.environment === undefined ? {} : { env: options.environment }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
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
  };
}

export async function convertRokotAbc(
  request: RokotAbcConversionRequest,
  signal?: AbortSignal,
): Promise<EngineProcessResult> {
  const processOptions = {
    ...(request.environment === undefined ? {} : { env: request.environment }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
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
    if (parseError !== undefined || document.documentElement.nodeName !== "score-partwise") {
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
