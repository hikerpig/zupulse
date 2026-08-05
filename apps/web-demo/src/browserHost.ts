import { isLocalePreference, resolveLocale, type LocalePreference, type LocaleState } from "@zupulse/app-i18n";
import { MockNativeBridge } from "@zupulse/web-core";
import type { LocaleHost, ViewerHost } from "@zupulse/web-viewer";

const localeStorageKey = "zupulse-locale";

export function createBrowserLocaleHost(
  ownerDocument: Document,
  systemLocales: readonly string[] = ownerDocument.defaultView?.navigator.languages ?? [],
): LocaleHost {
  const storage = getStorage(ownerDocument);
  const storedPreference = readStoredPreference(storage);
  const initialPreference = storedPreference ?? "system";
  const initialState: LocaleState = {
    preference: initialPreference,
    effectiveLocale: resolveLocale(initialPreference, systemLocales),
  };
  return {
    initialState,
    async setPreference(preference: LocalePreference) {
      if (!storage) throw new Error("LOCALE_STORAGE_UNAVAILABLE");
      storage.setItem(localeStorageKey, preference);
      return {
        preference,
        effectiveLocale: resolveLocale(preference, systemLocales),
      };
    },
  };
}

export function createBrowserHost(ownerDocument: Document): ViewerHost & { bridge: MockNativeBridge } {
  const bridge = new MockNativeBridge();
  return {
    bridge,
    subscribe(listener) {
      const handlePageHide = () => listener({ type: "suspend" });
      ownerDocument.defaultView?.addEventListener("pagehide", handlePageHide);
      return () => ownerDocument.defaultView?.removeEventListener("pagehide", handlePageHide);
    },
  };
}

function getStorage(ownerDocument: Document): Storage | undefined {
  try {
    return ownerDocument.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

function readStoredPreference(storage: Storage | undefined): LocalePreference | undefined {
  if (!storage) return undefined;
  let value: string | null;
  try {
    value = storage.getItem(localeStorageKey);
  } catch {
    return undefined;
  }
  if (value === null) return undefined;
  if (isLocalePreference(value)) return value;
  try {
    storage.removeItem(localeStorageKey);
  } catch {
    // Invalid preference is ignored even when storage cleanup is unavailable.
  }
  return undefined;
}
