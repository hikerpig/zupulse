#!/usr/bin/env python3
"""Train one compact two-dimensional layout object-center candidate."""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset

from layout_object_targets import build_object_center_targets
from train_staff_line_segmenter import ConvBlock, choose_device


ARCHITECTURE = "compact-layout-object-center-stride4-v1"
MODEL_SIZE = (512, 768)
OUTPUT_SIZE = (128, 192)
SYSTEM_SIGMA = (3, 2)
STAFF_SIGMA = (3, 1)


class CompactLayoutObjectNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.encoder1 = ConvBlock(1, 8)
        self.encoder2 = ConvBlock(8, 12)
        self.encoder3 = ConvBlock(12, 16)
        self.center = ConvBlock(16, 24)
        self.decoder3 = ConvBlock(40, 16)
        self.object_head = nn.Conv2d(16, 4, 1)
        self.pool = nn.MaxPool2d(2)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        level1 = self.encoder1(value)
        level2 = self.encoder2(self.pool(level1))
        level3 = self.encoder3(self.pool(level2))
        center = self.center(self.pool(level3))
        up3 = nn.functional.interpolate(center, size=level3.shape[-2:], mode="bilinear", align_corners=False)
        decoded3 = self.decoder3(torch.cat((up3, level3), dim=1))
        return self.object_head(decoded3)


def build_model(architecture: str) -> nn.Module:
    if architecture == ARCHITECTURE:
        return CompactLayoutObjectNet()
    raise ValueError(f"unsupported architecture: {architecture}")


def initialize_backbone_from_band_state(model: CompactLayoutObjectNet, source: dict[str, torch.Tensor]) -> None:
    target = model.state_dict()
    for name, value in target.items():
        if name.startswith("object_head."):
            continue
        source_value = source.get(name)
        if source_value is None or source_value.shape != value.shape:
            raise ValueError(f"initial checkpoint backbone is incompatible: {name}")
        target[name] = source_value
    model.load_state_dict(target)
    nn.init.normal_(model.object_head.weight, std=0.001)
    nn.init.constant_(model.object_head.bias, -2.19)


def focal_heatmap_loss(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    probability = logits.sigmoid().clamp(1e-6, 1 - 1e-6)
    positive = target == 1
    negative = target < 1
    negative_weight = (1 - target) ** 4
    positive_loss = torch.log(probability) * (1 - probability) ** 2 * positive
    negative_loss = torch.log(1 - probability) * probability**2 * negative_weight * negative
    positive_count = positive.sum().clamp(min=1)
    return -(positive_loss.sum() + negative_loss.sum()) / positive_count


class LayoutObjectDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(self, root: Path, pages: list[dict[str, object]], size: tuple[int, int]) -> None:
        self.root = root
        self.pages = pages
        self.size = size

    def __len__(self) -> int:
        return len(self.pages)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        page = self.pages[index]
        image_path = Path(page["imagePath"])
        with Image.open(self.root / image_path) as source:
            image = source.convert("L").resize(self.size, Image.Resampling.BILINEAR)
        annotation = json.loads((self.root / image_path.with_suffix(".json")).read_bytes())
        target = build_object_center_targets(
            annotation,
            size=OUTPUT_SIZE,
            system_sigma=SYSTEM_SIGMA,
            staff_sigma=STAFF_SIGMA,
        )
        image_array = 1 - np.asarray(image, dtype=np.float32) / 255
        return torch.from_numpy(image_array[None]), torch.from_numpy(target)


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--slice", type=Path, required=True)
    parser.add_argument("--initial-checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--architecture", choices=(ARCHITECTURE,), default=ARCHITECTURE)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=20260904)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    slice_bytes = args.slice.read_bytes()
    plan = json.loads(slice_bytes)
    train = LayoutObjectDataset(args.dataset_root, plan["train"], MODEL_SIZE)
    validation = LayoutObjectDataset(args.dataset_root, plan["validation"], MODEL_SIZE)
    generator = torch.Generator().manual_seed(args.seed)
    train_loader = DataLoader(train, batch_size=args.batch_size, shuffle=True, generator=generator)
    validation_loader = DataLoader(validation, batch_size=args.batch_size)
    device = choose_device(args.device)
    model = build_model(args.architecture)
    initialize_backbone_from_band_state(
        model,
        torch.load(args.initial_checkpoint, map_location="cpu", weights_only=True),
    )
    model = model.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    history = []
    for epoch in range(args.epochs):
        model.train()
        train_losses = []
        for image, target in train_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = focal_heatmap_loss(model(image.to(device)), target.to(device))
            loss.backward()
            optimizer.step()
            train_losses.append(float(loss.detach().cpu()))
        model.eval()
        validation_losses = []
        with torch.no_grad():
            for image, target in validation_loader:
                validation_losses.append(
                    float(focal_heatmap_loss(model(image.to(device)), target.to(device)).cpu())
                )
        record = {
            "epoch": epoch + 1,
            "trainLoss": sum(train_losses) / len(train_losses),
            "validationLoss": sum(validation_losses) / len(validation_losses),
        }
        history.append(record)
        print(json.dumps(record, sort_keys=True), flush=True)

    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    args.output.mkdir(parents=True)
    checkpoint = args.output / "model.pt"
    torch.save(model.state_dict(), checkpoint)
    summary = {
        "architecture": args.architecture,
        "datasetManifestSha256": hashlib.sha256((args.dataset_root / "manifest.json").read_bytes()).hexdigest(),
        "sliceSha256": hashlib.sha256(slice_bytes).hexdigest(),
        "initialCheckpointSha256": hashlib.sha256(args.initial_checkpoint.read_bytes()).hexdigest(),
        "device": str(device),
        "epochs": args.epochs,
        "learningRate": args.learning_rate,
        "history": history,
        "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
        "seed": args.seed,
        "trainPageCount": len(train),
        "validationPageCount": len(validation),
        "checkpointSha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
    }
    (args.output / "summary.json").write_bytes(canonical_json(summary))


if __name__ == "__main__":
    main()
