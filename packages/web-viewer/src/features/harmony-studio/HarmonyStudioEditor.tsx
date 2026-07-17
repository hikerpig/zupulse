import { useState } from "react";
import type { HarmonyCandidate } from "@zupulse/web-core";
import { formatChordSymbol } from "@zupulse/web-core";
import styles from "../../app/pages/StudioPage.module.css";

export type HarmonyStudioEditorProps = {
  candidates: readonly HarmonyCandidate[];
  unresolvedReason?: string;
  onSelect(candidate: HarmonyCandidate): void;
  onApply(chord: HarmonyCandidate["chord"]): void;
  onNoChord(): void;
};

const steps = ["C", "D", "E", "F", "G", "A", "B"] as const;
const kinds = [
  "major",
  "minor",
  "dominant",
  "diminished",
  "half-diminished",
  "augmented",
  "suspended-second",
  "suspended-fourth",
  "power",
] as const;
const degreeValues = [2, 3, 4, 5, 6, 7, 9, 11, 13] as const;
const degreeOperations = ["add", "alter", "subtract"] as const;
const degreeAlters = [-2, -1, 0, 1, 2] as const;
type ChordDegree = HarmonyCandidate["chord"]["degrees"][number];

export function HarmonyStudioEditor({
  candidates,
  unresolvedReason,
  onSelect,
  onApply,
  onNoChord,
}: HarmonyStudioEditorProps) {
  const [root, setRoot] = useState<(typeof steps)[number]>("C");
  const [kind, setKind] = useState<(typeof kinds)[number]>("major");
  const [extension, setExtension] = useState("none");
  const [bass, setBass] = useState("none");
  const [degrees, setDegrees] = useState<ChordDegree[]>([]);
  const [degreeOperation, setDegreeOperation] = useState<(typeof degreeOperations)[number]>("add");
  const [degreeValue, setDegreeValue] = useState<(typeof degreeValues)[number]>(3);
  const [degreeAlter, setDegreeAlter] = useState<(typeof degreeAlters)[number]>(0);
  const appliedExtension =
    kind === "dominant"
      ? extension === "none"
        ? 7
        : Number(extension)
      : kind === "half-diminished"
        ? 7
        : kind === "power"
          ? undefined
          : extension === "none"
            ? undefined
            : Number(extension);
  return (
    <section className={styles.harmonyEditor} aria-labelledby="harmony-editor-title">
      <div className={styles.editorHeading}>
        <div>
          <p className={styles.sectionKicker}>Chord inspector</p>
          <h2 id="harmony-editor-title">和弦候选</h2>
          <p>候选按置信度排序，也可以在下方手动构建。</p>
        </div>
        <button type="button" onClick={onNoChord}>
          标记为 N.C.
        </button>
      </div>
      {unresolvedReason ? (
        <p className={styles.unresolvedReason} role="status">
          {unresolvedReason}
        </p>
      ) : null}
      <div className={styles.candidateList} role="list" aria-label="结构化和弦候选">
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
      <fieldset className={styles.chordBuilder}>
        <legend>结构化和弦编辑</legend>
        <div className={styles.chordFields}>
          <label className={styles.field}>
            根音
            <select aria-label="根音" value={root} onChange={(event) => setRoot(event.target.value as typeof root)}>
              {steps.map((step) => (
                <option key={step} value={step}>
                  {step}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            和弦类型
            <select aria-label="和弦类型" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              {kinds.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            扩展音
            <select aria-label="扩展音" value={extension} onChange={(event) => setExtension(event.target.value)}>
              <option value="none">无</option>
              {[6, 7, 9, 11, 13].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            低音
            <select aria-label="低音" value={bass} onChange={(event) => setBass(event.target.value)}>
              <option value="none">无</option>
              {steps.map((step) => (
                <option key={step} value={step}>
                  {step}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className={styles.degreeEditor}>
          <legend>度数</legend>
          <div className={styles.degreeControls}>
            <label className={styles.field}>
              操作
              <select
                aria-label="度数操作"
                value={degreeOperation}
                onChange={(event) => {
                  const operation = event.target.value as typeof degreeOperation;
                  setDegreeOperation(operation);
                  if (operation !== "add" && degreeValue === 2) setDegreeValue(3);
                }}
              >
                {degreeOperations.map((operation) => (
                  <option key={operation} value={operation}>
                    {operation}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              度数
              <select
                aria-label="度数"
                value={degreeValue}
                onChange={(event) => setDegreeValue(Number(event.target.value) as typeof degreeValue)}
              >
                {degreeValues
                  .filter((value) => degreeOperation === "add" || value !== 2)
                  .map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.field}>
              变化
              <select
                aria-label="度数变化"
                value={degreeAlter}
                onChange={(event) => setDegreeAlter(Number(event.target.value) as typeof degreeAlter)}
              >
                {degreeAlters.map((alter) => (
                  <option key={alter} value={alter}>
                    {alter}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                setDegrees((current) => [
                  ...current.filter((degree) => degree.value !== degreeValue),
                  { operation: degreeOperation, value: degreeValue, alter: degreeAlter },
                ])
              }
            >
              添加度数
            </button>
          </div>
          <ul className={styles.degreeList} aria-label="已选度数">
            {degrees.map((degree) => (
              <li key={degree.value}>
                {degree.operation} {degree.alter} {degree.value}
                <button
                  type="button"
                  onClick={() => setDegrees((current) => current.filter((item) => item !== degree))}
                >
                  移除度数 {degree.value}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
        <button
          className="primary-button"
          type="button"
          onClick={() =>
            onApply({
              root: { step: root, alter: 0 },
              kind,
              ...(appliedExtension === undefined ? {} : { extension: appliedExtension as 6 | 7 | 9 | 11 | 13 }),
              degrees,
              ...(bass === "none" ? {} : { bass: { step: bass as typeof root, alter: 0 } }),
            })
          }
        >
          应用结构化和弦
        </button>
      </fieldset>
    </section>
  );
}
