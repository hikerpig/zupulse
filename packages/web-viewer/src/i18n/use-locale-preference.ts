import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../app/appStore";
import type { LocaleHost } from "./locale-controller";

export function useLocalePreference(localeHost: LocaleHost) {
  const { i18n } = useTranslation();
  const locale = useAppStore((state) => state.locale);
  const localeChange = useAppStore((state) => state.localeChange);
  const setLocaleState = useAppStore((state) => state.setLocaleState);
  const setLocaleChange = useAppStore((state) => state.setLocaleChange);

  const selectLocale = async (preference: "system" | "zh-CN" | "en-US") => {
    setLocaleChange("saving");
    try {
      const nextLocale = await localeHost.setPreference(preference);
      await i18n.changeLanguage(nextLocale.effectiveLocale);
      flushSync(() => {
        setLocaleState(nextLocale);
        setLocaleChange("idle");
      });
      return true;
    } catch {
      setLocaleChange("error");
      return false;
    }
  };

  return { locale, localeChange, selectLocale };
}
