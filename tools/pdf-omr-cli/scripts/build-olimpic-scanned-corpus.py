#!/usr/bin/env python3
"""Build a deterministic PDF/MusicXML corpus from OLiMPiC scanned system samples.

The source archive contains real scanned system images and their MusicXML annotations.
This builder joins systems in page/system order and writes a multi-page PDF whose pages
are the source scans. It intentionally does not synthesize or repair musical facts.
"""

from __future__ import annotations

import argparse
import struct
import zlib
from pathlib import Path
from xml.etree import ElementTree


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--score-id", action="append", required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()
    args.output_root.mkdir(parents=True, exist_ok=True)
    for score_id in args.score_id:
        build_score(args.source_root / score_id, args.output_root / score_id)


def build_score(source_root: Path, output_root: Path) -> None:
    systems = sorted(source_root.glob("p*-s*.png"), key=system_key)
    if not systems:
        raise SystemExit(f"no scanned systems found in {source_root}")
    output_root.mkdir(parents=True, exist_ok=True)
    pdf_bytes = build_pdf([decode_png(path) for path in systems])
    (output_root / "input.pdf").write_bytes(pdf_bytes)
    (output_root / "truth.musicxml").write_bytes(merge_musicxml(source_root, systems))
    for image in systems:
        (output_root / image.name).write_bytes(image.read_bytes())
    for xml in sorted(source_root.glob("p*-s*.musicxml"), key=system_key):
        (output_root / xml.name).write_bytes(xml.read_bytes())


def system_key(path: Path) -> tuple[int, int]:
    name = path.stem
    page, system = name[1:].split("-s")
    return int(page), int(system)


def merge_musicxml(source_root: Path, images: list[Path]) -> bytes:
    roots = []
    for image in images:
        xml = source_root / f"{image.stem}.musicxml"
        roots.append(ElementTree.parse(xml).getroot())
    first = roots[0]
    first_part = first.find("part")
    if first_part is None:
        raise SystemExit(f"missing part in {source_root}")
    merged = ElementTree.Element(first.tag, first.attrib)
    for child in first:
        if child.tag != "part":
            merged.append(ElementTree.fromstring(ElementTree.tostring(child, encoding="unicode")))
    part = ElementTree.SubElement(merged, "part", first_part.attrib)
    inherited_attributes: dict[str, object] = {}
    for root in roots:
        source_part = root.find("part")
        if source_part is None:
            raise SystemExit("system MusicXML is missing its part")
        measures = source_part.findall("measure")
        for index, measure in enumerate(measures):
            copied = ElementTree.fromstring(ElementTree.tostring(measure, encoding="unicode"))
            if index == 0:
                carry_forward_attributes(copied, inherited_attributes)
            part.append(copied)
            capture_attributes(copied, inherited_attributes)
    return ElementTree.tostring(merged, encoding="utf-8", xml_declaration=True)


def carry_forward_attributes(measure: ElementTree.Element, inherited: dict[str, object]) -> None:
    """Carry omitted MusicXML state across cropped system roots.

    OLiMPiC system annotations are valid MusicXML fragments, so a later system may
    omit unchanged meter/key/clef state that was declared on an earlier system.
    Reattaching only missing attribute children preserves the source facts while
    making the joined full-work document valid for a stateful MusicXML reader.
    """
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
    existing_clefs = {
        child.get("number", "1") for child in current.findall("clef")
    }
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
    existing_clefs = {
        child.get("number", "1"): child for child in inherited.get("clefs", [])
    }
    for child in current.findall("clef"):
        existing_clefs[child.get("number", "1")] = ElementTree.fromstring(
            ElementTree.tostring(child, encoding="unicode")
        )
    inherited["clefs"] = list(existing_clefs.values())


def decode_png(path: Path) -> tuple[int, int, bytes]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"unsupported image: {path}")
    cursor = 8
    width = height = bit_depth = color_type = None
    chunks = []
    while cursor < len(data):
        length = struct.unpack(">I", data[cursor : cursor + 4])[0]
        chunk = data[cursor + 4 : cursor + 8]
        payload = data[cursor + 8 : cursor + 8 + length]
        cursor += 12 + length
        if chunk == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
            if (bit_depth, color_type, compression, filter_method, interlace) != (8, 0, 0, 0, 0):
                raise SystemExit(f"PNG must be 8-bit grayscale without interlace: {path}")
        elif chunk == b"IDAT":
            chunks.append(payload)
        elif chunk == b"IEND":
            break
    if width is None or height is None:
        raise SystemExit(f"PNG is missing IHDR: {path}")
    decoded = zlib.decompress(b"".join(chunks))
    row_size = width
    rows = []
    previous = bytearray(row_size)
    cursor = 0
    for _ in range(height):
        filter_type = decoded[cursor]
        cursor += 1
        row = bytearray(decoded[cursor : cursor + row_size])
        cursor += row_size
        unfilter(row, previous, filter_type)
        rows.append(bytes(row))
        previous = row
    return width, height, b"".join(rows)


def unfilter(row: bytearray, previous: bytearray, filter_type: int) -> None:
    if filter_type == 0:
        return
    if filter_type == 1:
        for index in range(len(row)):
            row[index] = (row[index] + (row[index - 1] if index else 0)) & 255
        return
    if filter_type == 2:
        for index in range(len(row)):
            row[index] = (row[index] + previous[index]) & 255
        return
    if filter_type == 3:
        for index in range(len(row)):
            left = row[index - 1] if index else 0
            row[index] = (row[index] + ((left + previous[index]) // 2)) & 255
        return
    if filter_type == 4:
        for index in range(len(row)):
            left = row[index - 1] if index else 0
            up = previous[index]
            up_left = previous[index - 1] if index else 0
            predictor = left + up - up_left
            distances = (abs(predictor - left), abs(predictor - up), abs(predictor - up_left))
            row[index] = (row[index] + (left, up, up_left)[distances.index(min(distances))]) & 255
        return
    raise SystemExit(f"unsupported PNG filter {filter_type}")


def build_pdf(images: list[tuple[int, int, bytes]]) -> bytes:
    objects: list[bytes] = []
    page_ids = []
    for index, (width, height, pixels) in enumerate(images):
        page_height = max(width, height)
        image_id = len(objects) + 1
        objects.append(
            f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceGray "
            f"/BitsPerComponent 8 /Filter /FlateDecode /Length {len(zlib.compress(pixels))} >>\nstream\n".encode()
            + zlib.compress(pixels)
            + b"\nendstream"
        )
        content = f"q {width} 0 0 {height} 0 0 cm /Im{index} Do Q".encode()
        content_id = len(objects) + 1
        objects.append(f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream")
        page_id = len(objects) + 1
        objects.append(
            f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 {width} {page_height}] "
            f"/Resources << /XObject << /Im{index} {image_id} 0 R >> >> /Contents {content_id} 0 R >>".encode()
        )
        page_ids.append(page_id)
    pages_id = len(objects) + 1
    for page_id in page_ids:
        objects[page_id - 1] = objects[page_id - 1].replace(
            b"/Parent 0 0 R", f"/Parent {pages_id} 0 R".encode()
        )
    objects.append(
        f"<< /Type /Pages /Kids [{ ' '.join(f'{page_id} 0 R' for page_id in page_ids) }] /Count {len(page_ids)} >>".encode()
    )
    catalog_id = len(objects) + 1
    objects.append(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode())
    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode())
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    output.extend(b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:]))
    output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(output)


if __name__ == "__main__":
    main()
