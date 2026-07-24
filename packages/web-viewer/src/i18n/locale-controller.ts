import type { LocalePreference, LocaleState } from "@zupulse/app-i18n";
import type { i18n } from "i18next";

export interface LocaleHost {
  readonly initialState: LocaleState;
  setPreference(preference: LocalePreference): Promise<LocaleState>;
}

export async function applyLocaleState(input: { state: LocaleState; i18n: i18n; document: Document }): Promise<void> {
  await input.i18n.changeLanguage(input.state.effectiveLocale);
  input.document.documentElement.lang = input.state.effectiveLocale;
  input.document.documentElement.dir = input.i18n.dir(input.state.effectiveLocale);
  input.document.title = input.i18n.t("meta:title");
  setMeta(input.document, 'meta[name="description"]', input.i18n.t("meta:description"));
  setMeta(input.document, 'meta[name="keywords"]', input.i18n.t("meta:keywords"));
  setMeta(input.document, 'meta[property="og:title"]', input.i18n.t("meta:title"));
  setMeta(input.document, 'meta[property="og:description"]', input.i18n.t("meta:description"));
  setMeta(input.document, 'meta[property="og:locale"]', input.i18n.t("meta:openGraphLocale"));
  setMeta(input.document, 'meta[name="twitter:title"]', input.i18n.t("meta:title"));
  setMeta(input.document, 'meta[name="twitter:description"]', input.i18n.t("meta:description"));
}

function setMeta(ownerDocument: Document, selector: string, content: string): void {
  ownerDocument.querySelector(selector)?.setAttribute("content", content);
}
