import { createHash } from "node:crypto";

const candidates = [
  {
    id: "legato-1",
    code: {
      available: true,
      repository: "https://github.com/guang-yng/legato",
      revision: "179c228d3d5f67113cf739b44891b3abe046f1dc",
      license: "MIT",
    },
    weights: {
      available: true,
      gated: true,
      model: "guangyangmusic/legato",
      license: "Llama-3.2-11B-Vision-Instruct",
    },
    runtime: {
      locallyReproduced: false,
      reason: "Gated 11B vision-model access and CUDA-oriented reference environment",
    },
  },
  {
    id: "legato-2",
    code: {
      available: false,
      repository: "https://github.com/guang-yng/legato2",
      license: null,
    },
    weights: {
      available: false,
      gated: null,
      model: null,
      license: null,
    },
    runtime: {
      locallyReproduced: false,
      reason: "Paper is public, but no public runnable repository or checkpoint was found",
    },
  },
  {
    id: "transcoda",
    code: {
      available: true,
      repository: "https://github.com/btrkeks/transcoda",
      revision: "d4e2e687d5679ae96ca4aa6f01e06a5b338cd488",
      license: "AGPL-3.0-only",
    },
    weights: {
      available: true,
      gated: false,
      model: "btrkeks/transcoda-59M-zeroshot-v1",
      revision: "b529f8aa5d996d9224df3395b5b92d0867343c91",
      file: "transcoda-59M-zeroshot-v1.ckpt",
      sha256: "3ce7387b94776cd0edc4e5b70fbc2e28ac0f4c812d5f978d1ef26e236dccdafc",
      license: "CC-BY-4.0",
    },
    runtime: {
      locallyReproduced: true,
      platform: "macOS arm64",
      device: "mps",
      nativeOutput: "**kern",
      smokeResult: "process-succeeded-output-structurally-invalid",
    },
  },
] as const;

const selected = candidates.filter((candidate) => candidate.id === "transcoda");
if (selected.length !== 1 || !selected[0].runtime.locallyReproduced) {
  throw new Error("Neural engine spike must identify exactly one locally reproduced candidate");
}

const payload = {
  schemaVersion: "1.0.0",
  evaluatedAt: "2026-07-28",
  selectedEngineId: selected[0].id,
  candidates,
};
const canonical = `${JSON.stringify(payload, null, 2)}\n`;
process.stdout.write(canonical);
process.stderr.write(`sha256=${createHash("sha256").update(canonical).digest("hex")}\n`);
