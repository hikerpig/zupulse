import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { HarmonyCandidate } from "@zupulse/web-core";
import { formatChordSymbol } from "@zupulse/web-core";
import styles from "../../app/pages/StudioPage.module.css";
import { ContextPopup } from "../../components/ContextPopup";

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
  const { t } = useTranslation("studio");
  const kindLabels: Record<(typeof kinds)[number], string> = {
    major: t("editor.kindMajor"),
    minor: t("editor.kindMinor"),
    dominant: t("editor.kindDominant"),
    diminished: t("editor.kindDiminished"),
    "half-diminished": t("editor.kindHalfDiminished"),
    augmented: t("editor.kindAugmented"),
    "suspended-second": t("editor.kindSuspendedSecond"),
    "suspended-fourth": t("editor.kindSuspendedFourth"),
    power: t("editor.kindPower"),
  };
  const degreeOperationLabels: Record<(typeof degreeOperations)[number], string> = {
    add: t("editor.operationAdd"),
    alter: t("editor.operationAlter"),
    subtract: t("editor.operationSubtract"),
  };
  const [root, setRoot] = useState<(typeof steps)[number]>("C");
  const [kind, setKind] = useState<(typeof kinds)[number]>("major");
  const [extension, setExtension] = useState("none");
  const [bass, setBass] = useState("none");
  const [degrees, setDegrees] = useState<ChordDegree[]>([]);
  const [degreeOperation, setDegreeOperation] = useState<(typeof degreeOperations)[number]>("add");
  const [degreeValue, setDegreeValue] = useState<(typeof degreeValues)[number]>(3);
  const [degreeAlter, setDegreeAlter] = useState<(typeof degreeAlters)[number]>(0);
  const [builderOpen, setBuilderOpen] = useState(false);
  const builderButtonRef = useRef<HTMLButtonElement>(null);
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
          <h2 id="harmony-editor-title">{t("editor.title")}</h2>
        </div>
        <div className={styles.editorButtons}>
          <button ref={builderButtonRef} type="button" onClick={() => setBuilderOpen(true)}>
            {t("editor.build")}
          </button>
          <button type="button" onClick={onNoChord}>
            {t("editor.noChord")}
          </button>
        </div>
      </div>
      {unresolvedReason ? (
        <p className={styles.unresolvedReason} role="status">
          {unresolvedReason}
        </p>
      ) : null}
      {candidates.length > 0 ? (
        <div className={styles.candidateList} role="list" aria-label={t("editor.candidateList")}>
          {candidates.map((candidate, index) => {
            const priority = index === 0 ? "preferred" : candidate.confidence === 0 ? "low" : "standard";
            const priorityLabel =
              priority === "preferred"
                ? t("editor.preferred")
                : priority === "low"
                  ? t("editor.lowConfidence")
                  : t("editor.candidate");
            return (
              <button
                key={`${candidate.chord.root.step}-${candidate.chord.kind}-${index}`}
                type="button"
                data-priority={priority}
                onClick={() => onSelect(candidate)}
              >
                <span className={styles.candidatePriority}>{priorityLabel}</span>
                <strong>{formatChordSymbol(candidate.chord)}</strong>
                <span>· {Math.round(candidate.confidence * 100)}%</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className={styles.candidateEmpty}>{t("editor.empty")}</p>
      )}
      <ContextPopup anchor={builderButtonRef.current} open={builderOpen} onOpenChange={setBuilderOpen}>
        <div>
          <h3>{t("editor.builderTitle")}</h3>
          <div className={styles.chordFields}>
            <label className={styles.field}>
              {t("editor.root")}
              <select
                aria-label={t("editor.root")}
                value={root}
                onChange={(event) => setRoot(event.target.value as typeof root)}
              >
                {steps.map((step) => (
                  <option key={step} value={step}>
                    {step}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              {t("editor.kind")}
              <select
                aria-label={t("editor.kind")}
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                {kinds.map((item) => (
                  <option key={item} value={item}>
                    {kindLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              {t("editor.extension")}
              <select
                aria-label={t("editor.extension")}
                value={extension}
                onChange={(event) => setExtension(event.target.value)}
              >
                <option value="none">{t("editor.none")}</option>
                {[6, 7, 9, 11, 13].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              {t("editor.bass")}
              <select aria-label={t("editor.bass")} value={bass} onChange={(event) => setBass(event.target.value)}>
                <option value="none">{t("editor.none")}</option>
                {steps.map((step) => (
                  <option key={step} value={step}>
                    {step}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className={styles.degreeEditor}>
            <legend>{t("editor.degrees")}</legend>
            <div className={styles.degreeControls}>
              <label className={styles.field}>
                {t("editor.operation")}
                <select
                  aria-label={t("editor.degreeOperation")}
                  value={degreeOperation}
                  onChange={(event) => {
                    const operation = event.target.value as typeof degreeOperation;
                    setDegreeOperation(operation);
                    if (operation !== "add" && degreeValue === 2) setDegreeValue(3);
                  }}
                >
                  {degreeOperations.map((operation) => (
                    <option key={operation} value={operation}>
                      {degreeOperationLabels[operation]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                {t("editor.degree")}
                <select
                  aria-label={t("editor.degree")}
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
                {t("editor.alteration")}
                <select
                  aria-label={t("editor.degreeAlteration")}
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
                {t("editor.addDegree")}
              </button>
            </div>
            <ul className={styles.degreeList} aria-label={t("editor.selectedDegrees")}>
              {degrees.map((degree) => (
                <li key={degree.value}>
                  {degreeOperationLabels[degree.operation]} {degree.alter} {degree.value}
                  <button
                    type="button"
                    onClick={() => setDegrees((current) => current.filter((item) => item !== degree))}
                  >
                    {t("editor.removeDegree", { degree: degree.value })}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              onApply({
                root: { step: root, alter: 0 },
                kind,
                ...(appliedExtension === undefined ? {} : { extension: appliedExtension as 6 | 7 | 9 | 11 | 13 }),
                degrees,
                ...(bass === "none" ? {} : { bass: { step: bass as typeof root, alter: 0 } }),
              });
              setBuilderOpen(false);
            }}
          >
            {t("editor.apply")}
          </button>
        </div>
      </ContextPopup>
    </section>
  );
}
