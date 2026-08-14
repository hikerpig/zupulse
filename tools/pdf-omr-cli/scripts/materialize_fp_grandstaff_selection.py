#!/usr/bin/env python3
"""Materialize selected FP-GrandStaff rows into PDF, Kern evidence, and MusicXML."""

from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import io
import json
import tempfile
from pathlib import Path
from typing import Any, Callable


ImageLoader = Callable[[str, int], bytes]
ImageDecoder = Callable[[bytes], tuple[int, int, bytes]]
KernConverter = Callable[[str], bytes]


def materialize(
    inventory: dict[str, Any],
    selection: dict[str, Any],
    output_root: Path,
    *,
    load_image: ImageLoader,
    decode_image: ImageDecoder,
    convert_kern: KernConverter,
) -> dict[str, Any]:
    selected_ids = _selected_ids(selection)
    by_id = {entry["item"]["id"]: entry for entry in inventory["fullPages"]}
    missing = sorted(selected_ids - by_id.keys())
    if missing:
        raise ValueError(f"selected FP-GrandStaff item is missing from inventory: {missing[0]}")
    pdf_module = _load_pdf_module()
    materialized = []
    for item_id in sorted(selected_ids):
        source_entry = by_id[item_id]
        entry = copy.deepcopy(source_entry)
        source_split = entry["item"]["provenance"]["sourceSplit"]
        row_index = entry["source"]["rowIndex"]
        image_bytes = load_image(source_split, row_index)
        if sha256(image_bytes) != entry["source"]["imageSha256"]:
            raise ValueError(f"source image hash mismatch: {item_id}")
        transcription = entry["source"]["transcription"]
        if sha256(transcription.encode("utf-8")) != entry["source"]["transcriptionSha256"]:
            raise ValueError(f"source transcription hash mismatch: {item_id}")
        kern = ekern_to_kern(transcription)
        musicxml = convert_kern(kern)
        if not musicxml.strip():
            raise ValueError(f"Kern converter produced empty MusicXML: {item_id}")
        width, height, pixels = decode_image(image_bytes)
        pdf = pdf_module.build_pdf([(width, height, pixels)])
        entry["item"]["input"]["sha256"] = sha256(pdf)
        entry["item"]["groundTruth"]["sha256"] = sha256(musicxml)
        input_output = output_root / entry["item"]["input"]["path"]
        ground_truth_output = output_root / entry["item"]["groundTruth"]["path"]
        kern_output = ground_truth_output.with_name("truth.krn")
        for path in (input_output, ground_truth_output, kern_output):
            if path.exists():
                raise ValueError(f"materialized asset already exists: {path}")
            path.parent.mkdir(parents=True, exist_ok=True)
        input_output.write_bytes(pdf)
        ground_truth_output.write_bytes(musicxml)
        kern_output.write_text(kern, encoding="utf-8")
        materialized.append(entry)
    return {
        "schemaVersion": "1.0.0",
        "release": inventory["release"],
        "fullPages": materialized,
    }


def ekern_to_kern(transcription: str) -> str:
    if not transcription.startswith("**ekern"):
        raise ValueError("FP-GrandStaff transcription is not eKern")
    return transcription.replace("**ekern", "**kern").replace("@", "").replace("·", "")


def decode_image(image_bytes: bytes) -> tuple[int, int, bytes]:
    try:
        from PIL import Image
    except ImportError as error:
        raise SystemExit("Pillow is required; run with `uv run --with pillow`") from error
    with Image.open(io.BytesIO(image_bytes)) as image:
        grayscale = image.convert("L")
        return grayscale.width, grayscale.height, grayscale.tobytes()


def convert_kern(kern: str) -> bytes:
    try:
        import converter21
        from music21 import converter
    except ImportError as error:
        raise SystemExit("converter21 is required; run with `uv run --with converter21`") from error
    converter21.register()
    score = converter.parseData(kern, format="humdrum")
    with tempfile.TemporaryDirectory() as temporary:
        output = Path(temporary) / "truth.musicxml"
        score.write("musicxml", fp=output)
        return output.read_bytes()


def load_parquet_images(paths: dict[str, Path]) -> ImageLoader:
    try:
        import pyarrow.parquet as parquet
    except ImportError as error:
        raise SystemExit("pyarrow is required; run with `uv run --with pyarrow`") from error
    tables = {split: parquet.read_table(path, columns=["image"]) for split, path in paths.items()}

    def load(source_split: str, row_index: int) -> bytes:
        return tables[source_split]["image"][row_index].as_py()["bytes"]

    return load


def _selected_ids(selection: dict[str, Any]) -> set[str]:
    profiles = selection.get("profiles", {})
    selected = {
        item["itemId"]
        for profile_name in ("standard-development", "standard-holdout")
        for item in profiles.get(profile_name, {}).get("items", [])
    }
    if not selected:
        raise ValueError("FP-GrandStaff selection contains no standard items")
    return selected


def _load_pdf_module() -> Any:
    path = Path(__file__).with_name("build-olimpic-scanned-corpus.py")
    spec = importlib.util.spec_from_file_location("build_olimpic_scanned_corpus", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"cannot load deterministic PDF builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--val-parquet", type=Path, required=True)
    parser.add_argument("--test-parquet", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-inventory", type=Path, required=True)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    expected_hashes = selection["release"]["splitArtifactSha256"]
    for split, path in (("val", args.val_parquet), ("test", args.test_parquet)):
        if sha256(path.read_bytes()) != expected_hashes[split]:
            raise SystemExit(f"FP-GrandStaff parquet hash mismatch: {path}")
    result = materialize(
        inventory,
        selection,
        args.output_root,
        load_image=load_parquet_images({"val": args.val_parquet, "test": args.test_parquet}),
        decode_image=decode_image,
        convert_kern=convert_kern,
    )
    args.output_inventory.parent.mkdir(parents=True, exist_ok=True)
    args.output_inventory.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
