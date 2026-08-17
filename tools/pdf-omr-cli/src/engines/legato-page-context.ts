const unitLengthPattern = /^[1-9]\d*\/[1-9]\d*$/u;
const meterPattern = /^(?:C\|?|[1-9]\d*\/[1-9]\d*)$/u;
const keyPattern = /^[A-G](?:#|b)?(?:maj|min|m|mix|dor|phr|lyd|loc)?$/u;

export function buildLegatoPageContextPrefix(abc: string): string | undefined {
  const unitLength = singleField(abc, "L");
  const meter = singleField(abc, "M");
  const key = singleField(abc, "K");
  if (
    unitLength === undefined ||
    meter === undefined ||
    key === undefined ||
    !unitLengthPattern.test(unitLength) ||
    !meterPattern.test(meter) ||
    !keyPattern.test(key)
  ) {
    return undefined;
  }
  return `X:1\nL:${unitLength}\nM:${meter}\nK:${key}\n`;
}

function singleField(abc: string, name: "L" | "M" | "K"): string | undefined {
  const values = abc
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(`${name}:`))
    .map((line) => line.slice(2).trim());
  return values.length === 1 && values[0]!.length > 0 ? values[0] : undefined;
}
