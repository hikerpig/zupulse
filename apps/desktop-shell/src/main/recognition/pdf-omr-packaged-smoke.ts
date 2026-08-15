import {
  PdfOmrError,
  runEngineProcess,
  runPdfOmrPipeline,
  type EngineRegistry,
  type OmrEngineAdapter,
  type OmrScoreDraft,
} from "@zupulse/pdf-omr-cli/pipeline";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DesktopPdfOmrRuntime } from "./pdf-omr-runtime";

export type PdfOmrPackagedSmokeResult = {
  pipelineStatus: "succeeded";
  pageCount: number;
  absolutePathLeaked: boolean;
  processTreeCancelled: boolean;
};

export async function runPdfOmrPackagedSmoke(options: {
  standardFontDirectory: string;
  wasmDirectory: string;
}): Promise<PdfOmrPackagedSmokeResult> {
  const directory = await mkdtemp(join(tmpdir(), "zupulse-pdf-omr-packaged-smoke-"));
  const inputPath = join(directory, "input.pdf");
  const outputDirectory = join(directory, "run");
  try {
    await writeFile(inputPath, minimalPdf());
    const runtime = new DesktopPdfOmrRuntime({
      runPipeline: runPdfOmrPipeline,
      standardFontDirectory: options.standardFontDirectory,
      wasmDirectory: options.wasmDirectory,
    });
    const pipeline = await runtime.run({
      inputPath,
      engineId: "packaged-smoke",
      outputDirectory,
      engineRegistry: registryWith(smokeAdapter()),
    });
    const processTreeCancelled = await verifyProcessTreeCancellation(directory);
    return {
      pipelineStatus: pipeline.status,
      pageCount: pipeline.input.pageCount,
      absolutePathLeaked: JSON.stringify(pipeline).includes(directory),
      processTreeCancelled,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function registryWith(adapter: OmrEngineAdapter): EngineRegistry {
  return {
    get(engineId) {
      if (engineId !== "packaged-smoke") {
        throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown packaged smoke engine");
      }
      return adapter;
    },
  };
}

function smokeAdapter(): OmrEngineAdapter {
  return {
    async inspectEnvironment() {
      return {
        id: "packaged-smoke",
        version: "1.0.0",
        executable: "internal-smoke-adapter",
        commandTemplate: [],
        license: { id: "internal-test", source: "zupulse" },
      };
    },
    async recognize() {
      return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 0 };
    },
    normalize() {
      return readyDraft();
    },
  };
}

function readyDraft(): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    parts: [
      {
        id: "P1",
        name: "Packaged Smoke",
        staves: [
          {
            index: 0,
            measures: [
              {
                index: 0,
                timeSignature: { numerator: 4, denominator: 4 },
                duration: { numerator: 1, denominator: 1 },
                keySignature: { fifths: 0 },
                clef: { sign: "G", line: 2 },
                voices: [
                  {
                    index: 1,
                    events: [
                      {
                        type: "rest",
                        id: "r1",
                        onset: { numerator: 0, denominator: 1 },
                        duration: { numerator: 1, denominator: 1 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

async function verifyProcessTreeCancellation(directory: string): Promise<boolean> {
  if (process.platform === "win32") return verifySingleProcessCancellation();
  const pidFile = join(directory, "process-tree.json");
  const childSource = [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    'const child = spawn(process.execPath, ["-e", "process.on(\\"SIGTERM\\",()=>{});setInterval(()=>{},1000)"], { stdio: "ignore" });',
    "writeFileSync(process.argv[1], JSON.stringify({ parent: process.pid, child: child.pid }));",
    'process.on("SIGTERM", () => {});',
    "setInterval(() => {}, 1000);",
  ].join("");
  const controller = new AbortController();
  const operation = runEngineProcess(
    { command: process.execPath, args: ["-e", childSource, pidFile], timeoutMs: 5000 },
    controller.signal,
  );
  await waitForFile(pidFile);
  const pids = JSON.parse(await readFile(pidFile, "utf8")) as { parent: number; child: number };
  controller.abort();
  await operation.catch((error: unknown) => {
    if (!(error instanceof PdfOmrError) || error.code !== "INTERRUPTED") throw error;
  });
  try {
    await waitForProcessesToExit([pids.parent, pids.child]);
    return true;
  } finally {
    forceKill([pids.parent, pids.child]);
  }
}

async function verifySingleProcessCancellation(): Promise<boolean> {
  const controller = new AbortController();
  const operation = runEngineProcess(
    { command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], timeoutMs: 5000 },
    controller.signal,
  );
  controller.abort();
  await operation.catch((error: unknown) => {
    if (!(error instanceof PdfOmrError) || error.code !== "INTERRUPTED") throw error;
  });
  return true;
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (
      await access(path)
        .then(() => true)
        .catch(() => false)
    )
      return;
    await delay(10);
  }
  throw new Error("packaged smoke process tree did not start");
}

async function waitForProcessesToExit(pids: readonly number[]): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isProcessAlive(pid))) return;
    await delay(20);
  }
  throw new Error("packaged smoke process tree survived cancellation");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function forceKill(pids: readonly number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process already exited.
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function minimalPdf(): Uint8Array {
  const content = "0 0 m 100 100 l S";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(source).byteLength);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}
