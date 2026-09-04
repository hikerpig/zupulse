#!/usr/bin/env python3
"""Frozen decoding and exact metrics for the research-only DETR probe."""

from __future__ import annotations

import numpy as np


CLASS_COUNT = 3


def decode_predictions(logits: np.ndarray, boxes: np.ndarray, *, threshold: float) -> list[dict[str, float | int]]:
    if logits.ndim != 2 or boxes.ndim != 2 or logits.shape[1] != CLASS_COUNT + 1 or boxes.shape[1] != 4:
        raise ValueError("logits and boxes have invalid shapes")
    if logits.shape[0] != boxes.shape[0]:
        raise ValueError("query counts must match")
    if not 0 < threshold < 1:
        raise ValueError("threshold must be between zero and one")
    shifted = logits - logits.max(axis=1, keepdims=True)
    probability = np.exp(shifted) / np.exp(shifted).sum(axis=1, keepdims=True)
    labels = probability[:, :CLASS_COUNT].argmax(axis=1)
    scores = probability[np.arange(len(probability)), labels]
    result = []
    for label, score, box in zip(labels, scores, boxes, strict=True):
        if score < threshold:
            continue
        center_x, center_y, width, height = (float(value) for value in box)
        result.append(
            {
                "centerX": center_x,
                "centerY": center_y,
                "height": height,
                "label": int(label),
                "score": float(score),
                "width": width,
            }
        )
    return sorted(result, key=lambda item: (item["centerY"], item["centerX"], -item["score"]))


def _contains(system: dict[str, object], prediction: dict[str, float | int]) -> bool:
    bbox = system["normalizedBBox"]
    center_x = prediction["centerX"]
    center_y = prediction["centerY"]
    return (
        bbox["x"] <= center_x <= bbox["x"] + bbox["width"]
        and bbox["y"] <= center_y <= bbox["y"] + bbox["height"]
    )


def evaluate_page(
    predictions: list[dict[str, float | int]], annotation: dict[str, object]
) -> dict[str, object]:
    truth = sorted(
        annotation["systems"],
        key=lambda system: (system["normalizedBBox"]["y"], system["normalizedBBox"]["x"]),
    )
    truth_by_class = [0] * CLASS_COUNT
    predicted_by_class = [0] * CLASS_COUNT
    matched_by_class = [0] * CLASS_COUNT
    for system in truth:
        truth_by_class[system["staffCount"] - 1] += 1
    for prediction in predictions:
        label = prediction["label"]
        if not isinstance(label, int) or label not in range(CLASS_COUNT):
            raise ValueError("prediction label is outside the supported classes")
        predicted_by_class[label] += 1

    unmatched = set(range(len(predictions)))
    for system in truth:
        label = system["staffCount"] - 1
        candidates = [
            index
            for index in unmatched
            if predictions[index]["label"] == label and _contains(system, predictions[index])
        ]
        if candidates:
            selected = max(candidates, key=lambda index: predictions[index]["score"])
            unmatched.remove(selected)
            matched_by_class[label] += 1

    topology_exact = len(predictions) == len(truth) and all(
        prediction["label"] == system["staffCount"] - 1 and _contains(system, prediction)
        for prediction, system in zip(predictions, truth, strict=True)
    )
    return {
        "topologyExact": topology_exact,
        "truthByClass": truth_by_class,
        "predictedByClass": predicted_by_class,
        "matchedByClass": matched_by_class,
    }


def summarize_pages(pages: list[dict[str, object]]) -> dict[str, object]:
    truth = [sum(page["truthByClass"][index] for page in pages) for index in range(CLASS_COUNT)]
    predicted = [sum(page["predictedByClass"][index] for page in pages) for index in range(CLASS_COUNT)]
    matched = [sum(page["matchedByClass"][index] for page in pages) for index in range(CLASS_COUNT)]
    exact = [
        matched[index] / max(truth[index], predicted[index]) if max(truth[index], predicted[index]) else 1.0
        for index in range(CLASS_COUNT)
    ]
    return {
        "pageCount": len(pages),
        "topologyExactPages": sum(bool(page["topologyExact"]) for page in pages),
        "truthByClass": truth,
        "predictedByClass": predicted,
        "matchedByClass": matched,
        "classExact": exact,
        "macroClassExact": sum(exact) / CLASS_COUNT,
    }
