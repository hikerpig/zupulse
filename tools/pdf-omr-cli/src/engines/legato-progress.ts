export type LegatoPageProgress = {
  completed: number;
  total: number;
};

export function parseLegatoProgressLine(line: string): LegatoPageProgress | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.type !== "progress" ||
    !Number.isSafeInteger(record.completed) ||
    !Number.isSafeInteger(record.total) ||
    (record.completed as number) < 0 ||
    (record.total as number) <= 0 ||
    (record.completed as number) > (record.total as number)
  ) {
    return undefined;
  }
  return { completed: record.completed as number, total: record.total as number };
}
