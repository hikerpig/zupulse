#!/usr/bin/env python3
"""Fine-tune one pinned, research-only DETR layout candidate."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

from layout_detr_metrics import decode_predictions, evaluate_ola_page, evaluate_page, summarize_ola_pages, summarize_pages
from layout_detr_targets import OLA_LABELS, LABELS, build_detr_coco_annotation, build_ola_detr_coco_annotation
from train_staff_line_segmenter import choose_device


MODEL_REVISION = "557a3b6fcdb1be415f074c22da2e16ab4f7e8265"
SCORE_THRESHOLD = 0.5
SOURCE_SHA256 = {
    "README.md": "bc7d74d96a9101113c06be3a90975510dd19671382eb6fdfc5d1edbb042a723b",
    "config.json": "e7bcf3992363f27717a863f14b193140ad2e41d4338ee012730e58a92cae17e6",
    "preprocessor_config.json": "84084dff7cb5f0ab9394adc87f34d813a4e0c3d7ad56aa7d73d775174ffaca3f",
    "pytorch_model.bin": "9400d5a6a433c73bb3440f42daab69a7b728b4bce0922904ac4779cb04e08989",
}
DOCLAYNET_REVISION = "c5946fb892bd99f527c0dd69577b9e9e55364f8f"
DOCLAYNET_SOURCE_SHA256 = {
    "README.md": "1eccacf4a44a5e977ee5db38b777ac186375c7ac02f594ece5e7efdf4cb8363c",
    "config.json": "01d2bd3356abd64b84b837294782b28a4052f1a36b19e3a9c7d84f75ee15d5e6",
    "preprocessor_config.json": "48aaaeafe0e746877c41969391577458d8164ef1b22050fd3c330f713f81c556",
    "model.safetensors": "e3861d34685d3b36e5f38370597daf98fb2f98a852cfa5c125035057ded06809",
}
MODEL_PROFILES = {
    "detr": {
        "activation": "softmax",
        "architecture": "facebook-detr-resnet-50-layout-v1",
        "labels": LABELS,
        "metricMode": "count-conditioned",
        "modelType": "detr",
        "revision": MODEL_REVISION,
        "sourceFiles": SOURCE_SHA256,
        "targetMode": "count-conditioned",
    },
    "deformable-detr-doclaynet": {
        "activation": "sigmoid",
        "architecture": "aryn-deformable-detr-doclaynet-layout-v1",
        "labels": LABELS,
        "metricMode": "count-conditioned",
        "modelType": "deformable_detr",
        "revision": DOCLAYNET_REVISION,
        "sourceFiles": DOCLAYNET_SOURCE_SHA256,
        "targetMode": "count-conditioned",
    },
    "deformable-detr-doclaynet-ola": {
        "activation": "sigmoid",
        "architecture": "aryn-deformable-detr-doclaynet-ola-layout-v1",
        "labels": OLA_LABELS,
        "metricMode": "ola",
        "modelType": "deformable_detr",
        "revision": DOCLAYNET_REVISION,
        "sourceFiles": DOCLAYNET_SOURCE_SHA256,
        "targetMode": "ola",
    },
}


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_source_model(root: Path, expected: dict[str, str] = SOURCE_SHA256) -> dict[str, str]:
    actual = {name: sha256(root / name) for name in expected if (root / name).is_file()}
    if actual != expected:
        raise ValueError("source model artifact hash mismatch")
    return actual


def model_profile(architecture: str) -> dict[str, object]:
    try:
        return MODEL_PROFILES[architecture]
    except KeyError as error:
        raise ValueError(f"unsupported architecture: {architecture}") from error


def cloned_state_dict(model: torch.nn.Module) -> dict[str, torch.Tensor]:
    return {name: value.detach().cpu().contiguous().clone() for name, value in model.state_dict().items()}


def sampling_weights(pages: list[dict[str, object]], *, rare_multiplier: int) -> list[float]:
    if rare_multiplier < 1:
        raise ValueError("rare multiplier must be positive")
    return [float(rare_multiplier if 1 in page["staffCounts"] else 1) for page in pages]


class LayoutDetrDataset(Dataset[tuple[Image.Image, dict[str, object]]]):
    def __init__(self, root: Path, pages: list[dict[str, object]], *, target_mode: str) -> None:
        self.root = root.resolve()
        self.pages = pages
        self.target_builder = {
            "count-conditioned": build_detr_coco_annotation,
            "ola": build_ola_detr_coco_annotation,
        }[target_mode]

    def __len__(self) -> int:
        return len(self.pages)

    def load(self, index: int) -> tuple[Image.Image, dict[str, object], dict[str, object]]:
        page = self.pages[index]
        image_path = (self.root / page["imagePath"]).resolve()
        annotation_path = image_path.with_suffix(".json")
        if (
            not image_path.is_relative_to(self.root)
            or not annotation_path.is_relative_to(self.root)
            or not image_path.is_file()
            or not annotation_path.is_file()
        ):
            raise ValueError(f"page artifact is missing or escapes dataset root: {image_path}")
        with Image.open(image_path) as source:
            image = source.convert("RGB")
        annotation = json.loads(annotation_path.read_bytes())
        return image, self.target_builder(annotation, image_id=index, image_size=image.size), annotation

    def __getitem__(self, index: int) -> tuple[Image.Image, dict[str, object]]:
        image, target, _ = self.load(index)
        return image, target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--slice", type=Path, required=True)
    parser.add_argument("--source-model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--architecture", choices=tuple(MODEL_PROFILES), default="detr")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--backbone-learning-rate", type=float, default=1e-5)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--rare-multiplier", type=int, default=4)
    parser.add_argument("--shortest-edge", type=int, default=512)
    parser.add_argument("--longest-edge", type=int, default=768)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=20260904)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    if args.epochs < 1 or args.batch_size < 1 or args.shortest_edge < 1 or args.longest_edge < args.shortest_edge:
        raise ValueError("training dimensions and counts are invalid")
    profile = model_profile(args.architecture)
    labels = profile["labels"]
    source_files = validate_source_model(args.source_model, profile["sourceFiles"])

    from transformers import (
        DeformableDetrConfig,
        DeformableDetrForObjectDetection,
        DeformableDetrImageProcessor,
        DetrConfig,
        DetrForObjectDetection,
        DetrImageProcessor,
    )

    if profile["modelType"] == "detr":
        config_class, model_class, processor_class = DetrConfig, DetrForObjectDetection, DetrImageProcessor
    else:
        config_class = DeformableDetrConfig
        model_class = DeformableDetrForObjectDetection
        processor_class = DeformableDetrImageProcessor

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    slice_bytes = args.slice.read_bytes()
    plan = json.loads(slice_bytes)
    train = LayoutDetrDataset(args.dataset_root, plan["train"], target_mode=profile["targetMode"])
    validation = LayoutDetrDataset(args.dataset_root, plan["validation"], target_mode=profile["targetMode"])
    generator = torch.Generator().manual_seed(args.seed)
    sampler = WeightedRandomSampler(
        sampling_weights(plan["train"], rare_multiplier=args.rare_multiplier),
        num_samples=len(train),
        replacement=True,
        generator=generator,
    )

    processor = processor_class.from_pretrained(args.source_model, local_files_only=True)
    processor.size = {"shortest_edge": args.shortest_edge, "longest_edge": args.longest_edge}

    def collate(batch: list[tuple[Image.Image, dict[str, object]]]) -> tuple[dict[str, object], list[dict[str, torch.Tensor]]]:
        images, targets = zip(*batch, strict=True)
        encoded = processor(images=list(images), annotations=list(targets), return_tensors="pt")
        return {"pixel_values": encoded["pixel_values"], "pixel_mask": encoded["pixel_mask"]}, encoded["labels"]

    loader = DataLoader(train, batch_size=args.batch_size, sampler=sampler, collate_fn=collate, num_workers=0)
    config = config_class.from_pretrained(args.source_model, local_files_only=True)
    config.use_pretrained_backbone = False
    config.num_labels = len(labels)
    config.id2label = dict(enumerate(labels))
    config.label2id = {label: index for index, label in enumerate(labels)}
    model = model_class.from_pretrained(
        args.source_model,
        config=config,
        local_files_only=True,
        ignore_mismatched_sizes=True,
    )
    device = choose_device(args.device)
    model = model.to(device)
    parameter_groups = [
        {
            "params": [parameter for name, parameter in model.named_parameters() if "backbone" not in name],
            "lr": args.learning_rate,
        },
        {
            "params": [parameter for name, parameter in model.named_parameters() if "backbone" in name],
            "lr": args.backbone_learning_rate,
        },
    ]
    optimizer = torch.optim.AdamW(parameter_groups, weight_decay=args.weight_decay)
    history = []
    for epoch in range(args.epochs):
        model.train()
        losses = []
        for inputs, batch_labels in loader:
            optimizer.zero_grad(set_to_none=True)
            batch_labels = [{name: value.to(device) for name, value in item.items()} for item in batch_labels]
            output = model(
                pixel_values=inputs["pixel_values"].to(device),
                pixel_mask=inputs["pixel_mask"].to(device),
                labels=batch_labels,
            )
            output.loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.1)
            optimizer.step()
            losses.append(float(output.loss.detach().cpu()))
        record = {"epoch": epoch + 1, "trainLoss": sum(losses) / len(losses)}
        history.append(record)
        print(json.dumps(record, sort_keys=True), flush=True)

    model.eval()
    page_results = []
    raw_predictions = []
    with torch.no_grad():
        for index in range(len(validation)):
            image, _, annotation = validation.load(index)
            encoded = processor(images=image, return_tensors="pt")
            output = model(
                pixel_values=encoded["pixel_values"].to(device),
                pixel_mask=encoded["pixel_mask"].to(device),
            )
            predictions = decode_predictions(
                output.logits[0].cpu().numpy(),
                output.pred_boxes[0].cpu().numpy(),
                threshold=SCORE_THRESHOLD,
                activation=profile["activation"],
                class_count=len(labels),
            )
            page_result = (
                evaluate_ola_page(predictions, annotation)
                if profile["metricMode"] == "ola"
                else evaluate_page(predictions, annotation)
            )
            page_results.append(page_result)
            raw_predictions.append(
                {
                    "pageIndex": plan["validation"][index]["pageIndex"],
                    "predictions": predictions,
                    "scoreId": plan["validation"][index]["scoreId"],
                }
            )
    metrics = summarize_ola_pages(page_results) if profile["metricMode"] == "ola" else summarize_pages(page_results)
    metrics["gatePassed"] = metrics["macroClassExact"] >= 0.9 and min(metrics["classExact"]) >= 0.85

    args.output.mkdir(parents=True)
    model_dir = args.output / "model"
    model.save_pretrained(model_dir, state_dict=cloned_state_dict(model), safe_serialization=True)
    processor.save_pretrained(model_dir)
    raw_bytes = canonical_json(raw_predictions)
    (args.output / "validation-predictions.json").write_bytes(raw_bytes)
    summary = {
        "architecture": profile["architecture"],
        "backboneLearningRate": args.backbone_learning_rate,
        "batchSize": args.batch_size,
        "datasetManifestSha256": sha256(args.dataset_root / "manifest.json"),
        "device": str(device),
        "epochs": args.epochs,
        "history": history,
        "imageSize": {"longestEdge": args.longest_edge, "shortestEdge": args.shortest_edge},
        "labels": list(labels),
        "learningRate": args.learning_rate,
        "metrics": metrics,
        "modelRevision": profile["revision"],
        "modelSha256": sha256(model_dir / "model.safetensors"),
        "packageVersions": {
            name: importlib.metadata.version(name)
            for name in ("pillow", "scipy", "timm", "torch", "torchvision", "transformers")
        },
        "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
        "rareMultiplier": args.rare_multiplier,
        "scoreThreshold": SCORE_THRESHOLD,
        "seed": args.seed,
        "sliceSha256": hashlib.sha256(slice_bytes).hexdigest(),
        "sourceFiles": source_files,
        "targetMode": profile["targetMode"],
        "trainPageCount": len(train),
        "validationPageCount": len(validation),
        "validationPredictionsSha256": hashlib.sha256(raw_bytes).hexdigest(),
        "weightDecay": args.weight_decay,
    }
    (args.output / "summary.json").write_bytes(canonical_json(summary))
    print(json.dumps(metrics, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
