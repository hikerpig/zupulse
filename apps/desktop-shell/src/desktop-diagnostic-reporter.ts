import { createBridgeRequest, parseBridgeResponse } from "@zupulse/web-core";

type DiagnosticBridge = {
  request(value: unknown): Promise<unknown>;
};

const diagnosticOperations = {
  "library.refresh": "LIBRARY_REFRESH_FAILED",
  "library.import.select": "FILE_SELECTION_FAILED",
  "library.open": "VIEWER_OPEN_FAILED",
  "studio.open": "STUDIO_OPEN_FAILED",
  "studio.preview": "STUDIO_PREVIEW_FAILED",
} as const;

export function createDesktopDiagnosticReporter(
  bridge: DiagnosticBridge,
  createCorrelationId: () => string = () => crypto.randomUUID(),
): (_error: unknown, operation: string) => void {
  return (_error, operation) => {
    const mapped = operation in diagnosticOperations ? (operation as keyof typeof diagnosticOperations) : undefined;
    const request = createBridgeRequest("diagnostics.write", createCorrelationId(), {
      code: "HOST_OPERATION_FAILED",
      operation: mapped ?? "viewer.operation",
      errorCode: mapped ? diagnosticOperations[mapped] : "VIEWER_OPERATION_FAILED",
    });
    void bridge
      .request(request)
      .then((value) => parseBridgeResponse(request.type, value))
      .catch(() => undefined);
  };
}
