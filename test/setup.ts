import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { namespaces, resources, supportedLocales } from "../packages/app-i18n/src";

if (typeof globalThis.PointerEvent === "undefined" && typeof globalThis.MouseEvent !== "undefined") {
  globalThis.PointerEvent = globalThis.MouseEvent as typeof PointerEvent;
}

void i18next.use(initReactI18next).init({
  resources,
  lng: "zh-CN",
  fallbackLng: "en-US",
  supportedLngs: supportedLocales,
  load: "currentOnly",
  ns: namespaces,
  defaultNS: "common",
  initAsync: false,
  returnNull: false,
  interpolation: { escapeValue: false },
});

const NativeRequest = globalThis.Request;

if (NativeRequest) {
  class RequestWithoutForeignAbortSignal extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const { signal: _signal, ...requestInit } = init ?? {};
      super(input, requestInit);
    }
  }

  globalThis.Request = RequestWithoutForeignAbortSignal;
}
