import { resolveLocale, type LocalePreference, type LocaleState } from "@zupulse/app-i18n";
import { LocalePreferenceStore } from "./locale-preference-store";

export async function createDesktopLocale(options: { userData: string; getSystemLanguages(): readonly string[] }) {
  const store = new LocalePreferenceStore(options.userData);
  const initialPreference = await store.load();
  let state: LocaleState = {
    preference: initialPreference,
    effectiveLocale: resolveLocale(initialPreference, options.getSystemLanguages()),
  };

  return {
    getState: () => state,
    getEffectiveLocale: () => state.effectiveLocale,
    async setPreference(preference: LocalePreference): Promise<LocaleState> {
      await store.save(preference);
      state = {
        preference,
        effectiveLocale: resolveLocale(preference, options.getSystemLanguages()),
      };
      return state;
    },
  };
}
