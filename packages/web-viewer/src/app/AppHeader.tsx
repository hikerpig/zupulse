import { FileCog, House, Languages, LibraryBig, Moon, Settings, Sun } from "lucide-react";
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
import { useLocalePreference } from "../i18n/use-locale-preference";
import { useAppStore } from "./appStore";
import type { ViewerProductCapabilities } from "./App";
import styles from "./AppHeader.module.css";

export function AppHeader({
  localeHost,
  capabilities,
  externalNavigationHost,
}: {
  localeHost: LocaleHost;
  capabilities: ViewerProductCapabilities;
  externalNavigationHost?: ExternalNavigationHost;
}) {
  const { t } = useTranslation("common");
  const { t: tErrors } = useTranslation("errors");
  const { pathname } = useLocation();
  const libraryScoreId = pathname.match(/^\/(?:viewer|studio)\/([^/]+)$/)?.[1];
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const { locale, localeChange, selectLocale } = useLocalePreference(localeHost);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const [localeOpen, setLocaleOpen] = useState(false);
  const localeButtonRef = useRef<HTMLButtonElement>(null);

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
        {capabilities.pdfOmrWorkbench && !libraryScoreId ? (
          <NavLink className={({ isActive }) => (isActive ? styles.activeLink : styles.navLink)} to="/pdf-omr">
            <FileCog aria-hidden="true" size={16} />
            {t("navigation.pdfOmr")}
          </NavLink>
        ) : null}
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
                onClick={() => void selectLocale(preference).then((saved) => saved && setLocaleOpen(false))}
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
        <NavLink
          className={styles.settingsLink ?? ""}
          to="/settings"
          state={{ from: pathname }}
          aria-label={t("navigation.settings")}
        >
          <Settings aria-hidden="true" size={17} />
          <span>{t("navigation.settings")}</span>
        </NavLink>
      </div>
    </header>
  );
}
