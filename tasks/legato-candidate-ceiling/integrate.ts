import assert from "node:assert/strict";
import type { OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";

export function integrate(baseline: OmrScoreDraft, crop: OmrScoreDraft, target: number, local: number): OmrScoreDraft {
  const result = structuredClone(baseline);
  const staves = (d: OmrScoreDraft) => d.parts.flatMap((part) => part.staves.map((staff) => ({ part, staff })));
  const left = staves(result),
    right = staves(crop);
  assert.equal(left.length, 2, "unsupported-topology");
  assert.equal(right.length, left.length, "topology-mismatch");
  for (let i = 0; i < left.length; i++) {
    const { part, staff } = left[i]!,
      source = right[i]!;
    const destination = staff.measures[target],
      origin = source.staff.measures[local];
    assert(destination?.index === target && origin?.index === local, "unknown-measure");
    const anchors = [...destination.voices].sort((a, b) => a.index - b.index);
    const voices = [...origin.voices].sort((a, b) => a.index - b.index);
    assert.equal(anchors.length, voices.length, "voice-count-mismatch");
    assert.equal(new Set(voices.map((v) => v.index)).size, voices.length, "duplicate-voices");
    assert.equal(new Set(anchors.map((v) => v.index)).size, anchors.length, "duplicate-anchors");
    // Active-slot correspondence is an experimental hypothesis; strict evaluation must still validate it.
    const replacements = voices.map((voice, index) => ({
      ...structuredClone(voice),
      index: anchors[index]!.index,
      events: voice.events.map((event) => {
        const prefix = `${source.part.id}-m${local}-s${source.staff.index}-v${voice.index}-`;
        assert(event.id.startsWith(prefix), "unknown-event-identity");
        const suffix = event.id.slice(prefix.length);
        assert.match(suffix, /^(?:e|fill)\d+$/, "unknown-event-identity");
        return {
          ...structuredClone(event),
          id: `${part.id}-m${target}-s${staff.index}-v${anchors[index]!.index}-${suffix}`,
        };
      }),
    }));
    // Crop metadata lacks inherited context; replace events only, preserving the complete score's measure attributes.
    destination.voices = destination.voices.map((v) => replacements.find((r) => r.index === v.index)!);
  }
  const restored = structuredClone(result);
  staves(restored).forEach(({ staff }, i) => {
    staff.measures[target]!.voices = structuredClone(staves(baseline)[i]!.staff.measures[target]!.voices);
  });
  assert.deepEqual(restored, baseline, "unselected-content-changed");
  return result;
}
