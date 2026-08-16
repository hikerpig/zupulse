---
status: implemented
---

# Public Pianoform Benchmark

## Objective

为隔离的 `pdf-omr-cli` 建立一套当前机器可承担的公开 pianoform benchmark，用于比较
Audiveris、LEGATO 与 Rokot，区分 engine recognition、conversion、full-page pipeline 与
runtime failure。日常 development run 固定为 10 个唯一 item；standard development/holdout run 各固定为
45 个唯一 item，并在参考机器上以每个 engine 独立运行 60 分钟为总预算。

本协议是 research decision gate，不是 App capability。小样本只能产生 `STOP`、`INVESTIGATE` 或
`PROVISIONAL_PASS`；`PROVISIONAL_PASS` 只允许扩大评测，不能改写既有冻结 `STOP` 或直接进入 App
discovery。

## Public datasets

### OLiMPiC Scanned

- Release: `OLiMPiC 1.0 scanned (2024-02-12)`。
- License: `CC-BY-SA-4.0` dataset release；只消费正式发布的 system image 与对应 MusicXML，不消费
  rights 状态仍为 `pending-item-review` 的 source PDF archive。
- `quick`: 6 development systems，来自 6 个不同 works。
- `standard-development`: 36 development systems，来自 36 个不同 works。
- `standard-holdout`: 36 holdout systems，来自 36 个不同 works。
- 同一 work、set 或 derived variant MUST NOT 跨 development/holdout。

### FP-GrandStaff

- Source: public `PRAIG/fp-grandstaff` release。
- Declared dataset license: `MIT`。
- `quick`: 2 development pages。
- `standard-development`: 4 development pages。
- `standard-holdout`: 4 holdout pages。
- FP-GrandStaff 只验证 synthetic full-page segmentation、reading order、joining 与 long-output behavior；它
  MUST NOT 作为真实扫描质量证据。

### Contract fixtures

- `quick`: 2 个现有 synthetic development fixtures。
- `standard`: 5 个现有 synthetic fixtures。
- Contract fixtures 只验证 CLI、hash、error、artifact、MusicXML round-trip 与 cancellation contract，不进入
  model-quality claim。

## Benchmark profiles

```ts
type BenchmarkExecutionProfile = {
  id: "quick" | "standard";
  maxTotalWallTimeMs: number;
  repeatItemIds: string[];
};
```

### Quick

```text
2 contract + 6 OLiMPiC systems + 2 FP-GrandStaff pages = 10 unique items
repeatItemIds = []
```

Quick MUST contain development items only and MUST be an exact subset of standard development. It is intended to
finish in approximately 6–10 minutes, but its only normative runtime bound is the profile's declared total budget.

### Standard

```text
5 contract + 36 OLiMPiC systems + 4 FP-GrandStaff pages = 45 unique items
repeatItemIds = 6 OLiMPiC item IDs
maxTotalWallTimeMs = 3_600_000
```

Standard has parallel development and holdout manifests with the same composition. The six repeated items are not
additional corpus items: the runner executes those items twice and all other items once. Reproducibility metrics MUST
be calculated only from actual repeated executions; a non-repeated item contributes zero comparisons.

The benchmark clock includes engine inspection/startup, model loading, recognition, conversion, normalization,
validation, metrics and artifact writes. Dependency installation and model/dataset download are outside the clock.

If the total budget expires, the runner MUST abort its owned engine process, MUST NOT execute later items, MUST write
a canonical incomplete report, and MUST fail the run with semantic code `BENCHMARK_RESOURCE_BUDGET_EXCEEDED`.
External `AbortSignal` cancellation remains `INTERRUPTED` and MUST NOT be rewritten as a resource-budget failure.

Reports aggregate all successful items as operational evidence, but holdout quality gates MUST use only
`benchmarkSuite = "oracle-system"`. Contract and synthetic full-page results remain separate category evidence and
MUST NOT improve an engine-quality gate.

## Deterministic selection

Selection MUST depend only on public dataset metadata and ground truth, never engine output. OLiMPiC standard items
MUST use 36 distinct works and three equal strata:

```text
easy:   12
medium: 12
hard:   12
```

Complexity ordering uses an explicitly versioned tuple computed from ground truth facts:

```text
noteCount
voiceCount
chordCount
tieCount
tupletCount
repeatCount
```

Works are first partitioned into three deterministic quantile strata after excluding ground truth that fails current
MusicXML/Harmony readiness. Within each stratum, choose one system per work: prefer up to four available `last`
positions, then up to four available `middle` positions, then fill by stable work/sample ID. This records achievable
coverage instead of assuming every stratum can provide four ready examples of every position. `quick` chooses two
systems from each standard-development stratum and maximizes global `first | middle | last` balance, remaining a strict
subset.

FP-GrandStaff selection MUST choose distinct source row identities from official `val`/`test` splits and cover
increasing page density using ground-truth `measureCount`; the public release does not expose reliable system
boundaries. Its exact selection rule, dataset revision, split artifact hash and selected IDs MUST be written to a
canonical selection artifact before any engine run.

## Manifest contract

The existing corpus item contract MAY add `benchmarkSuite`; profiled manifests MUST provide it:

```ts
type BenchmarkSuite = "contract" | "oracle-system" | "full-page";
```

A benchmark manifest MAY add:

```ts
type BenchmarkManifestExecution = {
  profile: "quick" | "standard";
  maxTotalWallTimeMs: number;
  repeatItemIds: string[];
};
```

Invariants:

- `repeatItemIds` MUST be unique and MUST reference items present in the manifest.
- `quick.items.length MUST equal 10` and `quick.repeatItemIds MUST be empty`.
- `standard.items.length MUST equal 45` and `standard.repeatItemIds.length MUST equal 6`.
- Quick MUST contain `2 contract + 6 oracle-system + 2 full-page` items.
- Standard MUST contain `5 contract + 36 oracle-system + 4 full-page` items.
- `repeatItemIds` MUST reference `oracle-system` items only.
- `maxTotalWallTimeMs MUST be a positive integer`; standard MUST equal `3_600_000`.
- Existing frozen manifests without `execution` retain their existing all-item repetition behavior and frozen hashes;
  this change MUST NOT rewrite historical manifests or reports.

## Commands

```bash
pnpm pdf-omr -- benchmark \
  --manifest <manifest.json> \
  --engine <audiveris|legato|rokot> \
  --output <result-dir> \
  --mode development

pnpm pdf-omr -- benchmark \
  --manifest <manifest.json> \
  --engine <audiveris|legato|rokot> \
  --output <result-dir> \
  --mode holdout \
  --protocol-sha <sha256>

pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
```

## Project structure

```text
docs/specs/                                      approved intent and contract
tasks/pdf-omr-public-benchmark/                  active implementation state only
tools/pdf-omr-cli/src/benchmark/                 manifest, execution and report contracts
tools/pdf-omr-cli/src/__tests__/                 Vitest behavior tests
tools/pdf-omr-cli/scripts/                       deterministic public dataset selectors/builders
tools/pdf-omr-cli/corpus/public-pianoform-v1/    small checked-in manifests/selection metadata only
```

Public dataset archives and generated benchmark inputs MUST NOT be committed. Builders consume an explicit local
cache path and emit reproducible manifests whose assets are hash-verified.

## Code style

```ts
const repetitions = manifest.execution?.repeatItemIds.includes(item.id) === true ? 2 : 1;
```

- Named exports, Prettier double quotes, `__tests__/*.test.ts`。
- Persisted input is Zod-validated and `.strict()`。
- Optional fields are omitted rather than assigned `undefined`。
- Paths in manifests remain relative and cannot escape corpus root。

## Testing strategy

- Unit: manifest profile invariants, deterministic selection and difficulty partitioning。
- Orchestrator: only declared items repeat; budget expiry aborts owned work, writes incomplete report and skips later
  items; external cancellation retains `INTERRUPTED`。
- Corpus contract: checked-in selection metadata contains 10/45 composition and no split/work leakage。
- Regression: current frozen manifests still parse and current benchmark signal/path/protocol tests remain green。

## Boundaries

- Always: preserve `AbortSignal`, `context.cwd`, protocol threshold forwarding, canonical artifacts and fail-closed
  ground-truth readiness。
- Ask first: adding a dependency, downloading/committing large public archives, changing App/Desktop/Bridge behavior。
- Never: tune on holdout details, repair ground truth heuristically, compare raw confidence across engines, commit model
  weights/public archives, or present synthetic full-page success as product readiness。

## Success criteria

- Quick manifest contract accepts exactly 10 items and no repeated IDs。
- Standard manifest contract accepts exactly 45 items, six repeated IDs and a `3_600_000 ms` budget。
- Only six standard OLiMPiC items run twice; all other standard items run once。
- Budget expiry produces a canonical incomplete report and semantic resource-budget failure without running later
  items。
- External cancellation still produces no completed report and returns `INTERRUPTED`。
- Deterministic selectors produce byte-identical selection metadata for the same public release inputs。
- Focused tests, package typecheck, relevant formatter checks and `git diff --check` pass after the final edit。

## Non-goals

- 本轮不提交完整 OLiMPiC/FP-GrandStaff archive 或 materialized assets；下载和生成物只保留在外部 cache。
- 本轮不实现 TEDn、confidence calibration 或 bootstrap confidence interval。
- 本轮不运行真实 engine holdout，不修改既有冻结 report。
- 本轮不接入 App、Library、Bridge、Repository 或 managed files。

## Open questions

无。完整真实 full-page holdout 的 rights review 与扩大到 200/完整公开样本属于后续 initiative。
