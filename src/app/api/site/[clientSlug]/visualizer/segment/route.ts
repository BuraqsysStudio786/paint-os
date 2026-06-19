import { db } from "@/lib/db";
import { blobFromImageReference, segmentWalls } from "@/lib/vision/provider";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  imageUrl: z.string().min(20).max(15_000_000),
  width: z.number().positive().max(10000).optional(),
  height: z.number().positive().max(10000).optional(),
  mode: z.enum(["auto", "classical", "fastsam", "mobilesam"]).optional(),
  clickPoints: z.array(z.tuple([z.number(), z.number()])).optional(),
  negativePoints: z.array(z.tuple([z.number(), z.number()])).optional(),
  roomType: z.string().max(100).optional(),
  expectedWallsCount: z.number().int().min(1).max(4).optional(),
});

export async function POST(request: Request, context: RouteContext<"/api/site/[clientSlug]/visualizer/segment">) {
  const { clientSlug } = await context.params;
  const client = await db.client.findUnique({ where: { slug: clientSlug, isActive: true }, select: { id: true } });
  if (!client) return Response.json({ ok: false, error: "Paint brand not found." }, { status: 404 });

  let data: z.infer<typeof schema>;
  let image: Blob;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return Response.json({ ok: false, error: "A valid room image is required." }, { status: 400 });
    }
    image = file;
    data = {
      imageUrl: String(form.get("imageUrl") || "uploaded-room-image"),
      width: Number(form.get("width")) || undefined,
      height: Number(form.get("height")) || undefined,
      mode: schema.shape.mode.safeParse(form.get("mode")).data,
      roomType: String(form.get("roomType") || "") || undefined,
      expectedWallsCount: Number(form.get("expectedWallsCount")) || undefined,
    };
  } else {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ ok: false, error: "A valid room image is required." }, { status: 400 });
    data = parsed.data;
    try {
      image = await blobFromImageReference(data.imageUrl);
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "Room image could not be loaded." }, { status: 400 });
    }
  }

  try {
    const result = await segmentWalls({
      image,
      imageUrl: data.imageUrl.startsWith("http") ? data.imageUrl : undefined,
      filename: "room-image",
      width: data.width,
      height: data.height,
      mode: data.mode,
      clickPoints: data.clickPoints,
      negativePoints: data.negativePoints,
      roomType: data.roomType,
      expectedWallsCount: data.expectedWallsCount,
    });
    await db.aISession.create({
      data: {
        clientId: client.id,
        type: "wall_segmentation",
        inputJson: { width: data.width, height: data.height, requestedProvider: process.env.VISION_PROVIDER || "local" },
        outputJson: result,
      },
    });
    if (!result.success || result.manualRequired || result.masks.length === 0) {
      return Response.json({
        ok: true,
        ...result,
        success: false,
        manualRequired: true,
        message: "AI wall detection unavailable in this demo.",
      });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({
      ok: true,
      success: false,
      manualRequired: true,
      message: "AI wall detection unavailable in this demo.",
      provider: "manual",
      method: "manual-required",
      imageWidth: data.width || 1600,
      imageHeight: data.height || 1000,
      masks: [],
      warnings: [error instanceof Error ? error.message : "Local vision service failed."],
    });
  }
}

export async function GET(_: Request, context: RouteContext<"/api/site/[clientSlug]/visualizer/segment">) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ ok: false }, { status: 404 });
  }
  const { clientSlug } = await context.params;
  const client = await db.client.findUnique({ where: { slug: clientSlug, isActive: true }, select: { id: true } });
  if (!client) return Response.json({ ok: false, error: "Paint brand not found." }, { status: 404 });
  const serviceUrl = process.env.VISION_SERVICE_URL?.trim();
  if (!serviceUrl) {
    return Response.json({
      ok: true,
      serviceUrl: "",
      health: { ok: false, error: "AI wall detection unavailable in this demo." },
    });
  }
  try {
    const health = await fetch(`${serviceUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return Response.json({
      ok: true,
      serviceUrl,
      health: health.ok ? await health.json() : { ok: false, status: health.status },
    });
  } catch (error) {
    return Response.json({
      ok: true,
      serviceUrl,
      health: { ok: false, error: error instanceof Error ? error.message : "Health check failed." },
    });
  }
}
