type Note = { id: string; pitch: number; onset: string };
type Head = { x: number; pitch: number; gap: number; valid: boolean };

export function rankPairs(notes: Note[], heads: Head[]) {
  const reject = (reason: string) => ({ reason, pairs: [] as { id: string; pitch: number }[] });
  if (heads.some((h) => !h.valid)) return reject("invalid-source");
  if (notes.length !== heads.length) return reject("note-count");
  const value = (s: string) => {
    const [n, d] = s.split("/").map(Number);
    return n! / d!;
  };
  const times = [...new Set(notes.map((n) => value(n.onset)))].sort((a, b) => a - b);
  const ng = times.map((t) => notes.filter((n) => value(n.onset) === t).sort((a, b) => a.pitch - b.pitch));
  const hg: Head[][] = [];
  for (const h of [...heads].sort((a, b) => a.x - b.x)) {
    const last = hg.at(-1);
    // Fixed narrow x clusters are a correspondence hypothesis, not a claim of source timing.
    if (last && h.x - last[0]!.x <= 0.5 * Math.min(h.gap, last[0]!.gap)) last.push(h);
    else hg.push([h]);
  }
  if (ng.length !== hg.length) return reject("group-count");
  const pairs: { id: string; pitch: number }[] = [];
  for (const [i, group] of ng.entries()) {
    const source = hg[i]!.sort((a, b) => a.pitch - b.pitch);
    if (group.length !== source.length) return reject("chord-count");
    if (
      new Set(group.map((n) => n.pitch)).size !== group.length ||
      new Set(source.map((h) => h.pitch)).size !== source.length
    )
      return reject("unison-ambiguity");
    group.forEach((n, j) => pairs.push({ id: n.id, pitch: source[j]!.pitch }));
  }
  return { reason: "paired", pairs };
}
