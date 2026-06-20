from __future__ import annotations

import base64
import json
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from utils.color_transfer import apply_paint
from utils.debug import render_detection_debug
from utils.masks import mask_to_polygons
from utils.wall_detection import detect_walls, model_capabilities


app = FastAPI(title="PaintOS Vision", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def decode_image(data: bytes) -> np.ndarray:
    if len(data) > 16 * 1024 * 1024:
        raise HTTPException(413, "Image is too large (16 MB maximum).")
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, "A valid JPG or PNG image is required.")
    return image


def parse_points(value: str | None) -> list[list[float]]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if not isinstance(parsed, list):
            raise ValueError("points must be a JSON array")
        points: list[list[float]] = []
        for point in parsed:
            if isinstance(point, dict) and "x" in point and "y" in point:
                points.append([float(point["x"]), float(point["y"])])
            elif isinstance(point, (list, tuple)) and len(point) >= 2:
                points.append([float(point[0]), float(point[1])])
            else:
                raise ValueError("each point must be {x, y} or [x, y]")
        return points
    except json.JSONDecodeError as error:
        raise HTTPException(400, f"Invalid point JSON: {error}") from error
    except (TypeError, ValueError) as error:
        raise HTTPException(400, f"Invalid point JSON: {error}") from error


def validate_mode(mode: str) -> str:
    normalized = mode.strip().lower()
    if normalized not in {"auto", "classical", "click", "blank-wall"}:
        raise HTTPException(400, "mode must be auto, classical, click, or blank-wall")
    return normalized


def segment_response(
    decoded: np.ndarray,
    *,
    mode: str,
    positive_points: list[list[float]],
    negative_points: list[list[float]],
    expected_walls: int | None,
    min_confidence: float,
) -> tuple[dict, dict]:
    height, width = decoded.shape[:2]
    method, masks, warnings, debug = detect_walls(
        decoded,
        mode,
        positive_points,
        negative_points,
        expected_walls,
        min_confidence,
    )
    success = bool(masks)
    payload = {
        "success": success,
        "provider": "local-python",
        "method": method,
        "imageWidth": width,
        "imageHeight": height,
        "masks": masks,
        "warnings": warnings,
        "manualRequired": not success,
    }
    return payload, debug


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "paintos-vision", "models": model_capabilities()}


@app.post("/segment-walls")
async def segment_walls(
    image: Annotated[UploadFile, File()],
    mode: Annotated[str, Form()] = "auto",
    positivePoints: Annotated[str | None, Form()] = None,
    clickPoints: Annotated[str | None, Form()] = None,
    negativePoints: Annotated[str | None, Form()] = None,
    expectedWalls: Annotated[int | None, Form()] = None,
    expectedWallsCount: Annotated[int | None, Form()] = None,
    minConfidence: Annotated[float, Form()] = 0.48,
) -> dict:
    decoded = decode_image(await image.read())
    normalized_mode = validate_mode(mode)
    expected = expectedWalls if expectedWalls is not None else expectedWallsCount
    if expected is not None and not 1 <= expected <= 4:
        raise HTTPException(400, "expectedWalls must be between 1 and 4")
    if not 0.0 <= minConfidence <= 1.0:
        raise HTTPException(400, "minConfidence must be between 0 and 1")
    positive_points = parse_points(positivePoints or clickPoints)
    if normalized_mode == "auto" and positive_points:
        normalized_mode = "click"
    payload, _ = segment_response(
        decoded,
        mode=normalized_mode,
        positive_points=positive_points,
        negative_points=parse_points(negativePoints),
        expected_walls=expected,
        min_confidence=minConfidence,
    )
    return payload


@app.post("/segment-walls-debug")
async def segment_walls_debug(
    image: Annotated[UploadFile, File()],
    mode: Annotated[str, Form()] = "auto",
    positivePoints: Annotated[str | None, Form()] = None,
    clickPoints: Annotated[str | None, Form()] = None,
    negativePoints: Annotated[str | None, Form()] = None,
    expectedWalls: Annotated[int | None, Form()] = None,
    expectedWallsCount: Annotated[int | None, Form()] = None,
    minConfidence: Annotated[float, Form()] = 0.48,
) -> dict:
    decoded = decode_image(await image.read())
    normalized_mode = validate_mode(mode)
    expected = expectedWalls if expectedWalls is not None else expectedWallsCount
    if expected is not None and not 1 <= expected <= 4:
        raise HTTPException(400, "expectedWalls must be between 1 and 4")
    if not 0.0 <= minConfidence <= 1.0:
        raise HTTPException(400, "minConfidence must be between 0 and 1")
    positive_points = parse_points(positivePoints or clickPoints)
    if normalized_mode == "auto" and positive_points:
        normalized_mode = "click"
    payload, debug = segment_response(
        decoded,
        mode=normalized_mode,
        positive_points=positive_points,
        negative_points=parse_points(negativePoints),
        expected_walls=expected,
        min_confidence=minConfidence,
    )
    debug_image = render_detection_debug(decoded, debug["floorY"], payload["masks"])
    return {
        **payload,
        "floorY": debug["floorY"],
        "floorDetected": debug["floorDetected"],
        "rawCandidateCount": debug.get("rawCandidateCount", 0),
        "acceptedCandidateCount": debug.get("acceptedCandidateCount", len(payload["masks"])),
        "candidateDiagnostics": debug.get("candidateDiagnostics", []),
        "debugImageBase64": debug_image,
        "debugImageDataUrl": f"data:image/png;base64,{debug_image}",
    }


@app.post("/mask-to-polygon")
async def mask_to_polygon(mask: Annotated[UploadFile, File()]) -> dict:
    decoded = decode_image(await mask.read())
    gray = cv2.cvtColor(decoded, cv2.COLOR_BGR2GRAY)
    _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
    polygons = mask_to_polygons(binary)
    return {
        "success": True,
        "imageWidth": decoded.shape[1],
        "imageHeight": decoded.shape[0],
        "polygons": [{"points": points, "areaRatio": area} for points, area in polygons],
    }


@app.post("/apply-paint-preview")
async def apply_paint_preview(
    image: Annotated[UploadFile, File()],
    maskJson: Annotated[str, Form()],
    shadeHex: Annotated[str, Form()],
    opacity: Annotated[float, Form()] = 0.56,
    finish: Annotated[str, Form()] = "matt",
    preserveShadows: Annotated[bool, Form()] = True,
) -> dict:
    decoded = decode_image(await image.read())
    try:
        parsed = json.loads(maskJson)
        polygons = [mask["points"] for mask in parsed.get("masks", []) if len(mask.get("points", [])) >= 3]
    except (json.JSONDecodeError, TypeError, KeyError) as error:
        raise HTTPException(400, "maskJson is invalid.") from error
    result = apply_paint(decoded, polygons, shadeHex, opacity, finish, preserveShadows)
    ok, encoded = cv2.imencode(".png", result)
    if not ok:
        raise HTTPException(500, "Could not encode the preview.")
    data = base64.b64encode(encoded.tobytes()).decode("ascii")
    return {"success": True, "resultImageDataUrl": f"data:image/png;base64,{data}"}
