import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";

const paintSchema = z.object({
  shadeId: z.string(),
  shadeCode: z.string(),
  shadeName: z.string(),
  shadeHex: z.string().regex(/^#[0-9a-f]{6}$/i),
  finish: z.enum(["matt", "silk", "gloss", "texture"]),
  opacity: z.number().min(0).max(1),
  blendMode: z.enum(["multiply", "overlay", "color", "soft-light"]),
  brightness: z.number().min(50).max(150),
  contrast: z.number().min(50).max(150),
  preserveShadows: z.boolean(),
});

const layerSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["wall", "ceiling", "trim", "custom"]).default("wall"),
  source: z.enum([
    "gallery-admin",
    "auto-detect",
    "click-detect",
    "rectangle",
    "manual-polygon",
    "brush-refined",
  ]),
  points: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  alphaMaskUrl: z.string().optional(),
  originalImageWidth: z.number().positive(),
  originalImageHeight: z.number().positive(),
  confidence: z.number().min(0).max(1).optional(),
  needsReview: z.boolean(),
  locked: z.boolean().optional(),
  visible: z.boolean(),
  paint: paintSchema.optional(),
});

export const visualizerProjectSchema = z.object({
  clientId: z.string().min(1),
  sessionId: z.string().min(1).max(100),
  spaceId: z.string().min(1).optional(),
  shadeId: z.string().min(1),
  maskJson: z.object({
    version: z.literal(2).optional(),
    status: z.enum(["draft", "needs_review", "approved"]).optional(),
    imageWidth: z.number().positive(),
    imageHeight: z.number().positive(),
    layers: z.array(layerSchema).optional(),
    masks: z.array(z.object({
      id: z.string(),
      name: z.string(),
      points: z.array(z.tuple([z.number(), z.number()])).min(3),
      type: z.enum(["wall", "ceiling", "trim", "custom"]).optional(),
      originalImageWidth: z.number().positive().optional(),
      originalImageHeight: z.number().positive().optional(),
      confidence: z.number().min(0).max(1).optional(),
      needsReview: z.boolean().optional(),
      locked: z.boolean().optional(),
      visible: z.boolean().optional(),
      paint: paintSchema.optional(),
      shadeId: z.string().optional(),
      shadeHex: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      finish: z.enum(["matt", "silk", "gloss", "texture"]).optional(),
      opacity: z.number().min(0).max(1).optional(),
      contrast: z.number().min(50).max(150).optional(),
      brightness: z.number().min(50).max(150).optional(),
      blendMode: z.string().optional(),
      source: z.string().optional(),
    })).min(1),
    updatedAt: z.string().optional(),
    controls: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  uploadedImageUrl: z.string().max(5000).optional(),
  resultImageUrl: z.string().max(5000).optional(),
});

export async function createVisualizerProject(input: z.input<typeof visualizerProjectSchema>) {
  const parsed = visualizerProjectSchema.parse(input);
  const [shade, space] = await Promise.all([
    db.shade.findFirst({
      where: { id: parsed.shadeId, clientId: parsed.clientId, isActive: true },
      select: { id: true },
    }),
    parsed.spaceId
      ? db.visualizerSpace.findFirst({
          where: { id: parsed.spaceId, clientId: parsed.clientId, isActive: true },
          select: { id: true },
        })
      : null,
  ]);
  if (!shade) throw new Error("Selected shade is unavailable.");
  if (parsed.spaceId && !space) throw new Error("Selected visualizer room is unavailable.");
  return db.visualizerProject.create({ data: { ...parsed, maskJson: parsed.maskJson as object } });
}
