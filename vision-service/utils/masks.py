from __future__ import annotations

from typing import Iterable

import cv2
import numpy as np


def simplify_contour(contour: np.ndarray, epsilon_ratio: float = 0.012) -> list[list[int]]:
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
    polygon = np.array([[int(x), int(y)] for x, y in points], dtype=np.int32)
    if len(polygon) >= 3:
        cv2.fillPoly(mask, [polygon], 255)
    return mask


def scale_points(points: list[list[int]], scale_x: float, scale_y: float) -> list[list[int]]:
    return [[round(x * scale_x), round(y * scale_y)] for x, y in points]
