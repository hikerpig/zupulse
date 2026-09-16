import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [output, python, renderer] = process.argv.slice(2);
if (!output || !python || !renderer)
  throw new Error("usage: materialize-independent.mjs <new-output-root> <python> <mscore>");
const protocolBytes = await readFile(new URL("./independent-protocol.json", import.meta.url));
const protocol = JSON.parse(protocolBytes);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [path, expected] of Object.entries(protocol.candidateSha256)) {
  if (hash(await readFile(path)) !== expected) throw new Error(`Frozen candidate changed: ${path}`);
}
const root = resolve(output);
await mkdir(root);
const artifacts = {};
const persist = async (name, bytes) => {
  await writeFile(join(root, name), bytes, { flag: "wx" });
  artifacts[name] = hash(bytes);
};
const download = async (upstreamPath, name) => {
  const url = `https://raw.githubusercontent.com/CPJKU/vienna4x22/${protocol.upstream.revision}/${upstreamPath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${upstreamPath}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("unexpected upstream size");
  await persist(name, bytes);
};
await download("LICENSE", "LICENSE");
const results = [];
for (const work of protocol.works) {
  await mkdir(join(root, work));
  await download(`musicxml/${work}.musicxml`, `${work}/source.musicxml`);
  await download(`pdf/${work}.pdf`, `${work}/original.pdf`);
  const pdf = join(root, work, "rendered.pdf");
  const rendered = spawnSync("rtk", ["proxy", renderer, "-o", pdf, join(root, work, "source.musicxml")], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (rendered.status !== 0) throw new Error(`Renderer failed: ${work} ${(rendered.stderr ?? "").slice(-1000)}`);
  artifacts[`${work}/rendered.pdf`] = hash(await readFile(pdf));
  for (const variant of ["original", "rendered"]) {
    const extraction = spawnSync(
      "rtk",
      ["proxy", python, "tools/pdf-omr-cli/engines/pitch_shadow.py", join(root, work, `${variant}.pdf`)],
      { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    if (extraction.status !== 0) throw new Error(`Extractor failed: ${work} ${variant}`);
    const source = JSON.parse(extraction.stdout);
    await persist(`${work}/${variant}.source.json`, Buffer.from(extraction.stdout));
    const pages = source.pages.map((page) => ({
      reason: page.reason,
      measures: page.measures.length,
      supportedMeasures: page.measures.filter((m) => m.reason === "supported").length,
    }));
    results.push({
      work,
      variant,
      pages,
      admitted: pages.every((p) => p.reason === "supported") && pages.some((p) => p.supportedMeasures > 0),
    });
  }
}
const admittedWorks = results.filter((r) => r.variant === "rendered" && r.admitted).length;
await persist(
  "materialization.json",
  Buffer.from(JSON.stringify({ protocolSha256: hash(protocolBytes), artifacts }, null, 2)),
);
await persist(
  "admission.json",
  Buffer.from(
    JSON.stringify(
      {
        admittedWorks,
        status: admittedWorks >= protocol.gates.minimumAdmittedWorks ? "ready-for-inference" : "not-evaluable",
        results,
      },
      null,
      2,
    ),
  ),
);
console.log(JSON.stringify({ root, admittedWorks, results }, null, 2));
