// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ViewerHostEvent } from "@zupulse/web-viewer";
import { createBrowserHost, createBrowserLocaleHost } from "../browserHost";

describe("createBrowserHost", () => {
  it("resolves and persists locale preferences transactionally", async () => {
    window.localStorage.clear();
    const host = createBrowserLocaleHost(document, ["en-US"]);

    expect(host.initialState).toEqual({ preference: "system", effectiveLocale: "en-US" });
    await expect(host.setPreference("zh-CN")).resolves.toEqual({
      preference: "zh-CN",
      effectiveLocale: "zh-CN",
    });
    expect(window.localStorage.getItem("zupulse-locale")).toBe("zh-CN");
  });

  it("falls back to system and removes an invalid stored preference", () => {
    window.localStorage.setItem("zupulse-locale", "fr-FR");

    const host = createBrowserLocaleHost(document, ["zh-Hant"]);

    expect(host.initialState).toEqual({ preference: "system", effectiveLocale: "zh-CN" });
    expect(window.localStorage.getItem("zupulse-locale")).toBeNull();
  });

  it("rejects writes without changing its current locale state", async () => {
    window.localStorage.clear();
    const host = createBrowserLocaleHost(document, ["zh-CN"]);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });

    await expect(host.setPreference("en-US")).rejects.toThrow();
    expect(host.initialState).toEqual({ preference: "system", effectiveLocale: "zh-CN" });

    setItem.mockRestore();
  });

  it("opens supported GP files through the browser file picker", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, "files", {
        configurable: true,
        value: [
          {
            name: "song.gp5",
            async arrayBuffer() {
              return new Uint8Array([1, 2]).buffer;
            },
          },
        ],
      });
      this.dispatchEvent(new Event("change"));
    });

    const host = createBrowserHost(document);
    await expect(host.openScore()).resolves.toEqual({
      fileName: "song.gp5",
      bytes: new Uint8Array([1, 2]),
    });

    expect(click).toHaveBeenCalledOnce();
  });

  it("suspends the active viewer when the browser page is hidden", () => {
    const events: ViewerHostEvent[] = [];
    const unsubscribe = createBrowserHost(document).subscribe((event) => events.push(event));

    window.dispatchEvent(new Event("pagehide"));
    expect(events).toEqual([{ type: "suspend" }]);

    unsubscribe();
    window.dispatchEvent(new Event("pagehide"));
    expect(events).toHaveLength(1);
  });
});
