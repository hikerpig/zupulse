#!/usr/bin/env python3
"""Train the optional offline harmony MLP and export quantized JSON weights."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch


CHORD_KINDS = (
    "major",
    "minor",
    "dominant",
    "diminished",
    "half-diminished",
    "augmented",
    "suspended-second",
    "suspended-fourth",
    "power",
)
EXTENSIONS = (None, 6, 7, 9, 11, 13)
DEGREE_OPERATIONS = ("add", "alter", "subtract")
FEATURE_LENGTH = 59


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--hidden-size", type=int, default=16, choices=range(1, 33))
    parser.add_argument("--epochs", type=int, default=240)
    parser.add_argument("--learning-rate", type=float, default=0.02)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--tune-report", action="append", type=Path, default=[])
    return parser.parse_args()


def hash_lines(lines: list[str]) -> str:
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def load_examples(paths: list[Path]):
    examples = []
    source_hashes = set()
    report_group_hashes = []
    for path in paths:
        report = json.loads(path.read_text())
        split = report.get("split", "train" if report.get("schemaVersion") == "1.0.0" else None)
        if split != "train":
            raise ValueError(f"training requires train reports: {path}")
        groups_hash = report.get("groupsSha256", report.get("trainingGroupsSha256"))
        if not isinstance(groups_hash, str):
            raise ValueError(f"ranking report groups hash missing: {path}")
        report_group_hashes.append(groups_hash)
        for source in report["sources"]:
            source_hashes.add(hash_lines([source["caseId"], source["revision"], source["groupsSha256"]]))
        for record in report["records"]:
            if record["outcome"] != "oracle-hit" or "targetIndex" not in record:
                continue
            examples.append(
                {
                    "corpus": record["corpus"],
                    "group": record["groupId"],
                    "weight": record["weight"],
                    "target": record["targetIndex"],
                    "features": candidate_features(record),
                }
            )
    if not examples:
        raise ValueError("MLP training has no oracle-hit records")
    return examples, sorted(source_hashes), hash_lines(sorted(report_group_hashes))


def candidate_features(record: dict) -> list[list[float]]:
    candidates = record["candidates"]
    max_local = max(1, *(abs(candidate["ruleLocalScore"]) for candidate in candidates))
    max_sequence = max(1, *(abs(candidate["ruleSequenceScore"]) for candidate in candidates))
    result = []
    for index, candidate in enumerate(candidates):
        chord = candidate["chord"]
        degrees = chord.get("degrees", [])
        features = [*candidate["features"]]
        features.extend(float(chord["kind"] == kind) for kind in CHORD_KINDS)
        features.extend(float(chord.get("extension") == extension) for extension in EXTENSIONS)
        features.extend(float(any(degree["operation"] == operation for degree in degrees)) for operation in DEGREE_OPERATIONS)
        features.extend(
            (
                candidate["ruleLocalScore"] / max_local,
                candidate["ruleSequenceScore"] / max_sequence,
                1 if len(candidates) == 1 else 1 - index / (len(candidates) - 1),
                float(index == record["primaryIndex"]),
            )
        )
        if len(features) != FEATURE_LENGTH:
            raise ValueError(f"unexpected feature length: {len(features)}")
        result.append(features)
    return result


def tensors(examples: list[dict]):
    count = len(examples)
    candidate_count = max(len(example["features"]) for example in examples)
    features = np.zeros((count, candidate_count, FEATURE_LENGTH), dtype=np.float32)
    mask = np.zeros((count, candidate_count), dtype=bool)
    targets = np.zeros(count, dtype=np.int64)
    group_weights: dict[tuple[str, str], float] = {}
    corpus_groups: dict[str, set[str]] = {}
    for example in examples:
        key = (example["corpus"], example["group"])
        group_weights[key] = group_weights.get(key, 0) + example["weight"]
        corpus_groups.setdefault(example["corpus"], set()).add(example["group"])
    sample_weights = np.zeros(count, dtype=np.float32)
    for index, example in enumerate(examples):
        size = len(example["features"])
        features[index, :size] = example["features"]
        mask[index, :size] = True
        targets[index] = example["target"]
        key = (example["corpus"], example["group"])
        # Match the TypeScript baseline: equal corpus, then work, then duration weight.
        sample_weights[index] = (
            example["weight"]
            / group_weights[key]
            / len(corpus_groups[example["corpus"]])
            / len(corpus_groups)
        )
    return tuple(torch.from_numpy(value) for value in (features, mask, targets, sample_weights))


def train(args: argparse.Namespace, examples: list[dict]):
    torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    features, mask, targets, sample_weights = tensors(examples)
    model = torch.nn.Sequential(
        torch.nn.Linear(FEATURE_LENGTH, args.hidden_size),
        torch.nn.ReLU(),
        torch.nn.Linear(args.hidden_size, 1),
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate, weight_decay=0.0001)
    for _ in range(args.epochs):
        optimizer.zero_grad()
        logits = model(features).squeeze(-1).masked_fill(~mask, -1e9)
        losses = torch.nn.functional.cross_entropy(logits, targets, reduction="none")
        loss = (losses * sample_weights).sum()
        loss.backward()
        optimizer.step()
    return model


def quantized_asset(model, source_hashes: list[str], groups_hash: str) -> dict:
    hidden = model[0]
    output = model[2]

    def rounded(values):
        quantized = [round(float(value), 2) for value in values.detach().reshape(-1)]
        return [0 if value == 0 else value for value in quantized]

    return {
        "version": 1,
        "featureVersion": "candidate-linear-v2",
        "algorithmVersion": "mlp-relu-v1",
        "trainingSourcesSha256": source_hashes,
        "trainingGroupsSha256": groups_hash,
        "hiddenSize": hidden.out_features,
        "hiddenWeights": rounded(hidden.weight),
        "hiddenBias": rounded(hidden.bias),
        "outputWeights": rounded(output.weight),
        "outputBias": rounded(output.bias)[0],
    }


def evaluate_asset(asset: dict, paths: list[Path]) -> dict:
    hidden_weights = torch.tensor(asset["hiddenWeights"]).reshape(asset["hiddenSize"], FEATURE_LENGTH)
    hidden_bias = torch.tensor(asset["hiddenBias"])
    output_weights = torch.tensor(asset["outputWeights"])
    output_bias = asset["outputBias"]
    totals: dict[str, list[float]] = {}
    for path in paths:
        report = json.loads(path.read_text())
        if report.get("split") != "tune":
            raise ValueError(f"evaluation requires tune reports: {path}")
        for record in report["records"]:
            if record["outcome"] != "oracle-hit" or "targetIndex" not in record:
                continue
            features = torch.tensor(candidate_features(record))
            logits = torch.relu(features @ hidden_weights.T + hidden_bias) @ output_weights + output_bias
            corpus = record["corpus"]
            values = totals.setdefault(corpus, [0, 0, 0, 0])
            values[0] += 1
            values[1] += record["weight"]
            values[2] += record["weight"] * int(record["primaryIndex"] == record["targetIndex"])
            values[3] += record["weight"] * int(int(torch.argmax(logits)) == record["targetIndex"])

    def metrics(values: list[float]) -> dict:
        baseline = values[2] / values[1]
        model = values[3] / values[1]
        return {
            "records": int(values[0]),
            "weight": int(values[1]),
            "baselineTop1": round(baseline, 4),
            "modelTop1": round(model, 4),
            "delta": round(model - baseline, 4),
        }

    aggregate = [sum(values[index] for values in totals.values()) for index in range(4)]
    return {"aggregate": metrics(aggregate), "corpora": {key: metrics(totals[key]) for key in sorted(totals)}}


def main() -> None:
    args = parse_args()
    examples, source_hashes, groups_hash = load_examples(args.reports)
    model = train(args, examples)
    asset = quantized_asset(model, source_hashes, groups_hash)
    args.output.write_text(json.dumps(asset, indent=2, separators=(",", ": ")) + "\n")
    result = {"output": str(args.output), "records": len(examples), "hiddenSize": args.hidden_size}
    if args.tune_report:
        result["quantizedEvaluation"] = evaluate_asset(asset, args.tune_report)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
