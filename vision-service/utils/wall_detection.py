from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .masks import (
    contour_to_polygon,
    is_safe_wall_mask,
    mask_area_ratio,
    mask_iou,
    polygon_mask,
    scale_points,
)


ROOT = Path(__file__).resolve().parents[1]
FASTSAM_WEIGHTS = Path(os.getenv("FASTSAM_WEIGHTS", ROOT / "models" / "FastSAM-s.pt"))
MAX_PROCESSING_SIDE = 960


def model_capabilities() -> dict[str, bool]:
    return {
        "classical": True,
        "fastsam": bool(importlib.util.find_spec("ultralytics") and FASTSAM_WEIGHTS.exists()),
        "mobilesam": bool(
            importlib.util.find_spec("segment_anything")
            and (ROOT / "models" / "mobile_sam.pt").exists()
        ),
    }


def _resize_for_processing(image: np.ndarray) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    scale = min(1.0, MAX_PROCESSING_SIDE / max(height, width))
    if scale == 1.0:
        return image.copy(), scale
    return (
        cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA),
        scale,
    )


def _local_standard_deviation(gray: np.ndarray, window: int = 11) -> np.ndarray:
    source = gray.astype(np.float32)
    mean = cv2.boxFilter(source, -1, (window, window), normalize=True)
    mean_square = cv2.boxFilter(source * source, -1, (window, window), normalize=True)
    return np.sqrt(np.maximum(mean_square - mean * mean, 0.0))


def _detect_floor_line(gray: np.ndarray, edges: np.ndarray) -> tuple[int, bool]:
    height, width = gray.shape
    fallback = int(height * 0.78)
    start = int(height * 0.62)
    end = min(height - 2, int(height * 0.9))
    if end <= start:
        return fallback, False

    vertical_gradient = np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))
    gradient_score = vertical_gradient[:, int(width * 0.03): int(width * 0.97)].mean(axis=1)
    edge_score = (edges > 0).astype(np.float32).mean(axis=1) * 100.0
    row_score = cv2.GaussianBlur(
        (gradient_score + edge_score * 0.8).reshape(-1, 1),
        (1, 9),
        0,
    ).ravel()

    hough_votes = np.zeros(height, dtype=np.float32)
    lines = cv2.HoughLinesP(
        edges[start:end],
        1,
        np.pi / 180,
        threshold=max(25, width // 9),
        minLineLength=max(40, int(width * 0.28)),
        maxLineGap=max(10, int(width * 0.08)),
    )
    if lines is not None:
        for raw in lines[:, 0]:
            x1, y1, x2, y2 = (int(value) for value in raw)
            y1 += start
            y2 += start
            length = float(np.hypot(x2 - x1, y2 - y1))
            if length <= 0 or abs(y2 - y1) / length > 0.12:
                continue
            line_y = int(round((y1 + y2) / 2))
            if 0 <= line_y < height:
                hough_votes[max(0, line_y - 3): min(height, line_y + 4)] += length / width * 55.0

    combined = row_score + hough_votes
    selected = start + int(np.argmax(combined[start:end]))
    baseline = float(np.median(combined[start:end]))
    spread = float(np.std(combined[start:end]))
    confident = combined[selected] >= baseline + max(3.5, spread * 0.65)
    if not confident:
        return fallback, False
    return int(np.clip(selected, int(height * 0.64), int(height * 0.88))), True


def _preprocess(image: np.ndarray) -> dict[str, Any]:
    work, scale = _resize_for_processing(image)
    height, width = work.shape[:2]
    denoised = cv2.bilateralFilter(work, 7, 38, 38)
    rgb = cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB)
    hsv = cv2.cvtColor(denoised, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    gray = cv2.cvtColor(denoised, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 42, 118)
    texture = _local_standard_deviation(gray)
    edge_density = cv2.boxFilter(
        (edges > 0).astype(np.float32),
        -1,
        (13, 13),
        normalize=True,
    )
    floor_y, floor_detected = _detect_floor_line(gray, edges)
    return {
        "work": work,
        "scale": scale,
        "height": height,
        "width": width,
        "rgb": rgb,
        "hsv": hsv,
        "lab": lab,
        "gray": gray,
        "edges": edges,
        "texture": texture,
        "edgeDensity": edge_density,
        "saturation": hsv[..., 1].astype(np.float32),
        "brightness": hsv[..., 2].astype(np.float32),
        "floorY": floor_y,
        "floorDetected": floor_detected,
    }


def _wall_likeness(context: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    height = context["height"]
    width = context["width"]
    floor_y = context["floorY"]
    hsv = context["hsv"]
    texture = context["texture"]
    edge_density = context["edgeDensity"]
    brightness = context["brightness"]
    saturation = context["saturation"]

    texture_limit = float(np.clip(np.percentile(texture[:floor_y], 63), 7.0, 20.0))
    texture_score = np.clip(1.0 - texture / max(texture_limit * 1.65, 1.0), 0.0, 1.0)
    edge_score = np.clip(1.0 - edge_density / 0.18, 0.0, 1.0)
    saturation_score = np.clip(1.0 - saturation / 150.0, 0.0, 1.0)
    brightness_score = np.clip((brightness - 28.0) / 62.0, 0.0, 1.0)
    brightness_score *= np.clip((252.0 - brightness) / 35.0, 0.25, 1.0)

    score = (
        texture_score * 0.38
        + edge_score * 0.32
        + saturation_score * 0.17
        + brightness_score * 0.13
    )

    hue = hsv[..., 0]
    green_plant = (hue >= 32) & (hue <= 96) & (saturation > 72)
    very_dark = brightness < 27
    high_texture = (texture > max(24.0, texture_limit * 2.0)) | (edge_density > 0.28)
    allowed = ~(green_plant | very_dark | high_texture)
    allowed[floor_y:, :] = False
    allowed[: max(1, int(height * 0.015)), :] = True

    candidate = ((score >= 0.56) & allowed).astype(np.uint8) * 255
    close_size = max(7, int(round(min(width, height) * 0.035)) | 1)
    open_size = max(3, int(round(min(width, height) * 0.012)) | 1)
    candidate = cv2.morphologyEx(
        candidate,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_size, close_size)),
        iterations=2,
    )
    candidate = cv2.morphologyEx(
        candidate,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_size, open_size)),
        iterations=1,
    )
    candidate[floor_y:, :] = 0
    return score, candidate


def _point_inside(mask: np.ndarray, point: list[float]) -> bool:
    if len(point) < 2:
        return False
    x = int(round(point[0]))
    y = int(round(point[1]))
    return 0 <= y < mask.shape[0] and 0 <= x < mask.shape[1] and mask[y, x] > 0


def _score_mask(
    mask: np.ndarray,
    context: dict[str, Any],
    likeness: np.ndarray,
    positive_points: list[list[float]],
    negative_points: list[list[float]],
) -> float:
    height, width = mask.shape
    pixels = mask > 0
    if not np.any(pixels):
        return 0.0
    area_ratio = mask_area_ratio(mask)
    x, y, box_width, box_height = cv2.boundingRect(mask)
    rectangularity = np.count_nonzero(mask) / max(float(box_width * box_height), 1.0)
    smoothness = float(likeness[pixels].mean())
    edge_density = float(context["edgeDensity"][pixels].mean())
    saturation = float(context["saturation"][pixels].mean() / 255.0)
    top_preference = 1.0 - min(1.0, y / max(context["floorY"], 1))
    width_bonus = min(1.0, box_width / max(width * 0.5, 1.0))
    height_bonus = min(1.0, box_height / max(context["floorY"] * 0.65, 1.0))

    score = (
        min(1.0, area_ratio / 0.42) * 0.25
        + smoothness * 0.29
        + max(0.0, 1.0 - edge_density / 0.2) * 0.14
        + max(0.0, 1.0 - saturation / 0.65) * 0.06
        + rectangularity * 0.08
        + top_preference * 0.05
        + width_bonus * 0.07
        + height_bonus * 0.06
    )
    if any(_point_inside(mask, point) for point in positive_points):
        score += 0.13
    if any(_point_inside(mask, point) for point in negative_points):
        score -= 0.32
    if area_ratio > 0.7:
        score -= 0.25
    return float(np.clip(score, 0.0, 0.96))


def _component_candidates(
    candidate_mask: np.ndarray,
    context: dict[str, Any],
    likeness: np.ndarray,
    positive_points: list[list[float]],
    negative_points: list[list[float]],
) -> list[dict[str, Any]]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(candidate_mask, 8)
    image_area = candidate_mask.size
    output: list[dict[str, Any]] = []
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        box_width = int(stats[label, cv2.CC_STAT_WIDTH])
        box_height = int(stats[label, cv2.CC_STAT_HEIGHT])
        if (
            area < image_area * 0.045
            or box_width < context["width"] * 0.13
            or box_height < context["height"] * 0.16
        ):
            continue
        mask = np.where(labels == label, 255, 0).astype(np.uint8)
        mask[context["floorY"]:, :] = 0
        if not is_safe_wall_mask(mask, context["floorY"]):
            continue
        output.append(
            {
                "mask": mask,
                "confidence": _score_mask(
                    mask,
                    context,
                    likeness,
                    positive_points,
                    negative_points,
                ),
                "source": "low-texture-planar-region",
            }
        )
    return output


def _colour_cluster_candidates(
    context: dict[str, Any],
    likeness: np.ndarray,
    positive_points: list[list[float]],
    negative_points: list[list[float]],
) -> list[dict[str, Any]]:
    height, width = context["height"], context["width"]
    floor_y = context["floorY"]
    lab = context["lab"]
    sample = lab[:floor_y].reshape(-1, 3).astype(np.float32)
    if len(sample) < 12:
        return []
    cluster_count = 5
    _, labels, _ = cv2.kmeans(
        sample,
        cluster_count,
        None,
        (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 24, 1.0),
        2,
        cv2.KMEANS_PP_CENTERS,
    )
    labels = labels.reshape(floor_y, width)
    output: list[dict[str, Any]] = []
    smooth_allowed = (likeness[:floor_y] >= 0.48).astype(np.uint8) * 255
    kernel_size = max(7, int(min(width, height) * 0.025) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    for cluster in range(cluster_count):
        upper = np.where(labels == cluster, 255, 0).astype(np.uint8)
        upper = cv2.bitwise_and(upper, smooth_allowed)
        upper = cv2.morphologyEx(upper, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = np.zeros((height, width), dtype=np.uint8)
        mask[:floor_y] = upper
        count, component_labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        for label in range(1, count):
            if stats[label, cv2.CC_STAT_AREA] < mask.size * 0.05:
                continue
            component = np.where(component_labels == label, 255, 0).astype(np.uint8)
            if not is_safe_wall_mask(component, floor_y):
                continue
            output.append(
                {
                    "mask": component,
                    "confidence": _score_mask(
                        component,
                        context,
                        likeness,
                        positive_points,
                        negative_points,
                    )
                    * 0.96,
                    "source": "color-smoothness-cluster",
                }
            )
    return output


def _blank_wall_fallback(
    context: dict[str, Any],
    likeness: np.ndarray,
    positive_points: list[list[float]],
    negative_points: list[list[float]],
) -> dict[str, Any] | None:
    height, width = context["height"], context["width"]
    floor_y = context["floorY"]
    columns = int(np.clip(round(width / 55), 8, 18))
    rows = int(np.clip(round(floor_y / 55), 5, 10))
    cell_width = width / columns
    cell_height = floor_y / rows
    good = np.zeros((rows, columns), dtype=np.uint8)
    quality = np.zeros((rows, columns), dtype=np.float32)

    for row in range(rows):
        y1 = int(round(row * cell_height))
        y2 = min(floor_y, int(round((row + 1) * cell_height)))
        for column in range(columns):
            x1 = int(round(column * cell_width))
            x2 = min(width, int(round((column + 1) * cell_width)))
            region = likeness[y1:y2, x1:x2]
            if region.size == 0:
                continue
            region_quality = float(region.mean())
            low_quality_fraction = float(np.mean(region < 0.42))
            edge_density = float(context["edgeDensity"][y1:y2, x1:x2].mean())
            quality[row, column] = region_quality
            if region_quality >= 0.57 and low_quality_fraction < 0.34 and edge_density < 0.14:
                good[row, column] = 255

    good = cv2.morphologyEx(good, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    # Largest-rectangle search prevents disconnected wall-colored pixels from
    # bridging around cabinets/windows into a near-full-width proposal.
    heights = np.zeros(columns, dtype=np.int32)
    best: tuple[float, tuple[int, int, int, int]] | None = None
    for row in range(rows):
        heights = np.where(good[row] > 0, heights + 1, 0)
        stack: list[int] = []
        for column in range(columns + 1):
            current_height = int(heights[column]) if column < columns else 0
            while stack and current_height < heights[stack[-1]]:
                top = stack.pop()
                rectangle_height = int(heights[top])
                left = stack[-1] + 1 if stack else 0
                rectangle_width = column - left
                area = rectangle_width * rectangle_height
                if (
                    area < max(6, rows * columns * 0.12)
                    or rectangle_width < 3
                    or rectangle_height < max(3, int(np.ceil(rows * 0.55)))
                ):
                    continue
                top_row = row - rectangle_height + 1
                region_quality = quality[
                    top_row: row + 1,
                    left: column,
                ]
                mean_quality = float(region_quality.mean())
                coverage = area / float(rows * columns)
                score = mean_quality * 0.72 + min(coverage / 0.45, 1.0) * 0.28
                if best is None or score > best[0]:
                    best = (
                        score,
                        (left, top_row, rectangle_width, rectangle_height),
                    )
            stack.append(column)
    if best is None:
        return None

    _, (grid_x, grid_y, grid_width, grid_height) = best
    x1 = max(0, int(np.floor(grid_x * cell_width)))
    y1 = max(0, int(np.floor(grid_y * cell_height)))
    x2 = min(width - 1, int(np.ceil((grid_x + grid_width) * cell_width)))
    y2 = min(floor_y - 1, int(np.ceil((grid_y + grid_height) * cell_height)))
    if y1 <= int(height * 0.08):
        y1 = 0
    if x1 <= int(width * 0.04):
        x1 = 0
    if floor_y - y2 <= int(height * 0.1):
        y2 = floor_y - 1

    mask = np.zeros((height, width), dtype=np.uint8)
    mask[y1:y2 + 1, x1:x2 + 1] = 255
    if not is_safe_wall_mask(mask, floor_y):
        return None
    confidence = _score_mask(
        mask,
        context,
        likeness,
        positive_points,
        negative_points,
    )
    if confidence < 0.52:
        return None
    return {
        "mask": mask,
        "confidence": float(np.clip(confidence, 0.55, 0.7)),
        "source": "blank-wall-fallback",
    }


def _click_candidate(
    context: dict[str, Any],
    likeness: np.ndarray,
    positive_points: list[list[float]],
    negative_points: list[list[float]],
) -> dict[str, Any] | None:
    if not positive_points:
        return None
    height, width = context["height"], context["width"]
    floor_y = context["floorY"]
    seed_x = int(np.clip(round(positive_points[0][0]), 0, width - 1))
    seed_y = int(np.clip(round(positive_points[0][1]), 0, height - 1))
    if seed_y >= floor_y:
        return None

    lab = context["lab"].astype(np.float32)
    radius = max(3, int(min(width, height) * 0.012))
    sample = lab[
        max(0, seed_y - radius): min(height, seed_y + radius + 1),
        max(0, seed_x - radius): min(width, seed_x + radius + 1),
    ]
    seed_colour = np.median(sample.reshape(-1, 3), axis=0)
    colour_distance = np.linalg.norm(
        (lab - seed_colour) * np.array([0.72, 1.0, 1.0], dtype=np.float32),
        axis=2,
    )
    threshold = float(np.clip(np.percentile(
        np.linalg.norm(
            (sample.reshape(-1, 3) - seed_colour)
            * np.array([0.72, 1.0, 1.0], dtype=np.float32),
            axis=1,
        ),
        90,
    ) + 16.0, 16.0, 31.0))
    eligible = (
        (colour_distance <= threshold)
        & (likeness >= 0.38)
        & (context["edgeDensity"] < 0.24)
    )
    eligible[floor_y:, :] = False
    eligible = eligible.astype(np.uint8) * 255
    cv2.circle(eligible, (seed_x, seed_y), max(2, radius // 2), 255, -1)
    eligible = cv2.morphologyEx(
        eligible,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (max(5, radius * 2 + 1), max(5, radius * 2 + 1)),
        ),
        iterations=2,
    )
    for point in negative_points:
        if len(point) >= 2:
            cv2.circle(
                eligible,
                (int(round(point[0])), int(round(point[1]))),
                max(8, int(min(width, height) * 0.035)),
                0,
                -1,
            )
    count, labels, stats, _ = cv2.connectedComponentsWithStats(eligible, 8)
    seed_label = int(labels[seed_y, seed_x])
    if seed_label == 0:
        nearby = labels[
            max(0, seed_y - radius): min(height, seed_y + radius + 1),
            max(0, seed_x - radius): min(width, seed_x + radius + 1),
        ]
        nonzero = nearby[nearby > 0]
        if nonzero.size:
            seed_label = int(np.bincount(nonzero).argmax())
    if seed_label <= 0 or seed_label >= count:
        return None
    mask = np.where(labels == seed_label, 255, 0).astype(np.uint8)
    if stats[seed_label, cv2.CC_STAT_AREA] < mask.size * 0.035:
        return None
    if not is_safe_wall_mask(mask, floor_y):
        return None
    confidence = _score_mask(mask, context, likeness, positive_points, negative_points)
    return {
        "mask": mask,
        "confidence": float(np.clip(confidence + 0.08, 0.58, 0.88)),
        "source": "click-assisted-region-growing",
    }


def _candidate_to_output(
    candidate: dict[str, Any],
    index: int,
    scale: float,
    original_width: int,
    original_height: int,
) -> dict[str, Any] | None:
    contours, _ = cv2.findContours(
        candidate["mask"],
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    points = contour_to_polygon(
        contour,
        candidate["mask"].shape[1],
        candidate["mask"].shape[0],
    )
    points = scale_points(points, 1.0 / scale, 1.0 / scale)
    points = [
        [
            int(np.clip(x, 0, original_width - 1)),
            int(np.clip(y, 0, original_height - 1)),
        ]
        for x, y in points
    ]
    names = ["Main Wall", "Side Wall", "Accent Wall", "Detected Wall 4"]
    confidence = round(min(float(candidate["confidence"]), 0.84), 2)
    return {
        "id": "main-wall" if index == 0 else f"detected-wall-{index + 1}",
        "name": names[index] if index < len(names) else f"Detected Wall {index + 1}",
        "points": points,
        "confidence": confidence,
        "source": candidate["source"],
        "needsReview": confidence < 0.85,
    }


def classical_wall_proposals(
    image: np.ndarray,
    mode: str = "classical",
    positive_points: list[list[float]] | None = None,
    negative_points: list[list[float]] | None = None,
    expected_walls: int | None = None,
    min_confidence: float = 0.48,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    positive_points = positive_points or []
    negative_points = negative_points or []
    original_height, original_width = image.shape[:2]
    context = _preprocess(image)
    scale = context["scale"]
    scaled_positive = [[point[0] * scale, point[1] * scale] for point in positive_points]
    scaled_negative = [[point[0] * scale, point[1] * scale] for point in negative_points]
    likeness, candidate_mask = _wall_likeness(context)

    candidates: list[dict[str, Any]] = []
    click = _click_candidate(context, likeness, scaled_positive, scaled_negative)
    if mode == "click" and click is not None:
        candidates.append(click)
    if mode != "click" or click is None:
        candidates.extend(
            _component_candidates(
                candidate_mask,
                context,
                likeness,
                scaled_positive,
                scaled_negative,
            )
        )
        candidates.extend(
            _colour_cluster_candidates(
                context,
                likeness,
                scaled_positive,
                scaled_negative,
            )
        )
        fallback = _blank_wall_fallback(
            context,
            likeness,
            scaled_positive,
            scaled_negative,
        )
        if fallback is not None:
            if (
                mode == "click"
                and scaled_positive
                and _point_inside(fallback["mask"], scaled_positive[0])
            ):
                fallback["source"] = "click-assisted-region-growing"
                fallback["confidence"] = min(0.82, fallback["confidence"] + 0.08)
            candidates.append(fallback)

    candidates.sort(
        key=lambda item: (item["confidence"], mask_area_ratio(item["mask"])),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    limit = max(1, min(expected_walls or 4, 4))
    threshold = float(np.clip(min_confidence, 0.35, 0.9))
    for candidate in candidates:
        if candidate["confidence"] < threshold:
            continue
        if any(mask_iou(candidate["mask"], other["mask"]) > 0.62 for other in selected):
            continue
        selected.append(candidate)
        if len(selected) >= limit:
            break

    masks: list[dict[str, Any]] = []
    for index, candidate in enumerate(selected):
        output = _candidate_to_output(
            candidate,
            index,
            scale,
            original_width,
            original_height,
        )
        if output is not None:
            masks.append(output)

    primary_source = masks[0]["source"] if masks else ""
    if mode == "click" and primary_source == "click-assisted-region-growing":
        method = "classical-opencv-click"
    elif mode == "blank-wall" or primary_source == "blank-wall-fallback":
        method = "classical-opencv-blank-wall"
    else:
        method = "classical-opencv"
    debug = {
        "floorY": int(round(context["floorY"] / scale)),
        "floorDetected": bool(context["floorDetected"]),
        "method": method,
    }
    return masks, debug


def fastsam_wall_proposals(
    image: np.ndarray,
    expected_walls: int | None = None,
) -> list[dict[str, Any]]:
    from ultralytics import FastSAM  # type: ignore

    model = FastSAM(str(FASTSAM_WEIGHTS))
    result = model(
        image,
        device="cpu",
        retina_masks=True,
        imgsz=1024,
        conf=0.35,
        iou=0.8,
        verbose=False,
    )
    if not result or result[0].masks is None:
        return []
    height, width = image.shape[:2]
    output: list[dict[str, Any]] = []
    for raw in result[0].masks.data.cpu().numpy():
        mask = (
            cv2.resize(raw.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)
            > 0.5
        ).astype(np.uint8) * 255
        floor_y = int(height * 0.78)
        mask[floor_y:, :] = 0
        if not is_safe_wall_mask(mask, floor_y):
            continue
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        points = contour_to_polygon(max(contours, key=cv2.contourArea), width, height)
        index = len(output)
        output.append(
            {
                "id": "main-wall" if index == 0 else f"detected-wall-{index + 1}",
                "name": ["Main Wall", "Side Wall", "Accent Wall", "Detected Wall 4"][index],
                "points": points,
                "confidence": 0.82,
                "source": "fastsam",
                "needsReview": True,
            }
        )
        if len(output) >= max(1, min(expected_walls or 4, 4)):
            break
    return output


def detect_walls(
    image: np.ndarray,
    mode: str,
    positive_points: list[list[float]] | None = None,
    negative_points: list[list[float]] | None = None,
    expected_walls: int | None = None,
    min_confidence: float = 0.48,
) -> tuple[str, list[dict[str, Any]], list[str], dict[str, Any]]:
    capabilities = model_capabilities()
    warnings: list[str] = []
    if mode == "auto" and capabilities["fastsam"]:
        try:
            masks = fastsam_wall_proposals(image, expected_walls)
            if masks:
                return (
                    "fastsam",
                    masks,
                    ["AI-assisted mask generated. Please review wall edges."],
                    {"floorY": int(image.shape[0] * 0.78), "floorDetected": False},
                )
            warnings.append("FastSAM returned no suitable wall planes; classical detection was used.")
        except Exception as error:
            warnings.append(f"FastSAM was unavailable for this image: {error}")

    masks, debug = classical_wall_proposals(
        image,
        mode=mode,
        positive_points=positive_points,
        negative_points=negative_points,
        expected_walls=expected_walls,
        min_confidence=min_confidence,
    )
    if masks:
        warnings.append("AI-assisted mask generated. Please review wall edges.")
    else:
        warnings.append("No confident wall detected. Please draw manually.")
    return debug["method"], masks, warnings, debug
