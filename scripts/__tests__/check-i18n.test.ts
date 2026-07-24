import { describe, expect, it } from "vitest";
import { checkI18nSource } from "../check-i18n.mjs";

describe("check-i18n", () => {
  it("rejects JSX text and user-visible static attributes with actionable locations", () => {
    const violations = checkI18nSource(
      'export const Demo = () => <button aria-label="Open score">打开乐谱</button>;',
      "Demo.tsx",
    );

    expect(violations).toEqual([
      { file: "Demo.tsx", line: 1, text: "Open score", kind: "static aria-label" },
      { file: "Demo.tsx", line: 1, text: "打开乐谱", kind: "JSX text" },
    ]);
  });

  it("allows catalog calls, standard music abbreviations, and reasoned exceptions", () => {
    expect(
      checkI18nSource(`
        export const Demo = ({ t }) => (
          <section>
            <button aria-label={t("open")}>{t("open")}</button>
            <span>BPM</span>
            {/* i18n-ignore: registered product wordmark */}
            <span aria-label="Zupulse">ZUPULSE</span>
          </section>
        );
      `),
    ).toEqual([]);
  });
});
