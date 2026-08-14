import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Element as XmlElement } from "@xmldom/xmldom";
import { PdfOmrError } from "../errors";

export function mergeLegatoPageAbc(pages: readonly string[]): string {
  if (pages.length === 0) throw invalid("missing-pages");
  return `${pages
    .map((page, index) => {
      if (page.trim().length === 0) throw invalid("empty-page-abc", { pageNumber: index + 1 });
      const merged = page.replace(/^X:.*$/mu, `X:${index + 1}`);
      if (merged === page && !/^X:/mu.test(page)) throw invalid("missing-page-reference", { pageNumber: index + 1 });
      return merged.trim();
    })
    .join("\n\n")}\n`;
}

export function mergeLegatoPageMusicXml(pages: readonly Uint8Array[]): Uint8Array {
  if (pages.length === 0) throw invalid("missing-pages");
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level === "error" || level === "fatalError") throw new Error(message);
    },
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const sources = pages.map((page, index) => {
    try {
      const document = parser.parseFromString(decoder.decode(page), "application/xml");
      if (document.documentElement?.nodeName !== "score-partwise") throw new Error("score-partwise-required");
      return document;
    } catch (error) {
      throw invalid("invalid-page-musicxml", { pageNumber: index + 1 }, error);
    }
  });
  const target = parser.parseFromString(decoder.decode(pages[0]!), "application/xml");
  const targetParts = [...target.getElementsByTagName("part")];
  const partIds = targetParts.map((part) => part.getAttribute("id") ?? "");
  if (partIds.length === 0 || partIds.some((id) => id.length === 0)) throw invalid("invalid-page-parts");

  for (const [pageIndex, source] of sources.entries()) {
    const sourceParts = [...source.getElementsByTagName("part")];
    if (sourceParts.map((part) => part.getAttribute("id") ?? "").join("\0") !== partIds.join("\0")) {
      throw invalid("page-part-mismatch", { pageNumber: pageIndex + 1 });
    }
    for (const part of sourceParts) {
      if (part.getElementsByTagName("note").length === 0) {
        throw invalid("empty-page-part", { pageNumber: pageIndex + 1, partId: part.getAttribute("id") ?? "" });
      }
    }
  }

  for (const [partIndex, targetPart] of targetParts.entries()) {
    for (const measure of childMeasures(targetPart)) targetPart.removeChild(measure);
    let measureNumber = 1;
    for (const source of sources) {
      const sourcePart = [...source.getElementsByTagName("part")][partIndex]!;
      for (const sourceMeasure of childMeasures(sourcePart)) {
        const measure = target.importNode(sourceMeasure, true) as XmlElement;
        measure.setAttribute("number", String(measureNumber));
        measureNumber += 1;
        targetPart.appendChild(measure);
      }
    }
  }

  const xml = new XMLSerializer().serializeToString(target).replace(/^<\?xml[^?]*\?>\s*/u, "");
  return new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}\n`);
}

function childMeasures(part: XmlElement): XmlElement[] {
  return Array.from(part.childNodes).filter(
    (node): node is XmlElement => node.nodeType === 1 && node.nodeName === "measure",
  );
}

function invalid(reason: string, context: Record<string, string | number> = {}, cause?: unknown): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "LEGATO page output is invalid", {
    context: { reason, ...context },
    ...(cause === undefined ? {} : { cause }),
  });
}
