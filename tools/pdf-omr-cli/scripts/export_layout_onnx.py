#!/usr/bin/env python3
"""Export the fixed compact multi-head layout research candidate to ONNX."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import onnx
import torch

from train_layout_segmenter import ARCHITECTURE, MODEL_SIZE, build_model


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError(f"output already exists: {args.output}")
    checkpoint_bytes = args.checkpoint.read_bytes()
    model = build_model(ARCHITECTURE)
    model.load_state_dict(torch.load(args.checkpoint, map_location="cpu", weights_only=True))
    model.eval()
    torch.onnx.export(
        model,
        torch.zeros((1, 1, MODEL_SIZE[1], MODEL_SIZE[0])),
        args.output,
        input_names=["page"],
        output_names=["staff_line_logits", "system_band_logits"],
        opset_version=17,
        dynamo=False,
    )
    document = onnx.load(args.output)
    onnx.helper.set_model_props(
        document,
        {"architecture": ARCHITECTURE, "sourceCheckpointSha256": hashlib.sha256(checkpoint_bytes).hexdigest()},
    )
    onnx.checker.check_model(document)
    onnx.save(document, args.output)
    print(hashlib.sha256(args.output.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
