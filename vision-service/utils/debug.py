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
    legend_x = max(12, width - 250)
    cv2.rectangle(canvas, (legend_x - 7, 5), (width - 8, 50), (20, 20, 20), -1)
    cv2.putText(
        canvas,
        "raw polygon",
        (legend_x, 22),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (40, 80, 245),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        canvas,
        "cleaned wall plane",
        (legend_x, 43),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (50, 220, 80),
        2,
        cv2.LINE_AA,
    )

    colours = [(50, 220, 80), (255, 170, 30), (210, 80, 220), (40, 220, 220)]
    overlay = canvas.copy()
    for index, mask in enumerate(masks):
        raw_polygon = np.asarray(mask.get("rawPoints", []), dtype=np.int32)
        polygon = np.asarray(mask.get("points", []), dtype=np.int32)
        if len(polygon) < 3:
            continue
        colour = colours[index % len(colours)]
        if len(raw_polygon) >= 3:
            cv2.polylines(
                canvas,
                [raw_polygon],
                True,
                (40, 80, 245),
                2,
                cv2.LINE_AA,
            )
            for point in raw_polygon:
                cv2.circle(
                    canvas,
                    (int(point[0]), int(point[1])),
                    3,
                    (40, 80, 245),
                    -1,
                    cv2.LINE_AA,
                )
        cv2.fillPoly(overlay, [polygon], colour)
        cv2.polylines(canvas, [polygon], True, colour, 3, cv2.LINE_AA)
        x, y = polygon.min(axis=0)
        label = (
            f'{mask.get("name", "Wall")} {mask.get("confidence", 0):.2f} '
            f'{mask.get("rawPointsCount", len(raw_polygon))}'
            f'->{mask.get("cleanedPointsCount", len(polygon))}'
        )
        label_x = int(x) + 7
        label_y = max(70, int(y) + 24)
        reason = str(mask.get("regularizationReason", ""))
        label_width = min(width - label_x - 4, max(180, len(label) * 8))
        if label_width > 0:
            cv2.rectangle(
                canvas,
                (label_x - 4, label_y - 18),
                (label_x + label_width, label_y + (22 if reason else 3)),
                (18, 18, 18),
                -1,
            )
        cv2.putText(
            canvas,
            label,
            (label_x, label_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.58,
            colour,
            2,
            cv2.LINE_AA,
        )
        if reason:
            cv2.putText(
                canvas,
                reason[:74],
                (label_x, label_y + 18),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                colour,
                1,
                cv2.LINE_AA,
            )
    canvas = cv2.addWeighted(overlay, 0.22, canvas, 0.78, 0)
    ok, encoded = cv2.imencode(".png", canvas)
    if not ok:
        raise RuntimeError("Could not encode debug image.")
    return base64.b64encode(encoded.tobytes()).decode("ascii")
