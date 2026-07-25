import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";
import { z } from "zod";

import {
  BRIDGE_SCHEMA_VERSION,
  IPAD_BRIDGE_EVENT_TYPES,
  IPAD_BRIDGE_REQUEST_TYPES,
  bridgeErrorSchema,
  bridgeEventSchema,
  bridgeRequestSchema,
  bridgeResponseSchemas,
  capabilitiesSchema,
  ipadBridgeEnvelopeSchema,
} from "../packages/web-core/src/bridge/schemas.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultOutput = resolve(repositoryRoot, "apps/ipad-shell/bridge/bridge-contract.json");
const args = process.argv.slice(2);
const check = args.includes("--check");
const outputIndex = args.indexOf("--output");
const output = outputIndex === -1 ? defaultOutput : resolve(process.cwd(), requireArgument(args, outputIndex + 1));

const requestTypes = [...IPAD_BRIDGE_REQUEST_TYPES].sort();
const eventTypes = [...IPAD_BRIDGE_EVENT_TYPES].sort();
const requestDocument = jsonSchema(bridgeRequestSchema);
const eventDocument = jsonSchema(bridgeEventSchema);

const manifest = {
  schemaVersion: 1,
  bridgeVersion: BRIDGE_SCHEMA_VERSION,
  requestTypes,
  eventTypes,
  envelope: jsonSchema(ipadBridgeEnvelopeSchema),
  requests: Object.fromEntries(requestTypes.map((type) => [type, schemaForType(requestDocument, type)])),
  responses: Object.fromEntries(requestTypes.map((type) => [type, jsonSchema(bridgeResponseSchemas[type])])),
  events: Object.fromEntries(eventTypes.map((type) => [type, schemaForType(eventDocument, type)])),
  capabilities: jsonSchema(capabilitiesSchema),
  error: jsonSchema(bridgeErrorSchema),
};
const serialized = await format(JSON.stringify(manifest), {
  parser: "json",
  printWidth: 120,
});

if (check) {
  const current = await readFile(output, "utf8").catch(() => "");
  if (current !== serialized) throw new Error(`Bridge contract drift detected: ${output}`);
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialized, "utf8");
}

function jsonSchema(schema) {
  return z.toJSONSchema(schema, { unrepresentable: "any" });
}

function schemaForType(document, type) {
  const schema = document.oneOf?.find((candidate) => candidate.properties?.type?.const === type);
  if (!schema) throw new Error(`Missing JSON schema for Bridge type: ${type}`);
  return schema;
}

function requireArgument(values, index) {
  const value = values[index];
  if (!value) throw new Error("--output requires a path");
  return value;
}
