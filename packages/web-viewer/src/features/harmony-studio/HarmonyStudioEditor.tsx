import type { HarmonyCandidate } from "@zupulse/web-core";
import { formatChordSymbol } from "@zupulse/web-core";

export type HarmonyStudioEditorProps = {
  candidates: readonly HarmonyCandidate[];
  unresolvedReason?: string;
  onSelect(candidate: HarmonyCandidate): void;
  onNoChord(): void;
};

export function HarmonyStudioEditor({ candidates, unresolvedReason, onSelect, onNoChord }: HarmonyStudioEditorProps) {
  return (
    <section aria-labelledby="harmony-editor-title">
      <h2 id="harmony-editor-title">和弦候选</h2>
      {unresolvedReason ? <p role="status">{unresolvedReason}</p> : null}
      <div role="list" aria-label="结构化和弦候选">
        {candidates.map((candidate, index) => (
          <button
            key={`${candidate.chord.root.step}-${candidate.chord.kind}-${index}`}
            type="button"
            onClick={() => onSelect(candidate)}
          >
            {formatChordSymbol(candidate.chord)} · {Math.round(candidate.confidence * 100)}%
          </button>
        ))}
      </div>
      <button type="button" onClick={onNoChord}>
        标记为 N.C.
      </button>
    </section>
  );
}
