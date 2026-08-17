import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FileCog, FileOutput, FileText, RotateCcw, Square, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { PdfOmrJobSnapshot } from "@zupulse/web-core";
import { Button, Field, Panel, Select, Status } from "../../components/ui";
import { ScoreViewer } from "../../components/ScoreViewer";
import type { ViewerDomBindings, ViewerFile } from "../../host";
import type { ViewerSessionPort } from "../../viewer-session/viewer-session-types";
import type {
  PdfOmrInputPreview,
  PdfOmrMidiAnalysis,
  PdfOmrValidationView,
  PdfOmrWorkbenchPort,
  PdfOmrWrittenPitch,
} from "../../features/pdf-omr/pdf-omr-port";
import styles from "./PdfOmrPage.module.css";

type EvidenceTab = "pdf" | "engine" | "score";
type CommonT = TFunction<"common">;
type PdfOmrProgress = Parameters<Parameters<PdfOmrWorkbenchPort["subscribe"]>[0]>[1];

const STAGES = ["inspect", "recognize", "validate", "export"] as const;

export function PdfOmrPage({
  port,
  openPreviewSession,
}: {
  port?: PdfOmrWorkbenchPort | undefined;
  openPreviewSession?: ((file: ViewerFile, domBindings?: ViewerDomBindings) => Promise<ViewerSessionPort>) | undefined;
}) {
  const { t } = useTranslation("common");
  const [file, setFile] = useState<{
    token: string;
    fileName: string;
    sizeBytes: number;
    inputKind: "pdf" | "image";
  }>();
  const [snapshot, setSnapshot] = useState<PdfOmrJobSnapshot>();
  const [lastProgress, setLastProgress] = useState<PdfOmrProgress>();
  const [result, setResult] = useState<Awaited<ReturnType<PdfOmrWorkbenchPort["readResult"]>>>(null);
  const [failedValidation, setFailedValidation] = useState<PdfOmrValidationView | null>(null);
  const [selectedEngine, setSelectedEngine] = useState("");
  const [tab, setTab] = useState<EvidenceTab>("pdf");
  const [busy, setBusy] = useState<"select" | "start" | "cancel" | "export" | "midi" | "apply-midi" | undefined>();
  const [exported, setExported] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [midiAnalysis, setMidiAnalysis] = useState<PdfOmrMidiAnalysis>();
  const [midiSelections, setMidiSelections] = useState<Record<string, string>>({});
  const [midiApplied, setMidiApplied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const stageStartedAtRef = useRef<Partial<Record<(typeof STAGES)[number], number>>>({});
  const stageDurationsRef = useRef<Partial<Record<(typeof STAGES)[number], number>>>({});

  const engines = port?.engines ?? [];
  const input = file ?? snapshot?.input;
  const availableEngines = engines.filter(
    (engine) => engine.available && (input === undefined || engine.inputKinds.includes(input.inputKind)),
  );
  useEffect(() => {
    if (availableEngines.some((engine) => engine.id === selectedEngine)) return;
    setSelectedEngine(availableEngines[0]?.id ?? "");
  }, [availableEngines, selectedEngine]);

  const syncSnapshot = useCallback(
    async (jobId?: string) => {
      if (!port) return;
      const next = await port.getSnapshot();
      if (next && (jobId === undefined || next.jobId === jobId)) {
        setSnapshot(next);
        setExported(next.exported === true);
        if (next.status === "succeeded") {
          const nextResult = await port.readResult(next.jobId);
          setResult(nextResult);
          if (nextResult) setTab("score");
        } else if (next.status === "failed") {
          setFailedValidation(await port.readFailedValidation(next.jobId));
        }
      }
    },
    [port],
  );

  useEffect(() => {
    if (!port) return;
    let active = true;
    void syncSnapshot();
    const detach = port.subscribe((jobId, event) => {
      if (!active) return;
      setLastProgress(event);
      void syncSnapshot(jobId);
    });
    return () => {
      active = false;
      detach();
    };
  }, [port, syncSnapshot]);

  const activeJob = snapshot?.status === "running" || snapshot?.status === "cancelling";
  const activeStage = activeJob ? snapshot?.stage : undefined;

  useEffect(() => {
    stageStartedAtRef.current = {};
    stageDurationsRef.current = {};
  }, [snapshot?.jobId]);

  if (activeStage !== undefined && stageStartedAtRef.current[activeStage] === undefined) {
    stageStartedAtRef.current[activeStage] = now;
  }

  for (const stage of STAGES) {
    const state = stageState(stage, snapshot);
    const startedAt = stageStartedAtRef.current[stage];
    if (
      (state === "completed" || state === "failed") &&
      startedAt !== undefined &&
      stageDurationsRef.current[stage] === undefined
    ) {
      stageDurationsRef.current[stage] = now - startedAt;
    }
  }

  useEffect(() => {
    if (activeStage === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeStage]);

  const selectPdf = async () => {
    if (!port || activeJob) return;
    if (snapshot?.status === "succeeded" && !exported && !window.confirm(t("pdfOmr.replaceConfirm"))) return;
    setBusy("select");
    setNotice(undefined);
    try {
      const selected = await port.select();
      if (selected.status === "selected") {
        setFile({
          token: selected.fileToken,
          fileName: selected.fileName,
          sizeBytes: selected.sizeBytes,
          inputKind: selected.inputKind,
        });
        setSnapshot(undefined);
        setResult(null);
        setFailedValidation(null);
        setExported(false);
        setMidiAnalysis(undefined);
        setMidiSelections({});
        setMidiApplied(false);
        setTab("pdf");
      }
    } catch {
      setNotice(t("pdfOmr.selectionFailed"));
    } finally {
      setBusy(undefined);
    }
  };

  const start = async () => {
    if (!port || !file || !selectedEngine) return;
    setBusy("start");
    setNotice(undefined);
    try {
      const started = await port.start(file.token, selectedEngine);
      setSnapshot(started.snapshot);
      setResult(null);
      setFailedValidation(null);
      setExported(false);
      setTab("engine");
    } catch {
      setNotice(t("pdfOmr.startFailed"));
    } finally {
      setBusy(undefined);
    }
  };

  const cancel = async () => {
    if (!port || !snapshot || !["running", "cancelling"].includes(snapshot.status)) return;
    setBusy("cancel");
    try {
      await port.cancel(snapshot.jobId);
      await syncSnapshot(snapshot.jobId);
    } catch {
      setNotice(t("pdfOmr.cancelFailed"));
    } finally {
      setBusy(undefined);
    }
  };

  const retry = async () => {
    if (!port || !snapshot) return;
    const previousJobId = snapshot.jobId;
    setBusy("start");
    setNotice(undefined);
    try {
      const retried = await port.retry(previousJobId, selectedEngine);
      setSnapshot(retried.snapshot);
      setResult(null);
      setFailedValidation(null);
      setExported(false);
      setTab("engine");
    } catch {
      setNotice(t("pdfOmr.startFailed"));
    } finally {
      setBusy(undefined);
    }
  };

  const exportResult = async () => {
    if (!port || !snapshot || snapshot.status !== "succeeded") return;
    setBusy("export");
    try {
      const status = await port.exportResult(snapshot.jobId);
      if (status === "saved") setExported(true);
    } catch {
      setNotice(t("pdfOmr.exportFailed"));
    } finally {
      setBusy(undefined);
    }
  };

  const analyzeMidi = async () => {
    if (!port || snapshot?.status !== "succeeded") return;
    setBusy("midi");
    setNotice(undefined);
    try {
      const selected = await port.selectMidi();
      if (selected.status === "cancelled") return;
      const analysis = await port.analyzeMidi(snapshot.jobId, selected.fileToken);
      setMidiAnalysis(analysis);
      setMidiSelections({});
      setMidiApplied(false);
    } catch {
      setNotice(t("pdfOmr.midi.failed"));
    } finally {
      setBusy(undefined);
    }
  };

  const selectedMidiDecisions =
    midiAnalysis?.proposals.flatMap((proposal) => {
      const writtenPitch = parseWrittenPitch(midiSelections[proposal.id]);
      return writtenPitch === undefined ? [] : [{ proposalId: proposal.id, writtenPitch }];
    }) ?? [];

  const applyMidiCorrections = async () => {
    if (!port || snapshot?.status !== "succeeded" || selectedMidiDecisions.length === 0) return;
    setBusy("apply-midi");
    setNotice(undefined);
    try {
      await port.applyMidiCorrections(snapshot.jobId, selectedMidiDecisions);
      const corrected = await port.readResult(snapshot.jobId);
      if (corrected === null) throw new Error("corrected-result-unavailable");
      setResult(corrected);
      setExported(false);
      setMidiApplied(true);
      setTab("score");
    } catch {
      setNotice(t("pdfOmr.midi.applyFailed"));
    } finally {
      setBusy(undefined);
    }
  };

  const jobId = snapshot?.jobId;
  const loadInputPreview = useCallback(
    (pageIndex: number) =>
      port !== undefined && jobId !== undefined ? port.readInputPreview(jobId, pageIndex) : Promise.resolve(null),
    [port, jobId],
  );

  const statusTone =
    snapshot?.status === undefined && input !== undefined ? "ready" : snapshotStatusTone(snapshot?.status);
  const hasJob = snapshot !== undefined;
  const canStart = file !== undefined && selectedEngine !== "" && !hasJob;
  const canRetry = snapshot?.status === "failed" || snapshot?.status === "cancelled";
  const validationView = result?.validation ?? failedValidation;
  const statusDetail = statusDetailText(t, snapshot, exported, input !== undefined);

  return (
    <main className={styles.shell} aria-labelledby="pdf-omr-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t("pdfOmr.badge")}</p>
          <h1 id="pdf-omr-title">{t("pdfOmr.title")}</h1>
          <p>{t("pdfOmr.description")}</p>
        </div>
        <div className={styles.statusBlock}>
          <Status tone={statusTone}>{statusLabel(t, snapshot?.status, exported, input !== undefined)}</Status>
          {statusDetail ? <small>{statusDetail}</small> : null}
        </div>
      </header>

      <div className={styles.workbench}>
        <aside className={styles.rail} aria-label={t("pdfOmr.inputAndStages")}>
          <Panel className={styles.inputPanel}>
            <div className={styles.panelTitle}>
              <FileText aria-hidden="true" size={16} />
              <h2>{t("pdfOmr.input")}</h2>
            </div>
            {input ? (
              <div className={styles.fileSummary}>
                <strong>{input.fileName}</strong>
                <span>
                  {[
                    formatBytes(input.sizeBytes),
                    t(`pdfOmr.inputKind.${input.inputKind}`),
                    snapshot?.input?.pageCount === undefined
                      ? undefined
                      : t("pdfOmr.inputPages", { count: snapshot.input.pageCount }),
                  ]
                    .filter((part) => part !== undefined)
                    .join(" · ")}
                </span>
              </div>
            ) : (
              <p className={styles.muted}>{t("pdfOmr.noFile")}</p>
            )}
            <Button
              tone="secondary"
              size="sm"
              onClick={() => void selectPdf()}
              disabled={activeJob}
              loading={busy === "select"}
            >
              <Upload aria-hidden="true" size={15} />
              {t("pdfOmr.selectPdf")}
            </Button>
          </Panel>

          <Panel className={styles.stagePanel}>
            <div className={styles.panelTitle}>
              <FileCog aria-hidden="true" size={16} />
              <h2>{t("pdfOmr.stages")}</h2>
            </div>
            <ol className={styles.stageList}>
              {STAGES.map((stage, index) => {
                const state = stageState(stage, snapshot);
                const duration = stageDurationsRef.current[stage];
                return (
                  <li key={stage} data-state={state}>
                    <span className={styles.stageMarker} aria-hidden="true">
                      {state === "completed" ? "✓" : state === "active" ? "●" : state === "skipped" ? "–" : index + 1}
                    </span>
                    <span>
                      <strong>{t(`pdfOmr.stage.${stage}.title`)}</strong>
                      <small>{t(`pdfOmr.stage.${stage}.${state}`)}</small>
                      {state === "active" ? (
                        <small className={styles.stageActivity} role="status">
                          {stageActivityLabel(t, stage, snapshot, stageStartedAtRef.current[stage], now)}
                        </small>
                      ) : null}
                      {duration !== undefined && (state === "completed" || state === "failed") ? (
                        <small className={styles.stageActivity}>
                          {t("pdfOmr.stageDuration", { time: formatElapsed(duration) })}
                        </small>
                      ) : null}
                      {stage === "validate" && state === "completed" && validationView ? (
                        <small className={styles.stageActivity}>
                          {t("pdfOmr.stageValidation", {
                            blocking: validationView.diagnostics.filter((d) => d.severity === "blocking").length,
                            warning: validationView.diagnostics.filter((d) => d.severity === "warning").length,
                          })}
                        </small>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </aside>

        <section className={styles.evidence} aria-label={t("pdfOmr.evidenceLabel")}>
          <div className={styles.evidenceToolbar} role="tablist" aria-label={t("pdfOmr.evidenceTabs")}>
            <EvidenceTabButton tab="pdf" active={tab === "pdf"} disabled={!file} onSelect={setTab}>
              {t("pdfOmr.tab.pdf")}
            </EvidenceTabButton>
            <EvidenceTabButton tab="engine" active={tab === "engine"} disabled={!hasJob} onSelect={setTab}>
              {t("pdfOmr.tab.engine")}
            </EvidenceTabButton>
            <EvidenceTabButton tab="score" active={tab === "score"} disabled={!result} onSelect={setTab}>
              {t("pdfOmr.tab.score")}
            </EvidenceTabButton>
          </div>
          <div className={styles.evidenceViewport}>
            {tab === "score" && result ? (
              <PdfOmrScorePreview result={result} openPreviewSession={openPreviewSession} />
            ) : tab === "engine" ? (
              <EngineEvidence
                snapshot={snapshot}
                lastProgress={lastProgress}
                stageStartedAt={snapshot?.stage === undefined ? undefined : stageStartedAtRef.current[snapshot.stage]}
                now={now}
                t={t}
              />
            ) : (
              <PdfEvidence file={input} loadPreview={jobId === undefined ? undefined : loadInputPreview} t={t} />
            )}
          </div>
        </section>

        <aside className={styles.summary} aria-label={t("pdfOmr.resultLabel")}>
          <Panel className={styles.controlPanel}>
            <div className={styles.panelTitle}>
              <FileOutput aria-hidden="true" size={16} />
              <h2>{t("pdfOmr.result")}</h2>
            </div>
            <div className={styles.engineField}>
              <Field label={t("pdfOmr.engine")} description={t("pdfOmr.engineHint")}>
                <Select
                  value={selectedEngine}
                  onChange={(event) => setSelectedEngine(event.target.value)}
                  disabled={(hasJob && !canRetry) || availableEngines.length === 0}
                >
                  {availableEngines.length === 0 ? <option value="">{t("pdfOmr.noEngines")}</option> : null}
                  {engines.map((engine) => {
                    const compatible = input === undefined || engine.inputKinds.includes(input.inputKind);
                    const disabled = !engine.available || !compatible;
                    return (
                      <option
                        key={engine.id}
                        value={engine.id}
                        disabled={disabled}
                        title={disabled ? engineAvailabilityText(t, engine, compatible) : undefined}
                      >
                        {engine.label} · {formatEngineVersion(engine.version)}
                        {disabled ? ` — ${t("pdfOmr.unavailable")}` : ""}
                      </option>
                    );
                  })}
                </Select>
              </Field>
              <details className={styles.engineAvailability}>
                <summary>
                  {t("pdfOmr.engineAvailability.label")}
                  {(() => {
                    const current = engines.find((engine) => engine.id === selectedEngine);
                    if (current === undefined) return null;
                    const compatible = input === undefined || current.inputKinds.includes(input.inputKind);
                    return (
                      <span className={styles.engineAvailabilitySummary}>
                        {current.label} ·{" "}
                        {current.available && compatible
                          ? t("pdfOmr.engineAvailability.readyShort")
                          : t("pdfOmr.unavailable")}
                      </span>
                    );
                  })()}
                </summary>
                <ul className={styles.engineStatusList} aria-label={t("pdfOmr.engineAvailability.label")}>
                  {engines.map((engine) => {
                    const compatible = input === undefined || engine.inputKinds.includes(input.inputKind);
                    return (
                      <li
                        key={engine.id}
                        data-available={engine.available && compatible}
                        data-tier={engineAvailabilityTier(engine)}
                      >
                        <span className={styles.engineStatusDot} aria-hidden="true" />
                        <span>
                          <strong>{engine.label}</strong>
                          <small>{engineAvailabilityText(t, engine, compatible)}</small>
                          {!engine.available ? (
                            <a className={styles.engineSettingsLink} href="#/settings">
                              {t("pdfOmr.engineAvailability.configure")}
                            </a>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </div>
            <div className={styles.primaryActions}>
              {snapshot?.status === "succeeded" ? (
                <>
                  <Button tone="primary" size="lg" onClick={() => void exportResult()} loading={busy === "export"}>
                    {exported ? t("pdfOmr.exported") : t("pdfOmr.export")}
                  </Button>
                  <Button tone="secondary" onClick={() => void selectPdf()} loading={busy === "select"}>
                    <Upload aria-hidden="true" size={15} />
                    {t("pdfOmr.selectNext")}
                  </Button>
                </>
              ) : snapshot?.status === "running" || snapshot?.status === "cancelling" ? (
                <Button
                  tone="secondary"
                  onClick={() => void cancel()}
                  disabled={snapshot.status === "cancelling"}
                  loading={busy === "cancel" || snapshot.status === "cancelling"}
                >
                  <Square aria-hidden="true" size={14} />
                  {snapshot.status === "cancelling" ? t("pdfOmr.cancelWait") : t("pdfOmr.cancel")}
                </Button>
              ) : canRetry ? (
                <Button tone="primary" onClick={() => void retry()} loading={busy === "start"}>
                  <RotateCcw aria-hidden="true" size={15} />
                  {t("pdfOmr.retry")}
                </Button>
              ) : (
                <Button
                  tone="primary"
                  size="lg"
                  onClick={() => void start()}
                  disabled={!canStart}
                  loading={busy === "start"}
                >
                  {t("pdfOmr.start")}
                </Button>
              )}
            </div>
            {notice ? (
              <p className={styles.notice} role="alert">
                {notice}
              </p>
            ) : null}
          </Panel>

          <Panel className={styles.diagnosticsPanel}>
            <div className={styles.panelTitle}>
              <h2>{t("pdfOmr.diagnostics")}</h2>
              {validationView ? <span className={styles.count}>{validationView.diagnostics.length}</span> : null}
            </div>
            {snapshot?.error ? (
              <div className={styles.errorSummary} role="alert" data-pdf-omr-error>
                <strong>{t("pdfOmr.errorTitle")}</strong>
                <code>{t("pdfOmr.errorCode", { code: snapshot.error.code })}</code>
                {snapshot.stage ? (
                  <small>{t("pdfOmr.errorStage", { stage: t(`pdfOmr.stage.${snapshot.stage}.title`) })}</small>
                ) : null}
                <p>{pdfOmrErrorReason(t, snapshot.error.code, snapshot.error.reason)}</p>
                <p>{t("pdfOmr.errorActionHint")}</p>
              </div>
            ) : null}
            {validationView ? (
              <ValidationView validation={validationView} t={t} />
            ) : snapshot?.error ? null : (
              <p className={styles.muted}>{t("pdfOmr.diagnosticsEmpty")}</p>
            )}
          </Panel>

          <MidiCorrectionPanel
            enabled={snapshot?.status === "succeeded" && result !== null}
            analysis={midiAnalysis}
            selections={midiSelections}
            applied={midiApplied}
            busy={busy}
            onAnalyze={() => void analyzeMidi()}
            onSelect={(proposalId, value) => setMidiSelections((current) => ({ ...current, [proposalId]: value }))}
            onApply={() => void applyMidiCorrections()}
            selectedCount={selectedMidiDecisions.length}
            t={t}
          />
        </aside>
      </div>
    </main>
  );
}

function MidiCorrectionPanel({
  enabled,
  analysis,
  selections,
  applied,
  busy,
  onAnalyze,
  onSelect,
  onApply,
  selectedCount,
  t,
}: {
  enabled: boolean;
  analysis?: PdfOmrMidiAnalysis | undefined;
  selections: Readonly<Record<string, string>>;
  applied: boolean;
  busy: "select" | "start" | "cancel" | "export" | "midi" | "apply-midi" | undefined;
  onAnalyze(): void;
  onSelect(proposalId: string, value: string): void;
  onApply(): void;
  selectedCount: number;
  t: CommonT;
}) {
  const ready =
    analysis?.proposals.filter(
      (proposal): proposal is typeof proposal & { suggestedSoundingMidi: number } =>
        proposal.reviewability.status === "writeback-ready" && proposal.suggestedSoundingMidi !== undefined,
    ) ?? [];
  const reviewOnly = (analysis?.proposals.length ?? 0) - ready.length;
  return (
    <Panel className={styles.midiPanel}>
      <div className={styles.panelTitle}>
        <h2>{t("pdfOmr.midi.title")}</h2>
        {analysis ? <span className={styles.count}>{ready.length}</span> : null}
      </div>
      {!enabled ? (
        <p className={styles.muted}>{t("pdfOmr.midi.requiresResult")}</p>
      ) : analysis === undefined ? (
        <>
          <p className={styles.muted}>{t("pdfOmr.midi.hint")}</p>
          <Button tone="secondary" size="sm" onClick={onAnalyze} loading={busy === "midi"}>
            {t("pdfOmr.midi.select")}
          </Button>
        </>
      ) : (
        <div className={styles.midiReview}>
          <strong data-compatibility={analysis.compatibility.status}>
            {t(`pdfOmr.midi.compatibility.${analysis.compatibility.status}`)}
          </strong>
          <p>{t("pdfOmr.midi.pitchAgreement", { value: Math.round(analysis.compatibility.pitchAgreement * 100) })}</p>
          <small>{t("pdfOmr.midi.reviewOnly", { count: reviewOnly })}</small>
          {ready.map((proposal) => {
            const label = t("pdfOmr.midi.writtenPitchLabel", { measure: (proposal.measureIndex ?? 0) + 1 });
            return (
              <label key={proposal.id} className={styles.pitchDecision}>
                <span>{label}</span>
                <small>
                  {t("pdfOmr.midi.pitchProposal", {
                    before: formatWrittenPitch(proposal.before),
                    midi: proposal.suggestedSoundingMidi,
                  })}
                </small>
                <Select
                  aria-label={label}
                  value={selections[proposal.id] ?? ""}
                  onChange={(event) => onSelect(proposal.id, event.target.value)}
                >
                  <option value="">{t("pdfOmr.midi.chooseSpelling")}</option>
                  {writtenPitchOptions(proposal.suggestedSoundingMidi).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            );
          })}
          {ready.length > 0 ? (
            <Button
              tone="primary"
              size="sm"
              disabled={selectedCount === 0}
              loading={busy === "apply-midi"}
              onClick={onApply}
            >
              {t("pdfOmr.midi.apply", { count: selectedCount })}
            </Button>
          ) : null}
          <Button tone="secondary" size="sm" onClick={onAnalyze} loading={busy === "midi"}>
            {t("pdfOmr.midi.replace")}
          </Button>
          {applied ? (
            <p className={styles.midiApplied} role="status">
              {t("pdfOmr.midi.applied")}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function EvidenceTabButton({
  tab,
  active,
  disabled,
  onSelect,
  children,
}: {
  tab: EvidenceTab;
  active: boolean;
  disabled: boolean;
  onSelect(tab: EvidenceTab): void;
  children: ReactNode;
}) {
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(
      event.currentTarget
        .closest('[role="tablist"]')
        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [],
    );
    if (tabs.length === 0) return;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const targetIndex =
      event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : tabs.indexOf(event.currentTarget) + direction;
    const target = tabs[(targetIndex + tabs.length) % tabs.length]!;
    onSelect(target.dataset.pdfOmrTab as EvidenceTab);
    requestAnimationFrame(() => target.focus());
  };
  return (
    <button
      type="button"
      role="tab"
      data-pdf-omr-tab={tab}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      onClick={() => onSelect(tab)}
      onKeyDown={moveTab}
    >
      {children}
    </button>
  );
}

function PdfEvidence({
  file,
  loadPreview,
  t,
}: {
  file?: { fileName: string; sizeBytes: number } | undefined;
  loadPreview?: ((pageIndex: number) => Promise<PdfOmrInputPreview | null>) | undefined;
  t: CommonT;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [preview, setPreview] = useState<{ url: string; pageCount: number } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  useEffect(() => {
    if (loadPreview === undefined) {
      setPreview(null);
      setState("idle");
      return;
    }
    let active = true;
    let url: string | undefined;
    setState("loading");
    loadPreview(pageIndex)
      .then((result) => {
        if (!active) return;
        if (result === null) {
          setPreview(null);
          setState("unavailable");
          return;
        }
        url = URL.createObjectURL(new Blob([Uint8Array.from(result.bytes)], { type: result.contentType }));
        setPreview({ url, pageCount: result.pageCount });
        setState("ready");
      })
      .catch(() => {
        if (active) {
          setPreview(null);
          setState("unavailable");
        }
      });
    return () => {
      active = false;
      if (url !== undefined) URL.revokeObjectURL(url);
    };
  }, [loadPreview, pageIndex]);

  if (state === "idle" || file === undefined) {
    return (
      <div className={styles.emptyEvidence}>
        <FileText aria-hidden="true" size={44} strokeWidth={1.2} />
        <h2>{file ? file.fileName : t("pdfOmr.pdfPlaceholder")}</h2>
        <p>{file ? t("pdfOmr.pdfSelected", { size: formatBytes(file.sizeBytes) }) : t("pdfOmr.pdfHint")}</p>
      </div>
    );
  }
  return (
    <div className={styles.pdfPreview}>
      <div className={styles.pdfPreviewHeader}>
        <strong>{file.fileName}</strong>
        {preview !== null && preview.pageCount > 1 ? (
          <span className={styles.pdfPreviewPager}>
            <button
              type="button"
              aria-label={t("pdfOmr.pdfPreview.previous")}
              disabled={pageIndex === 0 || state === "loading"}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              ‹
            </button>
            <span>{t("pdfOmr.pdfPreview.pageLabel", { page: pageIndex + 1, total: preview.pageCount })}</span>
            <button
              type="button"
              aria-label={t("pdfOmr.pdfPreview.next")}
              disabled={pageIndex + 1 >= preview.pageCount || state === "loading"}
              onClick={() => setPageIndex((current) => current + 1)}
            >
              ›
            </button>
          </span>
        ) : null}
      </div>
      {state === "loading" ? <p className={styles.muted}>{t("pdfOmr.pdfPreview.loading")}</p> : null}
      {state === "unavailable" ? <p className={styles.muted}>{t("pdfOmr.pdfPreview.unavailable")}</p> : null}
      {preview !== null ? (
        <img
          src={preview.url}
          alt={t("pdfOmr.pdfPreview.imageAlt", { fileName: file.fileName, page: pageIndex + 1 })}
        />
      ) : null}
    </div>
  );
}

function EngineEvidence({
  snapshot,
  lastProgress,
  stageStartedAt,
  now,
  t,
}: {
  snapshot?: PdfOmrJobSnapshot | undefined;
  lastProgress?: PdfOmrProgress | undefined;
  stageStartedAt: number | undefined;
  now: number;
  t: CommonT;
}) {
  const progress =
    snapshot?.status === "running" || snapshot?.status === "cancelling"
      ? (snapshot.progress ??
        (lastProgress?.kind === "engine-progress" &&
        lastProgress.completed !== undefined &&
        lastProgress.total !== undefined &&
        lastProgress.unit !== undefined
          ? { completed: lastProgress.completed, total: lastProgress.total, unit: lastProgress.unit }
          : undefined))
      : undefined;
  const elapsedMs = stageStartedAt === undefined ? undefined : Math.max(0, now - stageStartedAt);
  const etaMs =
    progress !== undefined && elapsedMs !== undefined && progress.completed > 0 && progress.completed < progress.total
      ? (elapsedMs / progress.completed) * (progress.total - progress.completed)
      : undefined;
  return (
    <div className={styles.engineEvidence}>
      <h2>{t("pdfOmr.engineEvidence")}</h2>
      <p>{t("pdfOmr.engineEvidenceHint")}</p>
      {snapshot?.engine ? (
        <code>
          {snapshot.engine.id} · {formatEngineVersion(snapshot.engine.version)}
        </code>
      ) : null}
      {progress !== undefined ? (
        <>
          <p className={styles.progressBig}>
            <strong>
              {progress.completed} / {progress.total}
            </strong>
            <span>{progress.unit === "page" ? t("pdfOmr.unit.page") : t("pdfOmr.unit.system")}</span>
          </p>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
            />
          </div>
          <p className={styles.progressMeta} role="status">
            {[
              elapsedMs === undefined ? undefined : t("pdfOmr.stageElapsed", { time: formatElapsed(elapsedMs) }),
              etaMs === undefined ? undefined : t("pdfOmr.stageEta", { time: formatElapsed(etaMs) }),
            ]
              .filter((part) => part !== undefined)
              .join(" · ")}
          </p>
        </>
      ) : null}
    </div>
  );
}

function PdfOmrScorePreview({
  result,
  openPreviewSession,
}: {
  result: NonNullable<Awaited<ReturnType<PdfOmrWorkbenchPort["readResult"]>>>;
  openPreviewSession?: ((file: ViewerFile, domBindings?: ViewerDomBindings) => Promise<ViewerSessionPort>) | undefined;
}) {
  const { t } = useTranslation("common");
  const [session, setSession] = useState<ViewerSessionPort>();
  const sessionRef = useRef<ViewerSessionPort | undefined>(undefined);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!openPreviewSession) return;
    let active = true;
    const status = document.createElement("output");
    const summary = document.createElement("div");
    const open = async () => {
      try {
        const alphaTabHost = document.querySelector<HTMLElement>("[data-pdf-omr-preview-host]");
        const scoreScrollElement = document.querySelector<HTMLElement>("[data-pdf-omr-preview-scroll]");
        if (!alphaTabHost || !scoreScrollElement) throw new Error("PDF_OMR_PREVIEW_HOST_MISSING");
        const next = await openPreviewSession(
          { fileName: result.fileName, bytes: result.bytes },
          {
            alphaTabHost,
            scoreScrollElement,
            status,
            summary,
          },
        );
        if (active) {
          sessionRef.current = next;
          setSession(next);
        } else await next.destroy();
      } catch {
        if (active) setError(true);
      }
    };
    void open();
    return () => {
      active = false;
      const current = sessionRef.current;
      sessionRef.current = undefined;
      void current?.destroy();
    };
  }, [openPreviewSession, result]);
  if (!openPreviewSession || error)
    return (
      <div className={styles.emptyEvidence}>
        <h2>{t("pdfOmr.previewUnavailable")}</h2>
        <p>{t("pdfOmr.previewUnavailableHint")}</p>
      </div>
    );
  return (
    <div className={styles.previewShell}>
      <output className="sr-only" aria-live="polite">
        {session ? t("pdfOmr.previewReady") : t("pdfOmr.previewLoading")}
      </output>
      <div data-pdf-omr-preview-scroll className={styles.previewScroll}>
        <ScoreViewer
          compact
          domId="pdf-omr-preview-host"
          scoreHostRef={(element) => element?.setAttribute("data-pdf-omr-preview-host", "true")}
          scoreScrollRef={(element) => element?.setAttribute("data-pdf-omr-preview-scroll", "true")}
        />
      </div>
    </div>
  );
}

function stageState(
  stage: (typeof STAGES)[number],
  snapshot?: PdfOmrJobSnapshot,
): "pending" | "active" | "completed" | "failed" | "skipped" {
  if (!snapshot) return "pending";
  const index = STAGES.indexOf(stage);
  const current = snapshot.stage === undefined ? -1 : STAGES.indexOf(snapshot.stage);
  if (snapshot.status === "failed") {
    if (current === index) return "failed";
    return current > index ? "completed" : "skipped";
  }
  if (snapshot.status === "cancelled") {
    return current > index ? "completed" : "skipped";
  }
  if (snapshot.status === "succeeded" || current > index) return "completed";
  if (current === index) return "active";
  return "pending";
}

function stageActivityLabel(
  t: CommonT,
  stage: (typeof STAGES)[number],
  snapshot: PdfOmrJobSnapshot | undefined,
  startedAt: number | undefined,
  now: number,
): string {
  const elapsed =
    startedAt === undefined ? undefined : t("pdfOmr.stageElapsed", { time: formatElapsed(now - startedAt) });
  if (stage === "recognize" && snapshot?.progress !== undefined) {
    const { completed, total } = snapshot.progress;
    const progress = t("pdfOmr.stageProgress", {
      completed,
      total,
      unit: snapshot.progress.unit === "page" ? t("pdfOmr.unit.page") : t("pdfOmr.unit.system"),
    });
    const eta =
      startedAt !== undefined && completed > 0 && completed < total
        ? t("pdfOmr.stageEta", { time: formatElapsed(((now - startedAt) / completed) * (total - completed)) })
        : undefined;
    return [progress, elapsed, eta].filter((part) => part !== undefined).join(" · ");
  }
  return elapsed ?? t(`pdfOmr.stage.${stage}.active`);
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function statusLabel(
  t: CommonT,
  status: PdfOmrJobSnapshot["status"] | undefined,
  exported: boolean,
  hasInput: boolean,
): string {
  if (exported) return t("pdfOmr.status.exported");
  if (status === undefined && hasInput) return t("pdfOmr.status.ready");
  return t(`pdfOmr.status.${status ?? "empty"}`);
}

function snapshotStatusTone(
  status: PdfOmrJobSnapshot["status"] | undefined,
): "neutral" | "ready" | "warning" | "danger" {
  if (status === "succeeded") return "ready";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "warning";
  return "neutral";
}

function pdfOmrErrorReason(t: CommonT, code: string, reason?: string | undefined): string {
  switch (reason) {
    case "input-image-too-large":
      return t("pdfOmr.errorReason.inputImageTooLarge");
    case "engine-step-timeout":
      return t("pdfOmr.errorReason.engineStepTimeout");
    case "ambiguous-system-segmentation":
      return t("pdfOmr.errorReason.ambiguousSystemSegmentation");
    case "encrypted-pdf":
      return t("pdfOmr.errorReason.encryptedPdf");
    case "malformed-pdf":
      return t("pdfOmr.errorReason.malformedPdf");
    case "malformed-image":
      return t("pdfOmr.errorReason.malformedImage");
    case "unreadable-pdf":
      return t("pdfOmr.errorReason.unreadablePdf");
    case "timeout":
      return t("pdfOmr.errorReason.timeout");
    case "non-zero-exit":
      return t("pdfOmr.errorReason.nonZeroExit");
    case "output-limit":
      return t("pdfOmr.errorReason.outputLimit");
    case "zero-page-pdf":
      return t("pdfOmr.errorReason.zeroPagePdf");
    case "unsupported-page-orientation":
      return t("pdfOmr.errorReason.unsupportedPageOrientation");
    case "unsupported-engine-input-kind":
      return t("pdfOmr.errorReason.unsupportedEngineInputKind");
    case "unsupported-page-count":
      return t("pdfOmr.errorReason.unsupportedPageCount");
    case "musicxml-readiness-blocked":
      return t("pdfOmr.errorReason.musicxmlReadinessBlocked");
    case "harmony-readiness-blocked":
      return t("pdfOmr.errorReason.harmonyReadinessBlocked");
    case "missing-artifact":
      return t("pdfOmr.errorReason.missingArtifact");
    case "normalization-failed":
      return t("pdfOmr.errorReason.normalizationFailed");
    case "invalid-musicxml":
      return t("pdfOmr.errorReason.invalidMusicxml");
    default:
      break;
  }
  switch (code) {
    case "ENGINE_UNAVAILABLE":
      return t("pdfOmr.errorReason.engineUnavailable");
    case "ENGINE_EXECUTION_FAILED":
      return t("pdfOmr.errorReason.engineExecutionFailed");
    case "ENGINE_OUTPUT_INVALID":
      return t("pdfOmr.errorReason.engineOutputInvalid");
    case "DRAFT_VALIDATION_FAILED":
      return t("pdfOmr.errorReason.draftValidationFailed");
    case "INVALID_INPUT":
      return t("pdfOmr.errorReason.invalidInput");
    case "INTERRUPTED":
      return t("pdfOmr.errorReason.interrupted");
    default:
      return reason === undefined
        ? t("pdfOmr.errorReason.unknown", { code })
        : t("pdfOmr.errorReason.unknownReason", { code, reason });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function engineAvailabilityText(
  t: CommonT,
  engine: PdfOmrWorkbenchPort["engines"][number],
  compatible: boolean,
): string {
  if (engine.available && !compatible) return t("pdfOmr.engineAvailability.unsupportedInput");
  if (engine.available) {
    return t("pdfOmr.engineAvailability.ready", {
      version: formatEngineVersion(engine.version),
    });
  }
  switch (engine.reason) {
    case "engine-executable-unavailable":
      return t("pdfOmr.engineAvailability.executableUnavailable");
    case "missing-rokot-configuration":
      return t("pdfOmr.engineAvailability.rokotNotConfigured");
    case "missing-legato-configuration":
      return t("pdfOmr.engineAvailability.legatoNotConfigured");
    case "model-unreadable":
    case "base-model-unreadable":
    case "mmproj-unreadable":
      return t("pdfOmr.engineAvailability.modelUnreadable");
    case "model-hash-mismatch":
    case "mmproj-hash-mismatch":
      return t("pdfOmr.engineAvailability.modelMismatch");
    case "repository-revision-mismatch":
    case "python-version-mismatch":
    case "llama-build-mismatch":
    case "abc-converter-unavailable":
    case "base-model-config-empty":
      return t("pdfOmr.engineAvailability.runtimeMismatch");
    default:
      return t("pdfOmr.engineAvailability.inspectFailed");
  }
}

function engineAvailabilityTier(
  engine: PdfOmrWorkbenchPort["engines"][number],
): "ready" | "unconfigured" | "mismatch" | "error" {
  if (engine.available) return "ready";
  switch (engine.reason) {
    case "missing-rokot-configuration":
    case "missing-legato-configuration":
      return "unconfigured";
    case "model-unreadable":
    case "base-model-unreadable":
    case "mmproj-unreadable":
    case "model-hash-mismatch":
    case "mmproj-hash-mismatch":
    case "repository-revision-mismatch":
    case "python-version-mismatch":
    case "llama-build-mismatch":
    case "abc-converter-unavailable":
    case "base-model-config-empty":
      return "mismatch";
    default:
      return "error";
  }
}

function statusDetailText(
  t: CommonT,
  snapshot: PdfOmrJobSnapshot | undefined,
  exported: boolean,
  hasInput: boolean,
): string | undefined {
  if (exported) return t("pdfOmr.statusDetail.exported");
  const status = snapshot?.status;
  if (status === "succeeded") return t("pdfOmr.statusDetail.succeeded");
  if (status === "failed") return t("pdfOmr.statusDetail.failed");
  if (status === "cancelled") return t("pdfOmr.statusDetail.cancelled");
  if ((status === "running" || status === "cancelling") && snapshot?.stage !== undefined) {
    return t("pdfOmr.statusDetail.running", { stage: t(`pdfOmr.stage.${snapshot.stage}.title`) });
  }
  if (status === undefined && hasInput) return t("pdfOmr.statusDetail.ready");
  return undefined;
}

function formatEngineVersion(version: string): string {
  return /^[0-9a-f]{40}$/i.test(version) ? version.slice(0, 8) : version;
}

const pitchClasses = [
  ["C", 0],
  ["D", 2],
  ["E", 4],
  ["F", 5],
  ["G", 7],
  ["A", 9],
  ["B", 11],
] as const;

function writtenPitchOptions(midi: number | undefined): Array<{ value: string; label: string }> {
  if (midi === undefined) return [];
  const options: Array<{ value: string; label: string }> = [];
  for (let octave = -1; octave <= 9; octave += 1) {
    for (const [step, natural] of pitchClasses) {
      for (const alter of [-2, -1, 0, 1, 2] as const) {
        if ((octave + 1) * 12 + natural + alter !== midi) continue;
        const pitch = { step, alter, octave };
        options.push({ value: `${step}:${alter}:${octave}`, label: formatWrittenPitch(pitch) });
      }
    }
  }
  return options;
}

function parseWrittenPitch(value: string | undefined): PdfOmrWrittenPitch | undefined {
  if (!value) return undefined;
  const [step, alter, octave] = value.split(":");
  const parsedAlter = Number(alter);
  const parsedOctave = Number(octave);
  if (!/^[A-G]$/.test(step ?? "") || ![-2, -1, 0, 1, 2].includes(parsedAlter) || !Number.isInteger(parsedOctave)) {
    return undefined;
  }
  return {
    step: step as PdfOmrWrittenPitch["step"],
    alter: parsedAlter as PdfOmrWrittenPitch["alter"],
    octave: parsedOctave,
  };
}

function formatWrittenPitch(pitch: PdfOmrWrittenPitch | undefined): string {
  if (pitch === undefined) return "—";
  const accidental = ({ "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" } as const)[pitch.alter];
  return `${pitch.step}${accidental}${pitch.octave}`;
}

function diagnosticText(t: CommonT, code: string): string {
  switch (code) {
    case "VOICE_EVENT_OVERLAP":
      return t("pdfOmr.diagnosticCode.VOICE_EVENT_OVERLAP");
    case "VOICE_DURATION_MISMATCH":
      return t("pdfOmr.diagnosticCode.VOICE_DURATION_MISMATCH");
    case "MISSING_CLEF":
      return t("pdfOmr.diagnosticCode.MISSING_CLEF");
    case "MISSING_KEY_SIGNATURE":
      return t("pdfOmr.diagnosticCode.MISSING_KEY_SIGNATURE");
    case "MISSING_DIVISIONS":
      return t("pdfOmr.diagnosticCode.MISSING_DIVISIONS");
    case "MISSING_TIME_SIGNATURE":
      return t("pdfOmr.diagnosticCode.MISSING_TIME_SIGNATURE");
    case "MISSING_PITCH":
      return t("pdfOmr.diagnosticCode.MISSING_PITCH");
    case "MISSING_EVENT_TIMING":
      return t("pdfOmr.diagnosticCode.MISSING_EVENT_TIMING");
    case "IMPLICIT_REST_FILL":
      return t("pdfOmr.diagnosticCode.IMPLICIT_REST_FILL");
    case "ROKOT_STAFF_MEASURE_COUNT_MISMATCH":
      return t("pdfOmr.diagnosticCode.ROKOT_STAFF_MEASURE_COUNT_MISMATCH");
    case "ROKOT_MEASURE_DURATION_MISMATCH":
      return t("pdfOmr.diagnosticCode.ROKOT_MEASURE_DURATION_MISMATCH");
    case "ROKOT_UNSUPPORTED_VOICE":
      return t("pdfOmr.diagnosticCode.ROKOT_UNSUPPORTED_VOICE");
    case "ROKOT_UNSUPPORTED_STAFF_TOPOLOGY":
      return t("pdfOmr.diagnosticCode.ROKOT_UNSUPPORTED_STAFF_TOPOLOGY");
    case "ROKOT_SYSTEM_BOUNDARY_AMBIGUOUS":
      return t("pdfOmr.diagnosticCode.ROKOT_SYSTEM_BOUNDARY_AMBIGUOUS");
    default:
      return code;
  }
}

function ValidationView({ validation, t }: { validation: PdfOmrValidationView; t: CommonT }) {
  const severityRank = { blocking: 0, warning: 1, info: 2 } as const;
  const sorted = [...validation.diagnostics].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const visible = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  const renderItem = (diagnostic: PdfOmrValidationView["diagnostics"][number], index: number) => (
    <li key={`${diagnostic.severity}-${diagnostic.code}-${index}`} data-severity={diagnostic.severity}>
      <details>
        <summary>
          <span>{diagnosticText(t, diagnostic.code)}</span>
          <span>{t(`pdfOmr.severity.${diagnostic.severity}`)}</span>
        </summary>
        <p>{t("pdfOmr.diagnosticDetail", { code: diagnostic.code })}</p>
      </details>
    </li>
  );
  return (
    <>
      <div className={styles.readinessGrid}>
        <Readiness label={t("pdfOmr.musicXml")} value={validation.readiness.musicXml} t={t} />
        <Readiness label={t("pdfOmr.harmony")} value={validation.readiness.harmony} t={t} />
      </div>
      <p className={styles.muted}>{t("pdfOmr.readinessHint")}</p>
      <ul className={styles.diagnosticList}>{visible.map(renderItem)}</ul>
      {rest.length > 0 ? (
        <details className={styles.diagnosticsMore}>
          <summary>{t("pdfOmr.diagnosticsMore", { count: rest.length })}</summary>
          <ul className={styles.diagnosticList}>{rest.map(renderItem)}</ul>
        </details>
      ) : null}
    </>
  );
}

function Readiness({
  label,
  value,
  t,
}: {
  label: string;
  value: "blocked" | "ready-with-warnings" | "ready";
  t: CommonT;
}) {
  return (
    <div data-readiness={value}>
      <span>{label}</span>
      <strong>{t(`pdfOmr.readiness.${value}`)}</strong>
    </div>
  );
}
