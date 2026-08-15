import type { RecognitionProviderId, RecognitionProviderSummary } from "@zupulse/web-core";

export type RecognitionFieldId =
  | "executable"
  | "llamaCli"
  | "model"
  | "visionProjector"
  | "python"
  | "repository"
  | "baseModel"
  | "checkpoint";

export type RecognitionFieldReference = { source: "saved" } | { source: "selection"; selectionToken: string };

export interface RecognitionSettingsPort {
  list(): Promise<RecognitionProviderSummary[]>;
  selectResource(
    providerId: RecognitionProviderId,
    fieldId: RecognitionFieldId,
    path?: string,
  ): Promise<
    | { status: "cancelled" }
    | { status: "selected"; selectionToken: string; label: string; kind: "executable" | "file" | "directory" }
  >;
  save(
    providerId: RecognitionProviderId,
    fields: Record<string, RecognitionFieldReference>,
  ): Promise<RecognitionProviderSummary>;
  clear(providerId: RecognitionProviderId): Promise<RecognitionProviderSummary>;
}
