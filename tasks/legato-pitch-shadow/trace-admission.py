"""Read-only rejection tracing; never produce correction evidence or change admission."""

import hashlib
import importlib.util
import json
from pathlib import Path
import sys


root = Path(__file__).resolve().parents[2]
protocol = json.loads((Path(__file__).parent / "independent-protocol.json").read_text())
extractor = root / "tools/pdf-omr-cli/engines/pitch_shadow.py"
expected = protocol["candidateSha256"]["tools/pdf-omr-cli/engines/pitch_shadow.py"]
if hashlib.sha256(extractor.read_bytes()).hexdigest() != expected:
    raise ValueError("Frozen extractor changed; this trace requires the original candidate")
spec = importlib.util.spec_from_file_location("pitch_shadow", extractor)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
events = []


def trace(frame, event, arg):
    if (event == "call" and frame.f_code.co_filename == str(extractor)
            and frame.f_code.co_name == "<lambda>" and "reason" in frame.f_locals):
        caller = frame.f_back
        state = caller.f_locals
        row = {"line": caller.f_lineno, "reason": frame.f_locals["reason"]}
        if caller.f_lineno == 212:
            span = state["span"]
            row["span"] = {key: span[key] for key in ("text", "bbox")}
        elif caller.f_lineno in (227, 237, 258):
            row["glyph"] = {key: state.get(key) for key in ("font", "char", "x", "y")}
        elif caller.f_lineno == 161:
            row["longRows"] = state["rows"]
        events.append(row)
    return trace


if len(sys.argv) != 2:
    raise SystemExit("usage: trace-admission.py <materialization-root>")
sys.settrace(trace)
try:
    for work in protocol["works"]:
        events.clear()
        result = module.extract_pdf(str(Path(sys.argv[1]) / work / "rendered.pdf"))
        print(json.dumps({"work": work, "pageReasons": [p["reason"] for p in result["pages"]],
                          "rejections": events}))
finally:
    sys.settrace(None)
