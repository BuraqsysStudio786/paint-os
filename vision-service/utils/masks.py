from __future__ import annotations

from typing import Iterable

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
