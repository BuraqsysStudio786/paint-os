import "server-only";

import { z } from "zod";
import { db } from "@/lib/db";

export const visualizerProjectSchema = z.object({
  clientId: z.string().min(1),
  sessionId: z.string().min(1).max(100),
  spaceId: z.string().min(1).optional(),
  shadeId: z.string().min(1),
  maskJson: z.object({
    imageWidth: z.number().positive(),
    imageHeight: z.number().positive(),
    masks: z.array(z.object({
      id: z.string(),
      name: z.string(),
      points: z.array(z.tuple([z.number(), z.number()])).min(3),
      shadeId: z.string().optional(),
      shadeHex: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
      finish: z.enum(["matt", "silk", "gloss", "texture"]).optional(),
      opacity: z.number().min(0).max(1).optional(),
      contrast: z.number().min(50).max(150).optional(),
      brightness: z.number().min(50).max(150).optional(),
      blendMode: z.string().optional(),
      source: z.string().optional(),
    })).min(1),
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
