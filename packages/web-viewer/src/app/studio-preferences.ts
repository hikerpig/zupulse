export type StudioPreferences = {
  split: number;
  previewEnabled: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const storageKey = "zupulse.studio.preferences";
const defaults: StudioPreferences = { split: 60, previewEnabled: true };

export function loadStudioPreferences(storage: StorageLike | undefined): StudioPreferences {
  if (!storage) return defaults;
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey) ?? "null");
    if (!isStoredPreferences(value)) return defaults;
    return { split: value.split, previewEnabled: value.previewEnabled };
  } catch {
    return defaults;
  }
}

export function saveStudioPreferences(storage: StorageLike | undefined, preferences: StudioPreferences): void {
  if (!storage || !isPreferences(preferences)) return;
  try {
    storage.setItem(storageKey, JSON.stringify({ version: 1, ...preferences }));
  } catch {}
}

function isStoredPreferences(value: unknown): value is StudioPreferences & { version: 1 } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    (value as { version: unknown }).version === 1 &&
    isPreferences(value)
  );
}

function isPreferences(value: unknown): value is StudioPreferences {
  return (
    typeof value === "object" &&
    value !== null &&
    "split" in value &&
    "previewEnabled" in value &&
    typeof (value as { split: unknown }).split === "number" &&
    Number.isInteger((value as { split: number }).split) &&
    (value as { split: number }).split >= 40 &&
    (value as { split: number }).split <= 75 &&
    typeof (value as { previewEnabled: unknown }).previewEnabled === "boolean"
  );
}
