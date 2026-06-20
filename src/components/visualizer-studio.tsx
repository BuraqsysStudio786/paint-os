"use client";

import {
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  Focus,
  ImagePlus,
  Layers3,
  Lock,
  MessageCircle,
  MousePointer2,
  Move,
  Pencil,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { saveVisualizerProject } from "@/app/actions";
import {
  canvasToOriginalPoint,
  createContainViewport,
  nearestPointIndex,
  pointInPolygon,
  scalePolygonToCanvas,
  validateMaskLayer,
} from "@/lib/visualizer/geometry";
import {
  createEmptyMaskDocument,
  normalizeMaskDocument,
  serializeMaskDocument,
} from "@/lib/visualizer/mask-document";
import type {
  VisualizerBlendMode,
  VisualizerFinish,
  VisualizerMaskDocument,
  VisualizerMaskLayer,
  VisualizerPoint,
} from "@/lib/visualizer/types";
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

type Tool = "select" | "click" | "rectangle" | "polygon" | "refine";

type SegmentationResponse = {
  ok?: boolean;
  success?: boolean;
  imageWidth: number;
  imageHeight: number;
  masks: Array<{
    id: string;
    name: string;
    points: VisualizerPoint[];
    confidence?: number;
    source?: string;
    needsReview?: boolean;
  }>;
  warnings?: string[];
  manualRequired?: boolean;
  message?: string;
  method?: string;
};

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 760;

function newLayer(
  name: string,
  source: VisualizerMaskLayer["source"],
  width: number,
  height: number,
  points: VisualizerPoint[] = [],
): VisualizerMaskLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: "wall",
    source,
    points,
    originalImageWidth: width,
    originalImageHeight: height,
    needsReview: source !== "gallery-admin",
    locked: false,
    visible: true,
  };
}

function canvasPointer(
  event: React.PointerEvent<HTMLCanvasElement>,
): VisualizerPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return [
    (event.clientX - rect.left) / rect.width * event.currentTarget.width,
    (event.clientY - rect.top) / rect.height * event.currentTarget.height,
  ];
}

function pathPolygon(
  context: CanvasRenderingContext2D,
  points: VisualizerPoint[],
) {
  if (points.length < 3) return;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
}

function blendMode(mode: VisualizerBlendMode, preserveShadows: boolean) {
  if (!preserveShadows) return "source-over" as GlobalCompositeOperation;
  const modes: Record<VisualizerBlendMode, GlobalCompositeOperation> = {
    multiply: "multiply",
    overlay: "overlay",
    color: "color",
    "soft-light": "soft-light",
  };
  return modes[mode];
}

function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  const link = document.createElement("a");
  link.download = name;
  link.href = canvas.toDataURL("image/jpeg", 0.92);
  link.click();
}

async function uploadVisualizerImage(file: File) {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/visualizer/upload", {
    method: "POST",
    body: form,
  });
  const result = await response.json() as {
    ok?: boolean;
    url?: string;
    error?: string;
  };
  if (!response.ok || !result.ok || !result.url) {
    throw new Error(result.error || "Image upload failed.");
  }
  return result.url;
}

function layerFromDetection(
  mask: SegmentationResponse["masks"][number],
  response: SegmentationResponse,
  source: "auto-detect" | "click-detect",
): VisualizerMaskLayer {
  return {
    id: crypto.randomUUID(),
    name: mask.name || "Detected Wall",
    type: "wall",
    source,
    points: mask.points,
    originalImageWidth: response.imageWidth,
    originalImageHeight: response.imageHeight,
    confidence: mask.confidence,
    needsReview: true,
    visible: true,
    locked: false,
  };
}

function ToolButton({
  active,
  disabled,
  icon,
  label,
  recommended,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex min-h-20 flex-col items-start justify-between border p-3 text-left text-xs font-black transition disabled:opacity-35 ${
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
          : "border-black/10 bg-white hover:border-[var(--accent)]"
      }`}
    >
      {icon}
      <span>{label}</span>
      {recommended && (
        <span className="absolute right-2 top-2 rounded-full bg-[var(--secondary)] px-2 py-1 text-[8px] uppercase text-[var(--primary)]">
          Recommended
        </span>
      )}
    </button>
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const uploadFileRef = useRef<File | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rectangleStartRef = useRef<VisualizerPoint | null>(null);
  const dragPointRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const renderStartedRef = useRef(0);

  const firstSpace = spaces[0];
  const initialShade = shades.find((item) => item.id === searchParams.get("shade"))
    || shades.find((item) => item.id === firstSpace?.defaultShadeId)
    || shades[0];
  const firstGalleryDocument = normalizeMaskDocument(firstSpace?.maskJson, {
    gallery: true,
    legacyStatus: "approved",
  });

  const [mode, setMode] = useState<"gallery" | "upload">(
    firstSpace ? "gallery" : "upload",
  );
  const [space, setSpace] = useState<Space | undefined>(firstSpace);
  const [imageUrl, setImageUrl] = useState(firstSpace?.imageUrl || "");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [document, setDocument] = useState<VisualizerMaskDocument>(
    firstGalleryDocument,
  );
  const [selectedLayerId, setSelectedLayerId] = useState(
    firstGalleryDocument.layers[0]?.id || "",
  );
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [rectanglePreview, setRectanglePreview] = useState<VisualizerPoint[]>(
    [],
  );
  const [showMasks, setShowMasks] = useState(true);
  const [before, setBefore] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [family, setFamily] = useState("All");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(
    firstGalleryDocument.layers.length
      ? "Select a wall layer, then choose a shade."
      : "This gallery room needs mask setup in admin.",
  );
  const [debugOpen, setDebugOpen] = useState(false);
  const [lastServiceResponse, setLastServiceResponse] = useState<unknown>();
  const [renderMs, setRenderMs] = useState(0);
  const [savedId, setSavedId] = useState("");
  const [detecting, startDetection] = useTransition();
  const [saving, startSaving] = useTransition();

  const selectedLayer = document.layers.find(
    (layer) => layer.id === selectedLayerId,
  );
  const viewport = useMemo(
    () => createContainViewport(
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      document.imageWidth,
      document.imageHeight,
      zoom,
    ),
    [document.imageHeight, document.imageWidth, zoom],
  );
  const selectedCanvasPoints = useMemo(
    () => scalePolygonToCanvas(selectedLayer?.points || [], viewport),
    [selectedLayer?.points, viewport],
  );
  const families = useMemo(
    () => [
      "All",
      "Trending",
      ...new Set(shades.map((item) => item.colorFamily).filter(Boolean)),
    ],
    [shades],
  );
  const filteredShades = useMemo(
    () => shades.filter((item) => {
      const familyMatch = family === "All"
        || (family === "Trending" ? item.isTrending : item.colorFamily === family);
      const searchMatch = !search
        || `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase());
      return familyMatch && searchMatch;
    }),
    [family, search, shades],
  );

  const setLayers = useCallback((
    update: (layers: VisualizerMaskLayer[]) => VisualizerMaskLayer[],
  ) => {
    setDocument((current) => {
      const layers = update(current.layers);
      return { ...current, layers, masks: layers };
    });
    setSavedId("");
  }, []);

  const updateSelectedLayer = useCallback((
    patch: Partial<VisualizerMaskLayer>,
  ) => {
    if (!selectedLayerId) return;
    setLayers((layers) => layers.map((layer) => (
      layer.id === selectedLayerId ? { ...layer, ...patch } : layer
    )));
  }, [selectedLayerId, setLayers]);

  const selectShade = useCallback((shade: PublicShade) => {
    if (!selectedLayer) {
      setStatus("Create or select a wall layer before choosing a shade.");
      return;
    }
    updateSelectedLayer({
      paint: {
        shadeId: shade.id,
        shadeCode: shade.code,
        shadeName: shade.name,
        shadeHex: shade.hex,
        finish: selectedLayer.paint?.finish || "matt",
        opacity: selectedLayer.paint?.opacity ?? 0.58,
        blendMode: selectedLayer.paint?.blendMode || "multiply",
        brightness: selectedLayer.paint?.brightness ?? 100,
        contrast: selectedLayer.paint?.contrast ?? 100,
        preserveShadows: selectedLayer.paint?.preserveShadows ?? true,
      },
    });
    setBefore(false);
    setStatus(`${shade.name} applied to ${selectedLayer.name}.`);
  }, [selectedLayer, updateSelectedLayer]);

  useEffect(() => {
    if (!imageUrl) {
      imageRef.current = null;
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageRef.current = image;
      setDocument((current) => {
        if (current.imageWidth === image.naturalWidth
          && current.imageHeight === image.naturalHeight) return current;
        if (current.layers.length > 0) return current;
        return {
          ...current,
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
        };
      });
    };
    image.onerror = () => setStatus("The room image could not be loaded.");
    image.src = imageUrl;
  }, [imageUrl]);

  const draw = useCallback(() => {
    renderStartedRef.current = performance.now();
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#101511";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!image) return;

    context.drawImage(
      image,
      viewport.offsetX,
      viewport.offsetY,
      viewport.renderedWidth,
      viewport.renderedHeight,
    );

    if (!before) {
      document.layers.forEach((layer) => {
        if (!layer.visible || !layer.paint || !layer.points?.length) return;
        const points = scalePolygonToCanvas(layer.points, viewport);
        context.save();
        pathPolygon(context, points);
        context.clip();

        const paint = layer.paint;
        context.filter = `brightness(${paint.brightness}%) contrast(${paint.contrast}%)`;
        context.globalCompositeOperation = blendMode(
          paint.blendMode,
          paint.preserveShadows,
        );
        context.globalAlpha = Math.min(0.94, Math.max(0.08, paint.opacity));
        context.fillStyle = paint.shadeHex;
        context.fillRect(
          viewport.offsetX,
          viewport.offsetY,
          viewport.renderedWidth,
          viewport.renderedHeight,
        );

        if (paint.finish !== "matt") {
          context.filter = "none";
          context.globalCompositeOperation = "screen";
          context.globalAlpha = paint.finish === "gloss"
            ? 0.2
            : paint.finish === "silk"
              ? 0.1
              : 0.055;
          const sheen = context.createLinearGradient(
            viewport.offsetX,
            viewport.offsetY,
            viewport.offsetX + viewport.renderedWidth,
            viewport.offsetY + viewport.renderedHeight,
          );
          sheen.addColorStop(0, "rgba(255,255,255,.38)");
          sheen.addColorStop(0.34, "rgba(255,255,255,0)");
          sheen.addColorStop(0.76, "rgba(255,255,255,.08)");
          sheen.addColorStop(1, "rgba(255,255,255,.2)");
          context.fillStyle = sheen;
          context.fillRect(
            viewport.offsetX,
            viewport.offsetY,
            viewport.renderedWidth,
            viewport.renderedHeight,
          );
        }

        if (paint.finish === "texture") {
          context.globalCompositeOperation = "soft-light";
          context.globalAlpha = 0.1;
          for (let y = viewport.offsetY; y < viewport.offsetY + viewport.renderedHeight; y += 7) {
            for (let x = viewport.offsetX; x < viewport.offsetX + viewport.renderedWidth; x += 7) {
              const value = ((x * 13 + y * 7) % 19) / 19;
              context.fillStyle = value > 0.5 ? "#fff" : "#000";
              context.fillRect(x, y, 1, 1);
            }
          }
        }
        context.restore();
      });
    }

    if (showMasks) {
      document.layers.forEach((layer) => {
        if (!layer.visible || !layer.points?.length) return;
        const points = scalePolygonToCanvas(layer.points, viewport);
        context.save();
        pathPolygon(context, points);
        context.strokeStyle = layer.id === selectedLayerId
          ? "#ffffff"
          : "rgba(255,255,255,.55)";
        context.lineWidth = layer.id === selectedLayerId ? 3 : 1.5;
        context.setLineDash(layer.needsReview ? [10, 7] : []);
        context.stroke();
        context.restore();
      });
    }

    if (rectanglePreview.length === 4) {
      context.save();
      pathPolygon(context, scalePolygonToCanvas(rectanglePreview, viewport));
      context.strokeStyle = "#C9A45C";
      context.fillStyle = "rgba(201,164,92,.18)";
      context.lineWidth = 3;
      context.setLineDash([8, 6]);
      context.fill();
      context.stroke();
      context.restore();
    }

    if (
      selectedLayer
      && selectedLayer.visible
      && tool !== "click"
      && showMasks
    ) {
      selectedCanvasPoints.forEach(([x, y], index) => {
        context.beginPath();
        context.arc(x, y, selectedPoint === index ? 9 : 7, 0, Math.PI * 2);
        context.fillStyle = selectedPoint === index ? "#C9A45C" : "#ffffff";
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = "#173F32";
        context.stroke();
      });
    }

    setRenderMs(Math.round((performance.now() - renderStartedRef.current) * 10) / 10);
  }, [
    before,
    document.layers,
    rectanglePreview,
    selectedCanvasPoints,
    selectedLayer,
    selectedLayerId,
    selectedPoint,
    showMasks,
    tool,
    viewport,
  ]);

  useEffect(() => draw(), [draw]);

  const addLayer = useCallback((
    source: VisualizerMaskLayer["source"],
    points: VisualizerPoint[] = [],
    name?: string,
  ) => {
    const layer = newLayer(
      name || `Wall ${document.layers.length + 1}`,
      source,
      document.imageWidth,
      document.imageHeight,
      points,
    );
    setLayers((layers) => [...layers, layer]);
    setSelectedLayerId(layer.id);
    setSelectedPoint(null);
    return layer;
  }, [
    document.imageHeight,
    document.imageWidth,
    document.layers.length,
    setLayers,
  ]);

  const switchMode = (nextMode: "gallery" | "upload") => {
    setMode(nextMode);
    setBefore(false);
    setTool(nextMode === "upload" ? "click" : "select");
    setZoom(1);
    setSelectedPoint(null);
    if (nextMode === "gallery") {
      if (!space && spaces[0]) setSpace(spaces[0]);
      const nextSpace = space || spaces[0];
      if (nextSpace) selectSpace(nextSpace);
    } else {
      setImageUrl(objectUrlRef.current || "");
      setDocument(createEmptyMaskDocument());
      setSelectedLayerId("");
      setStatus("Upload a photo, then click the wall for the best starting point.");
    }
  };

  const selectSpace = (next: Space) => {
    const nextDocument = normalizeMaskDocument(next.maskJson, {
      gallery: true,
      legacyStatus: "approved",
    });
    setSpace(next);
    setMode("gallery");
    setImageUrl(next.imageUrl);
    setDocument(nextDocument);
    setSelectedLayerId(nextDocument.layers[0]?.id || "");
    setTool("select");
    setZoom(1);
    setBefore(false);
    setStatus(
      nextDocument.status === "approved" && nextDocument.layers.length
        ? "Approved gallery masks loaded. Select a layer and apply a shade."
        : "This gallery room needs mask setup in admin.",
    );
  };

  const uploadImage = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setStatus("Upload a JPG or PNG image.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    uploadFileRef.current = file;
    setMode("upload");
    setImageUrl(objectUrlRef.current);
    setUploadedUrl("");
    setDocument(createEmptyMaskDocument());
    setSelectedLayerId("");
    setTool("click");
    setStatus("Photo ready. Recommended: choose Click Wall, then click inside the wall.");
  };

  const runDetection = useCallback((
    modeName: "auto" | "click",
    positivePoint?: VisualizerPoint,
  ) => {
    const file = uploadFileRef.current;
    if (!file) {
      setStatus("Upload a room photo before running wall detection.");
      return;
    }
    startDetection(async () => {
      setStatus(
        modeName === "click"
          ? "Finding the wall around your click…"
          : "Generating wall candidates…",
      );
      try {
        const form = new FormData();
        form.set("image", file);
        form.set("mode", modeName);
        form.set("expectedWallsCount", modeName === "click" ? "1" : "4");
        if (positivePoint) {
          form.set("positivePoints", JSON.stringify([
            { x: positivePoint[0], y: positivePoint[1] },
          ]));
        }
        const response = await fetch(
          `/api/site/${clientSlug}/visualizer/segment`,
          { method: "POST", body: form },
        );
        const result = await response.json() as SegmentationResponse;
        setLastServiceResponse(result);
        if (!response.ok || !result.ok || !result.masks?.length) {
          throw new Error(
            result.message
            || result.warnings?.join(" ")
            || "No useful wall candidate was found.",
          );
        }
        const layers = result.masks.map((mask) => layerFromDetection(
          mask,
          result,
          modeName === "click" ? "click-detect" : "auto-detect",
        ));
        setDocument((current) => {
          const existing = current.layers;
          const merged = modeName === "click"
            ? [...existing, layers[0]]
            : [...existing, ...layers];
          return {
            ...current,
            imageWidth: result.imageWidth,
            imageHeight: result.imageHeight,
            layers: merged,
            masks: merged,
          };
        });
        setSelectedLayerId(layers[0].id);
        setTool("refine");
        setStatus("AI-assisted mask added. Please review and drag the wall edges.");
      } catch (error) {
        setStatus(
          `${error instanceof Error ? error.message : "Detection failed."} `
          + "Define corners manually or draw a rectangle.",
        );
      }
    });
  }, [clientSlug]);

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvasPoint = canvasPointer(event);
    const originalPoint = canvasToOriginalPoint(canvasPoint, viewport);
    if (
      canvasPoint[0] < viewport.offsetX
      || canvasPoint[0] > viewport.offsetX + viewport.renderedWidth
      || canvasPoint[1] < viewport.offsetY
      || canvasPoint[1] > viewport.offsetY + viewport.renderedHeight
    ) return;

    if (tool === "click") {
      runDetection("click", originalPoint);
      return;
    }
    if (tool === "rectangle") {
      rectangleStartRef.current = originalPoint;
      setRectanglePreview([originalPoint, originalPoint, originalPoint, originalPoint]);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "polygon") {
      if (!selectedLayer || selectedLayer.source !== "manual-polygon") {
        addLayer("manual-polygon", [originalPoint], "Custom Wall");
      } else {
        updateSelectedLayer({
          points: [...(selectedLayer.points || []), originalPoint],
        });
      }
      return;
    }
    if (selectedLayer && !selectedLayer.locked) {
      const pointIndex = nearestPointIndex(
        selectedCanvasPoints,
        canvasPoint,
        18,
      );
      if (pointIndex >= 0) {
        dragPointRef.current = pointIndex;
        dragMovedRef.current = false;
        setSelectedPoint(pointIndex);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    const hit = [...document.layers].reverse().find((layer) => (
      layer.visible
      && layer.points
      && pointInPolygon(originalPoint, layer.points)
    ));
    if (hit) {
      setSelectedLayerId(hit.id);
      setSelectedPoint(null);
    }
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const originalPoint = canvasToOriginalPoint(canvasPointer(event), viewport);
    if (rectangleStartRef.current) {
      const start = rectangleStartRef.current;
      setRectanglePreview([
        start,
        [originalPoint[0], start[1]],
        originalPoint,
        [start[0], originalPoint[1]],
      ]);
      return;
    }
    if (
      dragPointRef.current === null
      || !selectedLayer
      || selectedLayer.locked
    ) return;
    dragMovedRef.current = true;
    const points = [...(selectedLayer.points || [])];
    points[dragPointRef.current] = originalPoint;
    updateSelectedLayer({
      points,
      needsReview: selectedLayer.source !== "gallery-admin",
    });
  };

  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (rectangleStartRef.current && rectanglePreview.length === 4) {
      const boxWidth = Math.abs(rectanglePreview[1][0] - rectanglePreview[0][0]);
      const boxHeight = Math.abs(rectanglePreview[3][1] - rectanglePreview[0][1]);
      if (
        boxWidth >= document.imageWidth * 0.03
        && boxHeight >= document.imageHeight * 0.03
      ) {
        addLayer("rectangle", rectanglePreview, "Rectangle Wall");
        setTool("refine");
        setStatus("Rectangle wall added. Drag its corners to refine the edges.");
      } else {
        setStatus("Drag a larger rectangle over the wall.");
      }
    }
    rectangleStartRef.current = null;
    setRectanglePreview([]);
    dragPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (selectedPoint === null || !selectedLayer || selectedLayer.locked) return;
      if ((selectedLayer.points?.length || 0) <= 3) return;
      event.preventDefault();
      updateSelectedLayer({
        points: selectedLayer.points?.filter((_, index) => index !== selectedPoint),
      });
      setSelectedPoint(null);
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [selectedLayer, selectedPoint, updateSelectedLayer]);

  const finishPolygon = () => {
    if (!selectedLayer) return;
    const validation = validateMaskLayer(selectedLayer);
    if (!validation.valid) {
      setStatus(validation.reason);
      return;
    }
    setTool("refine");
    setSelectedPoint(null);
    setStatus("Wall selection finished. Drag any point to refine it.");
  };

  const deleteSelectedPoint = () => {
    if (
      selectedPoint === null
      || !selectedLayer?.points
      || selectedLayer.points.length <= 3
      || selectedLayer.locked
    ) return;
    updateSelectedLayer({
      points: selectedLayer.points.filter((_, index) => index !== selectedPoint),
    });
    setSelectedPoint(null);
  };

  const addRefinePoint = () => {
    if (!selectedLayer?.points || selectedLayer.locked) return;
    const points = selectedLayer.points;
    let longest = 0;
    let insertAt = 1;
    for (let index = 0; index < points.length; index++) {
      const next = (index + 1) % points.length;
      const distance = Math.hypot(
        points[next][0] - points[index][0],
        points[next][1] - points[index][1],
      );
      if (distance > longest) {
        longest = distance;
        insertAt = next;
      }
    }
    const previous = points[(insertAt - 1 + points.length) % points.length];
    const next = points[insertAt % points.length];
    const updated = [...points];
    updated.splice(insertAt, 0, [
      (previous[0] + next[0]) / 2,
      (previous[1] + next[1]) / 2,
    ]);
    updateSelectedLayer({
      points: updated,
      source: "brush-refined",
      needsReview: true,
    });
    setSelectedPoint(insertAt);
  };

  const removeSelectedLayer = () => {
    if (!selectedLayerId) return;
    const remaining = document.layers.filter(
      (layer) => layer.id !== selectedLayerId,
    );
    setLayers(() => remaining);
    setSelectedLayerId(remaining[0]?.id || "");
    setSelectedPoint(null);
  };

  const removeLayerById = (id: string) => {
    const remaining = document.layers.filter((layer) => layer.id !== id);
    setLayers(() => remaining);
    if (selectedLayerId === id) {
      setSelectedLayerId(remaining[0]?.id || "");
      setSelectedPoint(null);
    }
  };

  const save = () => {
    if (!document.layers.length) {
      setStatus("Create at least one wall layer before saving.");
      return;
    }
    const firstPainted = document.layers.find((layer) => layer.paint);
    const shadeId = firstPainted?.paint?.shadeId || initialShade?.id;
    if (!shadeId) {
      setStatus("Choose a shade before saving.");
      return;
    }
    startSaving(async () => {
      try {
        let resultImageUrl = "";
        let uploadedImageUrl = uploadedUrl;
        if (mode === "upload" && uploadFileRef.current && !uploadedImageUrl) {
          uploadedImageUrl = await uploadVisualizerImage(uploadFileRef.current);
          setUploadedUrl(uploadedImageUrl);
        }
        const canvas = canvasRef.current;
        if (canvas) {
          try {
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob(
                (value) => value
                  ? resolve(value)
                  : reject(new Error("Preview export failed.")),
                "image/jpeg",
                0.9,
              );
            });
            resultImageUrl = await uploadVisualizerImage(
              new File([blob], "paint-visualizer-preview.jpg", {
                type: "image/jpeg",
              }),
            );
          } catch {
            resultImageUrl = "";
          }
        }
        const saved = await saveVisualizerProject({
          clientId,
          sessionId: crypto.randomUUID(),
          spaceId: mode === "gallery" ? space?.id : undefined,
          uploadedImageUrl: mode === "upload" ? uploadedImageUrl : undefined,
          shadeId,
          maskJson: serializeMaskDocument(document),
          resultImageUrl: resultImageUrl || undefined,
        });
        setSavedId(saved.id);
        setStatus("Project saved. You can keep editing or request a quote.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Project save failed.");
      }
    });
  };

  const selectedShade = shades.find(
    (item) => item.id === selectedLayer?.paint?.shadeId,
  ) || initialShade;
  const quoteText = encodeURIComponent(
    `I created a paint visualizer project${savedId ? ` (${savedId})` : ""}. `
    + document.layers.map((layer) => (
      `${layer.name}: ${layer.paint?.shadeName || "not painted"}`
    )).join("; ")
    + ". Please send a quote.",
  );
  const cursor = tool === "click" || tool === "polygon" || tool === "rectangle"
    ? "cursor-crosshair"
    : tool === "refine"
      ? "cursor-move"
      : "cursor-default";

  return (
    <div className="visualizer-shell">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-black/10 pb-5">
        <div className="flex bg-black/[.045] p-1">
          <button
            type="button"
            onClick={() => switchMode("gallery")}
            disabled={!spaces.length}
            className={`min-h-11 px-5 text-xs font-black uppercase tracking-widest ${
              mode === "gallery" ? "bg-[var(--primary)] text-white" : ""
            }`}
          >
            Gallery Rooms
          </button>
          <button
            type="button"
            onClick={() => switchMode("upload")}
            className={`min-h-11 px-5 text-xs font-black uppercase tracking-widest ${
              mode === "upload" ? "bg-[var(--primary)] text-white" : ""
            }`}
          >
            Upload My Room
          </button>
        </div>
        <p className="flex max-w-xl items-center gap-2 text-xs font-bold text-[var(--muted)]">
          <CircleHelp size={16} />
          {mode === "upload"
            ? "AI-assisted detection gives a starting point. Please review the wall edges."
            : "Gallery rooms use prepared mask layers and never run automatic detection."}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="min-w-0">
          <div className="relative overflow-hidden bg-[#101511] shadow-[0_25px_70px_rgba(20,30,24,.2)]">
            {imageUrl ? (
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                className={`block aspect-[30/19] h-auto w-full touch-none ${cursor}`}
              />
            ) : (
              <label className="grid aspect-[30/19] cursor-pointer place-items-center text-center text-white/70">
                <span>
                  <Upload className="mx-auto mb-4" size={36} />
                  <strong className="block text-xl text-white">Upload your room</strong>
                  <small className="mt-2 block">JPG or PNG, up to 10 MB</small>
                </span>
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(event) => uploadImage(event.target.files?.[0])}
                />
              </label>
            )}

            <div className="absolute left-3 top-3 flex flex-wrap gap-1 bg-white/92 p-1 shadow-lg backdrop-blur">
              <button
                type="button"
                onClick={() => setBefore(true)}
                className={`flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase ${
                  before ? "bg-[var(--primary)] text-white" : ""
                }`}
              >
                <Eye size={13} /> Before
              </button>
              <button
                type="button"
                onClick={() => setBefore(false)}
                className={`flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase ${
                  !before ? "bg-[var(--primary)] text-white" : ""
                }`}
              >
                <Sparkles size={13} /> After
              </button>
              <button
                type="button"
                onClick={() => setShowMasks((value) => !value)}
                className="px-3 py-2"
                title="Show or hide mask edges"
              >
                {showMasks ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))}
                className="px-2"
                title="Zoom out"
              >
                <ZoomOut size={15} />
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}
                className="px-2"
                title="Zoom in"
              >
                <ZoomIn size={15} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-2"
                title="Fit image"
              >
                <Focus size={15} />
              </button>
            </div>

            {selectedLayer && (
              <span className="absolute bottom-3 right-3 flex items-center gap-2 bg-white/92 px-3 py-2 text-xs font-black shadow-lg backdrop-blur">
                <i
                  className="size-4 rounded-full border border-black/15"
                  style={{ background: selectedLayer.paint?.shadeHex || "#fff" }}
                />
                {selectedLayer.name}
              </span>
            )}

            {tool !== "select" && mode === "upload" && (
              <span className="absolute bottom-3 left-3 bg-black/70 px-3 py-2 text-xs font-bold text-white backdrop-blur">
                {tool === "click" && "Click inside the wall"}
                {tool === "rectangle" && "Drag over the wall"}
                {tool === "polygon" && "Click each wall corner"}
                {tool === "refine" && "Drag points to refine"}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
            <span className="flex items-center gap-2">
              <MousePointer2 size={14} />
              {status}
            </span>
            {mode === "upload" && (
              <span>For best accuracy, click the wall or define corners manually.</span>
            )}
          </div>

          <section className="mt-7 border-y border-black/10 py-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="public-eyebrow">Shade tray</span>
                <h3 className="mt-3 font-serif text-4xl">
                  Paint the selected layer.
                </h3>
              </div>
              <label className="flex items-center gap-2 border-b border-black/25 py-2">
                <Search size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="bg-transparent text-sm outline-none"
                  placeholder="Shade or code"
                />
              </label>
            </div>
            <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
              {families.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setFamily(item)}
                  className={`shrink-0 border px-3 py-2 text-xs font-black ${
                    family === item
                      ? "bg-[var(--primary)] text-white"
                      : "border-black/10 bg-[var(--surface)]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
              {filteredShades.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => selectShade(item)}
                  className={`group min-w-28 border p-2 text-left transition hover:-translate-y-1 ${
                    selectedLayer?.paint?.shadeId === item.id
                      ? "border-[var(--primary)] bg-[var(--surface)] shadow-xl"
                      : "border-black/8"
                  }`}
                >
                  <span
                    className="relative block aspect-[5/4] w-full"
                    style={{ background: item.hex }}
                  >
                    {selectedLayer?.paint?.shadeId === item.id && (
                      <Check
                        className="absolute right-2 top-2 rounded-full bg-white p-1"
                        size={22}
                      />
                    )}
                  </span>
                  <strong className="mt-2 block truncate text-xs">{item.name}</strong>
                  <small className="text-[9px] font-bold text-[var(--muted)]">
                    {item.code}
                  </small>
                </button>
              ))}
            </div>
          </section>

          {mode === "gallery" ? (
            <section className="mt-7">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="public-eyebrow">Prepared rooms</span>
                  <h3 className="mt-3 font-serif text-4xl">
                    Gallery masks, approved in admin.
                  </h3>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {spaces.length} rooms
                </span>
              </div>
              <div className="mt-5 flex gap-4 overflow-x-auto pb-5">
                {spaces.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => selectSpace(item)}
                    className={`min-w-52 border p-2 text-left transition hover:-translate-y-1 ${
                      space?.id === item.id
                        ? "border-[var(--primary)] bg-[var(--surface)] shadow-xl"
                        : "border-black/8"
                    }`}
                  >
                    <div
                      className="aspect-[16/10] bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${item.thumbnailUrl || item.imageUrl})`,
                      }}
                    />
                    <strong className="mt-3 block text-sm">{item.name}</strong>
                    <small className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {item.space || item.roomType}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="mt-7 border border-black/10 bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="public-eyebrow">Your photo</span>
                  <h3 className="mt-3 font-serif text-3xl">
                    Create reliable wall layers.
                  </h3>
                </div>
                <label className="public-pill cursor-pointer">
                  <ImagePlus size={15} /> Change photo
                  <input
                    hidden
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(event) => uploadImage(event.target.files?.[0])}
                  />
                </label>
              </div>
            </section>
          )}
        </section>

        <aside className="tool-surface xl:sticky xl:top-24 xl:h-fit">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="public-eyebrow">Layer studio</span>
              <h2 className="mt-4 font-serif text-4xl leading-none">
                {mode === "gallery" ? space?.name : "Your room"}
              </h2>
            </div>
            <Layers3 size={25} strokeWidth={1.4} />
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between">
              <p className="tool-label">Layers</p>
              {mode === "upload" && (
                <button
                  type="button"
                  onClick={() => {
                    addLayer("manual-polygon", [], `Wall ${document.layers.length + 1}`);
                    setTool("polygon");
                  }}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[var(--accent)]"
                >
                  <Plus size={13} /> Add Layer
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-2">
              {document.layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 border p-2 ${
                    layer.id === selectedLayerId
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setLayers((layers) => layers.map((item) => (
                      item.id === layer.id
                        ? { ...item, visible: !item.visible }
                        : item
                    )))}
                    title={layer.visible ? "Hide layer" : "Show layer"}
                  >
                    {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLayerId(layer.id);
                      setSelectedPoint(null);
                    }}
                    className="min-w-0 text-left"
                  >
                    <strong className="block truncate text-xs">{layer.name}</strong>
                    <span className="block truncate text-[9px] uppercase opacity-60">
                      {layer.source}
                      {layer.needsReview ? " · review" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayers((layers) => layers.map((item) => (
                      item.id === layer.id
                        ? { ...item, locked: !item.locked }
                        : item
                    )))}
                    title={layer.locked ? "Unlock layer" : "Lock layer"}
                  >
                    {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  {mode === "upload" && (
                    <button
                      type="button"
                      onClick={() => removeLayerById(layer.id)}
                      title="Delete layer"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {!document.layers.length && (
                <div className="border border-dashed border-black/20 p-4 text-xs text-[var(--muted)]">
                  {mode === "gallery"
                    ? "This gallery room needs mask setup in admin."
                    : "No wall layers yet. Click the wall, draw a rectangle, or select corners."}
                </div>
              )}
            </div>
          </div>

          {mode === "upload" && (
            <div className="mt-6 border-t border-black/10 pt-5">
              <p className="tool-label">Create Mask</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ToolButton
                  active={tool === "click"}
                  disabled={!imageUrl || !visionEnabled || detecting}
                  icon={<MousePointer2 size={18} />}
                  label={detecting ? "Detecting…" : "Click Wall"}
                  recommended
                  onClick={() => setTool("click")}
                />
                <ToolButton
                  disabled={!imageUrl || !visionEnabled || detecting}
                  icon={<WandSparkles size={18} />}
                  label="Auto Detect"
                  onClick={() => runDetection("auto")}
                />
                <ToolButton
                  active={tool === "rectangle"}
                  disabled={!imageUrl}
                  icon={<RectangleHorizontal size={18} />}
                  label="Rectangle"
                  onClick={() => setTool("rectangle")}
                />
                <ToolButton
                  active={tool === "polygon"}
                  disabled={!imageUrl}
                  icon={<Pencil size={18} />}
                  label="Custom Polygon"
                  onClick={() => {
                    if (!selectedLayer || selectedLayer.source !== "manual-polygon") {
                      addLayer("manual-polygon", [], "Custom Wall");
                    }
                    setTool("polygon");
                  }}
                />
                <ToolButton
                  active={tool === "refine"}
                  disabled={!selectedLayer}
                  icon={<Move size={18} />}
                  label="Point Refine"
                  onClick={() => setTool("refine")}
                />
                <ToolButton
                  disabled={!selectedLayer || selectedLayer.locked}
                  icon={<Plus size={18} />}
                  label="Add Point"
                  onClick={addRefinePoint}
                />
              </div>
              {tool === "polygon" && (
                <button
                  type="button"
                  onClick={finishPolygon}
                  disabled={(selectedLayer?.points?.length || 0) < 3}
                  className="admin-btn mt-3 w-full disabled:opacity-40"
                >
                  <Check size={15} /> Finish Selection
                </button>
              )}
              {selectedLayer && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={deleteSelectedPoint}
                    disabled={selectedPoint === null || selectedLayer.locked}
                    className="admin-btn-light disabled:opacity-35"
                  >
                    <Trash2 size={14} /> Erase Point
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedLayer}
                    className="admin-btn-light"
                  >
                    <RotateCcw size={14} /> Delete Layer
                  </button>
                </div>
              )}
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                Click detection is recommended. Rectangle and corner tools guarantee
                a usable result when the room is complex.
              </p>
            </div>
          )}

          {selectedLayer && (
            <div className="mt-6 border-t border-black/10 pt-5">
              <label className="tool-label">
                Layer name
                <input
                  value={selectedLayer.name}
                  disabled={mode === "gallery"}
                  onChange={(event) => updateSelectedLayer({
                    name: event.target.value,
                  })}
                />
              </label>
              <p className="tool-label mt-5">Paint Settings</p>
              <label className="tool-label mt-3">
                Finish
                <select
                  value={selectedLayer.paint?.finish || "matt"}
                  onChange={(event) => selectedLayer.paint && updateSelectedLayer({
                    paint: {
                      ...selectedLayer.paint,
                      finish: event.target.value as VisualizerFinish,
                    },
                  })}
                >
                  <option value="matt">Matt</option>
                  <option value="silk">Silk</option>
                  <option value="gloss">Gloss</option>
                  <option value="texture">Texture</option>
                </select>
              </label>
              <label className="tool-label mt-4">
                Blend mode
                <select
                  value={selectedLayer.paint?.blendMode || "multiply"}
                  onChange={(event) => selectedLayer.paint && updateSelectedLayer({
                    paint: {
                      ...selectedLayer.paint,
                      blendMode: event.target.value as VisualizerBlendMode,
                    },
                  })}
                >
                  <option value="multiply">Multiply</option>
                  <option value="soft-light">Soft light</option>
                  <option value="overlay">Overlay</option>
                  <option value="color">Color</option>
                </select>
              </label>
              <label className="tool-label mt-4">
                Opacity · {Math.round((selectedLayer.paint?.opacity || 0.58) * 100)}%
                <input
                  type="range"
                  min="20"
                  max="92"
                  value={Math.round((selectedLayer.paint?.opacity || 0.58) * 100)}
                  onChange={(event) => selectedLayer.paint && updateSelectedLayer({
                    paint: {
                      ...selectedLayer.paint,
                      opacity: Number(event.target.value) / 100,
                    },
                  })}
                />
              </label>
              <label className="tool-label mt-4">
                Brightness · {selectedLayer.paint?.brightness || 100}%
                <input
                  type="range"
                  min="75"
                  max="125"
                  value={selectedLayer.paint?.brightness || 100}
                  onChange={(event) => selectedLayer.paint && updateSelectedLayer({
                    paint: {
                      ...selectedLayer.paint,
                      brightness: Number(event.target.value),
                    },
                  })}
                />
              </label>
              <label className="tool-label mt-4">
                Contrast · {selectedLayer.paint?.contrast || 100}%
                <input
                  type="range"
                  min="75"
                  max="130"
                  value={selectedLayer.paint?.contrast || 100}
                  onChange={(event) => selectedLayer.paint && updateSelectedLayer({
                    paint: {
                      ...selectedLayer.paint,
                      contrast: Number(event.target.value),
                    },
                  })}
                />
              </label>
              <label className="mt-4 flex items-center justify-between border-y border-black/10 py-4 text-sm font-bold">
                Preserve shadows
                <input
                  type="checkbox"
                  checked={selectedLayer.paint?.preserveShadows ?? true}
                  onChange={(event) => selectedLayer.paint && updateSelectedLayer({
                    paint: {
                      ...selectedLayer.paint,
                      preserveShadows: event.target.checked,
                    },
                  })}
                  className="size-5 accent-[var(--primary)]"
                />
              </label>
              {!selectedLayer.paint && selectedShade && (
                <button
                  type="button"
                  onClick={() => selectShade(selectedShade)}
                  className="admin-btn mt-4 w-full"
                >
                  Apply {selectedShade.name}
                </button>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-2 border-t border-black/10 pt-5">
            <button
              type="button"
              onClick={save}
              disabled={saving || !document.layers.length}
              className="admin-btn disabled:opacity-40"
            >
              <Save size={16} />
              {saving ? "Saving…" : savedId ? "Project Saved" : "Save Project"}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  if (canvasRef.current) {
                    downloadCanvas(canvasRef.current, "paint-visualizer.jpg");
                  }
                } catch {
                  setStatus("This image host does not allow browser downloads.");
                }
              }}
              disabled={!imageUrl}
              className="admin-btn-light"
            >
              <Download size={16} /> Download Preview
            </button>
            <a
              className="admin-btn-light"
              href={`https://wa.me/${whatsappNumber}?text=${quoteText}`}
            >
              <MessageCircle size={16} /> WhatsApp Quote
            </a>
          </div>

          <details className="mt-5 border-t border-black/10 pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              Project details <ChevronDown size={14} />
            </summary>
            <div className="mt-3 text-xs leading-5 text-[var(--muted)]">
              <p>{document.imageWidth} × {document.imageHeight} original image</p>
              <p>{document.layers.length} layer{document.layers.length === 1 ? "" : "s"}</p>
              <p>Digital colours are approximate. Approve a physical sample.</p>
            </div>
          </details>

          {process.env.NODE_ENV !== "production" && (
            <div className="mt-5 border-t border-black/10 pt-4">
              <button
                type="button"
                onClick={() => setDebugOpen((value) => !value)}
                className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]"
              >
                {debugOpen ? "Hide" : "Show"} debug drawer
              </button>
              {debugOpen && (
                <pre className="mt-3 max-h-72 overflow-auto bg-[#101511] p-3 text-[9px] leading-4 text-amber-100">
                  {JSON.stringify({
                    imageSize: [document.imageWidth, document.imageHeight],
                    canvasSize: [CANVAS_WIDTH, CANVAS_HEIGHT],
                    selectedLayer: selectedLayer?.id,
                    source: selectedLayer?.source,
                    scaleX: viewport.scaleX,
                    scaleY: viewport.scaleY,
                    offsetX: viewport.offsetX,
                    offsetY: viewport.offsetY,
                    points: selectedLayer?.points,
                    renderMs,
                    serviceResponse: lastServiceResponse,
                  }, null, 2)}
                </pre>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
