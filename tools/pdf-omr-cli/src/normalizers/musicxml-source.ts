import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { readMusicXmlRootXml } from "@zupulse/web-core";
import { PdfOmrError } from "../errors";

export type XmlElement = Element;

export function parseMusicXmlDocument(bytes: Uint8Array): Document {
  try {
    const source = readMusicXmlRootXml(bytes);
    return new DOMParser({
      onError(level, message) {
        if (level === "error" || level === "fatalError") throw new Error(message);
      },
    }).parseFromString(source, "application/xml");
  } catch (error) {
    throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Audiveris MusicXML is invalid", {
      context: { reason: "invalid-musicxml" },
      cause: error,
    });
  }
}

export function childElements(parent: Element, name?: string): Element[] {
  const result: Element[] = [];
  for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
    if (node.nodeType === 1 && (name === undefined || node.nodeName === name)) result.push(node as Element);
  }
  return result;
}

export function childElement(parent: Element, name: string): Element | undefined {
  return childElements(parent, name)[0];
}

export function childText(parent: Element, name: string): string | undefined {
  const value = childElement(parent, name)?.textContent?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export function integerText(parent: Element, name: string): number | undefined {
  const value = childText(parent, name);
  if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
