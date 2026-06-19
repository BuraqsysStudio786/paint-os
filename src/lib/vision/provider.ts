import "server-only";

import { manualRequiredResult, type VisionResult } from "./mask-utils";
import { runHuggingFaceVision } from "./providers/huggingface";
import { runLocalPythonVision, type VisionInput } from "./providers/local-python";
import { runReplicateVision } from "./providers/replicate";

export type VisionProviderName = "local" | "replicate" | "huggingface" | "auto";

export async function blobFromImageReference(reference: string): Promise<Blob> {
  if (reference.startsWith("data:")) {
    const response = await fetch(reference);
    return response.blob();
  }
  const response = await fetch(reference, {
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Could not load the room image (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (blob.size > 16 * 1024 * 1024) throw new Error("Room image exceeds the 16 MB detection limit.");
  return blob;
}

export async function segmentWalls(input: VisionInput & { imageUrl?: string }): Promise<VisionResult> {
  const selected = (process.env.VISION_PROVIDER || "local").toLowerCase() as VisionProviderName;
  const providers = selected === "auto"
    ? (["local", "replicate", "huggingface"] as const)
    : ([selected] as const);
  const warnings: string[] = [];

  for (const provider of providers) {
    try {
      if (provider === "local") {
        if (process.env.ENABLE_LOCAL_VISION === "false") throw new Error("Local vision is disabled.");
        if (!process.env.VISION_SERVICE_URL?.trim()) throw new Error("Local vision service is not configured.");
        return await runLocalPythonVision(input);
      }
      if (provider === "replicate") {
        if (!process.env.REPLICATE_API_TOKEN) throw new Error("Replicate is not configured.");
        if (!input.imageUrl) throw new Error("Replicate requires an accessible image URL.");
        return await runReplicateVision(input, input.imageUrl);
      }
      if (provider === "huggingface") return await runHuggingFaceVision(input);
    } catch (error) {
      warnings.push(`${provider}: ${error instanceof Error ? error.message : "provider failed"}`);
    }
  }

  return manualRequiredResult(
    input.width,
    input.height,
    `AI wall detection unavailable in this demo. ${warnings.join(" ")}`.trim(),
  );
}
