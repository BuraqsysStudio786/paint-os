"use client";

import {
  Check,
  CircleHelp,
  Eye,
  ImageIcon,
  Lightbulb,
  MessageCircle,
  MousePointer2,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { saveVisualizerProject } from "@/app/actions";
import type { PublicShade } from "./db-public";

type Space = {
  id: string;
  name: string;
  imageUrl: string;
  thumbnailUrl?: string;
  roomType: string;
  space?: string | null;
  maskJson: unknown;
  defaultShadeId?: string | null;
};
type Point = { x: number; y: number };
type Mask = {
  id: string;
  name: string;
  points: [number, number][];
  shadeId?: string;
  shadeHex?: string;
  finish?: "matt" | "silk" | "gloss" | "texture";
  opacity?: number;
  contrast?: number;
  brightness?: number;
  blendMode?: string;
  source?: string;
};
type WallPaintState = {
  maskId: string;
  shadeId: string;
  shadeHex: string;
  finish: "matt" | "silk" | "gloss" | "texture";
  opacity: number;
  contrast: number;
  brightness: number;
};
type MaskJson = {
  imageWidth: number;
  imageHeight: number;
  masks: Mask[];
  controls?: Record<string, string | number | boolean>;
};
type SegmentationResponse =
  | {
      ok: true;
      success?: boolean;
      provider: string;
      method: string;
      imageWidth: number;
      imageHeight: number;
      masks: Mask[];
      warnings?: string[];
      manualRequired?: boolean;
      message?: string;
      legacyMaskDataUrl?: string;
    }
  | { ok: false; error: string };

const defaultMask = (width = 1200, height = 750): MaskJson => ({
  imageWidth: width,
  imageHeight: height,
  masks: [],
});

function normalizeMask(input: unknown, width = 1600, height = 1000): MaskJson {
  if (input && typeof input === "object") {
    const candidate = input as Partial<MaskJson>;
    if (Array.isArray(candidate.masks)) {
      const masks = candidate.masks
        .map((mask) => ({
          id: String(mask.id || crypto.randomUUID()),
          name: String(mask.name || "Wall area"),
          points: Array.isArray(mask.points)
            ? mask.points
                .filter((point) => Array.isArray(point) && point.length >= 2)
                .map((point) => [Number(point[0]), Number(point[1])] as [number, number])
            : [],
          opacity: Number(mask.opacity ?? .58),
          shadeId: mask.shadeId ? String(mask.shadeId) : undefined,
          shadeHex: mask.shadeHex ? String(mask.shadeHex) : undefined,
          finish: ["matt", "silk", "gloss", "texture"].includes(String(mask.finish))
            ? mask.finish as Mask["finish"]
            : undefined,
          contrast: Number(mask.contrast ?? 100),
          brightness: Number(mask.brightness ?? 100),
          blendMode: String(mask.blendMode || "multiply"),
          source: String(mask.source || "gallery"),
        }))
        .filter((mask) => mask.points.length >= 3);
      return {
        imageWidth: Number(candidate.imageWidth || width),
        imageHeight: Number(candidate.imageHeight || height),
        masks,
      };
    }
  }
  if (Array.isArray(input)) {
    const first = input[0] as { points?: number[] } | undefined;
    if (Array.isArray(first?.points)) {
      const points = first.points.reduce<[number, number][]>((result, value, index, values) => {
        if (index % 2 === 0) result.push([value, values[index + 1] || 0]);
        return result;
      }, []);
      return {
        imageWidth: 1200,
        imageHeight: 700,
        masks: [{ id: "wall-1", name: "Main wall", points, opacity: .58, blendMode: "multiply", source: "gallery" }],
      };
    }
  }
  return defaultMask(width, height);
}

function scalePoints(mask: Mask, maskJson: MaskJson, width: number, height: number): Point[] {
  return mask.points.map(([x, y]) => ({
    x: x / maskJson.imageWidth * width,
    y: y / maskJson.imageHeight * height,
  }));
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || .00001) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function nearestPoint(points: Point[], target: Point, radius = 18) {
  let found = -1;
  let distance = radius;
  points.forEach((point, index) => {
    const next = Math.hypot(point.x - target.x, point.y - target.y);
    if (next <= distance) {
      found = index;
      distance = next;
    }
  });
  return found;
}

function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * event.currentTarget.width,
    y: (event.clientY - rect.top) / rect.height * event.currentTarget.height,
  };
}

async function maskToPolygon(maskDataUrl: string, width: number, height: number): Promise<Point[]> {
  const image = new Image();
  image.src = maskDataUrl;
  await image.decode();
  const work = document.createElement("canvas");
  work.width = width;
  work.height = height;
  const context = work.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not read the detected wall mask.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let lightCount = 0;
  const total = width * height;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114;
    if (pixels[index + 3] > 20 && luminance > 128) lightCount++;
  }
  const invert = lightCount / total > .72;
  const rowStep = Math.max(6, Math.round(height / 18));
  const left: Point[] = [];
  const right: Point[] = [];
  for (let y = 0; y < height; y += rowStep) {
    let min = width;
    let max = -1;
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      const luminance = pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114;
      const active = pixels[index + 3] > 20 && (invert ? luminance < 128 : luminance > 128);
      if (active) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
    if (max > min && max - min > width * .08) {
      left.push({ x: min, y });
      right.push({ x: max, y });
    }
  }
  const polygon = [...left, ...right.reverse()];
  if (polygon.length < 6) throw new Error("No confident wall boundary was found. Draw the polygon manually.");
  return polygon;
}

async function uploadVisualizerImage(file: File) {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/visualizer/upload", { method: "POST", body: form });
  const result = await response.json() as { ok: boolean; url?: string; error?: string };
  if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Image upload failed.");
  return result.url;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the visualizer preview.")), "image/jpeg", .9);
  });
}

function Segment({ values, value, onChange }: { values: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 bg-black/5 p-1">
      {values.map((item) => (
        <button
          key={item}
          onClick={() => onChange(item)}
          className={`min-h-11 px-2 text-xs font-black capitalize transition ${value === item ? "bg-[var(--primary)] text-white shadow" : "hover:bg-white"}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function VisualizerStudio({
  clientId,
  clientSlug,
  whatsappNumber,
  spaces,
  shades,
  visionEnabled = true,
}: {
  clientId: string;
  clientSlug: string;
  whatsappNumber: string;
  spaces: Space[];
  shades: PublicShade[];
  visionEnabled?: boolean;
}) {
  const searchParams = useSearchParams();
  const canvas = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const uploadFileRef = useRef<File | null>(null);
  const pointerMoved = useRef(false);

  const [space, setSpace] = useState<Space | undefined>(spaces[0]);
  const initialShade = shades.find((item) => item.id === searchParams.get("shade"))
    || shades.find((item) => item.id === spaces[0]?.defaultShadeId)
    || shades[0];
  const [shade, setShade] = useState<PublicShade | undefined>(initialShade);
  const [mode, setMode] = useState<"gallery" | "upload">(spaces.length ? "gallery" : "upload");
  const [sourceUrl, setSourceUrl] = useState(spaces[0]?.imageUrl || "");
  const [uploadedUrl, setUploadedUrl] = useState<string>();
  const [uploadDataUrl, setUploadDataUrl] = useState<string>();
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 750 });
  const [maskJson, setMaskJson] = useState<MaskJson>(() => normalizeMask(spaces[0]?.maskJson));
  const [activeMaskId, setActiveMaskId] = useState(() => normalizeMask(spaces[0]?.maskJson).masks[0]?.id || "");
  const [hoveredMaskId, setHoveredMaskId] = useState("");
  const [wallPaints, setWallPaints] = useState<Record<string, WallPaintState>>(() => {
    const masks = normalizeMask(spaces[0]?.maskJson).masks;
    return masks.reduce<Record<string, WallPaintState>>((result, mask) => {
      const selected = shades.find((item) => item.id === mask.shadeId)
        || shades.find((item) => item.hex.toLowerCase() === mask.shadeHex?.toLowerCase())
        || initialShade;
      if (selected) result[mask.id] = {
        maskId: mask.id,
        shadeId: selected.id,
        shadeHex: selected.hex,
        finish: mask.finish || "matt",
        opacity: mask.opacity ?? .58,
        contrast: mask.contrast ?? 100,
        brightness: mask.brightness ?? 100,
      };
      return result;
    }, {});
  });
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [before, setBefore] = useState(false);
  const [intensity, setIntensity] = useState(62);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [preserveShadows, setPreserveShadows] = useState(true);
  const [finish, setFinish] = useState("matt");
  const [lighting, setLighting] = useState("daylight");
  const [family, setFamily] = useState("All");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [debug, setDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const [lastSegmentation, setLastSegmentation] = useState<unknown>(null);
  const [savedId, setSavedId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [detecting, startDetection] = useTransition();
  const [saving, startSaving] = useTransition();

  const activePoints = useMemo(
    () => {
      const mask = maskJson.masks.find((item) => item.id === activeMaskId);
      return mask ? scalePoints(mask, maskJson, canvasSize.width, canvasSize.height) : [];
    },
    [activeMaskId, canvasSize.height, canvasSize.width, maskJson],
  );
  const families = useMemo(() => [
    "All",
    ...new Set(shades.map((item) => item.colorFamily).filter(Boolean)),
    "Trending",
  ], [shades]);
  const filteredShades = useMemo(() => shades.filter((item) => {
    const familyMatch = family === "All"
      || (family === "Trending" ? item.isTrending : item.colorFamily === family);
    return familyMatch && (!search || `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase()));
  }), [family, search, shades]);

  const source = sourceUrl;

  const setActivePaint = useCallback((patch: Partial<WallPaintState>) => {
    if (!activeMaskId) return;
    setWallPaints((current) => {
      const existing = current[activeMaskId];
      const selected = shades.find((item) => item.id === (patch.shadeId || existing?.shadeId)) || shade;
      if (!selected) return current;
      return {
        ...current,
        [activeMaskId]: {
          maskId: activeMaskId,
          shadeId: selected.id,
          shadeHex: selected.hex,
          finish: existing?.finish || "matt",
          opacity: existing?.opacity ?? .58,
          contrast: existing?.contrast ?? 100,
          brightness: existing?.brightness ?? 100,
          ...patch,
        },
      };
    });
    setSavedId("");
  }, [activeMaskId, shade, shades]);

  const selectMask = useCallback((maskId: string) => {
    setActiveMaskId(maskId);
    setSelectedPoint(null);
    const paint = wallPaints[maskId];
    if (!paint) return;
    setShade(shades.find((item) => item.id === paint.shadeId) || shade);
    setFinish(paint.finish);
    setIntensity(Math.round(paint.opacity / .58 * 62));
    setContrast(paint.contrast);
    setBrightness(paint.brightness);
  }, [shade, shades, wallPaints]);

  useEffect(() => {
    if (!source) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const width = Math.min(1400, image.naturalWidth || 1200);
      const height = Math.round(width * (image.naturalHeight || 750) / (image.naturalWidth || 1200));
      imageRef.current = image;
      setCanvasSize({ width, height });
      if (mode === "upload") {
        setMaskJson((current) => current.masks.length ? current : {
          ...current,
          imageWidth: image.naturalWidth || width,
          imageHeight: image.naturalHeight || height,
        });
      }
    };
    image.onerror = () => setStatus("This room image could not be loaded. Choose another room or upload a JPG/PNG.");
    image.src = source;
  }, [mode, source]);

  const draw = useCallback(() => {
    const target = canvas.current;
    const image = imageRef.current;
    if (!target || !image) return;
    const context = target.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, target.width, target.height);
    const lightingBrightness = lighting === "evening" ? .88 : lighting === "warm" ? 1.03 : lighting === "cool" ? 1.05 : 1;
    context.filter = `contrast(${contrast}%) brightness(${brightness * lightingBrightness}%)`;
    context.drawImage(image, 0, 0, target.width, target.height);
    context.filter = "none";
    if (before) return;

    for (const mask of maskJson.masks) {
      const paint = wallPaints[mask.id];
      const selectedShade = shades.find((item) => item.id === paint?.shadeId);
      if (!selectedShade) continue;
      const points = scalePoints(mask, maskJson, target.width, target.height);
      if (points.length < 3) continue;

      context.save();
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.closePath();
      context.clip();
      context.globalCompositeOperation = preserveShadows ? "multiply" : "source-over";
      context.globalAlpha = Math.min(.92, paint.opacity);
      context.fillStyle = selectedShade.hex;
      context.fillRect(0, 0, target.width, target.height);

      if (lighting !== "daylight") {
        context.globalCompositeOperation = lighting === "evening" ? "multiply" : "screen";
        context.globalAlpha = lighting === "evening" ? .13 : .1;
        context.fillStyle = lighting === "warm" || lighting === "evening" ? "#ffc982" : "#b9ddff";
        context.fillRect(0, 0, target.width, target.height);
      }

      if (paint.finish !== "matt") {
        context.globalCompositeOperation = "screen";
        context.globalAlpha = paint.finish === "gloss" ? .23 : paint.finish === "silk" ? .12 : .07;
        const sheen = context.createLinearGradient(0, 0, target.width, target.height);
        sheen.addColorStop(0, "rgba(255,255,255,.42)");
        sheen.addColorStop(.38, "rgba(255,255,255,0)");
        sheen.addColorStop(.72, paint.finish === "texture" ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.03)");
        sheen.addColorStop(1, "rgba(255,255,255,.25)");
        context.fillStyle = sheen;
        context.fillRect(0, 0, target.width, target.height);
      }
      context.restore();

      if (mask.id === activeMaskId || mask.id === hoveredMaskId || debug) {
        context.save();
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.strokeStyle = mode === "upload" ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.72)";
        context.lineWidth = 2;
        context.setLineDash([9, 7]);
        context.stroke();
        if (debug) {
          context.setLineDash([]);
          context.fillStyle = "rgba(0,0,0,.75)";
          context.fillRect(points[0].x, points[0].y - 22, Math.max(90, mask.id.length * 7), 20);
          context.fillStyle = "#fff";
          context.font = "12px sans-serif";
          context.fillText(mask.id, points[0].x + 5, points[0].y - 8);
          points.forEach((point) => {
            context.beginPath();
            context.arc(point.x, point.y, 4, 0, Math.PI * 2);
            context.fillStyle = "#C9A45C";
            context.fill();
          });
        }
        context.restore();
      }
    }

    if (mode === "upload" && activePoints.length) {
      activePoints.forEach((point, index) => {
        context.beginPath();
        context.arc(point.x, point.y, selectedPoint === index ? 8 : 6, 0, Math.PI * 2);
        context.fillStyle = selectedPoint === index ? "#C8A35D" : "#ffffff";
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = "#183E32";
        context.stroke();
      });
    }
  }, [activeMaskId, activePoints, before, brightness, contrast, debug, hoveredMaskId, lighting, maskJson, mode, preserveShadows, selectedPoint, shades, wallPaints]);

  useEffect(() => draw(), [canvasSize, draw]);

  const updateActivePoints = useCallback((points: Point[]) => {
    setMaskJson((current) => ({
      ...current,
      masks: current.masks.map((mask) => mask.id === activeMaskId
        ? {
            ...mask,
            points: points.map((point) => [
              point.x / canvasSize.width * current.imageWidth,
              point.y / canvasSize.height * current.imageHeight,
            ] as [number, number]),
          }
        : mask),
    }));
    setSavedId("");
  }, [activeMaskId, canvasSize.height, canvasSize.width]);

  const renameActiveMask = (name: string) => {
    setMaskJson((current) => ({
      ...current,
      masks: current.masks.map((mask) => mask.id === activeMaskId ? { ...mask, name } : mask),
    }));
    setSavedId("");
  };

  const selectShade = (next: PublicShade) => {
    setShade(next);
    setActivePaint({ shadeId: next.id, shadeHex: next.hex });
    setSavedId("");
  };

  const selectSpace = (next: Space) => {
    const nextMasks = normalizeMask(next.maskJson);
    const nextShade = shades.find((item) => item.id === next.defaultShadeId) || shade || shades[0];
    setMode("gallery");
    setSpace(next);
    setSourceUrl(next.imageUrl);
    setUploadedUrl(undefined);
    setUploadDataUrl(undefined);
    setMaskJson(nextMasks);
    setActiveMaskId(nextMasks.masks[0]?.id || "");
    setSelectedPoint(null);
    setWallPaints(nextMasks.masks.reduce<Record<string, WallPaintState>>((result, mask) => {
      const selected = shades.find((item) => item.id === mask.shadeId)
        || shades.find((item) => item.hex.toLowerCase() === mask.shadeHex?.toLowerCase())
        || nextShade;
      if (selected) result[mask.id] = {
        maskId: mask.id,
        shadeId: selected.id,
        shadeHex: selected.hex,
        finish: mask.finish || "matt",
        opacity: mask.opacity ?? .58,
        contrast: mask.contrast ?? 100,
        brightness: mask.brightness ?? 100,
      };
      return result;
    }, {}));
    setShade(nextShade);
    setBefore(false);
    setSavedId("");
    setStatus("");
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setStatus("Upload a JPG or PNG room photo.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setStatus("The room photo must be smaller than 10 MB.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    uploadFileRef.current = file;
    objectUrlRef.current = objectUrl;
    setMode("upload");
    setSpace(undefined);
    setSourceUrl(objectUrl);
    setUploadedUrl(undefined);
    setMaskJson(defaultMask());
    setActiveMaskId("");
    setWallPaints({});
    setSelectedPoint(null);
    setSavedId("");
    setStatus("Room loaded. Click around a wall to create a polygon, or try AI-assisted detection.");

    const reader = new FileReader();
    reader.onload = () => setUploadDataUrl(String(reader.result));
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      setUploadedUrl(await uploadVisualizerImage(file));
    } catch (error) {
      setStatus(`${error instanceof Error ? error.message : "Upload storage failed."} You can still draw and preview manually.`);
    } finally {
      setUploading(false);
    }
  };

  const addNewPolygon = () => {
    const id = `manual-wall-${crypto.randomUUID()}`;
    setMaskJson((current) => ({
      imageWidth: current.imageWidth,
      imageHeight: current.imageHeight,
      masks: [...current.masks, { id, name: `Wall ${current.masks.length + 1}`, points: [], opacity: .58, blendMode: "multiply", source: "manual" }],
    }));
    setActiveMaskId(id);
    setSelectedPoint(null);
    if (shade) setWallPaints((current) => ({
      ...current,
      [id]: { maskId: id, shadeId: shade.id, shadeHex: shade.hex, finish: "matt", opacity: .58, contrast: 100, brightness: 100 },
    }));
  };

  const ensurePolygon = () => {
    if (activeMaskId) return activeMaskId;
    const id = `manual-wall-${crypto.randomUUID()}`;
    setMaskJson((current) => ({
      ...current,
      masks: [{ id, name: "Wall 1", points: [], opacity: .58, blendMode: "multiply", source: "manual" }],
    }));
    setActiveMaskId(id);
    if (shade) setWallPaints({
      [id]: { maskId: id, shadeId: shade.id, shadeHex: shade.hex, finish: "matt", opacity: .58, contrast: 100, brightness: 100 },
    });
    return id;
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    pointerMoved.current = false;
    if (mode === "gallery") {
      const hit = [...maskJson.masks].reverse().find((mask) =>
        pointInPolygon(point, scalePoints(mask, maskJson, canvasSize.width, canvasSize.height)));
      if (hit) selectMask(hit.id);
      return;
    }

    const id = ensurePolygon();
    const mask = maskJson.masks.find((item) => item.id === id);
    const points = mask ? scalePoints(mask, maskJson, canvasSize.width, canvasSize.height) : [];
    const hit = nearestPoint(points, point);
    if (hit >= 0) {
      setSelectedPoint(hit);
      setDraggingPoint(hit);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const next = [...points, point];
    if (mask) updateActivePoints(next);
    else {
      setMaskJson((current) => ({
        ...current,
        masks: [{
          id,
          name: "Wall 1",
          points: [[
            point.x / canvasSize.width * current.imageWidth,
            point.y / canvasSize.height * current.imageHeight,
          ]],
          opacity: .58,
          blendMode: "multiply",
          source: "manual",
        }],
      }));
    }
    setSelectedPoint(next.length - 1);
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === "gallery") {
      const point = canvasPoint(event);
      const hit = [...maskJson.masks].reverse().find((mask) =>
        pointInPolygon(point, scalePoints(mask, maskJson, canvasSize.width, canvasSize.height)));
      setHoveredMaskId(hit?.id || "");
      return;
    }
    if (draggingPoint === null || mode !== "upload") return;
    pointerMoved.current = true;
    const next = [...activePoints];
    next[draggingPoint] = canvasPoint(event);
    updateActivePoints(next);
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingPoint !== null && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingPoint(null);
  };

  const deletePoint = useCallback(() => {
    if (selectedPoint === null) return;
    updateActivePoints(activePoints.filter((_, index) => index !== selectedPoint));
    setSelectedPoint(null);
  }, [activePoints, selectedPoint, updateActivePoints]);

  useEffect(() => {
    const remove = (event: KeyboardEvent) => {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedPoint !== null && mode === "upload") {
        const element = event.target as HTMLElement;
        if (element.tagName === "INPUT") return;
        event.preventDefault();
        deletePoint();
      }
    };
    window.addEventListener("keydown", remove);
    return () => window.removeEventListener("keydown", remove);
  }, [deletePoint, mode, selectedPoint]);

  const undoPoint = () => {
    if (!activePoints.length) return;
    updateActivePoints(activePoints.slice(0, -1));
    setSelectedPoint(null);
  };

  const deletePolygon = () => {
    if (!activeMaskId) return;
    const remaining = maskJson.masks.filter((mask) => mask.id !== activeMaskId);
    setMaskJson({ ...maskJson, masks: remaining });
    setWallPaints((current) => {
      const next = { ...current };
      delete next[activeMaskId];
      return next;
    });
    setActiveMaskId(remaining[0]?.id || "");
    setSelectedPoint(null);
  };

  const runAI = () => startDetection(async () => {
    const file = uploadFileRef.current;
    const imageUrl = uploadedUrl?.startsWith("http") ? uploadedUrl : uploadDataUrl;
    if (!file && !imageUrl) {
      setStatus("The uploaded image is still preparing. Try again in a moment.");
      return;
    }
    setStatus("Local AI is looking for wall planes. You will be able to edit every point.");
    try {
      const form = new FormData();
      if (file) form.set("image", file, file.name);
      form.set("imageUrl", imageUrl || "uploaded-room-image");
      form.set("width", String(maskJson.imageWidth));
      form.set("height", String(maskJson.imageHeight));
      form.set("mode", "auto");
      const response = await fetch(`/api/site/${clientSlug}/visualizer/segment`, { method: "POST", body: form });
      const result = await response.json() as SegmentationResponse;
      setLastSegmentation(result);
      if (!response.ok || !result.ok) throw new Error(result.ok ? "Wall detection failed." : result.error);
      let detectedMasks = result.masks || [];
      let imageWidth = result.imageWidth || canvasSize.width;
      let imageHeight = result.imageHeight || canvasSize.height;
      if (!detectedMasks.length && result.legacyMaskDataUrl) {
        const points = await maskToPolygon(result.legacyMaskDataUrl, canvasSize.width, canvasSize.height);
        imageWidth = canvasSize.width;
        imageHeight = canvasSize.height;
        detectedMasks = [{
          id: `ai-wall-${crypto.randomUUID()}`,
          name: "AI detected wall",
          points: points.map((point) => [point.x, point.y]),
          opacity: .58,
          blendMode: "multiply",
          source: result.provider,
        }];
      }
      if (!detectedMasks.length) {
        setStatus(result.message || result.warnings?.join(" ") || "No confident wall detected. Please draw the wall area manually.");
        return;
      }
      const masks = detectedMasks.map((mask, index) => ({
        ...mask,
        id: mask.id || `ai-wall-${crypto.randomUUID()}`,
        name: mask.name || `Detected wall ${index + 1}`,
        opacity: mask.opacity ?? .56,
        blendMode: mask.blendMode || "multiply",
        source: mask.source || result.provider,
      }));
      setMaskJson({ imageWidth, imageHeight, masks });
      setActiveMaskId(masks[0].id);
      setSelectedPoint(null);
      if (shade) setWallPaints(masks.reduce<Record<string, WallPaintState>>((paints, mask) => {
        paints[mask.id] = { maskId: mask.id, shadeId: shade.id, shadeHex: shade.hex, finish: "matt", opacity: mask.opacity ?? .56, contrast: 100, brightness: 100 };
        return paints;
      }, {}));
      setStatus(`AI-assisted wall detection used ${result.method}. Review and drag points to correct every edge.${result.warnings?.length ? ` ${result.warnings.join(" ")}` : ""}`);
    } catch (error) {
      setLastSegmentation({ error: error instanceof Error ? error.message : "AI detection failed." });
      setStatus(error instanceof Error ? error.message : "AI detection failed. Continue by clicking around the wall manually.");
    }
  });

  useEffect(() => {
    if (!debug || process.env.NODE_ENV === "production") return;
    fetch(`/api/site/${clientSlug}/visualizer/segment`, { cache: "no-store" })
      .then((response) => response.json())
      .then(setDebugInfo)
      .catch((error) => setDebugInfo({
        ok: false,
        error: error instanceof Error ? error.message : "Debug health check failed.",
      }));
  }, [clientSlug, debug]);

  const resetControls = () => {
    setIntensity(62);
    setContrast(100);
    setBrightness(100);
    setFinish("matt");
    setLighting("daylight");
    setPreserveShadows(true);
    setBefore(false);
    setSavedId("");
  };

  const resetSelectedWall = () => {
    if (!activeMaskId) return;
    setWallPaints((current) => {
      const next = { ...current };
      delete next[activeMaskId];
      return next;
    });
    setSavedId("");
    setStatus("Selected wall paint cleared.");
  };

  const resetAllWalls = () => {
    setWallPaints({});
    setSavedId("");
    setStatus("All wall paint cleared. Choose any wall and shade to begin again.");
  };

  const save = () => startSaving(async () => {
    if (!shade) {
      setStatus("Choose a shade before saving.");
      return;
    }
    const validMasks = maskJson.masks.filter((mask) => mask.points.length >= 3);
    if (!validMasks.length) {
      setStatus("Add at least three polygon points around a wall before saving.");
      return;
    }
    try {
      let resultImageUrl: string | undefined;
      if (canvas.current) {
        try {
          const blob = await canvasBlob(canvas.current);
          resultImageUrl = await uploadVisualizerImage(new File([blob], `visualizer-result-${Date.now()}.jpg`, { type: "image/jpeg" }));
        } catch {
          // Cross-origin gallery images can block canvas export. The mask and
          // project are still valuable and must remain saveable.
        }
      }
      const paintedMasks = validMasks.map((mask) => ({ ...mask, ...wallPaints[mask.id] }));
      const primaryPaint = wallPaints[activeMaskId] || Object.values(wallPaints)[0];
      if (!primaryPaint) throw new Error("Apply a shade to at least one wall before saving.");
      const project = await saveVisualizerProject({
        clientId,
        sessionId: crypto.randomUUID(),
        spaceId: mode === "gallery" ? space?.id : undefined,
        shadeId: primaryPaint.shadeId,
        maskJson: {
          ...maskJson,
          masks: paintedMasks,
          controls: { intensity, contrast, brightness, finish, lighting, preserveShadows },
        },
        uploadedImageUrl: mode === "upload" ? uploadedUrl : undefined,
        resultImageUrl,
      });
      setSavedId(project.id);
      setStatus("Visualizer project saved successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The visualizer project could not be saved.");
    }
  });

  if (!shade || !shades.length) {
    return <div className="border border-black/10 bg-[var(--surface)] p-10">Add active shades before using the visualizer.</div>;
  }

  return (
    <div className="visualizer-shell">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-black/10 py-4">
        <div className="flex gap-2">
          <button onClick={() => space ? selectSpace(space) : spaces[0] && selectSpace(spaces[0])} className={`public-pill ${mode === "gallery" ? "!bg-[var(--primary)] !text-white" : ""}`}><ImageIcon size={15} /> Gallery rooms</button>
          <label className={`public-pill ${mode === "upload" ? "!bg-[var(--primary)] !text-white" : ""}`}><Upload size={15} /> Upload your room<input hidden type="file" accept="image/jpeg,image/png" onChange={(event) => uploadImage(event.target.files?.[0])} /></label>
        </div>
        {process.env.NODE_ENV !== "production" && <button onClick={() => setDebug(!debug)} className={`public-pill ${debug ? "!bg-[var(--accent)] !text-white" : ""}`}>Mask debug</button>}
        <span className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]"><CircleHelp size={15} /> Digital colors are approximate; approve a physical sample.</span>
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_370px]">
        <section className="min-w-0">
          <div className="relative overflow-hidden bg-[#101411] shadow-[0_28px_80px_rgba(20,30,24,.16)]">
            {source ? (
              <canvas
                ref={canvas}
                width={canvasSize.width}
                height={canvasSize.height}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                onPointerLeave={() => setHoveredMaskId("")}
                className={`block h-auto w-full touch-none ${mode === "upload" ? "cursor-crosshair" : "cursor-pointer"}`}
              />
            ) : (
              <label className="grid min-h-[540px] cursor-pointer place-items-center text-center text-white/70">
                <span><Upload className="mx-auto mb-4" size={34} /><strong className="block text-xl text-white">Upload a room photo</strong><small className="mt-2 block">JPG or PNG, up to 10 MB</small></span>
                <input hidden type="file" accept="image/jpeg,image/png" onChange={(event) => uploadImage(event.target.files?.[0])} />
              </label>
            )}

            <div className="absolute left-4 top-4 flex gap-1 bg-white/92 p-1 shadow-lg backdrop-blur">
              <button onClick={() => setBefore(true)} className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest ${before ? "bg-[var(--primary)] text-white" : ""}`}><Eye size={14} /> Before</button>
              <button onClick={() => setBefore(false)} className={`flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest ${!before ? "bg-[var(--primary)] text-white" : ""}`}><Sparkles size={14} /> After</button>
            </div>

            <span className="absolute right-4 top-4 flex items-center gap-2 bg-white/92 px-3 py-2 text-xs font-black shadow-lg backdrop-blur">
              <i className="size-5 rounded-full border border-black/10" style={{ background: shade.hex }} />{shade.name} · {shade.code}
            </span>
            {maskJson.masks.find((mask) => mask.id === activeMaskId) && <span className="absolute bottom-4 right-4 bg-white/92 px-3 py-2 text-xs font-black shadow-lg backdrop-blur">{maskJson.masks.find((mask) => mask.id === activeMaskId)?.name}</span>}
            {debug && <span className="absolute bottom-14 right-4 bg-black/75 px-3 py-2 font-mono text-[10px] text-white">image {maskJson.imageWidth}×{maskJson.imageHeight} · canvas {canvasSize.width}×{canvasSize.height} · scale {(canvasSize.width/maskJson.imageWidth).toFixed(3)}</span>}
            {mode === "upload" && (
              <span className="absolute bottom-4 left-4 bg-black/65 px-3 py-2 text-xs font-bold text-white backdrop-blur">
                {activePoints.length < 3 ? `${activePoints.length}/3 minimum points` : `${activePoints.length} editable points`}
              </span>
            )}
          </div>

          {debug && process.env.NODE_ENV !== "production" && (
            <pre className="mt-3 max-h-64 overflow-auto border border-amber-500/30 bg-[#111713] p-4 text-[10px] leading-5 text-amber-100">
              {JSON.stringify({
                serviceUrl: debugInfo?.serviceUrl,
                health: debugInfo?.health,
                maskCount: maskJson.masks.length,
                lastSegmentation,
              }, null, 2)}
            </pre>
          )}

          <p className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
            <MousePointer2 size={14} />
            {mode === "upload"
              ? "Click to add polygon points. Drag a point to edit it; select a point and press Delete to remove it."
              : "Click a wall area in the image, then choose a shade below to recolor it immediately."}
          </p>

          <section className="mt-7 border-y border-black/10 py-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><span className="public-eyebrow">Shade tray</span><h3 className="mt-3 font-serif text-4xl">Click a swatch to paint the selected wall.</h3></div>
              <label className="flex items-center gap-2 border-b border-black/25 py-2"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="bg-transparent text-sm outline-none" placeholder="Shade name or code" /></label>
            </div>
            <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
              {families.map((item) => <button key={item} onClick={() => setFamily(item)} className={`shrink-0 border px-3 py-2 text-xs font-black ${family === item ? "bg-[var(--primary)] text-white" : "border-black/10 bg-[var(--surface)]"}`}>{item}</button>)}
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
              {filteredShades.map((item) => (
                <button key={item.id} onClick={() => selectShade(item)} className={`group min-w-28 border p-2 text-left transition hover:-translate-y-1 ${shade.id === item.id ? "border-[var(--primary)] bg-[var(--surface)] shadow-xl" : "border-black/8"}`}>
                  <span className="relative block aspect-[5/4] w-full" style={{ background: item.hex }}>{shade.id === item.id && <Check className="absolute right-2 top-2 rounded-full bg-white p-1" size={22} />}</span>
                  <strong className="mt-2 block truncate text-xs">{item.name}</strong>
                  <small className="text-[9px] font-bold text-[var(--muted)]">{item.code}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-end justify-between gap-4"><div><span className="public-eyebrow">Room gallery</span><h3 className="mt-3 font-serif text-4xl">Start from a prepared room mask.</h3></div><span className="text-xs text-[var(--muted)]">{spaces.length} database rooms</span></div>
            <div className="mt-5 flex gap-4 overflow-x-auto pb-5">
              {spaces.map((item) => (
                <button key={item.id} onClick={() => selectSpace(item)} className={`min-w-52 border p-2 text-left transition hover:-translate-y-1 ${mode === "gallery" && space?.id === item.id ? "border-[var(--primary)] bg-[var(--surface)] shadow-xl" : "border-black/8"}`}>
                  <div className="aspect-[16/10] bg-cover bg-center" style={{ backgroundImage: `url(${item.thumbnailUrl || item.imageUrl})` }} />
                  <strong className="mt-3 block text-sm">{item.name}</strong>
                  <small className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{item.space || item.roomType}</small>
                </button>
              ))}
              <label className="grid min-w-52 cursor-pointer place-items-center border border-dashed border-black/25 p-6 text-center text-xs font-black transition hover:bg-[var(--surface)]">
                <span><Upload className="mx-auto mb-3" size={25} />Upload your room</span>
                <input hidden type="file" accept="image/jpeg,image/png" onChange={(event) => uploadImage(event.target.files?.[0])} />
              </label>
            </div>
          </section>
        </section>

        <aside className="tool-surface xl:sticky xl:top-24 xl:h-fit">
          <div className="flex items-start justify-between gap-4">
            <div><span className="public-eyebrow">{mode === "upload" ? "Your room" : "Gallery room"}</span><h2 className="mt-4 font-serif text-4xl leading-none">{mode === "upload" ? "Custom wall" : space?.name}</h2></div>
            <span className={`mt-1 size-3 rounded-full ${source ? "bg-emerald-600" : "bg-amber-500"}`} />
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between"><p className="tool-label">Wall areas</p>{mode === "upload" && <button onClick={addNewPolygon} className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">+ New polygon</button>}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {maskJson.masks.map((mask) => (
                <button key={mask.id} onClick={() => selectMask(mask.id)} className={`border px-3 py-2 text-xs font-black ${activeMaskId === mask.id ? "bg-[var(--primary)] text-white" : "border-black/10"}`}>
                  {mask.name}{wallPaints[mask.id] && <i className="ml-2 inline-block size-3 rounded-full border border-current/30 align-middle" style={{ background: wallPaints[mask.id].shadeHex }} />}
                </button>
              ))}
              {!maskJson.masks.length && <span className="text-xs text-[var(--muted)]">Click the image to start Wall 1.</span>}
            </div>
          </div>

          {mode === "upload" && (
            <div className="mt-6 border-y border-black/10 py-5">
              {activeMaskId && <label className="tool-label mb-4">Wall name<input value={maskJson.masks.find((mask) => mask.id === activeMaskId)?.name || ""} onChange={(event) => renameActiveMask(event.target.value)} placeholder="Main wall" /></label>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={undoPoint} disabled={!activePoints.length} className="admin-btn-light disabled:opacity-35"><Undo2 size={14} /> Undo point</button>
                <button onClick={deletePoint} disabled={selectedPoint === null} className="admin-btn-light disabled:opacity-35"><Trash2 size={14} /> Delete point</button>
                <button onClick={() => { setSelectedPoint(null); setStatus(activePoints.length >= 3 ? "Wall polygon finished. Choose a shade or add another wall." : "Add at least three points before finishing the wall."); }} disabled={activePoints.length < 3} className="admin-btn-light col-span-2 disabled:opacity-35"><Check size={14} /> Finish polygon</button>
                <button onClick={deletePolygon} disabled={!activeMaskId} className="admin-btn-light col-span-2 disabled:opacity-35"><RotateCcw size={14} /> Clear polygon</button>
              </div>
              {visionEnabled && (
                <button onClick={runAI} disabled={detecting || (!uploadedUrl && !uploadDataUrl)} className="admin-btn mt-3 w-full disabled:opacity-45">
                  <Sparkles size={15} />{detecting ? "Detecting wall…" : "AI-assisted wall detect"}
                </button>
              )}
              {!visionEnabled && <p className="mt-3 border-l-2 border-[var(--accent)] bg-black/[.025] p-3 text-xs font-bold text-[var(--muted)]">AI wall detection unavailable in this demo. Gallery rooms and manual wall selection remain available.</p>}
              <p className="mt-3 text-xs font-bold text-[var(--muted)]">AI-assisted wall detection — please review wall edges.</p>
            </div>
          )}

          <div className="mt-6"><p className="tool-label">Finish</p><div className="mt-2"><Segment values={["matt", "silk", "gloss", "texture"]} value={finish} onChange={(value) => { const next=value as WallPaintState["finish"]; setFinish(next); setActivePaint({ finish: next }); }} /></div></div>
          <div className="mt-6"><p className="tool-label">Lighting</p><div className="mt-2"><Segment values={["daylight", "warm", "cool", "evening"]} value={lighting} onChange={(value) => { setLighting(value); setSavedId(""); }} /></div></div>

          <label className="tool-label mt-6">Color intensity · {intensity}%<input type="range" min="20" max="95" value={intensity} onChange={(event) => { const value=+event.target.value; setIntensity(value); setActivePaint({ opacity: Math.min(.92, .58 * value / 62) }); }} className="accent-[var(--accent)]" /></label>
          <label className="tool-label mt-5">Image contrast · {contrast}%<input type="range" min="75" max="130" value={contrast} onChange={(event) => { const value=+event.target.value; setContrast(value); setActivePaint({ contrast: value }); }} className="accent-[var(--accent)]" /></label>
          <label className="tool-label mt-5">Image brightness · {brightness}%<input type="range" min="75" max="125" value={brightness} onChange={(event) => { const value=+event.target.value; setBrightness(value); setActivePaint({ brightness: value }); }} className="accent-[var(--accent)]" /></label>
          <label className="mt-5 flex items-center justify-between border-y border-black/10 py-4 text-sm font-bold">Preserve wall shadows<input type="checkbox" checked={preserveShadows} onChange={(event) => { setPreserveShadows(event.target.checked); setSavedId(""); }} className="size-5 accent-[var(--primary)]" /></label>

          <div className="mt-6 grid gap-2">
            <button onClick={save} disabled={saving || uploading} className="admin-btn disabled:opacity-45"><Save size={16} />{saving ? "Saving project…" : savedId ? "Project saved" : uploading ? "Uploading room…" : "Save project"}</button>
            <a className="admin-btn-light" href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`I visualized ${mode === "upload" ? "my room" : space?.name}: ${maskJson.masks.map((mask) => { const paint=wallPaints[mask.id]; const selected=shades.find((item)=>item.id===paint?.shadeId); return `${mask.name} — ${selected?.name || "unpainted"}${selected ? ` (${selected.code})` : ""}`; }).join("; ")}. Please send an estimate.`)}`}><MessageCircle size={16} /> WhatsApp estimate</a>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={resetSelectedWall} className="admin-btn-light"><RotateCcw size={14} /> Reset wall</button>
              <button onClick={resetAllWalls} className="admin-btn-light"><Trash2 size={14} /> Reset all</button>
            </div>
            <button onClick={resetControls} className="admin-btn-light"><Redo2 size={15} /> Reset image controls</button>
          </div>

          <div className={`mt-5 border-l-2 p-4 text-xs leading-5 ${status.includes("failed") || status.includes("could not") ? "border-red-700 bg-red-700/5" : "border-[var(--accent)] bg-black/[.025]"}`}>
            <span className="flex items-start gap-2"><Lightbulb className="mt-0.5 shrink-0" size={14} />{status || (mode === "upload" ? "Draw a polygon manually or use AI-assisted detection. Manual editing always remains available." : "Select a wall, then click a shade swatch below the image.")}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
