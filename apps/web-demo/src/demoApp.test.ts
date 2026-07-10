// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mountDemoApp, renderDemoState, type DemoAppDependencies } from "./demoApp";

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

describe("mountDemoApp lifecycle", () => {
  it("destroys the previous playback session before starting the next", async () => {
    document.body.innerHTML = appHtml();
    const order: string[] = [];
    let sessionNumber = 0;
    const dependencies = fakeDependencies({
      async startPlaybackSession() {
        sessionNumber += 1;
        const current = sessionNumber;
        order.push(`start-${current}`);
        return {
          async destroy() {
            order.push(`destroy-${current}`);
          },
        };
      },
    });
    mountDemoApp(document, dependencies);

    chooseFile("first.gp5");
    await settle();
    chooseFile("second.gp5");
    await settle();

    expect(order).toEqual(["start-1", "destroy-1", "start-2"]);
  });

  it("destroys the active session on pagehide", async () => {
    document.body.innerHTML = appHtml();
    let destroyed = 0;
    const dependencies = fakeDependencies({
      async startPlaybackSession() {
        return {
          async destroy() {
            destroyed += 1;
          },
        };
      },
    });
    mountDemoApp(document, dependencies);
    chooseFile("song.gp5");
    await settle();

    window.dispatchEvent(new Event("pagehide"));
    await settle();

    expect(destroyed).toBe(1);
  });
});

function fakeDependencies(
  input: Pick<DemoAppDependencies, "startPlaybackSession">,
): DemoAppDependencies {
  return {
    createApi: () => ({
      settings: { importer: {} },
      updateSettings: () => undefined,
      load: () => true,
    }),
    createAdapter: () => ({
      subscribe: () => () => undefined,
      getSnapshot: () => ({ soundFont: "ready", transport: "stopped" }),
      playPause: () => undefined,
      stop: () => undefined,
      retrySoundFont: () => undefined,
      seekTick: () => undefined,
      setSpeed: () => undefined,
      setLoop: () => undefined,
      setVisibleTracks: () => undefined,
      setTrackMute: () => undefined,
      setTrackSolo: () => undefined,
      setTrackVolume: () => undefined,
      destroy: () => undefined,
    }),
    async presentFile({ file }) {
      return {
        status: "ready",
        message: `已加载 ${file.name}`,
        identity: { contentHash: file.name, format: "gp" },
        summary: { title: file.name, trackCount: 1, masterBarCount: 1 },
        bytes: new Uint8Array([1]),
        score: { title: file.name, tracks: [{ name: "Lead" }], masterBars: [{}] },
      };
    },
    startPlaybackSession: input.startPlaybackSession,
  };
}

function appHtml(): string {
  return `
    <input id="score-file" type="file">
    <section id="alpha-tab"></section>
    <p id="status"></p>
    <section id="summary"></section>
  `;
}

function chooseFile(name: string): void {
  const input = document.querySelector<HTMLInputElement>("#score-file") as HTMLInputElement;
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{
      name,
      async arrayBuffer() {
        return new Uint8Array([1]).buffer;
      },
    }],
  });
  input.dispatchEvent(new Event("change"));
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}
