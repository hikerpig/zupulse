#!/usr/bin/env python3
"""Train one compact row-energy layout topology candidate."""

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

from layout_topology_targets import build_center_energy_targets
from train_staff_line_segmenter import ConvBlock, choose_device


ARCHITECTURE = "compact-layout-row-energy-v1"
MODEL_SIZE = (512, 768)
SYSTEM_SIGMA = 6
STAFF_SIGMA = 2


class CompactLayoutRowEnergyNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.encoder1 = ConvBlock(1, 8)
        self.encoder2 = ConvBlock(8, 12)
        self.encoder3 = ConvBlock(12, 16)
        self.center = ConvBlock(16, 24)
        self.decoder3 = ConvBlock(40, 16)
        self.decoder2 = ConvBlock(28, 12)
        self.decoder1 = ConvBlock(20, 8)
        self.row_head = nn.Conv1d(8, 4, 1)
        self.pool = nn.MaxPool2d(2)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        level1 = self.encoder1(value)
        level2 = self.encoder2(self.pool(level1))
        level3 = self.encoder3(self.pool(level2))
        center = self.center(self.pool(level3))
        up3 = nn.functional.interpolate(center, size=level3.shape[-2:], mode="bilinear", align_corners=False)
        decoded3 = self.decoder3(torch.cat((up3, level3), dim=1))
        up2 = nn.functional.interpolate(decoded3, size=level2.shape[-2:], mode="bilinear", align_corners=False)
        decoded2 = self.decoder2(torch.cat((up2, level2), dim=1))
        up1 = nn.functional.interpolate(decoded2, size=level1.shape[-2:], mode="bilinear", align_corners=False)
        decoded1 = self.decoder1(torch.cat((up1, level1), dim=1))
        return self.row_head(decoded1.mean(dim=3))


def build_model(architecture: str) -> nn.Module:
    if architecture == ARCHITECTURE:
        return CompactLayoutRowEnergyNet()
    raise ValueError(f"unsupported architecture: {architecture}")


def initialize_from_two_head_state(model: CompactLayoutRowEnergyNet, source: dict[str, torch.Tensor]) -> None:
    target = model.state_dict()
    for name, value in target.items():
        if name.startswith("row_head."):
            continue
        source_value = source.get(name)
        if source_value is None or source_value.shape != value.shape:
            raise ValueError(f"initial checkpoint backbone is incompatible: {name}")
        target[name] = source_value
    source_weight = source.get("row_head.weight")
    source_bias = source.get("row_head.bias")
    if source_weight is None or source_weight.shape != (2, 8, 1) or source_bias is None or source_bias.shape != (2,):
        raise ValueError("initial checkpoint must contain two row-energy heads")
    target["row_head.weight"] = torch.cat((source_weight[0:1].repeat(3, 1, 1), source_weight[1:2]))
    target["row_head.bias"] = torch.cat((source_bias[0:1].repeat(3), source_bias[1:2]))
    model.load_state_dict(target)


class LayoutTopologyDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(
        self,
        root: Path,
        pages: list[dict[str, object]],
        size: tuple[int, int],
        *,
        allow_incompatible: bool,
    ) -> None:
        self.root = root
        self.size = size
        self.pages: list[dict[str, object]] = []
        self.targets: list[np.ndarray] = []
        self.excluded_pages: list[dict[str, object]] = []
        for page in pages:
            image_path = Path(page["imagePath"])
            annotation = json.loads((root / image_path.with_suffix(".json")).read_bytes())
            try:
                targets = build_center_energy_targets(
                    annotation,
                    height=size[1],
                    system_sigma=SYSTEM_SIGMA,
                    staff_sigma=STAFF_SIGMA,
                )
            except ValueError as error:
                exclusion = {
                    "scoreId": page["scoreId"],
                    "pageIndex": page["pageIndex"],
                    "reason": str(error),
                }
                if not allow_incompatible:
                    raise ValueError(f"validation page is incompatible: {exclusion}") from error
                self.excluded_pages.append(exclusion)
                continue
            self.pages.append(page)
            self.targets.append(np.concatenate((targets["systemEnergyByStaffCount"], targets["staffEnergy"][None])))

    def __len__(self) -> int:
        return len(self.pages)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        page = self.pages[index]
        with Image.open(self.root / page["imagePath"]) as source:
            image = source.convert("L").resize(self.size, Image.Resampling.BILINEAR)
        image_array = 1 - np.asarray(image, dtype=np.float32) / 255
        return torch.from_numpy(image_array[None]), torch.from_numpy(self.targets[index])


def _dice(prediction: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    prediction = (prediction.sigmoid() >= 0.5).float()
    target = (target >= 0.5).float()
    intersection = (prediction * target).sum(dim=1)
    return ((2 * intersection + 1e-6) / (prediction.sum(dim=1) + target.sum(dim=1) + 1e-6)).mean()


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--slice", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--architecture", choices=(ARCHITECTURE,), default=ARCHITECTURE)
    parser.add_argument("--initial-checkpoint", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=20260904)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    slice_bytes = args.slice.read_bytes()
    plan = json.loads(slice_bytes)
    train = LayoutTopologyDataset(
        args.dataset_root,
        plan["train"],
        MODEL_SIZE,
        allow_incompatible=True,
    )
    validation = LayoutTopologyDataset(
        args.dataset_root,
        plan["validation"],
        MODEL_SIZE,
        allow_incompatible=False,
    )
    generator = torch.Generator().manual_seed(args.seed)
    train_loader = DataLoader(train, batch_size=args.batch_size, shuffle=True, generator=generator)
    validation_loader = DataLoader(validation, batch_size=args.batch_size)
    device = choose_device(args.device)
    model = build_model(args.architecture)
    initialize_from_two_head_state(
        model,
        torch.load(args.initial_checkpoint, map_location="cpu", weights_only=True),
    )
    model = model.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    target_sum = np.stack(train.targets).sum(axis=(0, 2))
    element_count = len(train) * MODEL_SIZE[1]
    positive_weight_values = np.minimum((element_count - target_sum) / target_sum, 30).astype(np.float32)
    positive_weight = torch.from_numpy(positive_weight_values).reshape(1, 4, 1).to(device)
    history = []
    for epoch in range(args.epochs):
        model.train()
        losses = []
        for image, target in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(image.to(device))
            loss = nn.functional.binary_cross_entropy_with_logits(
                logits,
                target.to(device),
                pos_weight=positive_weight,
            )
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        model.eval()
        system_dice = [[], [], []]
        staff_dice = []
        with torch.no_grad():
            for image, target in validation_loader:
                logits = model(image.to(device))
                target = target.to(device)
                for index in range(3):
                    system_dice[index].append(float(_dice(logits[:, index], target[:, index]).cpu()))
                staff_dice.append(float(_dice(logits[:, 3], target[:, 3]).cpu()))
        record = {
            "epoch": epoch + 1,
            "trainLoss": sum(losses) / len(losses),
            "systemCenterValidationDiceByStaffCount": {
                str(index + 1): sum(scores) / len(scores) for index, scores in enumerate(system_dice)
            },
            "staffCenterValidationDice": sum(staff_dice) / len(staff_dice),
        }
        history.append(record)
        print(json.dumps(record, sort_keys=True), flush=True)

    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    args.output.mkdir(parents=True)
    checkpoint = args.output / "model.pt"
    torch.save(model.state_dict(), checkpoint)
    dataset_manifest = args.dataset_root / "manifest.json"
    summary = {
        "architecture": args.architecture,
        "initialCheckpointSha256": hashlib.sha256(args.initial_checkpoint.read_bytes()).hexdigest(),
        "datasetManifestSha256": hashlib.sha256(dataset_manifest.read_bytes()).hexdigest(),
        "sliceSha256": hashlib.sha256(slice_bytes).hexdigest(),
        "device": str(device),
        "epochs": args.epochs,
        "learningRate": args.learning_rate,
        "history": history,
        "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
        "seed": args.seed,
        "trainPageCount": len(train),
        "validationPageCount": len(validation),
        "excludedTrainPages": train.excluded_pages,
        "positiveWeightByChannel": {
            "systemStaffCount1": float(positive_weight_values[0]),
            "systemStaffCount2": float(positive_weight_values[1]),
            "systemStaffCount3": float(positive_weight_values[2]),
            "staffCenter": float(positive_weight_values[3]),
        },
        "checkpointSha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
    }
    (args.output / "summary.json").write_bytes(canonical_json(summary))


if __name__ == "__main__":
    main()
