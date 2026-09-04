#!/usr/bin/env python3
"""Frozen decoding and exact metrics for the research-only DETR probe."""

from __future__ import annotations

import numpy as np

from layout_detr_targets import normalized_staff_bboxes


CLASS_COUNT = 3


def decode_predictions(
    logits: np.ndarray,
    boxes: np.ndarray,
    *,
    threshold: float,
    activation: str = "softmax",
    class_count: int = CLASS_COUNT,
) -> list[dict[str, float | int]]:
    if isinstance(class_count, bool) or not isinstance(class_count, int) or class_count < 1:
        raise ValueError("class_count must be a positive integer")
    expected_logit_count = class_count + 1 if activation == "softmax" else class_count
    if activation not in ("softmax", "sigmoid"):
        raise ValueError("activation must be softmax or sigmoid")
    if logits.ndim != 2 or boxes.ndim != 2 or logits.shape[1] != expected_logit_count or boxes.shape[1] != 4:
        raise ValueError("logits and boxes have invalid shapes")
    if logits.shape[0] != boxes.shape[0]:
        raise ValueError("query counts must match")
    if not 0 < threshold < 1:
        raise ValueError("threshold must be between zero and one")
    if activation == "softmax":
        shifted = logits - logits.max(axis=1, keepdims=True)
        probability = np.exp(shifted) / np.exp(shifted).sum(axis=1, keepdims=True)
        foreground_probability = probability[:, :class_count]
    else:
        foreground_probability = 1 / (1 + np.exp(-np.clip(logits, -80, 80)))
    labels = foreground_probability.argmax(axis=1)
    scores = foreground_probability[np.arange(len(foreground_probability)), labels]
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


def _normalized_prediction_bbox(prediction: dict[str, float | int]) -> tuple[float, float, float, float]:
    center_x = float(prediction["centerX"])
    center_y = float(prediction["centerY"])
    width = float(prediction["width"])
    height = float(prediction["height"])
    if width <= 0 or height <= 0:
        raise ValueError("prediction box must have positive dimensions")
    return center_x - width / 2, center_y - height / 2, width, height


def _bbox_contains(bbox: tuple[float, float, float, float], prediction: dict[str, float | int]) -> bool:
    x, y, width, height = bbox
    center_x = float(prediction["centerX"])
    center_y = float(prediction["centerY"])
    return x <= center_x <= x + width and y <= center_y <= y + height


def _match_predictions(
    truth_boxes: list[tuple[float, float, float, float]], predictions: list[dict[str, float | int]]
) -> dict[int, int]:
    unmatched = set(range(len(predictions)))
    matched: dict[int, int] = {}
    for truth_index, truth_box in enumerate(truth_boxes):
        candidates = [index for index in unmatched if _bbox_contains(truth_box, predictions[index])]
        if not candidates:
            continue
        prediction_index = max(candidates, key=lambda index: float(predictions[index]["score"]))
        unmatched.remove(prediction_index)
        matched[prediction_index] = truth_index
    return matched


def evaluate_ola_page(
    predictions: list[dict[str, float | int]], annotation: dict[str, object]
) -> dict[str, object]:
    """Assemble class-agnostic system/staff detections and score exact staff counts."""

    for prediction in predictions:
        if prediction.get("label") not in (0, 1):
            raise ValueError("OLA prediction label is outside the supported classes")
    systems = sorted(
        (prediction for prediction in predictions if prediction["label"] == 0),
        key=lambda item: (item["centerY"], item["centerX"], -item["score"]),
    )
    staffs = sorted(
        (prediction for prediction in predictions if prediction["label"] == 1),
        key=lambda item: (-item["score"], item["centerY"], item["centerX"]),
    )
    truth = sorted(
        annotation["systems"],
        key=lambda system: (system["normalizedBBox"]["y"], system["normalizedBBox"]["x"]),
    )
    truth_system_boxes = [
        (
            float(system["normalizedBBox"]["x"]),
            float(system["normalizedBBox"]["y"]),
            float(system["normalizedBBox"]["width"]),
            float(system["normalizedBBox"]["height"]),
        )
        for system in truth
    ]
    truth_staff_boxes = [box for system in truth for box in normalized_staff_bboxes(system)]
    system_matches = _match_predictions(truth_system_boxes, systems)
    staff_matches = _match_predictions(truth_staff_boxes, staffs)

    assigned_staff_counts = [0] * len(systems)
    unassigned_staff_count = 0
    system_prediction_boxes = [_normalized_prediction_bbox(system) for system in systems]
    for staff in staffs:
        candidates = [index for index, bbox in enumerate(system_prediction_boxes) if _bbox_contains(bbox, staff)]
        if not candidates:
            unassigned_staff_count += 1
            continue
        selected = min(
            candidates,
            key=lambda index: (
                abs(float(staff["centerY"]) - float(systems[index]["centerY"]))
                / float(systems[index]["height"]),
                system_prediction_boxes[index][2] * system_prediction_boxes[index][3],
                index,
            ),
        )
        assigned_staff_counts[selected] += 1

    truth_by_class = [0] * CLASS_COUNT
    predicted_by_class = [0] * CLASS_COUNT
    matched_by_class = [0] * CLASS_COUNT
    for system in truth:
        truth_by_class[system["staffCount"] - 1] += 1
    invalid_predicted_system_count = 0
    for staff_count in assigned_staff_counts:
        if staff_count in (1, 2, 3):
            predicted_by_class[staff_count - 1] += 1
        else:
            invalid_predicted_system_count += 1
    for prediction_index, truth_index in system_matches.items():
        truth_count = truth[truth_index]["staffCount"]
        if assigned_staff_counts[prediction_index] == truth_count:
            matched_by_class[truth_count - 1] += 1

    topology_exact = (
        len(systems) == len(truth)
        and len(staffs) == len(truth_staff_boxes)
        and len(system_matches) == len(truth)
        and len(staff_matches) == len(truth_staff_boxes)
        and invalid_predicted_system_count == 0
        and unassigned_staff_count == 0
        and sum(matched_by_class) == len(truth)
    )
    return {
        "topologyExact": topology_exact,
        "truthByClass": truth_by_class,
        "predictedByClass": predicted_by_class,
        "matchedByClass": matched_by_class,
        "truthSystemCount": len(truth),
        "predictedSystemCount": len(systems),
        "matchedSystemCount": len(system_matches),
        "truthStaffCount": len(truth_staff_boxes),
        "predictedStaffCount": len(staffs),
        "matchedStaffCount": len(staff_matches),
        "invalidPredictedSystemCount": invalid_predicted_system_count,
        "unassignedStaffCount": unassigned_staff_count,
    }


def summarize_ola_pages(pages: list[dict[str, object]]) -> dict[str, object]:
    summary = summarize_pages(pages)
    truth_systems = sum(int(page["truthSystemCount"]) for page in pages)
    predicted_systems = sum(int(page["predictedSystemCount"]) for page in pages)
    matched_systems = sum(int(page["matchedSystemCount"]) for page in pages)
    truth_staffs = sum(int(page["truthStaffCount"]) for page in pages)
    predicted_staffs = sum(int(page["predictedStaffCount"]) for page in pages)
    matched_staffs = sum(int(page["matchedStaffCount"]) for page in pages)
    summary.update(
        {
            "truthSystemCount": truth_systems,
            "predictedSystemCount": predicted_systems,
            "matchedSystemCount": matched_systems,
            "systemObjectExact": matched_systems / max(truth_systems, predicted_systems)
            if max(truth_systems, predicted_systems)
            else 1.0,
            "truthStaffCount": truth_staffs,
            "predictedStaffCount": predicted_staffs,
            "matchedStaffCount": matched_staffs,
            "staffObjectExact": matched_staffs / max(truth_staffs, predicted_staffs)
            if max(truth_staffs, predicted_staffs)
            else 1.0,
            "invalidPredictedSystemCount": sum(int(page["invalidPredictedSystemCount"]) for page in pages),
            "unassignedStaffCount": sum(int(page["unassignedStaffCount"]) for page in pages),
        }
    )
    return summary
