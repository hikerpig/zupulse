"""Pinned local runner for the LEGATO PDF OMR adapter."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def inspect_pdf(input_path: Path) -> None:
    import fitz

    with fitz.open(input_path) as document:
        print(json.dumps({"pageCount": len(document)}))


def render_pdf_pages(input_path: Path):
    import fitz
    from PIL import Image

    images = []
    with fitz.open(input_path) as document:
        for page in document:
            pixmap = page.get_pixmap(alpha=False)
            images.append(
                Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
            )
    if not images:
        raise ValueError("PDF has no pages")
    return images


def recognize(args: argparse.Namespace) -> None:
    import torch
    from transformers import AutoConfig, AutoProcessor, GenerationConfig

    sys.path.insert(0, str(args.repository))
    from image_utils import pad_to_portrait_letter
    from legato.models import LegatoModel

    config = AutoConfig.from_pretrained(args.model, local_files_only=True)
    config.encoder_pretrained_model_name_or_path = str(args.base_model)
    processor = AutoProcessor.from_pretrained(args.model, local_files_only=True)
    model = LegatoModel.from_pretrained(
        args.model,
        config=config,
        local_files_only=True,
        torch_dtype="auto",
    )
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    model = model.to(device)
    if device in {"cuda", "mps"}:
        model = model.half()

    generation = GenerationConfig(
        max_length=args.max_length,
        num_beams=args.num_beams,
        repetition_penalty=args.repetition_penalty,
    )
    args.page_output_directory.mkdir(parents=True, exist_ok=True)
    for page_number, page in enumerate(render_pdf_pages(args.input), start=1):
        image = pad_to_portrait_letter(page)
        inputs = processor(images=[image], truncation=True, return_tensors="pt").to(device)
        with torch.no_grad():
            output = model.generate(
                **inputs,
                generation_config=generation,
                use_model_defaults=False,
            )
        abc = processor.batch_decode(output, skip_special_tokens=True)[0].replace(
            "<|text|>", "text"
        )
        prefix = f"page-{page_number:03d}"
        (args.page_output_directory / f"{prefix}.abc").write_text(
            abc, encoding="utf-8"
        )
        converter = args.repository / "abc2xml.py"
        conversion = subprocess.run(
            [sys.executable, str(converter), "-"],
            input=abc.encode("utf-8"),
            capture_output=True,
            cwd=args.repository,
            timeout=30,
            check=False,
        )
        if conversion.returncode != 0 or not conversion.stdout:
            raise RuntimeError("ABC to MusicXML conversion failed")
        (args.page_output_directory / f"{prefix}.musicxml").write_bytes(
            conversion.stdout
        )
        del inputs, output
        if device == "mps":
            torch.mps.empty_cache()


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("--input", type=Path, required=True)
    run = commands.add_parser("recognize")
    run.add_argument("--input", type=Path, required=True)
    run.add_argument("--repository", type=Path, required=True)
    run.add_argument("--model", type=Path, required=True)
    run.add_argument("--base-model", type=Path, required=True)
    run.add_argument("--page-output-directory", type=Path, required=True)
    run.add_argument("--max-length", type=int, required=True)
    run.add_argument("--num-beams", type=int, required=True)
    run.add_argument("--repetition-penalty", type=float, required=True)
    return root


def main() -> None:
    args = parser().parse_args()
    if args.command == "inspect":
        inspect_pdf(args.input)
    else:
        recognize(args)


if __name__ == "__main__":
    main()
