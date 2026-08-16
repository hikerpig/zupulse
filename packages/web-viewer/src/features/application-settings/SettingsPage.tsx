import { ArrowLeft } from "lucide-react";
import { flushSync } from "react-dom";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import type { LocaleHost } from "../../i18n/locale-controller";
import { useLocalePreference } from "../../i18n/use-locale-preference";
import { useAppStore, type ViewerTheme } from "../../app/appStore";
import styles from "./SettingsPage.module.css";
import type { RecognitionProviderId, RecognitionProviderSummary } from "@zupulse/web-core";
import type {
  RecognitionFieldId,
  RecognitionFieldReference,
  RecognitionSettingsPort,
} from "./recognition-settings-port";

const themes: ViewerTheme[] = ["light", "dark"];
const locales = ["system", "zh-CN", "en-US"] as const;

export function SettingsPage({
  localeHost,
  recognitionSettings,
}: {
  localeHost: LocaleHost;
  recognitionSettings?: RecognitionSettingsPort | undefined;
}) {
  const { t } = useTranslation("common");
  const { t: tErrors } = useTranslation("errors");
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const { locale, localeChange, selectLocale } = useLocalePreference(localeHost);
  const location = useLocation();
  const from = isSafeReturnPath(location.state) ? location.state.from : "/";

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <Link className={styles.backLink} to={from} aria-label={t("settings.back")}>
            <ArrowLeft aria-hidden="true" size={18} />
          </Link>
          <div>
            <h1>{t("settings.title")}</h1>
            <p>{t("settings.description")}</p>
          </div>
        </header>

        <section className={styles.section} aria-labelledby="general-settings-title">
          <div className={styles.sectionHeading}>
            <h2 id="general-settings-title">{t("settings.general.title")}</h2>
            <p>{t("settings.general.description")}</p>
          </div>

          <fieldset className={styles.settingRow}>
            <legend>{t("settings.general.theme")}</legend>
            <p>{t("settings.general.themeHint")}</p>
            <div className={styles.options}>
              {themes.map((value) => (
                <label key={value} className={styles.option}>
                  <input
                    type="radio"
                    name="application-theme"
                    checked={theme === value}
                    onChange={() => flushSync(() => setTheme(value))}
                  />
                  <span>{t(`theme.${value}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.settingRow}>
            <legend>{t("settings.general.language")}</legend>
            <p>{t("settings.general.languageHint")}</p>
            <div className={styles.options}>
              {locales.map((value) => (
                <label key={value} className={styles.option}>
                  <input
                    type="radio"
                    name="application-locale"
                    checked={locale.preference === value}
                    disabled={localeChange === "saving"}
                    onChange={() => void selectLocale(value)}
                  />
                  <span>{t(`locale.${value === "zh-CN" ? "zhCN" : value === "en-US" ? "enUS" : "system"}`)}</span>
                </label>
              ))}
            </div>
            {localeChange === "saving" ? <span role="status">{t("locale.saving")}</span> : null}
            {localeChange === "error" ? <span role="alert">{tErrors("localePreferenceWriteFailed")}</span> : null}
          </fieldset>
        </section>
        {recognitionSettings ? <RecognitionSettings port={recognitionSettings} /> : null}
      </div>
    </main>
  );
}

const providerFields: Record<RecognitionProviderId, readonly RecognitionFieldId[]> = {
  audiveris: ["executable"],
  rokot: ["llamaCli", "model", "visionProjector", "python"],
  legato: ["python", "repository", "model", "baseModel"],
};

type RecognitionFieldDraft =
  | { kind: "reference"; reference: RecognitionFieldReference; value: string }
  | { kind: "path"; value: string };

function RecognitionSettings({ port }: { port: RecognitionSettingsPort }) {
  const { t } = useTranslation("common");
  const [providers, setProviders] = useState<RecognitionProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<RecognitionProviderId>();
  const [draft, setDraft] = useState<Record<string, RecognitionFieldDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void port
      .list()
      .then((next) => active && setProviders(next))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [port]);

  const openProvider = (provider: RecognitionProviderSummary) => {
    if (
      expanded &&
      expanded !== provider.id &&
      Object.values(draft).some((field) => field.kind === "path" || field.reference.source === "selection")
    ) {
      if (!window.confirm(t("settings.recognition.discardConfirm"))) return;
    }
    setError(false);
    setExpanded(expanded === provider.id ? undefined : provider.id);
    setDraft(
      Object.fromEntries(
        provider.fields.map((field) => [
          field.id,
          { kind: "reference", reference: { source: "saved" }, value: field.label },
        ]),
      ),
    );
  };

  const selectField = async (providerId: RecognitionProviderId, fieldId: RecognitionFieldId) => {
    setError(false);
    const result = await port.selectResource(providerId, fieldId).catch(() => undefined);
    if (!result) return setError(true);
    if (result.status === "selected") {
      setDraft((current) => ({
        ...current,
        [fieldId]: {
          kind: "reference",
          reference: { source: "selection", selectionToken: result.selectionToken },
          value: result.label,
        },
      }));
    }
  };

  const save = async (providerId: RecognitionProviderId) => {
    const required = providerFields[providerId];
    if (required.some((field) => !draft[field]?.value.trim())) return setError(true);
    setBusy(true);
    setError(false);
    try {
      const fields = Object.fromEntries(
        await Promise.all(
          required.map(async (fieldId) => {
            const field = draft[fieldId]!;
            if (field.kind === "reference") return [fieldId, field.reference] as const;
            const selected = await port.selectResource(providerId, fieldId, field.value);
            if (selected.status !== "selected") throw new Error("MANUAL_RECOGNITION_RESOURCE_REJECTED");
            return [
              fieldId,
              { source: "selection", selectionToken: selected.selectionToken } satisfies RecognitionFieldReference,
            ] as const;
          }),
        ),
      );
      const saved = await port.save(providerId, fields);
      setProviders((current) => current.map((provider) => (provider.id === providerId ? saved : provider)));
      setExpanded(undefined);
      setDraft({});
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const clear = async (providerId: RecognitionProviderId) => {
    if (!window.confirm(t("settings.recognition.clearConfirm"))) return;
    setBusy(true);
    try {
      const cleared = await port.clear(providerId);
      setProviders((current) => current.map((provider) => (provider.id === providerId ? cleared : provider)));
      setExpanded(undefined);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section} aria-labelledby="recognition-settings-title">
      <div className={styles.sectionHeading}>
        <h2 id="recognition-settings-title">{t("settings.recognition.title")}</h2>
        <p>{t("settings.recognition.description")}</p>
      </div>
      {loading ? <p role="status">{t("settings.recognition.checking")}</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {t("settings.recognition.error")}
        </p>
      ) : null}
      <div className={styles.providerList}>
        {providers.map((provider) => (
          <div className={styles.provider} key={provider.id}>
            <div className={styles.providerRow}>
              <div>
                <strong>{providerName(provider.id)}</strong>
                <span>
                  {provider.inputKinds.map((kind) => t(`settings.recognition.inputKind.${kind}`)).join(" / ")}
                </span>
              </div>
              <span className={styles.status}>
                {t(`settings.recognition.state.${provider.state}`, { version: provider.version ?? "unknown" })}
              </span>
              <button type="button" onClick={() => openProvider(provider)}>
                <span className="sr-only">{providerName(provider.id)}</span>
                {t(
                  provider.state === "needs-attention" ? "settings.recognition.fix" : "settings.recognition.configure",
                )}
              </button>
            </div>
            {expanded === provider.id ? (
              <div className={styles.providerForm}>
                {providerFields[provider.id].map((fieldId) => (
                  <div className={styles.resourceRow} key={fieldId}>
                    <label htmlFor={`${provider.id}-${fieldId}`}>{t(`settings.recognition.field.${fieldId}`)}</label>
                    <div className={styles.resourceControl}>
                      <input
                        id={`${provider.id}-${fieldId}`}
                        type="text"
                        value={draft[fieldId]?.value ?? ""}
                        placeholder={t("settings.recognition.pathPlaceholder")}
                        disabled={busy}
                        maxLength={4096}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [fieldId]: { kind: "path", value: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`${t(draft[fieldId] ? "settings.recognition.replace" : "settings.recognition.select")} ${t(`settings.recognition.field.${fieldId}`)}`}
                      onClick={() => void selectField(provider.id, fieldId)}
                    >
                      {t(draft[fieldId] ? "settings.recognition.replace" : "settings.recognition.select")}
                    </button>
                  </div>
                ))}
                <div className={styles.formActions}>
                  {provider.hasExplicitConfiguration ? (
                    <button type="button" disabled={busy} onClick={() => void clear(provider.id)}>
                      {t("settings.recognition.clear")}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setExpanded(undefined);
                      setDraft({});
                    }}
                  >
                    {t("settings.recognition.cancel")}
                  </button>
                  <button
                    className={styles.primaryAction}
                    type="button"
                    disabled={busy}
                    onClick={() => void save(provider.id)}
                  >
                    {t("settings.recognition.save")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function providerName(providerId: RecognitionProviderId): string {
  return { audiveris: "Audiveris", rokot: "Rokot", legato: "LEGATO" }[providerId];
}

function isSafeReturnPath(state: unknown): state is { from: string } {
  return (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof state.from === "string" &&
    state.from.startsWith("/") &&
    !state.from.startsWith("//") &&
    state.from !== "/settings"
  );
}
