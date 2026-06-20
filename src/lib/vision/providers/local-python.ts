import "server-only";

import { normalizeVisionResult, type VisionResult } from "../mask-utils";

export type VisionInput = {
  image: Blob;
  filename?: string;
  mode?: "auto" | "classical" | "click" | "blank-wall";
  clickPoints?: [number, number][];
  positivePoints?: [number, number][];
  negativePoints?: [number, number][];
  roomType?: string;
  expectedWallsCount?: number;
  width?: number;
  height?: number;
};

export async function runLocalPythonVision(input: VisionInput): Promise<VisionResult> {
  const baseUrl = process.env.VISION_SERVICE_URL?.trim();
  if (!baseUrl) throw new Error("Local vision service is not configured.");
  const form = new FormData();
  form.set("image", input.image, input.filename || "room.jpg");
  form.set("mode", input.mode || "auto");
  const positivePoints = input.positivePoints || input.clickPoints;
  if (positivePoints?.length) {
    form.set(
      "positivePoints",
      JSON.stringify(positivePoints.map(([x, y]) => ({ x, y }))),
    );
  }
  if (input.negativePoints?.length) form.set("negativePoints", JSON.stringify(input.negativePoints));
  if (input.roomType) form.set("roomType", input.roomType);
  if (input.expectedWallsCount) form.set("expectedWallsCount", String(input.expectedWallsCount));

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/segment-walls`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? String(payload.detail)
      : `Local vision returned HTTP ${response.status}.`;
    throw new Error(detail);
  }
  return normalizeVisionResult(payload, input.width, input.height);
}
