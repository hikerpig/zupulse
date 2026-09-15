export const BASE_ROKOT_PROMPT = "Transcribe this staff to rokot-ABC.";

export const ROKOT_SYSTEM_CONTEXT_POLICIES = ["previous-prediction-headers-v1"] as const;
export type RokotSystemContextPolicy = (typeof ROKOT_SYSTEM_CONTEXT_POLICIES)[number];

export type PreviousSystemHeaders = {
  length: string;
  meter: string;
  key: string;
};

export function systemContextParameters(policy: RokotSystemContextPolicy) {
  return {
    systemContext: policy,
    systemContextHeaders: "L,M,K",
    systemContextKeyMode: "previous",
  } as const;
}

export function parsePreviousSystemHeaders(abc: string): PreviousSystemHeaders | undefined {
  const length = /^L:(\d+\/\d+)$/m.exec(abc)?.[1];
  const meter = /^M:((?:\d+\/\d+)|C\|?)$/m.exec(abc)?.[1];
  const key = /^K:([A-G](?:#|b)?(?:m|maj|min|dor|phr|lyd|mix|loc)?)$/m.exec(abc)?.[1];
  return length === undefined || meter === undefined || key === undefined ? undefined : { length, meter, key };
}

export function createSystemContextTracker(): {
  prompt(): string;
  observe(abc: string): void;
} {
  let previous: PreviousSystemHeaders | undefined;
  return {
    prompt() {
      if (previous === undefined) return BASE_ROKOT_PROMPT;
      return `${BASE_ROKOT_PROMPT} The previous system used L:${previous.length}, M:${previous.meter}, K:${previous.key}. If this crop does not print a new meter or key signature, preserve those headers.`;
    },
    observe(abc) {
      previous = parsePreviousSystemHeaders(abc);
    },
  };
}
