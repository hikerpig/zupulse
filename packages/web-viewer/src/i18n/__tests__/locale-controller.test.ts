// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createAppI18n } from "@zupulse/app-i18n";
import { applyLocaleState } from "../locale-controller";

describe("applyLocaleState", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="description" content="">
      <meta name="keywords" content="">
      <meta property="og:title" content="">
      <meta property="og:description" content="">
      <meta property="og:locale" content="">
      <meta name="twitter:title" content="">
      <meta name="twitter:description" content="">
    `;
  });

  it("updates language, direction and managed metadata", async () => {
    const i18n = createAppI18n("zh-CN");

    await applyLocaleState({
      state: { preference: "en-US", effectiveLocale: "en-US" },
      i18n,
      document,
    });

    expect(document.documentElement.lang).toBe("en-US");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.title).toBe("Zupulse | Score Practice and Harmony Analysis");
    expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe("en_US");
  });
});
