import { fileImportDroppedRequestSchema } from "@zupulse/web-core";
import type { SupportedLocale } from "@zupulse/app-i18n";
import { assertBridgeAppSender, BridgeDispatchError, type RequiredBridgeHandlers } from "../bridge/dispatcher";
import { FileTokenStore } from "./file-token-store";
import { acceptScorePaths, readScoreFileBytes, saveScoreFile, selectScoreFiles } from "./score-files";

const DROPPED_FILES_IPC_CHANNEL = "zupulse:file:importDropped" as const;

type FileAccessHandlers = RequiredBridgeHandlers<"file.select" | "file.readBytes" | "file.save">;
type DroppedFileEvent = {
  senderFrame?: { url: string } | null;
  sender: { getURL(): string };
};
type DroppedFileIpc = {
  handle(
    channel: typeof DROPPED_FILES_IPC_CHANNEL,
    handler: (event: DroppedFileEvent, value: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: typeof DROPPED_FILES_IPC_CHANNEL): void;
};

export function createFileAccessModule(options: { getLocale(): SupportedLocale; recordFailure(error: unknown): void }) {
  const fileTokens = new FileTokenStore();
  let droppedFileIpc: DroppedFileIpc | undefined;
  const handlers: FileAccessHandlers = {
    "file.select": (request) => selectScoreFiles(fileTokens, request.payload.multiple, options.getLocale()),
    "file.readBytes": (request) => readScoreFileBytes(fileTokens, request.payload.fileToken),
    "file.save": (request) => saveScoreFile(request.payload, options.getLocale()),
  };

  return {
    handlers,
    fileTokens,
    installDroppedFileIpc(ipc: DroppedFileIpc): void {
      droppedFileIpc = ipc;
      ipc.handle(DROPPED_FILES_IPC_CHANNEL, async (event, value) => {
        try {
          assertBridgeAppSender(event.senderFrame?.url ?? event.sender.getURL());
          const parsed = fileImportDroppedRequestSchema.safeParse(value);
          if (!parsed.success) {
            throw new BridgeDispatchError(
              "INVALID_BRIDGE_MESSAGE",
              "Dropped-file import failed schema validation",
              false,
              parsed.error.issues,
            );
          }
          return await acceptScorePaths(fileTokens, parsed.data.payload.paths);
        } catch (error) {
          options.recordFailure(error);
          throw error;
        }
      });
    },
    dispose(): void {
      fileTokens.clear();
      droppedFileIpc?.removeHandler(DROPPED_FILES_IPC_CHANNEL);
      droppedFileIpc = undefined;
    },
  };
}
