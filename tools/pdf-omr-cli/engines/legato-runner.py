"""Pinned local runner for the LEGATO PDF OMR adapter."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path


UNIT_LENGTH_PATTERN = re.compile(r"^[1-9]\d*/[1-9]\d*$")
METER_PATTERN = re.compile(r"^(?:C\|?|[1-9]\d*/[1-9]\d*)$")
KEY_PATTERN = re.compile(r"^[A-G](?:#|b)?(?:maj|min|m|mix|dor|phr|lyd|loc)?$")


def build_page_context_prefix(abc: str) -> str | None:
    fields = {}
    for name in ("L", "M", "K"):
        values = [
            line[2:].strip()
            for line in abc.splitlines()
            if line.startswith(f"{name}:")
        ]
        if len(values) != 1 or not values[0]:
            return None
        fields[name] = values[0]
    if not UNIT_LENGTH_PATTERN.fullmatch(fields["L"]):
        return None
    if not METER_PATTERN.fullmatch(fields["M"]):
        return None
    if not KEY_PATTERN.fullmatch(fields["K"]):
        return None
    return f'X:1\nL:{fields["L"]}\nM:{fields["M"]}\nK:{fields["K"]}\n'


def inspect_pdf(input_path: Path) -> None:
    import fitz

    with fitz.open(input_path) as document:
        print(json.dumps({"pageCount": len(document)}))


def render_pdf_pages(input_path: Path):
    import fitz
    from PIL import Image

    with fitz.open(input_path) as document:
        if not document:
            raise ValueError("PDF has no pages")
        for page in document:
            pixmap = page.get_pixmap(alpha=False)
            image = Image.frombytes(
                "RGB", [pixmap.width, pixmap.height], pixmap.samples
            )
            del pixmap
            yield image


def load_runtime(args: argparse.Namespace):
    import torch
    from transformers import AutoConfig, AutoProcessor, GenerationConfig

    sys.path.insert(0, str(args.repository))
    from image_utils import pad_to_portrait_letter
    from legato.models import LegatoModel, LegatoSegmentProcessor

    config = AutoConfig.from_pretrained(args.model, local_files_only=True)
    config.encoder_pretrained_model_name_or_path = str(args.base_model)
    processor = AutoProcessor.from_pretrained(args.model, local_files_only=True)
    segment_processor = (
        LegatoSegmentProcessor.from_pretrained(args.model, local_files_only=True)
        if args.page_context_mode == "previous-page-abc"
        else None
    )
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
    return {
        "torch": torch,
        "processor": processor,
        "segment_processor": segment_processor,
        "model": model,
        "device": device,
        "generation": generation,
        "pad": pad_to_portrait_letter,
        "dtype": str(next(model.parameters()).dtype).removeprefix("torch."),
    }


def recognize(args: argparse.Namespace, runtime=None) -> None:
    runtime = runtime or load_runtime(args)
    torch = runtime["torch"]
    processor = runtime["processor"]
    segment_processor = runtime["segment_processor"]
    model = runtime["model"]
    device = runtime["device"]
    generation = runtime["generation"]
    pad_to_portrait_letter = runtime["pad"]
    telemetry_pages = []
    dtype = runtime["dtype"]
    eos_token_ids = generation.eos_token_id
    if eos_token_ids is None:
        eos_token_ids = model.generation_config.eos_token_id
    if isinstance(eos_token_ids, int):
        eos_token_ids = [eos_token_ids]
    eos_token_ids = set(eos_token_ids or [])
    args.page_output_directory.mkdir(parents=True, exist_ok=True)
    page_context = None
    import fitz

    with fitz.open(args.input) as document:
        total_pages = len(document)
    for page_number, page in enumerate(render_pdf_pages(args.input), start=1):
        image = pad_to_portrait_letter(page)
        active_processor = segment_processor if page_context is not None else processor
        inputs = (
            active_processor(
                images=[image],
                prefixes=[page_context],
                truncation=True,
                return_tensors="pt",
            ).to(device)
            if page_context is not None
            else processor(images=[image], truncation=True, return_tensors="pt").to(
                device
            )
        )
        with torch.no_grad():
            output = model.generate(
                **inputs,
                generation_config=generation,
                use_model_defaults=False,
            )
        decoded = active_processor.batch_decode(
            output, skip_special_tokens=True
        )[0].replace(
            "<|text|>", "text"
        )
        if page_context is not None:
            if not decoded.startswith(page_context):
                raise RuntimeError("LEGATO page context prefix was not preserved")
            continuation = decoded[len(page_context) :].lstrip("\r\n")
            abc = page_context + continuation
        else:
            abc = decoded
        output_token_count = int(output.shape[-1])
        if output_token_count >= args.max_length:
            termination = "max-length"
        elif int(output[0, -1].item()) in eos_token_ids:
            termination = "eos"
        else:
            termination = "other"
        telemetry_pages.append(
            {
                "pageNumber": page_number,
                "outputTokenCount": output_token_count,
                "maxLength": args.max_length,
                "termination": termination,
                "device": device,
                "dtype": dtype,
                **(
                    {
                        "contextPrefixSha256": hashlib.sha256(
                            page_context.encode("utf-8")
                        ).hexdigest()
                    }
                    if page_context is not None
                    else {}
                ),
            }
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
        page_context = (
            build_page_context_prefix(abc)
            if args.page_context_mode == "previous-page-abc"
            else None
        )
        print(
            json.dumps(
                {"type": "progress", "completed": page_number, "total": total_pages},
                separators=(",", ":"),
            ),
            file=sys.stderr,
            flush=True,
        )
    args.telemetry_output.write_text(
        json.dumps(
            {"schemaVersion": "1.0.0", "pages": telemetry_pages},
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )


def run_worker(args: argparse.Namespace) -> None:
    started = time.monotonic()
    runtime = load_runtime(args)
    print(
        json.dumps(
            {"type": "ready", "modelLoadMs": (time.monotonic() - started) * 1000},
            separators=(",", ":"),
        ),
        flush=True,
    )
    for line in sys.stdin:
        request = {}
        failed = False
        try:
            request = json.loads(line)
            if request.get("type") == "shutdown":
                return
            if request.get("type") != "recognize" or not isinstance(
                request.get("id"), int
            ):
                raise ValueError("invalid-request")
            request_args = argparse.Namespace(
                **vars(args),
                input=Path(request["inputPath"]),
                page_output_directory=Path(request["pageOutputDirectory"]),
                telemetry_output=Path(request["telemetryOutputPath"]),
            )
            recognize(request_args, runtime)
            response = {"type": "result", "id": request["id"], "ok": True}
        except Exception:
            failed = True
            response = {
                "type": "result",
                "id": request.get("id", -1) if isinstance(request, dict) else -1,
                "ok": False,
                "reason": "inference-failed",
            }
        print(json.dumps(response, separators=(",", ":")), flush=True)
        if failed:
            return


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
    run.add_argument("--telemetry-output", type=Path, required=True)
    run.add_argument("--max-length", type=int, required=True)
    run.add_argument("--num-beams", type=int, required=True)
    run.add_argument("--repetition-penalty", type=float, required=True)
    run.add_argument(
        "--page-context-mode",
        choices=("none", "previous-page-abc"),
        default="none",
    )
    worker = commands.add_parser("worker")
    worker.add_argument("--repository", type=Path, required=True)
    worker.add_argument("--model", type=Path, required=True)
    worker.add_argument("--base-model", type=Path, required=True)
    worker.add_argument("--max-length", type=int, required=True)
    worker.add_argument("--num-beams", type=int, required=True)
    worker.add_argument("--repetition-penalty", type=float, required=True)
    worker.add_argument(
        "--page-context-mode",
        choices=("none", "previous-page-abc"),
        default="none",
    )
    return root


def main() -> None:
    args = parser().parse_args()
    if args.command == "inspect":
        inspect_pdf(args.input)
    elif args.command == "recognize":
        recognize(args)
    else:
        run_worker(args)


if __name__ == "__main__":
    main()
