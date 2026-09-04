#!/usr/bin/env python3
"""Train the single compact staff-line segmentation research candidate."""

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


class ConvBlock(nn.Module):
    def __init__(self, input_channels: int, output_channels: int) -> None:
        super().__init__()
        self.layers = nn.Sequential(
            nn.Conv2d(input_channels, output_channels, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(output_channels, output_channels, 3, padding=1),
            nn.ReLU(inplace=True),
        )

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        return self.layers(value)


class TinyStaffLineUNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.encoder1 = ConvBlock(1, 8)
        self.encoder2 = ConvBlock(8, 16)
        self.bottleneck = ConvBlock(16, 32)
        self.decoder2 = ConvBlock(48, 16)
        self.decoder1 = ConvBlock(24, 8)
        self.head = nn.Conv2d(8, 1, 1)
        self.pool = nn.MaxPool2d(2)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        level1 = self.encoder1(value)
        level2 = self.encoder2(self.pool(level1))
        center = self.bottleneck(self.pool(level2))
        up2 = nn.functional.interpolate(center, size=level2.shape[-2:], mode="bilinear", align_corners=False)
        decoded2 = self.decoder2(torch.cat((up2, level2), dim=1))
        up1 = nn.functional.interpolate(decoded2, size=level1.shape[-2:], mode="bilinear", align_corners=False)
        return self.head(self.decoder1(torch.cat((up1, level1), dim=1)))


class CompactStaffLineCNN(nn.Module):
    """Full-resolution context without pooling away 3–5 px staff spacing."""

    def __init__(self) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        input_channels = 1
        for dilation in (1, 2, 4, 8):
            layers.extend(
                [
                    nn.Conv2d(input_channels, 8, 3, padding=dilation, dilation=dilation),
                    nn.ReLU(inplace=True),
                ]
            )
            input_channels = 8
        layers.append(nn.Conv2d(8, 1, 1))
        self.layers = nn.Sequential(*layers)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        return self.layers(value)


def build_model(architecture: str) -> nn.Module:
    if architecture == "tiny-staff-line-unet-v1":
        return TinyStaffLineUNet()
    if architecture == "compact-dilated-staff-line-cnn-v2":
        return CompactStaffLineCNN()
    raise ValueError(f"unsupported architecture: {architecture}")


class StaffLineDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    def __init__(self, root: Path, pages: list[dict[str, object]], size: tuple[int, int]) -> None:
        self.root = root
        self.pages = pages
        self.size = size

    def __len__(self) -> int:
        return len(self.pages)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        page = self.pages[index]
        with Image.open(self.root / page["imagePath"]) as source:
            image = source.convert("L").resize(self.size, Image.Resampling.BILINEAR)
        with Image.open(self.root / page["maskPath"]) as source:
            mask = source.convert("L").resize(self.size, Image.Resampling.NEAREST)
        image_array = 1.0 - np.asarray(image, dtype=np.float32) / 255.0
        mask_array = (np.asarray(mask, dtype=np.uint8) > 0).astype(np.float32)
        return torch.from_numpy(image_array[None]), torch.from_numpy(mask_array[None])


def dice_score(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    prediction = logits.sigmoid() >= 0.5
    intersection = (prediction * target).sum()
    return (2 * intersection + 1) / (prediction.sum() + target.sum() + 1)


def choose_device(requested: str) -> torch.device:
    if requested == "auto":
        requested = "mps" if torch.backends.mps.is_available() else "cpu"
    device = torch.device(requested)
    if device.type == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS was requested but is unavailable")
    return device


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--slice", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--architecture",
        choices=("tiny-staff-line-unet-v1", "compact-dilated-staff-line-cnn-v2"),
        default="tiny-staff-line-unet-v1",
    )
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--max-train-pages", type=int)
    parser.add_argument("--max-validation-pages", type=int)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=20260901)
    args = parser.parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    slice_bytes = args.slice.read_bytes()
    plan = json.loads(slice_bytes)
    train_pages = plan["train"][: args.max_train_pages]
    validation_pages = plan["validation"][: args.max_validation_pages]
    size = (512, 768)
    train = StaffLineDataset(args.dataset_root, train_pages, size)
    validation = StaffLineDataset(args.dataset_root, validation_pages, size)
    generator = torch.Generator().manual_seed(args.seed)
    train_loader = DataLoader(train, batch_size=args.batch_size, shuffle=True, generator=generator)
    validation_loader = DataLoader(validation, batch_size=args.batch_size)
    device = choose_device(args.device)
    model = build_model(args.architecture).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([20.0], device=device))
    history = []
    for epoch in range(args.epochs):
        model.train()
        losses = []
        for image, mask in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(image.to(device))
            loss = criterion(logits, mask.to(device))
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        model.eval()
        scores = []
        with torch.no_grad():
            for image, mask in validation_loader:
                scores.append(float(dice_score(model(image.to(device)), mask.to(device)).cpu()))
        record = {"epoch": epoch + 1, "trainLoss": sum(losses) / len(losses), "validationDice": sum(scores) / len(scores)}
        history.append(record)
        print(json.dumps(record, sort_keys=True), flush=True)
    args.output.mkdir(parents=True, exist_ok=False)
    checkpoint = args.output / "model.pt"
    torch.save(model.state_dict(), checkpoint)
    summary = {
        "architecture": args.architecture,
        "device": str(device),
        "epochs": args.epochs,
        "history": history,
        "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
        "seed": args.seed,
        "sliceSha256": hashlib.sha256(slice_bytes).hexdigest(),
        "trainPageCount": len(train),
        "validationPageCount": len(validation),
        "checkpointSha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
    }
    (args.output / "summary.json").write_text(json.dumps(summary, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
