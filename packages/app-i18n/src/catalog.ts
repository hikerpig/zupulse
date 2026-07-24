import { createInstance, type i18n } from "i18next";
import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";

export const supportedLocales = ["zh-CN", "en-US"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export type LocalePreference = "system" | SupportedLocale;
export type LocaleState = {
  preference: LocalePreference;
  effectiveLocale: SupportedLocale;
};

export const namespaces = ["common", "library", "viewer", "studio", "errors", "desktop", "meta"] as const;
export type AppNamespace = (typeof namespaces)[number];

export const resources = {
  "zh-CN": zhCN,
  "en-US": enUS,
} as const;

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "system" || supportedLocales.some((locale) => locale === value);
}

export function resolveLocale(preference: LocalePreference, systemLocales: readonly string[]): SupportedLocale {
  if (preference !== "system") return preference;
  for (const locale of systemLocales) {
    const language = locale.toLowerCase().split("-")[0];
    if (language === "zh") return "zh-CN";
    if (language === "en") return "en-US";
  }
  return "en-US";
}

export function createAppI18n(locale: SupportedLocale, options: { strictMissingKeys?: boolean } = {}): i18n {
  const instance = createInstance();
  const strictMissingKeys = options.strictMissingKeys ?? false;
  void instance.init({
    resources,
    lng: locale,
    fallbackLng: "en-US",
    supportedLngs: supportedLocales,
    load: "currentOnly",
    ns: namespaces,
    defaultNS: "common",
    initAsync: false,
    returnNull: false,
    interpolation: { escapeValue: false },
    saveMissing: strictMissingKeys,
    missingKeyHandler: strictMissingKeys
      ? (_languages, namespace, key) => {
          throw new Error(`Missing translation key: ${namespace}:${key}`);
        }
      : false,
  });
  return instance;
}
