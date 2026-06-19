from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .masks import mask_to_polygons, scale_points


ROOT = Path(__file__).resolve().parents[1]
FASTSAM_WEIGHTS = Path(os.getenv("FASTSAM_WEIGHTS", ROOT / "models" / "FastSAM-s.pt"))


def model_capabilities() -> dict[str, bool]:
    return {
        "classical": True,
        "fastsam": bool(importlib.util.find_spec("ultralytics") and FASTSAM_WEIGHTS.exists()),
        "mobilesam": bool(
            importlib.util.find_spec("segment_anything")
            and (ROOT / "models" / "mobile_sam.pt").exists()
        ),
    }


def _candidate_score(
    contour: np.ndarray,
    image: np.ndarray,
    edges: np.ndarray,
    positive_points: list[list[float]],
    negative_points: list[list[float]],
) -> float:
    height, width = image.shape[:2]
    area = cv2.contourArea(contour)
    x, y, box_width, box_height = cv2.boundingRect(contour)
    if area <= 0 or box_width <= 0 or box_height <= 0:
        return -1
    area_ratio = area / (width * height)
    verticality = box_height / max(box_width, 1)
    rectangularity = area / max(float(box_width * box_height), 1.0)
    centre_y = (y + box_height / 2) / height
    top_preference = 1.0 - min(1.0, y / max(height * 0.72, 1))
    region_mask = np.zeros((height, width), dtype=np.uint8)
    cv2.drawContours(region_mask, [contour], -1, 255, -1)
    pixels = image[region_mask > 0]
    texture = float(edges[region_mask > 0].mean() / 255.0) if pixels.size else 1.0
    saturation = float(cv2.cvtColor(image, cv2.COLOR_BGR2HSV)[..., 1][region_mask > 0].mean() / 255.0) if pixels.size else 1.0
    score = area_ratio * 3.0 + min(verticality, 1.5) * 0.1 + top_preference * 0.22
    score += min(rectangularity, 1.0) * 0.18
    score += max(0.0, 0.45 - texture) * 0.8
    score += max(0.0, 0.58 - saturation) * 0.2
    for point in positive_points:
        if len(point) >= 2 and cv2.pointPolygonTest(contour, (float(point[0]), float(point[1])), False) >= 0:
            score += 0.85
    for point in negative_points:
        if len(point) >= 2 and cv2.pointPolygonTest(contour, (float(point[0]), float(point[1])), False) >= 0:
            score -= 1.2
    if y > height * 0.7:
        score -= 0.8
    if centre_y > 0.72:
        score -= 0.45
    if area_ratio > 0.82:
        score -= 0.7
    return score


def classical_wall_proposals(
    image: np.ndarray,
    positive_points: list[list[float]] | None = None,
    negative_points: list[list[float]] | None = None,
    expected_walls: int | None = None,
) -> list[dict[str, Any]]:
    positive_points = positive_points or []
    negative_points = negative_points or []
    original_height, original_width = image.shape[:2]
    max_side = 960
    scale = min(1.0, max_side / max(original_width, original_height))
    work = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    height, width = work.shape[:2]
    scaled_positive = [[point[0] * scale, point[1] * scale] for point in positive_points]
    scaled_negative = [[point[0] * scale, point[1] * scale] for point in negative_points]

    lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB)
    smooth = cv2.bilateralFilter(lab, 9, 42, 42)
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 45, 120)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    pixels = smooth.reshape((-1, 3)).astype(np.float32)
    cluster_count = 6
    _, labels, _ = cv2.kmeans(
        pixels,
        cluster_count,
        None,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 35, 0.8),
        3,
        cv2.KMEANS_PP_CENTERS,
    )
    labels = labels.reshape((height, width))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    candidates: list[tuple[float, np.ndarray]] = []
    for cluster in range(cluster_count):
        mask = np.where(labels == cluster, 255, 0).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8), iterations=1)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x, y, box_width, box_height = cv2.boundingRect(contour)
            area_ratio = cv2.contourArea(contour) / (width * height)
            if (
                area_ratio < 0.055
                or area_ratio > 0.78
                or box_width < width * 0.16
                or box_height < height * 0.18
                or (box_width > width * 0.96 and box_height > height * 0.82)
            ):
                continue
            score = _candidate_score(contour, work, edges, scaled_positive, scaled_negative)
            if score > 0.12:
                candidates.append((score, contour))

    candidates.sort(key=lambda item: item[0], reverse=True)
    limit = max(1, min(expected_walls or 4, 4))
    accepted: list[dict[str, Any]] = []
    accepted_boxes: list[tuple[int, int, int, int]] = []
    for score, contour in candidates:
        if score < 0.34:
            continue
        box = cv2.boundingRect(contour)
        x, y, box_width, box_height = box
        duplicate = any(
            abs(x - other[0]) < width * 0.05
            and abs(y - other[1]) < height * 0.05
            and abs(box_width - other[2]) < width * 0.08
            and abs(box_height - other[3]) < height * 0.08
            for other in accepted_boxes
        )
        if duplicate:
            continue
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        contour_area = cv2.contourArea(contour)
        solidity = contour_area / max(hull_area, 1.0)
        if solidity < 0.72:
            continue
        polygon_pairs = mask_to_polygons(
            cv2.drawContours(np.zeros((height, width), np.uint8), [hull], -1, 255, -1),
            min_area_ratio=0.02,
            limit=1,
        )
        if not polygon_pairs:
            continue
        points, area_ratio = polygon_pairs[0]
        if len(points) > 12:
            continue
        points = scale_points(points, 1.0 / scale, 1.0 / scale)
        confidence = float(np.clip(0.3 + score * 0.28 + area_ratio * 0.42, 0.0, 0.86))
        if confidence < 0.48:
            continue
        accepted.append(
            {
                "id": f"detected-wall-{len(accepted) + 1}",
                "name": f"Detected wall {len(accepted) + 1}",
                "points": points,
                "confidence": round(confidence, 2),
                "source": "local-python-classical",
                "needsReview": True,
                "opacity": 0.56,
                "blendMode": "multiply",
            }
        )
        accepted_boxes.append(box)
        if len(accepted) >= limit:
            break
    return accepted


def fastsam_wall_proposals(image: np.ndarray, expected_walls: int | None = None) -> list[dict[str, Any]]:
    from ultralytics import FastSAM  # type: ignore

    model = FastSAM(str(FASTSAM_WEIGHTS))
    result = model(image, device="cpu", retina_masks=True, imgsz=1024, conf=0.35, iou=0.8, verbose=False)
    if not result or result[0].masks is None:
        return []
    masks = result[0].masks.data.cpu().numpy()
    ranked: list[tuple[float, np.ndarray]] = []
    height, width = image.shape[:2]
    edges = cv2.Canny(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 50, 130)
    for raw in masks:
        mask = cv2.resize(raw.astype(np.float32), (width, height)) > 0.5
        contours, _ = cv2.findContours(mask.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        score = _candidate_score(contour, image, edges, [], [])
        if score > 0.2:
            ranked.append((score, mask.astype(np.uint8) * 255))
    ranked.sort(key=lambda item: item[0], reverse=True)
    output: list[dict[str, Any]] = []
    for score, mask in ranked[: max(1, min(expected_walls or 4, 4))]:
        polygon = mask_to_polygons(mask, min_area_ratio=0.035, limit=1)
        if not polygon:
            continue
        output.append(
            {
                "id": f"detected-wall-{len(output) + 1}",
                "name": f"Detected wall {len(output) + 1}",
                "points": polygon[0][0],
                "confidence": round(float(np.clip(0.48 + score * 0.3, 0.45, 0.92)), 2),
                "source": "local-python",
                "needsReview": True,
                "opacity": 0.56,
                "blendMode": "multiply",
            }
        )
    return output


def detect_walls(
    image: np.ndarray,
    mode: str,
    positive_points: list[list[float]] | None = None,
    negative_points: list[list[float]] | None = None,
    expected_walls: int | None = None,
) -> tuple[str, list[dict[str, Any]], list[str]]:
    capabilities = model_capabilities()
    warnings: list[str] = []
    if mode in {"auto", "fastsam"} and capabilities["fastsam"]:
        try:
            masks = fastsam_wall_proposals(image, expected_walls)
            if masks:
                return "fastsam", masks, warnings
            warnings.append("FastSAM returned no suitable wall planes; classical proposals were used.")
        except Exception as error:  # optional model must never take down the service
            warnings.append(f"FastSAM was unavailable for this image: {error}")
    elif mode == "fastsam":
        warnings.append("FastSAM is not installed or its weights are missing; classical proposals were used.")
    if mode == "mobilesam":
        warnings.append("MobileSAM is not configured; classical proposals were used.")

    masks = classical_wall_proposals(image, positive_points, negative_points, expected_walls)
    if not masks:
        warnings.append("No confident wall detected. Please draw manually.")
    return "classical-opencv", masks, warnings
