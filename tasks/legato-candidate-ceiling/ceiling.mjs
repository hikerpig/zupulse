export function compare(predicted, expected) {
  const missing = [...expected],
    matched = [],
    extra = [];
  for (const key of predicted) {
    const index = missing.indexOf(key);
    if (index < 0) extra.push(key);
    else {
      matched.push(key);
      missing.splice(index, 1);
    }
  }
  return { matched, extra, missing };
}

export function ceiling(baseline, expected, alternatives) {
  const base = compare(baseline, expected);
  const choices = alternatives.map((candidate, index) => {
    const result = compare(candidate, expected);
    const delta = compare(result.matched, base.matched);
    return { index, recovered: delta.extra, lost: delta.missing, falsePositives: result.extra.length };
  });
  // Taking the maximum count per key avoids inventing duplicate notes by unioning candidates.
  const union = [];
  for (const candidate of [baseline, ...alternatives]) union.push(...compare(candidate, union).extra);
  const eventRecovered = compare(compare(union, expected).matched, base.matched).extra.length;
  const eligible = choices.filter((c) => c.lost.length === 0 && c.falsePositives <= base.extra.length);
  const best = eligible.reduce((a, c) => (c.recovered.length > a.recovered.length ? c : a), {
    index: -1,
    recovered: [],
    lost: [],
    falsePositives: base.extra.length,
  });
  return { eventRecovered, measureRecovered: best.recovered.length, best, choices };
}
