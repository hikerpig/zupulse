// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderDemoState } from "./demoApp";

describe("renderDemoState", () => {
  it("renders ready state into status and summary regions", () => {
    document.body.innerHTML = `
      <p id="status"></p>
      <section id="summary"></section>
    `;

    renderDemoState(
      {
        status: document.querySelector("#status") as HTMLElement,
        summary: document.querySelector("#summary") as HTMLElement,
      },
      {
        status: "ready",
        message: "已加载 Song",
        summary: {
          title: "Song",
          artist: "Artist",
          trackCount: 2,
          masterBarCount: 3,
          tempo: 120,
        },
      },
    );

    expect(document.querySelector("#status")?.textContent).toBe("已加载 Song");
    expect(document.querySelector("#summary")?.textContent).toContain("Song");
    expect(document.querySelector("#summary")?.textContent).toContain("2 tracks");
    expect(document.querySelector("#summary")?.textContent).toContain("120 bpm");
  });

  it("renders error state without stale summary", () => {
    document.body.innerHTML = `
      <p id="status"></p>
      <section id="summary">old summary</section>
    `;

    renderDemoState(
      {
        status: document.querySelector("#status") as HTMLElement,
        summary: document.querySelector("#summary") as HTMLElement,
      },
      {
        status: "error",
        message: "请选择 Guitar Pro 文件",
      },
    );

    expect(document.querySelector("#status")?.textContent).toBe("请选择 Guitar Pro 文件");
    expect(document.querySelector("#summary")?.textContent).toBe("");
  });
});
