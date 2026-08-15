import path from "node:path";
import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";

export function resolveAppAsset(root: string, rawUrl: string): string {
  const rawPathStart = rawUrl.indexOf("/", rawUrl.indexOf("//") + 2);
  const rawPath = (rawPathStart < 0 ? "/" : rawUrl.slice(rawPathStart)).split(/[?#]/, 1)[0] ?? "/";
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error("APP_PROTOCOL_INVALID_PATH");
  }
  if (decodedPath.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("APP_PROTOCOL_PATH_OUTSIDE_ROOT");
  }

  const url = new URL(rawUrl);
  if (url.protocol !== "zupulse:" || url.host !== "app") {
    throw new Error("APP_PROTOCOL_INVALID_ORIGIN");
  }
  const candidate = path.resolve(root, `.${decodedPath}`);
  const relative = path.relative(path.resolve(root), candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("APP_PROTOCOL_PATH_OUTSIDE_ROOT");
  }
  return candidate;
}

export function registerAppProtocol(root: string): void {
  protocol.handle("zupulse", (request) => net.fetch(pathToFileURL(resolveAppAsset(root, request.url)).href));
}
