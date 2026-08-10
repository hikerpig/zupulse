import type { TelemetryEnvelope, TelemetryExceptionContext } from "./schemas";

export interface TelemetryPort {
  capture(event: TelemetryEnvelope): void;
  captureException(error: unknown, context: TelemetryExceptionContext): void;
  flush(deadlineMs: number): Promise<void>;
}

export function createNoopTelemetryPort(): TelemetryPort {
  return {
    capture: () => undefined,
    captureException: () => undefined,
    flush: async () => undefined,
  };
}

export function createSafeTelemetryPort(port: TelemetryPort): TelemetryPort {
  return {
    capture: (event) => {
      try {
        port.capture(event);
      } catch {
        // Telemetry must never affect the product path.
      }
    },
    captureException: (error, context) => {
      try {
        port.captureException(error, context);
      } catch {
        // Telemetry must never affect the product path.
      }
    },
    flush: async (deadlineMs) => {
      try {
        await port.flush(deadlineMs);
      } catch {
        // Telemetry must never affect shutdown or navigation.
      }
    },
  };
}
