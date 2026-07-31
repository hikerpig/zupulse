import { z } from "zod";
import { PdfOmrError } from "../errors";
import { sha256Schema } from "../schemas";

const pixelBboxSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

const pdfPointBboxSchema = z
  .object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();

const rokotSystemSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    systemIndex: z.number().int().nonnegative(),
    source: z
      .object({
        pixelBbox: pixelBboxSchema,
        pdfPointBbox: pdfPointBboxSchema,
        cropSha256: sha256Schema,
      })
      .strict(),
    abcUtf8: z.string().min(1),
    musicXmlUtf8: z.string().min(1),
  })
  .strict();

export const rokotSystemBundleSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    systems: z.array(rokotSystemSchema).min(1),
  })
  .strict()
  .superRefine((bundle, context) => {
    for (let index = 1; index < bundle.systems.length; index += 1) {
      const previous = bundle.systems[index - 1]!;
      const current = bundle.systems[index]!;
      const ordered =
        current.pageIndex > previous.pageIndex ||
        (current.pageIndex === previous.pageIndex && current.systemIndex > previous.systemIndex);
      if (!ordered) {
        context.addIssue({
          code: "custom",
          path: ["systems", index],
          message: "systems must be ordered by pageIndex and systemIndex",
        });
      }
    }
  });

export type RokotSystemBundle = z.infer<typeof rokotSystemBundleSchema>;

const allowedVoices = new Set(["1", "1b", "2", "2b"]);
const headerPatterns = [/^X:[^\r\n]+$/, /^M:[^\r\n]+$/, /^L:[^\r\n]+$/, /^K:[^\r\n]+$/];

export function validateRokotAbc(bytes: Uint8Array): string {
  let abc: string;
  try {
    abc = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw invalidOutput("invalid-abc-utf8", error);
  }

  const lines = abc.split(/\r?\n/);
  if (
    lines[0] !== "%%rokot-abc 0.1" ||
    headerPatterns.some((pattern, index) => !pattern.test(lines[index + 1] ?? ""))
  ) {
    throw invalidOutput("invalid-rokot-abc-envelope");
  }

  const contentLines = lines.slice(5).filter((line) => line.length > 0);
  const structuralLines = contentLines.every(
    (line) => /^V:[^\s]+(?:\s.*)?$/.test(line) || /^\[V:[^\]]+\](?:\s.*)?$/.test(line),
  );
  const duplicateHeader = contentLines.some((line) => /^[XMLK]:/.test(line));
  if (!structuralLines || duplicateHeader) throw invalidOutput("invalid-rokot-abc-envelope");

  const voices = contentLines.flatMap((line) => {
    const declaration = /^V:([^\s]+)/.exec(line);
    if (declaration !== null) return [declaration[1]!];
    const inline = /^\[V:([^\]]+)\]/.exec(line);
    return inline === null ? [] : [inline[1]!];
  });
  if (voices.some((voice) => !allowedVoices.has(voice))) throw invalidOutput("unknown-rokot-voice");

  const body = contentLines
    .filter((line) => line.startsWith("[V:"))
    .map((line) => line.replace(/^\[V:[^\]]+\]\s*/, ""))
    .join("\n")
    .replace(/"[^"]*"/g, "")
    .replace(/![^!]*!/g, "")
    .replace(/\[[A-Za-z]:[^\]]*\]/g, "");
  if (!/(^|[\s|:[({])(?:[\^_=]*[A-Ga-g][,']*|[zZxX])/.test(body)) {
    throw invalidOutput("empty-rokot-abc");
  }

  return abc;
}

export function parseRokotSystemBundle(bytes: Uint8Array): RokotSystemBundle {
  let bundle: RokotSystemBundle;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    bundle = rokotSystemBundleSchema.parse(JSON.parse(json) as unknown);
  } catch (error) {
    throw invalidOutput("invalid-rokot-system-bundle", error);
  }

  for (const system of bundle.systems) {
    validateRokotAbc(new TextEncoder().encode(system.abcUtf8));
  }
  return bundle;
}

function invalidOutput(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "Rokot output is invalid", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}
