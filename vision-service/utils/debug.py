from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np


def render_detection_debug(
    image: np.ndarray,
    floor_y: int,
    masks: list[dict[str, Any]],
) -> str:
    canvas = image.copy()
    height, width = canvas.shape[:2]
    floor_y = int(np.clip(floor_y, 0, max(height - 1, 0)))
    cv2.line(canvas, (0, floor_y), (width - 1, floor_y), (30, 80, 255), 3)
    cv2.putText(
        canvas,
        f"floorY={floor_y}",
        (12, max(24, floor_y - 10)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (30, 80, 255),
        2,
        cv2.LINE_AA,
    )

    colours = [(38, 210, 80), (255, 170, 30), (210, 80, 220), (40, 220, 220)]
    overlay = canvas.copy()
    for index, mask in enumerate(masks):
        polygon = np.asarray(mask.get("points", []), dtype=np.int32)
        if len(polygon) < 3:
            continue
        colour = colours[index % len(colours)]
        cv2.fillPoly(overlay, [polygon], colour)
        cv2.polylines(canvas, [polygon], True, colour, 3, cv2.LINE_AA)
        x, y = polygon.min(axis=0)
        label = f'{mask.get("name", "Wall")} {mask.get("confidence", 0):.2f}'
        cv2.putText(
            canvas,
            label,
            (int(x) + 5, max(22, int(y) + 24)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.58,
            colour,
            2,
            cv2.LINE_AA,
        )
    canvas = cv2.addWeighted(overlay, 0.22, canvas, 0.78, 0)
    ok, encoded = cv2.imencode(".png", canvas)
    if not ok:
        raise RuntimeError("Could not encode debug image.")
    return base64.b64encode(encoded.tobytes()).decode("ascii")
