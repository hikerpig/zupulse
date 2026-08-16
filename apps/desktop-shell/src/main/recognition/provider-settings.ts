import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createEngineRegistry,
  resolveBundledLegatoRunnerPath,
  type EngineRegistry,
} from "@zupulse/pdf-omr-cli/pipeline";
import type {
  BridgeRequest,
  RecognitionProviderId,
  RecognitionProviderIssueCode,
  RecognitionProviderSummary,
} from "@zupulse/web-core";
import { preflightPdfOmrEngine, preflightPdfOmrEngines } from "./pdf-omr-engine-preflight";
import {
  RecognitionProviderConfigurationStore,
  type RecognitionProviderConfiguration,
} from "./provider-configuration-store";

type SaveRequest = Extract<BridgeRequest, { type: "recognitionSettings.save" }>["payload"];
type FieldReference = { source: "saved" } | { source: "selection"; selectionToken: string };
type Selection = {
  providerId: RecognitionProviderId;
  fieldId: string;
  path: string;
  label: string;
  kind: "executable" | "file" | "directory";
};

const inputKinds = {
  audiveris: ["pdf", "image"],
  rokot: ["pdf"],
  legato: ["pdf"],
} as const;

const fieldKinds: Record<RecognitionProviderId, Record<string, Selection["kind"]>> = {
  audiveris: { executable: "executable" },
  rokot: { llamaCli: "executable", model: "file", visionProjector: "file", python: "executable" },
  legato: { python: "executable", repository: "directory", model: "file", baseModel: "directory" },
};

export class RecognitionProviderSettings {
  private readonly selections = new Map<string, Selection>();

  private constructor(
    private readonly store: RecognitionProviderConfigurationStore,
    private configurations: Partial<Record<RecognitionProviderId, RecognitionProviderConfiguration>>,
    private readonly automaticAudiverisExecutable: string,
  ) {}

  static async create(options: {
    store: RecognitionProviderConfigurationStore;
    automaticAudiverisExecutable: string;
  }): Promise<RecognitionProviderSettings> {
    return new RecognitionProviderSettings(
      options.store,
      await options.store.loadAll(),
      options.automaticAudiverisExecutable,
    );
  }

  registerSelection(
    providerId: RecognitionProviderId,
    fieldId: string,
    selectedPath: string,
  ): {
    selectionToken: string;
    label: string;
    kind: Selection["kind"];
  } {
    const kind = fieldKinds[providerId][fieldId];
    if (!kind) throw new Error("INVALID_RECOGNITION_RESOURCE_FIELD");
    const normalizedPath = selectedPath.trim();
    if (!path.isAbsolute(normalizedPath))
      throw new RecognitionSettingsError("resource-unreadable", "Resource path must be absolute");
    const selection = { providerId, fieldId, path: normalizedPath, label: path.basename(normalizedPath), kind };
    const token = randomUUID();
    this.selections.set(token, selection);
    return { selectionToken: token, label: selection.label, kind };
  }

  async list(): Promise<RecognitionProviderSummary[]> {
    const capabilities = await preflightPdfOmrEngines(this.createRegistrySnapshot());
    return capabilities.map((capability) => this.toSummary(capability.id as RecognitionProviderId, capability));
  }

  async save(request: SaveRequest): Promise<RecognitionProviderSummary> {
    const candidate = this.resolveCandidate(request);
    const registry = this.createRegistry({ ...this.configurations, [request.providerId]: candidate });
    const capability = await preflightPdfOmrEngine(registry, request.providerId);
    if (!capability.available)
      throw new RecognitionSettingsError(mapIssue(capability.reason), "Provider preflight failed");
    try {
      await this.store.save(candidate);
    } catch {
      throw new RecognitionSettingsError("persistence-failed", "Provider configuration could not be persisted");
    }
    this.configurations = { ...this.configurations, [request.providerId]: candidate };
    for (const reference of Object.values(request.fields)) {
      if (reference.source === "selection") this.selections.delete(reference.selectionToken);
    }
    return this.toSummary(request.providerId, capability);
  }

  async clear(providerId: RecognitionProviderId): Promise<RecognitionProviderSummary> {
    await this.store.clear(providerId).catch(() => {
      throw new RecognitionSettingsError("persistence-failed", "Provider configuration could not be cleared");
    });
    const next = { ...this.configurations };
    delete next[providerId];
    this.configurations = next;
    return (await this.list()).find((provider) => provider.id === providerId)!;
  }

  createRegistrySnapshot(): EngineRegistry {
    return this.createRegistry({ ...this.configurations });
  }

  private resolveCandidate(request: SaveRequest): RecognitionProviderConfiguration {
    const saved = this.configurations[request.providerId] as Record<string, string> | undefined;
    const fields = Object.fromEntries(
      Object.entries(request.fields).map(([fieldId, reference]) => [
        fieldId,
        this.resolveField(request.providerId, fieldId, reference, saved),
      ]),
    );
    return { providerId: request.providerId, ...fields } as RecognitionProviderConfiguration;
  }

  private resolveField(
    providerId: RecognitionProviderId,
    fieldId: string,
    reference: FieldReference,
    saved: Record<string, string> | undefined,
  ): string {
    if (reference.source === "saved") {
      const value = saved?.[fieldId];
      if (!value) throw new RecognitionSettingsError("missing-configuration", "Saved field is unavailable");
      return value;
    }
    const selection = this.selections.get(reference.selectionToken);
    if (selection?.providerId !== providerId || selection.fieldId !== fieldId) {
      throw new RecognitionSettingsError("resource-unreadable", "Selection token is invalid");
    }
    return selection.path;
  }

  private createRegistry(
    configurations: Partial<Record<RecognitionProviderId, RecognitionProviderConfiguration>>,
  ): EngineRegistry {
    const audiveris = configurations.audiveris;
    const rokot = configurations.rokot;
    const legato = configurations.legato;
    return createEngineRegistry({
      environmentFallback: false,
      audiverisExecutable:
        audiveris?.providerId === "audiveris" ? audiveris.executable : this.automaticAudiverisExecutable,
      ...(rokot?.providerId === "rokot"
        ? {
            rokot: {
              llamaCliPath: rokot.llamaCli,
              modelPath: rokot.model,
              mmprojPath: rokot.visionProjector,
              abc2xmlPythonPath: rokot.python,
            },
          }
        : {}),
      ...(legato?.providerId === "legato"
        ? {
            legato: {
              pythonExecutable: legato.python,
              repositoryPath: legato.repository,
              repositoryRevision: "8c1de27e414f487fe59086547aaae23b868ed6ca",
              modelPath: legato.model,
              modelSha256: "cdeafc9ab30eba74e1c87f0722f869aa9c00d4c4d5986561d4abfeccd6f9cfcc",
              baseModelPath: legato.baseModel,
              runnerPath: resolveBundledLegatoRunnerPath(),
            },
          }
        : {}),
    });
  }

  private toSummary(
    providerId: RecognitionProviderId,
    capability: { version: string; available: boolean; reason?: string },
  ): RecognitionProviderSummary {
    const configuration = this.configurations[providerId];
    const fields = configuration
      ? Object.entries(configuration)
          .filter(([fieldId]) => fieldId !== "providerId")
          .map(([id, value]) => ({ id, label: path.basename(value), kind: fieldKinds[providerId][id]! }))
      : [];
    if (capability.available)
      return {
        id: providerId,
        state: "ready",
        version: capability.version,
        inputKinds: [...inputKinds[providerId]],
        hasExplicitConfiguration: configuration !== undefined,
        fields,
      };
    if (configuration === undefined && providerId !== "audiveris")
      return {
        id: providerId,
        state: "unconfigured",
        inputKinds: [...inputKinds[providerId]],
        hasExplicitConfiguration: false,
        fields: [],
      };
    return {
      id: providerId,
      state: "needs-attention",
      reason: mapIssue(capability.reason),
      inputKinds: [...inputKinds[providerId]],
      hasExplicitConfiguration: configuration !== undefined,
      fields,
    };
  }
}

export class RecognitionSettingsError extends Error {
  constructor(
    readonly reason: RecognitionProviderIssueCode,
    message: string,
  ) {
    super(message);
  }
}

function mapIssue(reason: string | undefined): RecognitionProviderIssueCode {
  if (reason?.includes("revision")) return "repository-revision-mismatch";
  if (reason?.includes("hash")) return "model-hash-mismatch";
  if (reason?.includes("unreadable")) return "resource-unreadable";
  if (reason?.includes("version") || reason?.includes("build")) return "executable-version-mismatch";
  if (reason?.includes("converter")) return "converter-unavailable";
  if (reason?.includes("missing")) return "missing-configuration";
  return "inspection-failed";
}
