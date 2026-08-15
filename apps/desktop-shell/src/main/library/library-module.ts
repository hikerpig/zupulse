import path from "node:path";
import { localPlaybackResumeSchema, parseSidecar } from "@zupulse/web-core";
import type { RequiredBridgeHandlers } from "../bridge/dispatcher";
import { JsonStore } from "../persistence/json-store";
import { DesktopLibraryStore } from "./desktop-library-store";
import { verifySqliteAvailable } from "./sqlite";

type LibraryHandlers = RequiredBridgeHandlers<
  | "library.list"
  | "library.get"
  | "library.find"
  | "library.add"
  | "library.readScore"
  | "library.updateMetadata"
  | "library.setFavorite"
  | "library.markOpened"
  | "library.delete"
  | "harmonyAnalysis.read"
  | "harmonyAnalysis.save"
  | "sidecar.read"
  | "sidecar.write"
  | "playbackResume.read"
  | "playbackResume.write"
>;

export async function createLibraryModule(options: {
  userData: string;
  onStorageWarning(category: "sidecar" | "resume", code: "CORRUPT_PERSISTED_DATA"): void;
}) {
  verifySqliteAvailable();
  const sidecarStore = new JsonStore(options.userData, "sidecars", { parse: parseSidecar }, (code) =>
    options.onStorageWarning("sidecar", code),
  );
  const resumeStore = new JsonStore(options.userData, "resume", localPlaybackResumeSchema, (code) =>
    options.onStorageWarning("resume", code),
  );
  const library = new DesktopLibraryStore(
    path.join(options.userData, "library.sqlite"),
    path.join(options.userData, "library"),
    {
      readSidecar: (libraryScoreId) => sidecarStore.read(libraryScoreId),
      readResume: (libraryScoreId) => resumeStore.read(libraryScoreId),
    },
  );
  await library.initialize();
  let disposed = false;

  const handlers: LibraryHandlers = {
    "library.list": async () => ({ scores: await library.list() }),
    "library.get": async (request) => ({ score: await library.get(request.payload.id) }),
    "library.find": async (request) => ({ score: await library.findByIdentity(request.payload.scoreIdentity) }),
    "library.add": async (request) => {
      const { parsedTitle, parsedArtist, durationMs, ...draft } = request.payload.draft;
      return library.add({
        ...draft,
        file: { ...draft.file, bytes: new Uint8Array(draft.file.bytes) },
        ...(parsedTitle === undefined ? {} : { parsedTitle }),
        ...(parsedArtist === undefined ? {} : { parsedArtist }),
        ...(durationMs === undefined ? {} : { durationMs }),
      });
    },
    "library.readScore": (request) => library.readScore(request.payload.id),
    "library.updateMetadata": async (request) => ({
      score: await library.updateMetadata(request.payload.id, request.payload.patch),
    }),
    "library.setFavorite": async (request) => {
      await library.setFavorite(request.payload.id, request.payload.favorite);
      return {};
    },
    "library.markOpened": async (request) => {
      await library.markOpened(request.payload.id, request.payload.openedAt);
      return {};
    },
    "library.delete": async (request) => {
      await library.delete(request.payload.id);
      await Promise.all([sidecarStore.delete(request.payload.id), resumeStore.delete(request.payload.id)]);
      return {};
    },
    "harmonyAnalysis.read": async (request) => ({
      document: await library.read(request.payload.libraryScoreId),
    }),
    "harmonyAnalysis.save": (request) => library.save(request.payload),
    "sidecar.read": async (request) => ({
      payload: await sidecarStore.read(request.payload.libraryScoreId ?? request.payload.identity.contentHash),
    }),
    "sidecar.write": async (request) => {
      const key = request.payload.libraryScoreId ?? request.payload.identity.contentHash;
      if (request.payload.libraryScoreId && !(await library.get(request.payload.libraryScoreId))) {
        throw new Error("LIBRARY_SCORE_NOT_FOUND");
      }
      await sidecarStore.write(key, request.payload.payload);
      return {};
    },
    "playbackResume.read": async (request) => ({
      resume: await resumeStore.read(request.payload.libraryScoreId ?? request.payload.identity.contentHash),
    }),
    "playbackResume.write": async (request) => {
      const key = request.payload.libraryScoreId ?? request.payload.identity.contentHash;
      if (request.payload.libraryScoreId && !(await library.get(request.payload.libraryScoreId))) {
        throw new Error("LIBRARY_SCORE_NOT_FOUND");
      }
      await resumeStore.write(key, request.payload.resume);
      return {};
    },
  };

  return {
    handlers,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      library.close();
    },
  };
}
