import { afterEach, describe, expect, it, vi } from "vitest";
import { pickFiles, saveBytes } from "../browser-file-transfer";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("pickFiles", () => {
  it("resolves an empty list when the picker is cancelled", async () => {
    const { ownerDocument, input } = createFileInputDocument();
    input.click = () => input.dispatch("cancel");

    await expect(pickFiles(ownerDocument, { accept: ".gp,.mxl", multiple: true })).resolves.toEqual([]);
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe(".gp,.mxl");
    expect(input.appended).toBe(true);
    expect(input.removed).toBe(true);
  });

  it("returns the selected files after change", async () => {
    const file = new File(["bytes"], "score.mxl");
    const { ownerDocument, input } = createFileInputDocument();
    input.click = () => {
      input.files = [file];
      input.dispatch("change");
    };

    await expect(pickFiles(ownerDocument, { accept: ".mxl", multiple: false })).resolves.toEqual([file]);
  });
});

describe("saveBytes", () => {
  it("appends a download link and defers blob URL revocation", () => {
    vi.useFakeTimers();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:saved",
      revokeObjectURL,
    });
    const { ownerDocument, anchors } = createAnchorDocument();

    saveBytes(ownerDocument, {
      fileName: "score.mxl",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "application/vnd.recordare.musicxml",
    });

    expect(anchors[0]).toMatchObject({ href: "blob:saved", download: "score.mxl", clicked: true, removed: true });
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:saved");
  });
});

function createFileInputDocument(): {
  ownerDocument: Document;
  input: FakeInput;
} {
  const input = new FakeInput();
  const ownerDocument = {
    createElement: () => input,
    body: {
      appendChild: () => {
        input.appended = true;
        return input;
      },
    },
  } as unknown as Document;
  return { ownerDocument, input };
}

class FakeInput {
  type = "";
  multiple = false;
  accept = "";
  files: File[] | null = null;
  style: { display?: string } = {};
  appended = false;
  removed = false;
  click: () => void = () => undefined;
  private readonly listeners = new Map<string, EventListener>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener === "function") this.listeners.set(type, listener);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.(new Event(type));
  }

  remove(): void {
    this.removed = true;
  }
}

function createAnchorDocument(): { ownerDocument: Document; anchors: FakeAnchor[] } {
  const anchors: FakeAnchor[] = [];
  const ownerDocument = {
    createElement: () => {
      const anchor = new FakeAnchor();
      anchors.push(anchor);
      return anchor;
    },
    body: {
      appendChild: (node: FakeAnchor) => {
        node.appended = true;
        return node;
      },
    },
  } as unknown as Document;
  return { ownerDocument, anchors };
}

class FakeAnchor {
  href = "";
  download = "";
  style: { display?: string } = {};
  appended = false;
  clicked = false;
  removed = false;

  click(): void {
    this.clicked = true;
  }

  remove(): void {
    this.removed = true;
  }
}
