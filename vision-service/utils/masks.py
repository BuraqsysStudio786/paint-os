from __future__ import annotations

from typing import Any, Iterable

import cv2
import numpy as np


def simplify_contour(contour: np.ndarray, epsilon_ratio: float = 0.018) -> list[list[int]]:
    perimeter = cv2.arcLength(contour, True)
    polygon = cv2.approxPolyDP(contour, max(2.0, perimeter * epsilon_ratio), True)
    points = [[int(point[0][0]), int(point[0][1])] for point in polygon]
    if len(points) < 3:
        x, y, width, height = cv2.boundingRect(contour)
        points = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]
    return points


def mask_to_polygons(
    mask: np.ndarray,
    min_area_ratio: float = 0.025,
    limit: int = 4,
) -> list[tuple[list[list[int]], float]]:
    binary = np.where(mask > 0, 255, 0).astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    image_area = float(binary.shape[0] * binary.shape[1])
    ranked = sorted(contours, key=cv2.contourArea, reverse=True)
    result: list[tuple[list[list[int]], float]] = []
    for contour in ranked:
        area = cv2.contourArea(contour)
        if area < image_area * min_area_ratio:
            continue
        result.append((simplify_contour(contour), area / image_area))
        if len(result) >= limit:
            break
    return result


def polygon_mask(width: int, height: int, points: Iterable[Iterable[float]]) -> np.ndarray:
    mask = np.zeros((height, width), dtype=np.uint8)
    polygon = np.array(
        [
            [
                int(np.clip(x, 0, max(width - 1, 0))),
                int(np.clip(y, 0, max(height - 1, 0))),
            ]
            for x, y in points
        ],
        dtype=np.int32,
    )
    if len(polygon) >= 3:
        cv2.fillPoly(mask, [polygon], 255)
    return mask


def scale_points(points: list[list[int]], scale_x: float, scale_y: float) -> list[list[int]]:
    return [[round(x * scale_x), round(y * scale_y)] for x, y in points]


def contour_to_polygon(
    contour: np.ndarray,
    width: int,
    height: int,
    *,
    max_points: int = 12,
) -> list[list[int]]:
    """Create a stable, clipped polygon without returning an entire-image mask."""
    points = simplify_contour(contour)
    if len(points) > max_points:
        hull = cv2.convexHull(contour)
        points = simplify_contour(hull, epsilon_ratio=0.025)
    return [
        [
            int(np.clip(x, 0, max(width - 1, 0))),
            int(np.clip(y, 0, max(height - 1, 0))),
        ]
        for x, y in points
    ]


def mask_area_ratio(mask: np.ndarray) -> float:
    return float(np.count_nonzero(mask)) / max(float(mask.size), 1.0)


def mask_iou(first: np.ndarray, second: np.ndarray) -> float:
    intersection = np.count_nonzero((first > 0) & (second > 0))
    union = np.count_nonzero((first > 0) | (second > 0))
    return float(intersection) / max(float(union), 1.0)


def is_safe_wall_mask(mask: np.ndarray, floor_y: int) -> bool:
    """Reject floor-heavy, tiny, and effectively full-image proposals."""
    height, width = mask.shape[:2]
    area_ratio = mask_area_ratio(mask)
    if area_ratio < 0.035 or area_ratio > 0.78:
        return False
    floor_pixels = np.count_nonzero(mask[max(0, floor_y + 2):])
    total_pixels = np.count_nonzero(mask)
    if floor_pixels / max(float(total_pixels), 1.0) > 0.035:
        return False
    x, y, box_width, box_height = cv2.boundingRect(np.where(mask > 0, 255, 0).astype(np.uint8))
    rectangularity = total_pixels / max(float(box_width * box_height), 1.0)
    if box_width >= width * 0.97 and (
        box_height >= height * 0.9
        or (area_ratio > 0.5 and rectangularity < 0.88)
    ):
        return False
    return y < floor_y and box_width >= width * 0.12 and box_height >= height * 0.16


def _signed_polygon_area(points: list[list[int]]) -> float:
    return 0.5 * sum(
        points[index][0] * points[(index + 1) % len(points)][1]
        - points[(index + 1) % len(points)][0] * points[index][1]
        for index in range(len(points))
    )


def _segments_intersect(
    first_start: list[int],
    first_end: list[int],
    second_start: list[int],
    second_end: list[int],
) -> bool:
    def orientation(a: list[int], b: list[int], c: list[int]) -> int:
        value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
        if abs(value) < 1e-6:
            return 0
        return 1 if value > 0 else 2

    return (
        orientation(first_start, first_end, second_start)
        != orientation(first_start, first_end, second_end)
        and orientation(second_start, second_end, first_start)
        != orientation(second_start, second_end, first_end)
    )


def _self_intersects(points: list[list[int]]) -> bool:
    count = len(points)
    for first in range(count):
        first_next = (first + 1) % count
        for second in range(first + 1, count):
            second_next = (second + 1) % count
            if first in {second, second_next} or first_next in {second, second_next}:
                continue
            if first == 0 and second_next == 0:
                continue
            if _segments_intersect(
                points[first],
                points[first_next],
                points[second],
                points[second_next],
            ):
                return True
    return False


def _remove_short_edges(
    points: list[list[int]],
    minimum_length: float,
) -> list[list[int]]:
    cleaned = points[:]
    changed = True
    while changed and len(cleaned) > 4:
        changed = False
        for index in range(len(cleaned)):
            previous = cleaned[index - 1]
            current = cleaned[index]
            if np.hypot(current[0] - previous[0], current[1] - previous[1]) < minimum_length:
                cleaned.pop(index)
                changed = True
                break
    return cleaned


def _remove_inward_dents(points: list[list[int]]) -> list[list[int]]:
    if len(points) <= 4:
        return points
    contour = np.asarray(points, dtype=np.int32).reshape((-1, 1, 2))
    hull = cv2.convexHull(contour)
    hull_points = [[int(point[0][0]), int(point[0][1])] for point in hull]
    contour_area = abs(cv2.contourArea(contour))
    hull_area = abs(cv2.contourArea(hull))
    if hull_area <= 0:
        return points
    # Convexification is intentionally conservative: it removes meaningful
    # inward object notches without replacing a strongly concave room shape.
    if contour_area / hull_area >= 0.7:
        return hull_points
    return points


def _profile_value(
    values: list[float] | np.ndarray | None,
    fallback: float,
    quantile: float = 0.5,
) -> float:
    if values is None:
        return fallback
    array = np.asarray(values, dtype=np.float32)
    array = array[np.isfinite(array)]
    if array.size == 0:
        return fallback
    return float(np.quantile(array, quantile))


def regularize_wall_polygon(
    points: list[list[int]],
    image_width: int,
    image_height: int,
    floor_y: int,
    click_point: list[float] | tuple[float, float] | None = None,
    diagnostics: dict[str, Any] | None = None,
) -> list[list[int]]:
    """Convert a raw wall contour into a simple, safe wall-plane polygon.

    Optional diagnostics may include source, texture, edgeDensity, rowRight,
    rowLeft, and columnCoverage values calculated from the originating mask.
    The dictionary is updated in place with regularization metadata.
    """
    info = diagnostics if diagnostics is not None else {}
    raw_count = len(points)
    width = max(1, int(image_width))
    height = max(1, int(image_height))
    floor_y = int(np.clip(floor_y, 1, height - 1))
    snap_x = max(4, int(width * 0.025))
    snap_y = max(4, int(height * 0.025))
    minimum_edge = max(4.0, min(width, height) * 0.018)

    clipped = [
        [
            int(np.clip(round(point[0]), 0, width - 1)),
            int(np.clip(round(point[1]), 0, height - 1)),
        ]
        for point in points
        if len(point) >= 2
    ]
    deduplicated: list[list[int]] = []
    for point in clipped:
        if not deduplicated or point != deduplicated[-1]:
            deduplicated.append(point)
    if len(deduplicated) > 1 and deduplicated[0] == deduplicated[-1]:
        deduplicated.pop()
    if len(deduplicated) < 3:
        info.update({
            "rawPointsCount": raw_count,
            "cleanedPointsCount": raw_count,
            "regularized": False,
            "regularizationReason": "insufficient raw polygon points",
        })
        return []

    contour = np.asarray(deduplicated, dtype=np.int32).reshape((-1, 1, 2))
    perimeter = cv2.arcLength(contour, True)
    approximated = cv2.approxPolyDP(
        contour,
        max(2.0, perimeter * 0.018),
        True,
    )
    cleaned = [[int(item[0][0]), int(item[0][1])] for item in approximated]
    cleaned = _remove_short_edges(cleaned, minimum_edge)
    cleaned = _remove_inward_dents(cleaned)

    xs = [point[0] for point in cleaned]
    ys = [point[1] for point in cleaned]
    minimum_x, maximum_x = min(xs), max(xs)
    minimum_y, maximum_y = min(ys), max(ys)
    touches_left = minimum_x <= snap_x
    touches_right = maximum_x >= width - 1 - snap_x
    touches_top = minimum_y <= snap_y
    near_floor = maximum_y >= floor_y - max(8, int(height * 0.08))
    mostly_above_floor = sum(point[1] <= floor_y for point in cleaned) / len(cleaned) >= 0.8
    texture = float(info.get("texture", 255.0))
    edge_density = float(info.get("edgeDensity", 1.0))
    click_assisted = str(info.get("source", "")).startswith("click-assisted")
    low_texture = texture <= float(info.get("textureLimit", 20.0))
    low_edges = edge_density <= float(info.get("edgeDensityLimit", 0.16))

    plane_reason = ""
    plane: list[list[int]] | None = None
    if click_assisted and mostly_above_floor and low_texture and low_edges:
        bottom = floor_y if near_floor else min(maximum_y, floor_y)
        row_right = info.get("rowRight")
        row_left = info.get("rowLeft")
        column_coverage = np.asarray(info.get("columnCoverage", []), dtype=np.float32)
        click_x = float(click_point[0]) if click_point and len(click_point) >= 2 else (minimum_x + maximum_x) / 2

        if touches_left and touches_top:
            dominant_right = float(maximum_x)
            if column_coverage.size == width:
                threshold = max(0.48, float(info.get("columnCoverageThreshold", 0.58)))
                valid = np.where(column_coverage >= threshold)[0]
                connected = valid[valid >= max(0, int(click_x))]
                if connected.size:
                    # Find the end of the contiguous high-occupancy wall span
                    # containing or immediately following the clicked column.
                    start_index = int(np.argmin(np.abs(connected - click_x)))
                    end_value = int(connected[start_index])
                    for value in connected[start_index + 1:]:
                        if int(value) > end_value + 2:
                            break
                        end_value = int(value)
                    dominant_right = float(end_value)
            top_right = _profile_value(
                info.get("topRight"),
                _profile_value(row_right, dominant_right, 0.45),
                0.5,
            )
            bottom_right = _profile_value(
                info.get("bottomRight"),
                _profile_value(row_right, dominant_right, 0.55),
                0.5,
            )
            tolerance = width * 0.09
            top_right = float(np.clip(top_right, dominant_right - tolerance, dominant_right + tolerance))
            bottom_right = float(np.clip(bottom_right, dominant_right - tolerance, dominant_right + tolerance))
            top_right = max(top_right, click_x + width * 0.08)
            bottom_right = max(bottom_right, click_x + width * 0.08)
            plane = [
                [0, 0],
                [int(round(top_right)), 0],
                [int(round(bottom_right)), int(bottom)],
                [0, int(bottom)],
            ]
            plane_reason = "click wall plane fitted to left/top boundaries and floor line"
        elif touches_right and touches_top:
            dominant_left = float(minimum_x)
            top_left = _profile_value(info.get("topLeft"), _profile_value(row_left, dominant_left, 0.55))
            bottom_left = _profile_value(info.get("bottomLeft"), _profile_value(row_left, dominant_left, 0.45))
            tolerance = width * 0.09
            top_left = float(np.clip(top_left, dominant_left - tolerance, dominant_left + tolerance))
            bottom_left = float(np.clip(bottom_left, dominant_left - tolerance, dominant_left + tolerance))
            top_left = min(top_left, click_x - width * 0.08)
            bottom_left = min(bottom_left, click_x - width * 0.08)
            plane = [
                [int(round(top_left)), 0],
                [width - 1, 0],
                [width - 1, int(bottom)],
                [int(round(bottom_left)), int(bottom)],
            ]
            plane_reason = "click wall plane fitted to right/top boundaries and floor line"
        elif touches_top:
            left = 0 if touches_left else minimum_x
            right = width - 1 if touches_right else maximum_x
            plane = [
                [int(left), 0],
                [int(right), 0],
                [int(right), int(bottom)],
                [int(left), int(bottom)],
            ]
            plane_reason = "click wall plane fitted to top boundary and floor line"

    if plane is not None:
        cleaned = plane
    else:
        cleaned = [
            [
                0 if point[0] <= snap_x else width - 1 if point[0] >= width - 1 - snap_x else point[0],
                0 if point[1] <= snap_y else floor_y if abs(point[1] - floor_y) <= max(snap_y, int(height * 0.05)) else point[1],
            ]
            for point in cleaned
        ]
        cleaned = _remove_short_edges(cleaned, minimum_edge)
        if len(cleaned) > 6:
            contour = np.asarray(cleaned, dtype=np.int32).reshape((-1, 1, 2))
            perimeter = cv2.arcLength(contour, True)
            for epsilon_ratio in (0.025, 0.035, 0.05, 0.07):
                simplified = cv2.approxPolyDP(
                    contour,
                    max(2.0, perimeter * epsilon_ratio),
                    True,
                )
                candidate = [[int(item[0][0]), int(item[0][1])] for item in simplified]
                if 3 <= len(candidate) <= 6:
                    cleaned = candidate
                    break
        plane_reason = "contour simplified, dents removed, and room boundaries snapped"

    if _signed_polygon_area(cleaned) < 0:
        cleaned.reverse()
    if _self_intersects(cleaned):
        info.update({
            "rawPointsCount": raw_count,
            "cleanedPointsCount": len(deduplicated),
            "regularized": False,
            "regularizationReason": "polygon rejected because it self-intersects",
        })
        return []

    cleaned_mask = polygon_mask(width, height, cleaned)
    area_ratio = mask_area_ratio(cleaned_mask)
    floor_overlap = (
        np.count_nonzero(cleaned_mask[floor_y + 1:])
        / max(float(np.count_nonzero(cleaned_mask)), 1.0)
    )
    if area_ratio > 0.75 or floor_overlap > 0.035:
        info.update({
            "rawPointsCount": raw_count,
            "cleanedPointsCount": len(deduplicated),
            "regularized": False,
            "regularizationReason": "polygon rejected by full-image or floor-overlap safety check",
        })
        return []

    regularized = cleaned != deduplicated
    info.update({
        "rawPointsCount": raw_count,
        "cleanedPointsCount": len(cleaned),
        "regularized": regularized,
        "regularizationReason": plane_reason if regularized else "raw polygon already clean",
        "touchesLeft": touches_left,
        "touchesRight": touches_right,
        "touchesTop": touches_top,
        "floorOverlapRatio": round(float(floor_overlap), 4),
        "regularizedAreaRatio": round(float(area_ratio), 4),
    })
    return cleaned
