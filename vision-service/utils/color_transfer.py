from __future__ import annotations

import cv2
import numpy as np

from .masks import polygon_mask


def hex_to_bgr(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise ValueError("shadeHex must be a six-digit hex colour")
    red, green, blue = (int(value[index:index + 2], 16) for index in (0, 2, 4))
    return blue, green, red


def apply_paint(
    image: np.ndarray,
    polygons: list[list[list[int]]],
    shade_hex: str,
    opacity: float,
    finish: str,
    preserve_shadows: bool,
) -> np.ndarray:
    height, width = image.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)
    for points in polygons:
        mask = cv2.max(mask, polygon_mask(width, height, points))

    colour = np.full_like(image, hex_to_bgr(shade_hex))
    alpha = float(np.clip(opacity, 0.05, 0.95))
    if preserve_shadows:
        luminance = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        luminance = np.clip(0.38 + luminance[..., None] * 0.72, 0.25, 1.0)
        colour = np.clip(colour.astype(np.float32) * luminance, 0, 255).astype(np.uint8)

    if finish in {"silk", "gloss"}:
        highlight = cv2.GaussianBlur(image, (0, 0), 18)
        strength = 0.08 if finish == "silk" else 0.16
        colour = cv2.addWeighted(colour, 1.0 - strength, highlight, strength, 0)
    elif finish == "texture":
        noise = np.random.default_rng(7).normal(0, 5, image.shape).astype(np.int16)
        colour = np.clip(colour.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    blended = cv2.addWeighted(image, 1.0 - alpha, colour, alpha, 0)
    result = image.copy()
    result[mask > 0] = blended[mask > 0]
    return result
