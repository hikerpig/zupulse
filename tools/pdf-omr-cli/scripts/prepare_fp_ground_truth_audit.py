#!/usr/bin/env python3
"""Convert FP-GrandStaff eKern candidates to temporary MusicXML for readiness auditing."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any, Callable


def prepare(
    entries: list[dict[str, Any]],
    output_root: Path,
    convert_kern: Callable[[str], bytes],
) -> dict[str, Any]:
    prepared = []
    for entry in entries:
        item_id = entry["item"]["id"]
        output = output_root / f"{item_id}.musicxml"
        if output.exists():
            raise ValueError(f"FP audit ground truth already exists: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(convert_kern(_ekern_to_kern(entry["source"]["transcription"])))
        prepared.append({"item": {"id": item_id}, "source": {"groundTruthPath": output.name}})
    return {"schemaVersion": "1.0.0", "oracleSystems": prepared}


def _ekern_to_kern(transcription: str) -> str:
    module = _load_materializer()
    return module.ekern_to_kern(transcription)


def _load_materializer() -> Any:
    path = Path(__file__).with_name("materialize_fp_grandstaff_selection.py")
    spec = importlib.util.spec_from_file_location("materialize_fp_grandstaff_selection", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"cannot load FP-GrandStaff materializer: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-inventory", type=Path, required=True)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    materializer = _load_materializer()
    result = prepare(inventory["fullPages"], args.output_root, materializer.convert_kern)
    args.output_inventory.parent.mkdir(parents=True, exist_ok=True)
    args.output_inventory.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
