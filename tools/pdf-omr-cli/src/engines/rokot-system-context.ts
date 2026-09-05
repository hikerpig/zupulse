export const BASE_ROKOT_PROMPT = "Transcribe this staff to rokot-ABC.";

export const ROKOT_SYSTEM_CONTEXT_POLICIES = [
  "previous-prediction-headers-v1",
  "previous-lm-headers-v1",
  "first-system-key-v1",
  "key-consensus-v1",
] as const;

export type RokotSystemContextPolicy = (typeof ROKOT_SYSTEM_CONTEXT_POLICIES)[number];

export type PreviousSystemHeaders = {
  length: string;
  meter: string;
  key: string;
};

export type SystemContextParameters = {
  systemContext: RokotSystemContextPolicy;
  systemContextHeaders: "L,M" | "L,M,K";
  systemContextKeyMode: "previous" | "omitted" | "first-system" | "consensus-2";
};

export function systemContextParameters(policy: RokotSystemContextPolicy): SystemContextParameters {
  if (policy === "previous-lm-headers-v1") {
    return { systemContext: policy, systemContextHeaders: "L,M", systemContextKeyMode: "omitted" };
  }
  if (policy === "first-system-key-v1") {
    return { systemContext: policy, systemContextHeaders: "L,M,K", systemContextKeyMode: "first-system" };
  }
  if (policy === "key-consensus-v1") {
    return { systemContext: policy, systemContextHeaders: "L,M,K", systemContextKeyMode: "consensus-2" };
  }
  return { systemContext: policy, systemContextHeaders: "L,M,K", systemContextKeyMode: "previous" };
}

export function parsePreviousSystemHeaders(abc: string): PreviousSystemHeaders | undefined {
  const length = /^L:(\d+\/\d+)$/m.exec(abc)?.[1];
  const meter = /^M:((?:\d+\/\d+)|C\|?)$/m.exec(abc)?.[1];
  const key = /^K:([A-G](?:#|b)?(?:m|maj|min|dor|phr|lyd|mix|loc)?)$/m.exec(abc)?.[1];
  return length === undefined || meter === undefined || key === undefined ? undefined : { length, meter, key };
}

export function createSystemContextTracker(policy: RokotSystemContextPolicy): {
  prompt(): string;
  observe(abc: string): void;
} {
  let previous: PreviousSystemHeaders | undefined;
  let firstKey: string | undefined;
  const recentKeys: string[] = [];

  return {
    prompt() {
      if (previous === undefined) return BASE_ROKOT_PROMPT;
      if (policy === "previous-lm-headers-v1") return formatLmPrompt(previous);
      if (policy === "first-system-key-v1") {
        return firstKey === undefined ? BASE_ROKOT_PROMPT : formatLmkPrompt({ ...previous, key: firstKey });
      }
      if (policy === "key-consensus-v1") {
        const disagreed = recentKeys.length >= 2 && recentKeys[0] !== recentKeys[1];
        return disagreed ? formatLmPrompt(previous) : formatLmkPrompt(previous);
      }
      return formatLmkPrompt(previous);
    },
    observe(abc) {
      previous = parsePreviousSystemHeaders(abc);
      if (previous === undefined) {
        recentKeys.length = 0;
        return;
      }
      firstKey ??= previous.key;
      recentKeys.push(previous.key);
      if (recentKeys.length > 2) recentKeys.shift();
    },
  };
}

function formatLmPrompt(previous: PreviousSystemHeaders): string {
  return `${BASE_ROKOT_PROMPT} The previous system used L:${previous.length}, M:${previous.meter}. If this crop does not print a new meter signature, preserve those headers.`;
}

function formatLmkPrompt(previous: PreviousSystemHeaders): string {
  return `${BASE_ROKOT_PROMPT} The previous system used L:${previous.length}, M:${previous.meter}, K:${previous.key}. If this crop does not print a new meter or key signature, preserve those headers.`;
}
