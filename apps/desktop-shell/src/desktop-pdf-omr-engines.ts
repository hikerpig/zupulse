import type { RecognitionProviderSummary } from "@zupulse/web-core";
import type { PdfOmrEngineOption } from "@zupulse/web-viewer";

export function synchronizePdfOmrEngine(engines: PdfOmrEngineOption[], provider: RecognitionProviderSummary): void {
  const index = engines.findIndex((engine) => engine.id === provider.id);
  const engine = providerEngineOption(provider);
  if (index === -1) engines.push(engine);
  else engines.splice(index, 1, engine);
}

export function pdfOmrEngineLabel(engineId: string): string {
  return (
    (
      {
        audiveris: "Audiveris",
        transcoda: "Transcoda",
        legato: "LEGATO",
        rokot: "Rokot",
      } as const
    )[engineId as "audiveris" | "transcoda" | "legato" | "rokot"] ?? engineId
  );
}

export function providerEngineOption(provider: RecognitionProviderSummary): PdfOmrEngineOption {
  return {
    id: provider.id,
    version: provider.version ?? "unknown",
    available: provider.state === "ready",
    label: pdfOmrEngineLabel(provider.id),
    inputKinds: provider.inputKinds,
    ...(provider.state === "ready" ? {} : { reason: workbenchAvailabilityReason(provider) }),
  };
}

function workbenchAvailabilityReason(provider: RecognitionProviderSummary): string {
  if (provider.state === "unconfigured") return `missing-${provider.id}-configuration`;
  return provider.reason === "resource-unreadable" ? "model-unreadable" : "engine-inspection-failed";
}
