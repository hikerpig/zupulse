#!/usr/bin/env python3
"""Isolated process entry point for the pinned ABC to MusicXML converter."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
from pathlib import Path
import sys


PACKAGE_NAME = "abc-xml-converter"


def require_converter(expected_version: str):
    actual_version = importlib.metadata.version(PACKAGE_NAME)
    if actual_version != expected_version:
        raise RuntimeError(
            f"{PACKAGE_NAME} version mismatch: expected {expected_version}, got {actual_version}"
        )
    from abc_xml_converter import convert_abc2xml

    return actual_version, convert_abc2xml


def inspect_environment(expected_version: str) -> None:
    actual_version, _converter = require_converter(expected_version)
    print(json.dumps({"package": PACKAGE_NAME, "version": actual_version}, sort_keys=True))


def convert(input_path: Path, output_path: Path, expected_version: str) -> None:
    _actual_version, converter = require_converter(expected_version)
    original_argv = sys.argv
    try:
        # abc-xml-converter 1.0.1 parses process arguments even when called as a library.
        sys.argv = [original_argv[0]]
        xml = converter(file_to_convert=str(input_path))
    finally:
        sys.argv = original_argv
    if not isinstance(xml, str):
        raise RuntimeError("ABC converter did not return a text result")
    output_path.write_text(xml, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("--expected-version", required=True)
    convert_parser = subparsers.add_parser("convert")
    convert_parser.add_argument("--expected-version", required=True)
    convert_parser.add_argument("--input", type=Path, required=True)
    convert_parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "inspect":
        inspect_environment(args.expected_version)
    else:
        convert(args.input, args.output, args.expected_version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
