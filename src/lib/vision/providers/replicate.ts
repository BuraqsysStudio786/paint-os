import "server-only";

import { runReplicateWallSegmentation } from "@/lib/ai/replicate-segmentation";
import { normalizeVisionResult, type VisionResult } from "../mask-utils";
import type { VisionInput } from "./local-python";

export async function runReplicateVision(input: VisionInput, imageUrl: string): Promise<VisionResult> {
  const result = await runReplicateWallSegmentation(imageUrl);
  if (!result.ok) throw new Error(result.error);
  return normalizeVisionResult({
    success: true,
    provider: "replicate",
    method: result.model,
    imageWidth: input.width || 1600,
    imageHeight: input.height || 1000,
    masks: [],
    warnings: ["Review the detected boundary carefully before applying paint."],
    legacyMaskDataUrl: result.maskDataUrl,
  }, input.width, input.height);
}
