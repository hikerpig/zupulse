// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ViewerHostEvent } from "@zupulse/web-viewer";
import { createBrowserHost } from "../browserHost";

describe("createBrowserHost", () => {
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
