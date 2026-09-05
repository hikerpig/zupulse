#!/usr/bin/env python3
"""Train one compact multi-head staff-line and system-band research candidate."""

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

from build_openscore_layout_dataset import (
    SystemBandGapError,
    apply_scan_domain_degradation,
    augmentation_seed,
    draw_system_band_mask,
    system_band_rectangles,
)
from train_staff_line_segmenter import ConvBlock, choose_device, dice_score


ARCHITECTURE = "compact-layout-unet-v1"
MODEL_SIZE = (512, 768)


class CompactLayoutUNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.encoder1 = ConvBlock(1, 8)
        self.encoder2 = ConvBlock(8, 12)
        self.encoder3 = ConvBlock(12, 16)
        self.center = ConvBlock(16, 24)
        self.decoder3 = ConvBlock(40, 16)
        self.decoder2 = ConvBlock(28, 12)
        self.decoder1 = ConvBlock(20, 8)
        self.staff_head = nn.Conv2d(8, 1, 1)
        self.system_head = nn.Conv2d(8, 1, 1)
        self.pool = nn.MaxPool2d(2)

    def forward(self, value: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
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
        return self.staff_head(decoded1), self.system_head(decoded1)


def build_model(architecture: str) -> nn.Module:
    if architecture == ARCHITECTURE:
        return CompactLayoutUNet()
    raise ValueError(f"unsupported architecture: {architecture}")


def pages_with_training_artifacts(
    root: Path, pages: list[dict[str, object]]
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    kept = []
    missing = []
    for page in pages:
        image_path = root / page["imagePath"]
        mask_path = root / page["maskPath"]
        annotation_path = image_path.with_suffix(".json")
        if image_path.is_file() and mask_path.is_file() and annotation_path.is_file():
            kept.append(page)
            continue
        missing.append(
            {
                "imagePath": page["imagePath"],
                "pageIndex": page["pageIndex"],
                "scoreId": page["scoreId"],
            }
        )
    return kept, missing


def pages_compatible_with_system_gap(
    root: Path,
    pages: list[dict[str, object]],
    size: tuple[int, int],
    *,
    minimum_inter_system_gap_px: int,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    kept = []
    excluded = []
    for page in pages:
        annotation = json.loads((root / page["imagePath"]).with_suffix(".json").read_bytes())
        try:
            system_band_rectangles(
                annotation, size, minimum_inter_system_gap_px=minimum_inter_system_gap_px
            )
        except SystemBandGapError:
            excluded.append(
                {
                    "imagePath": page["imagePath"],
                    "pageIndex": page["pageIndex"],
                    "scoreId": page["scoreId"],
                }
            )
            continue
        kept.append(page)
    return kept, excluded


class LayoutDataset(Dataset[tuple[torch.Tensor, torch.Tensor, torch.Tensor]]):
    def __init__(
        self,
        root: Path,
        pages: list[dict[str, object]],
        size: tuple[int, int],
        *,
        minimum_inter_system_gap_px: int = 0,
        scan_domain_seed: int | None = None,
    ) -> None:
        self.root = root
        self.pages = pages
        self.size = size
        self.minimum_inter_system_gap_px = minimum_inter_system_gap_px
        self.scan_domain_seed = scan_domain_seed

    def __len__(self) -> int:
        return len(self.pages)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        page = self.pages[index]
        image_path = Path(page["imagePath"])
        with Image.open(self.root / image_path) as source:
            image = source.convert("L").resize(self.size, Image.Resampling.BILINEAR)
        if self.scan_domain_seed is not None:
            image = apply_scan_domain_degradation(
                image, seed=augmentation_seed(self.scan_domain_seed, page["scoreId"], page["pageIndex"])
            )
        with Image.open(self.root / page["maskPath"]) as source:
            staff_mask = source.convert("L").resize(self.size, Image.Resampling.NEAREST)
        annotation = json.loads((self.root / image_path.with_suffix(".json")).read_bytes())
        system_mask = draw_system_band_mask(
            annotation, self.size, minimum_inter_system_gap_px=self.minimum_inter_system_gap_px
        )
        image_array = 1.0 - np.asarray(image, dtype=np.float32) / 255.0
        staff_array = (np.asarray(staff_mask, dtype=np.uint8) > 0).astype(np.float32)
        system_array = (np.asarray(system_mask, dtype=np.uint8) > 0).astype(np.float32)
        return (
            torch.from_numpy(image_array[None]),
            torch.from_numpy(staff_array[None]),
            torch.from_numpy(system_array[None]),
        )


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--slice", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--architecture", choices=(ARCHITECTURE,), default=ARCHITECTURE)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--max-train-pages", type=int)
    parser.add_argument("--max-validation-pages", type=int)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--seed", type=int, default=20260904)
    parser.add_argument("--minimum-inter-system-gap-px", type=int, default=0)
    parser.add_argument("--scan-domain-degradation", action="store_true")
    parser.add_argument("--scan-domain-seed", type=int, default=20260905)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    slice_bytes = args.slice.read_bytes()
    plan = json.loads(slice_bytes)
    train_pages = plan["train"][: args.max_train_pages]
    validation_pages = plan["validation"][: args.max_validation_pages]
    train_pages, missing_train = pages_with_training_artifacts(args.dataset_root, train_pages)
    validation_pages, missing_validation = pages_with_training_artifacts(args.dataset_root, validation_pages)
    train_pages, excluded_train = pages_compatible_with_system_gap(
        args.dataset_root,
        train_pages,
        MODEL_SIZE,
        minimum_inter_system_gap_px=args.minimum_inter_system_gap_px,
    )
    validation_pages, excluded_validation = pages_compatible_with_system_gap(
        args.dataset_root,
        validation_pages,
        MODEL_SIZE,
        minimum_inter_system_gap_px=args.minimum_inter_system_gap_px,
    )
    train = LayoutDataset(
        args.dataset_root,
        train_pages,
        MODEL_SIZE,
        minimum_inter_system_gap_px=args.minimum_inter_system_gap_px,
        scan_domain_seed=args.scan_domain_seed if args.scan_domain_degradation else None,
    )
    validation = LayoutDataset(
        args.dataset_root,
        validation_pages,
        MODEL_SIZE,
        minimum_inter_system_gap_px=args.minimum_inter_system_gap_px,
    )
    generator = torch.Generator().manual_seed(args.seed)
    train_loader = DataLoader(train, batch_size=args.batch_size, shuffle=True, generator=generator)
    validation_loader = DataLoader(validation, batch_size=args.batch_size)
    device = choose_device(args.device)
    model = build_model(args.architecture).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    staff_criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([20.0], device=device))
    system_criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([2.0], device=device))
    history = []
    for epoch in range(args.epochs):
        model.train()
        losses = []
        for image, staff_mask, system_mask in train_loader:
            optimizer.zero_grad(set_to_none=True)
            staff_logits, system_logits = model(image.to(device))
            loss = staff_criterion(staff_logits, staff_mask.to(device)) + system_criterion(
                system_logits, system_mask.to(device)
            )
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().cpu()))
        model.eval()
        staff_scores = []
        system_scores = []
        with torch.no_grad():
            for image, staff_mask, system_mask in validation_loader:
                staff_logits, system_logits = model(image.to(device))
                staff_scores.append(float(dice_score(staff_logits, staff_mask.to(device)).cpu()))
                system_scores.append(float(dice_score(system_logits, system_mask.to(device)).cpu()))
        record = {
            "epoch": epoch + 1,
            "trainLoss": sum(losses) / len(losses),
            "staffLineValidationDice": sum(staff_scores) / len(staff_scores),
            "systemBandValidationDice": sum(system_scores) / len(system_scores),
        }
        history.append(record)
        print(json.dumps(record, sort_keys=True), flush=True)

    args.output.mkdir(parents=True, exist_ok=False)
    checkpoint = args.output / "model.pt"
    torch.save(model.state_dict(), checkpoint)
    dataset_manifest = args.dataset_root / "manifest.json"
    summary = {
        "architecture": args.architecture,
        "datasetManifestSha256": hashlib.sha256(dataset_manifest.read_bytes()).hexdigest(),
        "device": str(device),
        "epochs": args.epochs,
        "history": history,
        "parameterCount": sum(parameter.numel() for parameter in model.parameters()),
        "seed": args.seed,
        "sliceSha256": hashlib.sha256(slice_bytes).hexdigest(),
        "trainPageCount": len(train),
        "validationPageCount": len(validation),
        "checkpointSha256": hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
        "minimumInterSystemGapPx": args.minimum_inter_system_gap_px,
        "scanDomainDegradation": args.scan_domain_degradation,
        "scanDomainSeed": args.scan_domain_seed if args.scan_domain_degradation else None,
        "excludedTrain": excluded_train,
        "excludedValidation": excluded_validation,
        "missingTrain": missing_train,
        "missingValidation": missing_validation,
    }
    (args.output / "summary.json").write_bytes(canonical_json(summary))


if __name__ == "__main__":
    main()
