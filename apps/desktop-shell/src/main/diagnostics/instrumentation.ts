import type { EventEmitter } from "node:events";
import type { TelemetryPort } from "@zupulse/web-core";
import type { DesktopDiagnostics } from "./desktop-diagnostics";
import { BridgeDispatchError } from "../bridge/dispatcher";

type DiagnosticTarget = Pick<EventEmitter, "on" | "removeListener">;
type WindowDiagnosticTarget = DiagnosticTarget & { webContents: DiagnosticTarget };

const processGoneReasons = new Set([
  "clean-exit",
  "abnormal-exit",
  "killed",
  "crashed",
  "oom",
  "launch-failed",
  "integrity-failure",
]);

export function installAppDiagnosticInstrumentation(
  app: DiagnosticTarget,
  diagnostics: DesktopDiagnostics,
  processTarget: DiagnosticTarget = process,
  telemetry?: TelemetryPort,
): () => void {
  const childProcessGone = (_event: unknown, details: unknown) => {
    void diagnostics.recordElectron({ code: "CHILD_PROCESS_GONE", ...safeProcessGoneFacts(details) });
  };
  const uncaughtException = (_error: unknown, origin: unknown) => {
    void diagnostics.recordMain({
      code: "HOST_OPERATION_FAILED",
      operation: "app.runtime",
      errorCode: origin === "unhandledRejection" ? "UNHANDLED_REJECTION" : "UNCAUGHT_EXCEPTION",
    });
    telemetry?.captureException(_error, {
      runtime: "main",
      handled: false,
      operation: "app.runtime",
    });
  };

  app.on("child-process-gone", childProcessGone);
  processTarget.on("uncaughtExceptionMonitor", uncaughtException);

  return () => {
    app.removeListener("child-process-gone", childProcessGone);
    processTarget.removeListener("uncaughtExceptionMonitor", uncaughtException);
  };
}

export function installWindowDiagnosticInstrumentation(
  window: WindowDiagnosticTarget,
  diagnostics: DesktopDiagnostics,
  telemetry?: TelemetryPort,
): () => void {
  const didFailLoad = () => {
    void diagnostics.recordElectron({
      code: "HOST_OPERATION_FAILED",
      operation: "renderer.load",
      errorCode: "RENDERER_LOAD_FAILED",
    });
  };
  const preloadError = () => {
    void diagnostics.recordElectron({
      code: "HOST_OPERATION_FAILED",
      operation: "renderer.preload",
      errorCode: "PRELOAD_FAILED",
    });
  };
  const unresponsive = () => {
    void diagnostics.recordElectron({ code: "RENDERER_UNRESPONSIVE" });
  };
  const renderProcessGone = (_event: unknown, details: unknown) => {
    const facts = safeProcessGoneFacts(details);
    void diagnostics.recordElectron({ code: "RENDERER_PROCESS_GONE", ...facts });
    telemetry?.capture({
      name: "runtime_failure_observed",
      runtime: "renderer",
      reason: toTelemetryFailureReason(facts.reason),
    });
  };

  window.webContents.on("did-fail-load", didFailLoad);
  window.webContents.on("preload-error", preloadError);
  window.on("unresponsive", unresponsive);
  window.webContents.on("render-process-gone", renderProcessGone);

  return () => {
    window.webContents.removeListener("did-fail-load", didFailLoad);
    window.webContents.removeListener("preload-error", preloadError);
    window.removeListener("unresponsive", unresponsive);
    window.webContents.removeListener("render-process-gone", renderProcessGone);
  };
}

export function recordBridgeFailure(diagnostics: DesktopDiagnostics, error: unknown): void {
  void diagnostics.recordMain(
    error instanceof BridgeDispatchError
      ? { code: "BRIDGE_MESSAGE_REJECTED", operation: "bridge.dispatch", errorCode: error.code }
      : { code: "HOST_OPERATION_FAILED", operation: "bridge.dispatch", errorCode: "BRIDGE_HANDLER_FAILED" },
  );
}

export function recordPersistedDataCorruption(diagnostics: DesktopDiagnostics, category: "sidecar" | "resume"): void {
  void diagnostics.recordMain({
    code: "PERSISTED_DATA_CORRUPT",
    operation: category === "sidecar" ? "sidecar.read" : "playback-resume.read",
    errorCode: "CORRUPT_PERSISTED_DATA",
  });
}

function safeProcessGoneFacts(value: unknown): { reason?: string; exitCode?: number } {
  if (!value || typeof value !== "object") return {};
  const details = value as Record<string, unknown>;
  const reason =
    typeof details.reason === "string" && processGoneReasons.has(details.reason) ? details.reason : undefined;
  const exitCode =
    typeof details.exitCode === "number" &&
    Number.isInteger(details.exitCode) &&
    details.exitCode >= -2147483648 &&
    details.exitCode <= 2147483647
      ? details.exitCode
      : undefined;
  return { ...(reason === undefined ? {} : { reason }), ...(exitCode === undefined ? {} : { exitCode }) };
}

function toTelemetryFailureReason(
  reason: string | undefined,
): "crashed" | "oom" | "killed" | "integrity-failure" | "unknown" {
  if (reason === "crashed" || reason === "oom" || reason === "killed" || reason === "integrity-failure") return reason;
  return "unknown";
}
