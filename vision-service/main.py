from __future__ import annotations

import base64
import json
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from utils.color_transfer import apply_paint
from utils.masks import mask_to_polygons
from utils.wall_detection import detect_walls, model_capabilities


app = FastAPI(title="PaintOS Vision", version="1.0.0")
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


def parse_json_list(value: str | None) -> list[list[float]]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError as error:
        raise HTTPException(400, f"Invalid hint JSON: {error}") from error


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "paintos-vision", "models": model_capabilities()}


@app.post("/segment-walls")
async def segment_walls(
    image: Annotated[UploadFile, File()],
    mode: Annotated[str, Form()] = "auto",
    clickPoints: Annotated[str | None, Form()] = None,
    negativePoints: Annotated[str | None, Form()] = None,
    roomType: Annotated[str | None, Form()] = None,
    expectedWallsCount: Annotated[int | None, Form()] = None,
) -> dict:
    if mode not in {"auto", "classical", "fastsam", "mobilesam"}:
        raise HTTPException(400, "mode must be auto, classical, fastsam, or mobilesam")
    decoded = decode_image(await image.read())
    height, width = decoded.shape[:2]
    method, masks, warnings = detect_walls(
        decoded,
        mode,
        parse_json_list(clickPoints),
        parse_json_list(negativePoints),
        expectedWallsCount,
    )
    if roomType:
        warnings.append(f"Room hint considered: {roomType}.")
    success = len(masks) > 0
    if not success and not any("No confident wall detected" in warning for warning in warnings):
        warnings.append("No confident wall detected. Please draw manually.")
    return {
        "success": success,
        "provider": "local-python",
        "method": method,
        "imageWidth": width,
        "imageHeight": height,
        "masks": masks,
        "warnings": warnings,
        "manualRequired": not success,
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
