import "server-only";

import { normalizeVisionResult, type VisionResult } from "../mask-utils";
import type { VisionInput } from "./local-python";

export async function runHuggingFaceVision(input: VisionInput): Promise<VisionResult> {
  const token = process.env.HUGGINGFACE_API_KEY;
  const model = process.env.HUGGINGFACE_SEGMENTATION_MODEL;
  if (!token || !model) throw new Error("Hugging Face segmentation is not configured.");
  const endpoint = model.startsWith("http")
    ? model
    : `https://router.huggingface.co/hf-inference/models/${model}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": input.image.type || "application/octet-stream",
    },
    body: input.image,
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Hugging Face returned HTTP ${response.status}.`);
  // Custom HF endpoints can return the normalized PaintOS shape directly.
  if (payload && typeof payload === "object" && "masks" in payload) {
    return normalizeVisionResult(payload, input.width, input.height);
  }
  throw new Error("The configured Hugging Face model did not return polygon masks.");
}
