import { z } from "zod";

export const wallMaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  points: z.array(z.tuple([z.number(), z.number()])).min(3),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().default("unknown"),
  needsReview: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(0.56),
  blendMode: z.string().default("multiply"),
});

export const visionResultSchema = z.object({
  success: z.boolean(),
  provider: z.string(),
  method: z.string(),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
  masks: z.array(wallMaskSchema),
  warnings: z.array(z.string()).default([]),
  manualRequired: z.boolean().default(false),
  legacyMaskDataUrl: z.string().optional(),
});

export type WallMask = z.infer<typeof wallMaskSchema>;
export type VisionResult = z.infer<typeof visionResultSchema>;

export function manualRequiredResult(
  width = 1600,
  height = 1000,
  warning = "Local AI detection unavailable. Use manual wall selection.",
): VisionResult {
  return {
    success: false,
    provider: "manual",
    method: "manual-required",
    imageWidth: width,
    imageHeight: height,
    masks: [],
    warnings: [warning],
    manualRequired: true,
  };
}

export function normalizeVisionResult(input: unknown, fallbackWidth = 1600, fallbackHeight = 1000) {
  const candidate = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return visionResultSchema.parse({
    success: candidate.success ?? candidate.ok ?? true,
    provider: candidate.provider ?? candidate.source ?? "unknown",
    method: candidate.method ?? candidate.model ?? "unknown",
    imageWidth: candidate.imageWidth ?? fallbackWidth,
    imageHeight: candidate.imageHeight ?? fallbackHeight,
    masks: candidate.masks ?? [],
    warnings: candidate.warnings ?? [],
    manualRequired: candidate.manualRequired ?? candidate.success === false,
    legacyMaskDataUrl: candidate.legacyMaskDataUrl ?? candidate.maskDataUrl,
  });
}
