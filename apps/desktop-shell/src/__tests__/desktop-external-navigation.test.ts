import { describe, expect, it, vi } from "vitest";
import { createDesktopExternalNavigation } from "../desktop-external-navigation";

describe("createDesktopExternalNavigation", () => {
  it("sends secure URLs through the validated Bridge request", async () => {
    const request = vi.fn(async () => ({}));
    const navigation = createDesktopExternalNavigation({
      request,
      subscribe: () => () => undefined,
    });

    await navigation.openExternalUrl("https://github.com/hikerpig/zupulse");

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "external.openUrl",
        payload: { url: "https://github.com/hikerpig/zupulse" },
      }),
    );
  });
});
