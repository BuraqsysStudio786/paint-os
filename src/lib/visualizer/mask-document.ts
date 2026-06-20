import { z } from "zod";
import { cleanWallPolygon, validateMaskLayer } from "./geometry";
import type {
  MaskStatus,
  VisualizerLayerSource,
  VisualizerMaskDocument,
  VisualizerMaskLayer,
  VisualizerPoint,
} from "./types";

const pointSchema = z.tuple([z.coerce.number(), z.coerce.number()]);
const rawLayerSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.enum(["wall", "ceiling", "trim", "custom"]).optional(),
  source: z.string().optional(),
  points: z.array(pointSchema).optional(),
  alphaMaskUrl: z.string().optional(),
  originalImageWidth: z.coerce.number().positive().optional(),
  originalImageHeight: z.coerce.number().positive().optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  needsReview: z.boolean().optional(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  shadeId: z.string().optional(),
  shadeHex: z.string().optional(),
  finish: z.enum(["matt", "silk", "gloss", "texture"]).optional(),
  opacity: z.coerce.number().optional(),
  contrast: z.coerce.number().optional(),
  brightness: z.coerce.number().optional(),
  blendMode: z.string().optional(),
  paint: z.record(z.string(), z.unknown()).optional(),
});

function source(value: string | undefined, gallery: boolean): VisualizerLayerSource {
  if (value === "gallery-admin"
    || value === "auto-detect"
    || value === "click-detect"
    || value === "rectangle"
    || value === "manual-polygon"
    || value === "brush-refined") return value;
  if (gallery) return "gallery-admin";
  if (value?.includes("click")) return "click-detect";
  if (value?.includes("rectangle")) return "rectangle";
  if (value?.includes("manual")) return "manual-polygon";
  if (value?.includes("brush")) return "brush-refined";
  return "auto-detect";
}

export function createEmptyMaskDocument(
  imageWidth = 1600,
  imageHeight = 1000,
  status: MaskStatus = "draft",
): VisualizerMaskDocument {
  return {
    version: 2,
    status,
    imageWidth,
    imageHeight,
    layers: [],
    masks: [],
  };
}

export function normalizeMaskDocument(
  input: unknown,
  options: {
    imageWidth?: number;
    imageHeight?: number;
    gallery?: boolean;
    legacyStatus?: MaskStatus;
  } = {},
): VisualizerMaskDocument {
  const record = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  const imageWidth = Number(record.imageWidth || options.imageWidth || 1600);
  const imageHeight = Number(record.imageHeight || options.imageHeight || 1000);
  const rawLayers = Array.isArray(record.layers)
    ? record.layers
    : Array.isArray(record.masks)
      ? record.masks
      : [];
  const layers = rawLayers.flatMap((raw, index) => {
    const parsed = rawLayerSchema.safeParse(raw);
    if (!parsed.success) return [];
    const value = parsed.data;
    const points = cleanWallPolygon(
      (value.points || []) as VisualizerPoint[],
      imageWidth,
      imageHeight,
    );
    if (points.length < 3 && !value.alphaMaskUrl) return [];
    const paintRecord = value.paint || {};
    const shadeId = String(paintRecord.shadeId || value.shadeId || "");
    const shadeHex = String(paintRecord.shadeHex || value.shadeHex || "");
    const layer: VisualizerMaskLayer = {
      id: value.id || `wall-${index + 1}`,
      name: value.name || (index === 0 ? "Main Wall" : `Wall ${index + 1}`),
      type: value.type || "wall",
      source: source(value.source, Boolean(options.gallery)),
      points,
      alphaMaskUrl: value.alphaMaskUrl,
      originalImageWidth: value.originalImageWidth || imageWidth,
      originalImageHeight: value.originalImageHeight || imageHeight,
      confidence: value.confidence,
      needsReview: value.needsReview ?? !options.gallery,
      locked: value.locked ?? false,
      visible: value.visible ?? true,
      paint: shadeId && /^#[0-9a-f]{6}$/i.test(shadeHex)
        ? {
            shadeId,
            shadeCode: String(paintRecord.shadeCode || ""),
            shadeName: String(paintRecord.shadeName || ""),
            shadeHex,
            finish: paintRecord.finish === "silk"
              || paintRecord.finish === "gloss"
              || paintRecord.finish === "texture"
              ? paintRecord.finish
              : value.finish || "matt",
            opacity: Number(paintRecord.opacity ?? value.opacity ?? 0.58),
            blendMode: paintRecord.blendMode === "overlay"
              || paintRecord.blendMode === "color"
              || paintRecord.blendMode === "soft-light"
              ? paintRecord.blendMode
              : "multiply",
            brightness: Number(paintRecord.brightness ?? value.brightness ?? 100),
            contrast: Number(paintRecord.contrast ?? value.contrast ?? 100),
            preserveShadows: paintRecord.preserveShadows !== false,
          }
        : undefined,
    };
    return validateMaskLayer(layer).valid ? [layer] : [];
  });
  const rawStatus = record.status;
  const status: MaskStatus = rawStatus === "approved"
    || rawStatus === "needs_review"
    || rawStatus === "draft"
    ? rawStatus
    : options.legacyStatus || "draft";
  return {
    version: 2,
    status,
    imageWidth,
    imageHeight,
    layers,
    masks: layers,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

export function serializeMaskDocument(document: VisualizerMaskDocument) {
  const layers = document.layers.map((layer) => ({
    ...layer,
    points: layer.points || [],
  }));
  return {
    ...document,
    version: 2 as const,
    layers,
    masks: layers,
    updatedAt: new Date().toISOString(),
  };
}
