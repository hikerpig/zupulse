import { House, Languages, LibraryBig, Moon, ShieldCheck, Sun } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { flushSync } from "react-dom";
import { LogoMark } from "../components/LogoMark";
import { GitHubMark } from "../components/GitHubMark";
import { ContextPopup } from "../components/ContextPopup";
import { Button } from "../components/ui";
import type { LocaleHost } from "../i18n/locale-controller";
import type { ExternalNavigationHost } from "../host";
import { useAppStore } from "./appStore";
import type { ViewerProductCapabilities } from "./App";
import type { ViewerApplication } from "./ViewerApplication";
import styles from "./AppHeader.module.css";

export function AppHeader({
  application,
  localeHost,
  capabilities,
  externalNavigationHost,
}: {
  application: ViewerApplication;
  localeHost: LocaleHost;
  capabilities: ViewerProductCapabilities;
  externalNavigationHost?: ExternalNavigationHost;
}) {
  const { t, i18n } = useTranslation("common");
  const { t: tErrors } = useTranslation("errors");
  const { pathname } = useLocation();
  const libraryScoreId = pathname.match(/^\/(?:viewer|studio)\/([^/]+)$/)?.[1];
  const theme = useAppStore((state) => state.theme);
  const locale = useAppStore((state) => state.locale);
  const localeChange = useAppStore((state) => state.localeChange);
  const setTheme = useAppStore((state) => state.setTheme);
  const setLocaleState = useAppStore((state) => state.setLocaleState);
  const setLocaleChange = useAppStore((state) => state.setLocaleChange);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const [localeOpen, setLocaleOpen] = useState(false);
  const localeButtonRef = useRef<HTMLButtonElement>(null);
  const telemetry = application.getTelemetryPreference();
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [telemetrySaving, setTelemetrySaving] = useState(false);
  const [telemetryError, setTelemetryError] = useState(false);
  const telemetryButtonRef = useRef<HTMLButtonElement>(null);
  const [telemetryEnabled, setTelemetryEnabled] = useState(telemetry?.enabled ?? false);

  const selectLocale = async (preference: "system" | "zh-CN" | "en-US") => {
    setLocaleChange("saving");
    let nextLocale;
    try {
      nextLocale = await localeHost.setPreference(preference);
    } catch {
      setLocaleChange("error");
      return;
    }
    await i18n.changeLanguage(nextLocale.effectiveLocale);
    flushSync(() => {
      setLocaleState(nextLocale);
      setLocaleChange("idle");
    });
    setLocaleOpen(false);
  };

  return (
    <header className={styles.header}>
      <NavLink className={styles.brand ?? ""} to="/" aria-label={t("brand.home")}>
        <LogoMark size={32} />
        <span className={styles.wordmark}>
          <strong>{t("brand.name")}</strong>
          <span>ZUPULSE</span>
        </span>
      </NavLink>

      <nav className={styles.navigation} aria-label={t("navigation.primary")}>
        <NavLink
          className={({ isActive }) => `${isActive ? styles.activeLink : styles.navLink} ${styles.redundantHomeLink}`}
          to="/"
          end
        >
          <House aria-hidden="true" size={16} />
          {t("navigation.home")}
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)} to="/library">
          <LibraryBig aria-hidden="true" size={16} />
          {t("navigation.library")}
        </NavLink>
        {libraryScoreId ? (
          <>
            <NavLink
              className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
              to={`/viewer/${libraryScoreId}`}
            >
              {t("navigation.viewer")}
            </NavLink>
            {capabilities.harmonyAnalysis ? (
              <NavLink
                className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)}
                to={`/studio/${libraryScoreId}`}
              >
                {t("navigation.studio")}
              </NavLink>
            ) : null}
          </>
        ) : null}
      </nav>

      <div className={`${styles.headerActions} tw:flex tw:items-center tw:gap-2 tw:justify-self-end`}>
        <a
          className={styles.githubLink}
          href="https://github.com/hikerpig/zupulse"
          target="_blank"
          rel="noreferrer"
          aria-label={t("links.githubRepository")}
          onClick={
            externalNavigationHost === undefined
              ? undefined
              : (event) => {
                  event.preventDefault();
                  void externalNavigationHost
                    .openExternalUrl("https://github.com/hikerpig/zupulse")
                    .catch(() => undefined);
                }
          }
        >
          <GitHubMark />
        </a>
        <Button
          ref={localeButtonRef}
          className={styles.headerActionButton}
          size="sm"
          aria-label={t("locale.trigger")}
          aria-haspopup="dialog"
          aria-expanded={localeOpen}
          onClick={() => setLocaleOpen((open) => !open)}
        >
          <Languages aria-hidden="true" size={17} />
          <span>{t("locale.trigger")}</span>
        </Button>
        {telemetry ? (
          <>
            <Button
              ref={telemetryButtonRef}
              className={`${styles.headerActionButton} ${styles.telemetryButton}`}
              size="sm"
              aria-label={t("telemetry.trigger")}
              aria-haspopup="dialog"
              aria-expanded={telemetryOpen}
              onClick={() => setTelemetryOpen((open) => !open)}
            >
              <ShieldCheck aria-hidden="true" size={17} />
              <span>{t("telemetry.trigger")}</span>
            </Button>
            <ContextPopup anchor={telemetryButtonRef.current} open={telemetryOpen} onOpenChange={setTelemetryOpen}>
              <div className={`${styles.localePopup} tw:grid tw:gap-2`} aria-label={t("telemetry.dialogLabel")}>
                <label className="tw:text-xs tw:flex tw:items-start tw:gap-2">
                  <input
                    type="checkbox"
                    checked={telemetryEnabled}
                    disabled={telemetrySaving || !telemetry.available}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setTelemetrySaving(true);
                      setTelemetryError(false);
                      void application
                        .setTelemetryPreference(enabled)
                        .then(() => setTelemetryEnabled(enabled))
                        .catch(() => {
                          setTelemetryError(true);
                          application.capturePresentedIssue("settings", {
                            code: "telemetry-preference-write-failed",
                            recoverable: true,
                          });
                        })
                        .finally(() => setTelemetrySaving(false));
                    }}
                  />
                  <span>{t("telemetry.enabled")}</span>
                </label>
                {!telemetry.available ? <p>{t("telemetry.unavailable")}</p> : null}
                {telemetrySaving ? <p role="status">{t("telemetry.saving")}</p> : null}
                {telemetryError ? <p role="alert">{tErrors("telemetryPreferenceWriteFailed")}</p> : null}
              </div>
            </ContextPopup>
          </>
        ) : null}
        <ContextPopup anchor={localeButtonRef.current} open={localeOpen} onOpenChange={setLocaleOpen}>
          <div className={`${styles.localePopup} tw:grid tw:gap-1`} aria-label={t("locale.dialogLabel")}>
            {(
              [
                ["system", t("locale.system")],
                ["zh-CN", t("locale.zhCN")],
                ["en-US", t("locale.enUS")],
              ] as const
            ).map(([preference, label]) => (
              <Button
                key={preference}
                className="tw:w-full tw:justify-start"
                size="sm"
                tone={locale.preference === preference ? "secondary" : "ghost"}
                role="menuitemradio"
                aria-checked={locale.preference === preference}
                disabled={localeChange === "saving"}
                onClick={() => void selectLocale(preference)}
              >
                {label}
              </Button>
            ))}
            {localeChange === "saving" ? <p role="status">{t("locale.saving")}</p> : null}
            {localeChange === "error" ? <p role="alert">{tErrors("localePreferenceWriteFailed")}</p> : null}
          </div>
        </ContextPopup>
        <Button
          className={styles.headerActionButton}
          size="sm"
          aria-label={nextTheme === "light" ? t("theme.switchToLight") : t("theme.switchToDark")}
          onClick={() => flushSync(() => setTheme(nextTheme))}
        >
          {theme === "dark" ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
          <span>{theme === "dark" ? t("theme.dark") : t("theme.light")}</span>
        </Button>
      </div>
    </header>
  );
}
