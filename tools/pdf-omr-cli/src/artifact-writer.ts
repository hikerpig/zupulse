import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { canonicalJson, sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";

export type ArtifactWriter = {
  writeJson(relativePath: string, value: unknown): Promise<string>;
  writeBytes(relativePath: string, bytes: Uint8Array): Promise<string>;
  artifactSha256(): Readonly<Record<string, string>>;
};

export async function createArtifactWriter(outputDirectory: string): Promise<ArtifactWriter> {
  try {
    await mkdir(outputDirectory);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "output directory already exists or cannot be created", {
      context: { outputDirectory },
      cause: error,
    });
  }

  const hashes = new Map<string, string>();
  const root = resolve(outputDirectory);

  const writeBytes = async (artifactPath: string, bytes: Uint8Array): Promise<string> => {
    const target = resolveArtifactPath(root, artifactPath);
    if (hashes.has(artifactPath)) {
      throw new PdfOmrError("INVALID_INPUT", "artifact was already written", {
        context: { artifactPath },
      });
    }
    await mkdir(dirname(target), { recursive: true });
    const temporary = resolve(dirname(target), `.${randomUUID()}.tmp`);
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, target);
    const hash = sha256Bytes(bytes);
    hashes.set(artifactPath, hash);
    return hash;
  };

  return {
    async writeJson(artifactPath, value) {
      return writeBytes(artifactPath, new TextEncoder().encode(canonicalJson(value)));
    },
    writeBytes,
    artifactSha256() {
      return Object.fromEntries([...hashes.entries()].sort(([left], [right]) => left.localeCompare(right)));
    },
  };
}

export async function verifyArtifactHash(path: string, expectedSha256: string): Promise<boolean> {
  return sha256Bytes(await readFile(path)) === expectedSha256;
}

function resolveArtifactPath(root: string, artifactPath: string): string {
  if (artifactPath.length === 0 || isAbsolute(artifactPath)) {
    throw new PdfOmrError("INVALID_INPUT", "artifact path must be relative", {
      context: { artifactPath },
    });
  }
  const target = resolve(root, artifactPath);
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new PdfOmrError("INVALID_INPUT", "artifact path escapes the run directory", {
      context: { artifactPath },
    });
  }
  return target;
}
