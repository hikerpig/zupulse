import { createBridgeRequest } from "@zupulse/web-core";
import { describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "../external-navigation";

describe("openExternalUrl", () => {
  it("opens the validated URL with the platform external-browser API", async () => {
    const openExternal = vi.fn(async () => undefined);
    const request = createBridgeRequest("external.openUrl", "external-1", {
      url: "https://github.com/hikerpig/zupulse",
    });

    await expect(openExternalUrl(request, openExternal)).resolves.toEqual({});
    expect(openExternal).toHaveBeenCalledWith("https://github.com/hikerpig/zupulse");
  });
});
