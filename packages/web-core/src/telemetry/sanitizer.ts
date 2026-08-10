const MAX_MESSAGE_LENGTH = 512;
const MAX_STACK_FRAMES = 50;
const MAX_STACK_FRAME_LENGTH = 256;
const MAX_EXCEPTIONS_PER_SESSION = 20;
const FINGERPRINT_WINDOW_MS = 60_000;

export interface SanitizedTelemetryException {
  name: string;
  message: string;
  stack?: string;
  fingerprint: string;
}

export class TelemetryExceptionBudget {
  private readonly counts = new Map<string, number>();

  private readonly fingerprints = new Map<string, number>();

  allow(applicationSessionId: string, fingerprint: string, nowMs = Date.now()): boolean {
    const sessionCount = this.counts.get(applicationSessionId) ?? 0;
    if (sessionCount >= MAX_EXCEPTIONS_PER_SESSION) return false;

    const fingerprintKey = `${applicationSessionId}:${fingerprint}`;
    const previous = this.fingerprints.get(fingerprintKey);
    if (previous !== undefined && nowMs - previous < FINGERPRINT_WINDOW_MS) return false;

    this.counts.set(applicationSessionId, sessionCount + 1);
    this.fingerprints.set(fingerprintKey, nowMs);
    return true;
  }
}

const redact = (value: string): string =>
  value
    .replace(/(?:https?|file|zupulse):\/\/[^\s)'"<>]+/gi, "<redacted-url>")
    .replace(/(?:bearer\s+|token\s*=|file[_-]?token\s*=|api[_-]?key\s*=|secret\s*=)[^\s&]+/gi, "<redacted-secret>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "<redacted-id>")
    .replace(/\b[0-9a-f]{64}\b/gi, "<redacted-hash>")
    .replace(
      /(?:^|[\s("'`])(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|private|var|tmp|Applications|workspace|Volumes|opt|usr|etc)\/)[^\s"'`<>)]*/g,
      (match) => `${match.slice(0, 1)}<redacted-path>`,
    );

const hash = (value: string): string => {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
};

export function sanitizeTelemetryException(error: unknown): SanitizedTelemetryException | undefined {
  if (!(error instanceof Error)) return undefined;

  const name = redact(error.name || "Error").slice(0, 128);
  const message = redact(error.message).slice(0, MAX_MESSAGE_LENGTH);
  const stackLines =
    typeof error.stack === "string"
      ? error.stack
          .split("\n")
          .filter((line) => /^\s*at\s+/.test(line) || /^\s*[^\s]+\s+@/.test(line))
          .slice(0, MAX_STACK_FRAMES)
      : [];
  const stack = stackLines.length
    ? stackLines.map((line) => redact(line).slice(0, MAX_STACK_FRAME_LENGTH)).join("\n")
    : undefined;
  const fingerprint = hash(`${name}\n${message}`);
  return stack ? { name, message, stack, fingerprint } : { name, message, fingerprint };
}
