#!/usr/bin/env python3
"""Build lossless full-page OLiMPiC inputs from source PDFs and annotations.

This is a development-only builder. It keeps source PDFs outside Git and uses
Poppler's pdfseparate/pdfunite to select original pages without rasterizing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

try:
    import yaml
except ImportError as error:  # pragma: no cover - environment failure
    raise SystemExit("PyYAML is required by the development-only corpus builder") from error


@dataclass(frozen=True)
class SystemMapping:
    sample_variant: str
    source_system: int
    bounding_box: dict[str, int]


@dataclass(frozen=True)
class PageMapping:
    sample_page: int
    source_page: int
    width: int
    height: int
    systems: tuple[SystemMapping, ...]


def build_page_mapping(
    work_id: str,
    corpus_mapping: dict[str, dict[str, Any]],
    annotations: dict[int, dict[str, Any]],
) -> list[PageMapping]:
    entries: list[tuple[int, int, int, dict[str, int], str]] = []
    documents: set[str] = set()
    for key, value in corpus_mapping.items():
        prefix, separator, variant = key.partition("/")
        if not separator or prefix != work_id:
            continue
        sample_page, sample_system = parse_variant(variant)
        source_page = require_positive_int(value, "imslpPage", key)
        source_system = require_positive_int(value, "imslpSystem", key)
        document = value.get("imslpDocument")
        if not isinstance(document, str) or not document:
            raise ValueError(f"missing imslpDocument for {key}")
        documents.add(document)
        page_annotation = annotations.get(source_page)
        if page_annotation is None:
            raise ValueError(f"missing source page annotation {source_page} for {key}")
        systems = page_annotation.get("systems")
        if not isinstance(systems, list) or source_system > len(systems):
            raise ValueError(f"missing source system annotation {source_system} for {key}")
        system_annotation = systems[source_system - 1]
        bounding_box = system_annotation.get("boundingBox") if isinstance(system_annotation, dict) else None
        if not isinstance(bounding_box, dict):
            raise ValueError(f"missing boundingBox for {key}")
        normalized_box: dict[str, int] = {}
        for field in ("left", "top", "width", "height"):
            normalized_box[field] = require_positive_int(bounding_box, field, key, allow_zero=True)
        entries.append((sample_page, sample_system, source_page, normalized_box, variant))

    if not entries:
        raise ValueError(f"no source mapping found for work {work_id}")
    if len(documents) != 1:
        raise ValueError(f"work {work_id} maps to multiple IMSLP documents: {sorted(documents)}")

    pages_by_sample: dict[int, list[tuple[int, int, dict[str, int], str]]] = defaultdict(list)
    for sample_page, sample_system, source_page, box, variant in sorted(entries):
        pages_by_sample[sample_page].append((sample_system, source_page, box, variant))
    sample_pages = sorted(pages_by_sample)
    if sample_pages != list(range(1, len(sample_pages) + 1)):
        raise ValueError(f"non-contiguous sample pages for work {work_id}: {sample_pages}")

    source_pages = [items[0][1] for _, items in sorted(pages_by_sample.items())]
    if source_pages != list(range(source_pages[0], source_pages[-1] + 1)):
        raise ValueError(f"non-contiguous source pages for work {work_id}: {source_pages}")

    result: list[PageMapping] = []
    for sample_page in sample_pages:
        items = pages_by_sample[sample_page]
        source_page = items[0][1]
        annotation = annotations[source_page]
        width = require_positive_int(annotation, "width", f"source page {source_page}")
        height = require_positive_int(annotation, "height", f"source page {source_page}")
        systems = tuple(
            SystemMapping(sample_variant=variant, source_system=source_system, bounding_box=box)
            for source_system, mapped_page, box, variant in sorted(items)
            if mapped_page == source_page
        )
        result.append(PageMapping(sample_page, source_page, width, height, systems))
    return result


def parse_variant(variant: str) -> tuple[int, int]:
    if not variant.startswith("p") or "-s" not in variant:
        raise ValueError(f"invalid sample variant: {variant}")
    page_token, system_token = variant[1:].split("-s", 1)
    if not page_token.isdigit() or not system_token.isdigit():
        raise ValueError(f"invalid sample variant: {variant}")
    page = int(page_token)
    system = int(system_token)
    if page < 1 or system < 1:
        raise ValueError(f"invalid sample variant: {variant}")
    return page, system


def require_positive_int(value: dict[str, Any], field: str, context: str, *, allow_zero: bool = False) -> int:
    raw = value.get(field)
    if not isinstance(raw, int) or (raw < 0 if allow_zero else raw < 1):
        raise ValueError(f"invalid {field} for {context}")
    return raw


def load_yaml_mapping(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected mapping YAML: {path}")
    return value


def find_source_pdf(source_root: Path, document: str) -> Path:
    document_id = document.removeprefix("#")
    matches = sorted((source_root / "imslp_pdfs").glob(f"IMSLP{document_id}*.pdf"))
    if len(matches) != 1:
        raise ValueError(f"expected one source PDF for {document}, found {len(matches)}")
    return matches[0]


def find_scanned_work(scanned_root: Path, work_id: str) -> Path:
    candidates = (
        scanned_root / "samples" / work_id,
        scanned_root / "olimpic-1.0-scanned" / "samples" / work_id,
        scanned_root / work_id,
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    raise ValueError(f"missing scanned annotations for work {work_id}")


def build_work(
    work_id: str,
    source_root: Path,
    scanned_root: Path,
    output_root: Path,
    pdfseparate: str,
    pdfunite: str,
) -> None:
    corpus_mapping = load_yaml_mapping(source_root / "corpus_to_imslp" / f"{work_id}.yaml")
    documents = {value.get("imslpDocument") for key, value in corpus_mapping.items() if key.startswith(f"{work_id}/")}
    if len(documents) != 1 or not isinstance(next(iter(documents), None), str):
        raise ValueError(f"work {work_id} must map to exactly one IMSLP document")
    document = next(iter(documents))
    system_annotations = load_yaml_mapping(source_root / "imslp_systems" / f"IMSLP{document.removeprefix('#')}.yaml")
    annotations = system_annotations.get("pages")
    if not isinstance(annotations, dict):
        raise ValueError(f"missing pages in system annotations for {work_id}")
    normalized_annotations = {int(page): value for page, value in annotations.items()}
    pages = build_page_mapping(work_id, corpus_mapping, normalized_annotations)
    source_pdf = find_source_pdf(source_root, document)
    scanned_work = find_scanned_work(scanned_root, work_id)
    destination = output_root / work_id
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"olimpic-{work_id}-", dir=output_root) as temporary:
        temporary_root = Path(temporary)
        page_template = temporary_root / "source-%d.pdf"
        subprocess.run(
            [pdfseparate, "-f", str(pages[0].source_page), "-l", str(pages[-1].source_page), str(source_pdf), str(page_template)],
            check=True,
            capture_output=True,
            text=True,
        )
        page_files = [temporary_root / f"source-{page.source_page}.pdf" for page in pages]
        missing = [str(path) for path in page_files if not path.is_file()]
        if missing:
            raise ValueError(f"pdfseparate did not produce expected pages: {missing}")
        subprocess.run(
            [pdfunite, *(str(path) for path in page_files), str(destination / "input.pdf")],
            check=True,
            capture_output=True,
            text=True,
        )
    systems = sorted(scanned_work.glob("p*-s*.musicxml"), key=system_key)
    expected_systems = sum(len(page.systems) for page in pages)
    if len(systems) != expected_systems:
        raise ValueError(f"work {work_id} has {len(systems)} MusicXML systems, expected {expected_systems}")
    (destination / "truth.musicxml").write_bytes(merge_musicxml(scanned_work, systems))
    mapping_document = {
        "schemaVersion": "1.0.0",
        "workId": work_id,
        "sourceSplit": "dev",
        "sourceDocument": document,
        "sourcePdf": {
            "memberName": source_pdf.name,
            "sha256": sha256_file(source_pdf),
            "bytes": source_pdf.stat().st_size,
        },
        "pages": [
            {
                "samplePage": page.sample_page,
                "sourcePage": page.source_page,
                "width": page.width,
                "height": page.height,
                "systems": [
                    {
                        "sampleVariant": system.sample_variant,
                        "sourceSystem": system.source_system,
                        "boundingBox": system.bounding_box,
                    }
                    for system in page.systems
                ],
            }
            for page in pages
        ],
    }
    (destination / "source-mapping.json").write_text(json.dumps(mapping_document, indent=2) + "\n", encoding="utf-8")


def system_key(path: Path) -> tuple[int, int]:
    page, system = path.stem[1:].split("-s")
    return int(page), int(system)


def merge_musicxml(source_root: Path, images: list[Path]) -> bytes:
    roots = []
    for image in images:
        xml = source_root / f"{image.stem}.musicxml"
        roots.append(ElementTree.parse(xml).getroot())
    first = roots[0]
    first_part = first.find("part")
    if first_part is None:
        raise ValueError(f"missing part in {source_root}")
    merged = ElementTree.Element(first.tag, first.attrib)
    for child in first:
        if child.tag != "part":
            merged.append(ElementTree.fromstring(ElementTree.tostring(child, encoding="unicode")))
    part = ElementTree.SubElement(merged, "part", first_part.attrib)
    inherited_attributes: dict[str, object] = {}
    for root in roots:
        source_part = root.find("part")
        if source_part is None:
            raise ValueError("system MusicXML is missing its part")
        for index, measure in enumerate(source_part.findall("measure")):
            copied = ElementTree.fromstring(ElementTree.tostring(measure, encoding="unicode"))
            if index == 0:
                carry_forward_attributes(copied, inherited_attributes)
            part.append(copied)
            capture_attributes(copied, inherited_attributes)
    return ElementTree.tostring(merged, encoding="utf-8", xml_declaration=True)


def carry_forward_attributes(measure: ElementTree.Element, inherited: dict[str, object]) -> None:
    current = measure.find("attributes")
    if current is None:
        if not inherited:
            return
        current = ElementTree.Element("attributes")
        measure.insert(0, current)
    existing = {child.tag for child in current}
    for tag in ("divisions", "key", "time", "staves"):
        value = inherited.get(tag)
        if tag not in existing and isinstance(value, ElementTree.Element):
            current.append(ElementTree.fromstring(ElementTree.tostring(value, encoding="unicode")))
    existing_clefs = {child.get("number", "1") for child in current.findall("clef")}
    for clef in inherited.get("clefs", []):
        if clef.get("number", "1") not in existing_clefs:
            current.append(ElementTree.fromstring(ElementTree.tostring(clef, encoding="unicode")))


def capture_attributes(measure: ElementTree.Element, inherited: dict[str, object]) -> None:
    current = measure.find("attributes")
    if current is None:
        return
    for tag in ("divisions", "key", "time", "staves"):
        child = current.find(tag)
        if child is not None:
            inherited[tag] = ElementTree.fromstring(ElementTree.tostring(child, encoding="unicode"))
    existing_clefs = {child.get("number", "1"): child for child in inherited.get("clefs", [])}
    for child in current.findall("clef"):
        existing_clefs[child.get("number", "1")] = ElementTree.fromstring(
            ElementTree.tostring(child, encoding="unicode")
        )
    inherited["clefs"] = list(existing_clefs.values())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--scanned-root", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--pdfseparate", default="pdfseparate")
    parser.add_argument("--pdfunite", default="pdfunite")
    parser.add_argument("--work-id", action="append")
    args = parser.parse_args()
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    works = selection.get("works")
    if not isinstance(works, list):
        raise SystemExit("selection does not contain works")
    selected_ids = [work["workId"] for work in works if isinstance(work, dict) and isinstance(work.get("workId"), str)]
    requested_ids = args.work_id or selected_ids
    unknown = sorted(set(requested_ids) - set(selected_ids))
    if unknown:
        raise SystemExit(f"requested work is not in selection: {unknown}")
    args.output_root.mkdir(parents=True, exist_ok=True)
    for work_id in requested_ids:
        build_work(
            work_id,
            args.source_root,
            args.scanned_root,
            args.output_root,
            args.pdfseparate,
            args.pdfunite,
        )


if __name__ == "__main__":
    main()
