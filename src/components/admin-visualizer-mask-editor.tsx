"use client";

import {
  Check,
  Eye,
  EyeOff,
  ImageUp,
  MousePointer2,
  Pencil,
  Plus,
  RectangleHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  canvasToOriginalPoint,
  createContainViewport,
  nearestPointIndex,
  validateMaskLayer,
} from "@/lib/visualizer/geometry";
import {
  normalizeMaskDocument,
  serializeMaskDocument,
} from "@/lib/visualizer/mask-document";
import type {
  MaskStatus,
  VisualizerMaskLayer,
  VisualizerPoint,
} from "@/lib/visualizer/types";

type ShadeOption = { id: string; name: string; code?: string };
type Tool = "select" | "click" | "rectangle" | "polygon";

async function uploadImage(file: File) {
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
    throw new Error(result.error || "Upload failed.");
  }
  return result.url;
}

function createLayer(
  documentWidth: number,
  documentHeight: number,
  source: VisualizerMaskLayer["source"],
  name: string,
  points: VisualizerPoint[] = [],
): VisualizerMaskLayer {
  return {
    id: crypto.randomUUID(),
    name,
    type: "wall",
    source,
    points,
    originalImageWidth: documentWidth,
    originalImageHeight: documentHeight,
    needsReview: source !== "gallery-admin",
    visible: true,
    locked: false,
  };
}

export function AdminVisualizerMaskEditor({
  initialImageUrl,
  initialMaskJson,
  shades,
  clientSlug,
}: {
  initialImageUrl: string;
  initialMaskJson: unknown;
  shades: ShadeOption[];
  clientSlug: string;
}) {
  const initial = normalizeMaskDocument(initialMaskJson, {
    gallery: true,
    legacyStatus: "approved",
  });
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [document, setDocument] = useState(initial);
  const [activeId, setActiveId] = useState(initial.layers[0]?.id || "");
  const [tool, setTool] = useState<Tool>("select");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [dragPoint, setDragPoint] = useState<number | null>(null);
  const [rectangleStart, setRectangleStart] = useState<VisualizerPoint | null>(null);
  const [rectanglePreview, setRectanglePreview] = useState<VisualizerPoint[]>([]);
  const [preview, setPreview] = useState(true);
  const [previewHex, setPreviewHex] = useState("#C9A45C");
  const [status, setStatus] = useState(
    "Choose a tool, create each wall layer, refine the points, then approve the mask.",
  );
  const [detecting, setDetecting] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const active = document.layers.find((layer) => layer.id === activeId);
  const serialized = useMemo(
    () => JSON.stringify(serializeMaskDocument(document)),
    [document],
  );
  const viewport = createContainViewport(
    document.imageWidth,
    document.imageHeight,
    document.imageWidth,
    document.imageHeight,
  );

  const setLayers = (
    update: (layers: VisualizerMaskLayer[]) => VisualizerMaskLayer[],
  ) => {
    setDocument((current) => {
      const layers = update(current.layers);
      return { ...current, layers, masks: layers };
    });
  };

  const updateActive = (patch: Partial<VisualizerMaskLayer>) => {
    setLayers((layers) => layers.map((layer) => (
      layer.id === activeId ? { ...layer, ...patch } : layer
    )));
  };

  const pointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return [0, 0] as VisualizerPoint;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    const mapped = matrix ? point.matrixTransform(matrix) : point;
    return canvasToOriginalPoint([mapped.x, mapped.y], viewport);
  };

  const addLayer = (
    source: VisualizerMaskLayer["source"] = "gallery-admin",
    points: VisualizerPoint[] = [],
    name = `Wall ${document.layers.length + 1}`,
  ) => {
    const layer = createLayer(
      document.imageWidth,
      document.imageHeight,
      source,
      name,
      points,
    );
    setLayers((layers) => [...layers, layer]);
    setActiveId(layer.id);
    setSelectedPoint(null);
    return layer;
  };

  const removeLayer = (id = activeId) => {
    const remaining = document.layers.filter((layer) => layer.id !== id);
    setLayers(() => remaining);
    setActiveId(remaining[0]?.id || "");
    setSelectedPoint(null);
    setDocument((current) => ({ ...current, status: "draft" }));
  };

  const detectWalls = async (
    mode: "auto" | "click",
    positivePoint?: VisualizerPoint,
  ) => {
    if (!imageUrl) return;
    setDetecting(true);
    setStatus(mode === "click" ? "Finding the clicked wall…" : "Generating candidates…");
    try {
      const response = await fetch(
        `/api/site/${clientSlug}/visualizer/segment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl,
            width: document.imageWidth,
            height: document.imageHeight,
            mode,
            positivePoints: positivePoint
              ? [{ x: positivePoint[0], y: positivePoint[1] }]
              : undefined,
            expectedWallsCount: mode === "click" ? 1 : 4,
          }),
        },
      );
      const result = await response.json() as {
        ok?: boolean;
        masks?: Array<{
          id?: string;
          name?: string;
          points: VisualizerPoint[];
          confidence?: number;
        }>;
        imageWidth?: number;
        imageHeight?: number;
        message?: string;
        warnings?: string[];
      };
      if (!response.ok || !result.ok || !result.masks?.length) {
        throw new Error(
          result.message
          || result.warnings?.join(" ")
          || "No usable wall candidate was returned.",
        );
      }
      const width = result.imageWidth || document.imageWidth;
      const height = result.imageHeight || document.imageHeight;
      const layers = result.masks.map((mask, index) => ({
        ...createLayer(
          width,
          height,
          mode === "click" ? "click-detect" : "auto-detect",
          mask.name || `Detected Wall ${index + 1}`,
          mask.points,
        ),
        confidence: mask.confidence,
        needsReview: true,
      }));
      setDocument((current) => {
        const merged = mode === "click"
          ? [...current.layers, layers[0]]
          : [...current.layers, ...layers];
        return {
          ...current,
          imageWidth: width,
          imageHeight: height,
          status: "needs_review",
          layers: merged,
          masks: merged,
        };
      });
      setActiveId(layers[0].id);
      setTool("select");
      setStatus("Candidate added. Drag every point before approving this gallery mask.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Detection failed.");
    } finally {
      setDetecting(false);
    }
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = pointer(event);
    const target = event.target as SVGElement;
    const handle = target.dataset.point;
    if (handle !== undefined) {
      setDragPoint(Number(handle));
      setSelectedPoint(Number(handle));
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "click") {
      void detectWalls("click", point);
      return;
    }
    if (tool === "rectangle") {
      setRectangleStart(point);
      setRectanglePreview([point, point, point, point]);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "polygon") {
      if (!active || active.source !== "gallery-admin") {
        addLayer("gallery-admin", [point], "Custom Wall");
      } else {
        updateActive({ points: [...(active.points || []), point] });
      }
      setDocument((current) => ({ ...current, status: "draft" }));
      return;
    }
    if (target.dataset.mask) {
      setActiveId(target.dataset.mask);
      setSelectedPoint(null);
      return;
    }
    const hit = [...document.layers].reverse().find((layer) => {
      if (!layer.points) return false;
      const index = nearestPointIndex(layer.points, point, 16);
      return index >= 0;
    });
    if (hit) setActiveId(hit.id);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = pointer(event);
    if (rectangleStart) {
      setRectanglePreview([
        rectangleStart,
        [point[0], rectangleStart[1]],
        point,
        [rectangleStart[0], point[1]],
      ]);
      return;
    }
    if (dragPoint === null || !active || active.locked) return;
    const points = [...(active.points || [])];
    points[dragPoint] = point;
    updateActive({
      points,
      needsReview: false,
      source: "gallery-admin",
    });
    setDocument((current) => ({ ...current, status: "needs_review" }));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (rectangleStart && rectanglePreview.length === 4) {
      const layer = addLayer(
        "gallery-admin",
        rectanglePreview,
        "Rectangle Wall",
      );
      setActiveId(layer.id);
      setDocument((current) => ({ ...current, status: "needs_review" }));
      setTool("select");
      setStatus("Rectangle added. Drag its corners to align the wall.");
    }
    setRectangleStart(null);
    setRectanglePreview([]);
    setDragPoint(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const approve = () => {
    const invalid = document.layers.find((layer) => !validateMaskLayer(layer).valid);
    if (!document.layers.length || invalid) {
      setStatus(
        invalid
          ? `${invalid.name}: ${validateMaskLayer(invalid).reason}`
          : "Create at least one valid wall layer before approval.",
      );
      return;
    }
    setLayers((layers) => layers.map((layer) => ({
      ...layer,
      source: "gallery-admin",
      needsReview: false,
      locked: true,
    })));
    setDocument((current) => ({ ...current, status: "approved" }));
    setStatus("Mask approved. Save the visualizer space to publish it.");
  };

  const loadDimensions = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) return;
    if (!document.layers.length) {
      setDocument((current) => ({
        ...current,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      }));
    }
  };

  return (
    <section className="md:col-span-2 border border-black/10 bg-[#F7F4EC] p-5">
      <input type="hidden" name="maskJson" value={serialized} />
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <label className="text-xs font-black uppercase tracking-wider text-black/55">
          Room image URL
          <input
            name="imageUrl"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-3 text-sm font-normal normal-case tracking-normal outline-none"
          />
        </label>
        <label className="admin-btn-light cursor-pointer">
          <ImageUp size={15} /> Upload image
          <input
            hidden
            type="file"
            accept="image/jpeg,image/png"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setStatus("Uploading room image…");
              try {
                setImageUrl(await uploadImage(file));
                setDocument((current) => ({
                  ...current,
                  status: "draft",
                  layers: [],
                  masks: [],
                }));
                setActiveId("");
                setStatus("Image uploaded. Create the approved wall layers.");
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Upload failed.");
              }
            }}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="relative min-h-80 overflow-hidden bg-[#151916]">
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                onLoad={loadDimensions}
                className="block h-auto w-full select-none"
                draggable={false}
              />
              <svg
                ref={svgRef}
                viewBox={`0 0 ${document.imageWidth} ${document.imageHeight}`}
                preserveAspectRatio="none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="absolute inset-0 size-full touch-none cursor-crosshair"
              >
                {document.layers.map((layer) => (
                  <g key={layer.id}>
                    {(layer.points?.length || 0) >= 3 && (
                      <polygon
                        data-mask={layer.id}
                        points={layer.points?.map((point) => point.join(",")).join(" ")}
                        fill={preview && layer.visible ? previewHex : "transparent"}
                        fillOpacity={preview && layer.visible ? 0.55 : 0}
                        stroke={layer.id === activeId ? "#ffffff" : "#C9A45C"}
                        strokeWidth={layer.id === activeId ? 5 : 3}
                        strokeDasharray={layer.needsReview ? "14 9" : undefined}
                        style={{ mixBlendMode: preview ? "multiply" : "normal" }}
                      />
                    )}
                    {layer.id === activeId && !layer.locked && layer.points?.map(
                      ([x, y], index) => (
                        <circle
                          key={`${x}-${y}-${index}`}
                          data-point={index}
                          cx={x}
                          cy={y}
                          r={selectedPoint === index ? 13 : 10}
                          fill={selectedPoint === index ? "#C9A45C" : "#fff"}
                          stroke="#173F32"
                          strokeWidth={4}
                          className="cursor-move"
                        />
                      ),
                    )}
                  </g>
                ))}
                {rectanglePreview.length === 4 && (
                  <polygon
                    points={rectanglePreview.map((point) => point.join(",")).join(" ")}
                    fill="#C9A45C"
                    fillOpacity={0.2}
                    stroke="#C9A45C"
                    strokeWidth={4}
                    strokeDasharray="12 8"
                  />
                )}
              </svg>
            </>
          ) : (
            <div className="grid min-h-96 place-items-center text-sm text-white/60">
              Add an image URL or upload a room.
            </div>
          )}
        </div>

        <aside className="bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <strong className="text-sm">Gallery layers</strong>
              <span className={`ml-2 rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                document.status === "approved"
                  ? "bg-emerald-100 text-emerald-800"
                  : document.status === "needs_review"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-black/5 text-black/55"
              }`}>
                {document.status.replace("_", " ")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => addLayer()}
              className="admin-btn-light !min-h-9 !px-3"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTool("click")}
              className={`admin-btn-light ${tool === "click" ? "!bg-[#173F32] !text-white" : ""}`}
            >
              <MousePointer2 size={14} /> Click Detect
            </button>
            <button
              type="button"
              onClick={() => void detectWalls("auto")}
              disabled={detecting || !imageUrl}
              className="admin-btn-light disabled:opacity-40"
            >
              <Sparkles size={14} /> {detecting ? "Detecting…" : "Auto"}
            </button>
            <button
              type="button"
              onClick={() => setTool("rectangle")}
              className={`admin-btn-light ${tool === "rectangle" ? "!bg-[#173F32] !text-white" : ""}`}
            >
              <RectangleHorizontal size={14} /> Rectangle
            </button>
            <button
              type="button"
              onClick={() => {
                addLayer("gallery-admin", [], "Custom Wall");
                setTool("polygon");
              }}
              className={`admin-btn-light ${tool === "polygon" ? "!bg-[#173F32] !text-white" : ""}`}
            >
              <Pencil size={14} /> Polygon
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {document.layers.map((layer) => (
              <div
                key={layer.id}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 border px-3 py-2 ${
                  activeId === layer.id
                    ? "border-[#173F32] bg-[#173F32] text-white"
                    : "border-black/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setLayers((layers) => layers.map((item) => (
                    item.id === layer.id
                      ? { ...item, visible: !item.visible }
                      : item
                  )))}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(layer.id);
                    setTool("select");
                  }}
                  className="text-left"
                >
                  <strong className="block text-xs">{layer.name}</strong>
                  <span className="text-[9px] uppercase opacity-60">
                    {layer.points?.length || 0} points · {layer.source}
                  </span>
                </button>
                <button type="button" onClick={() => removeLayer(layer.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {active && (
            <div className="mt-4 border-t border-black/10 pt-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-black/50">
                Layer name
                <input
                  value={active.name}
                  onChange={(event) => updateActive({ name: event.target.value })}
                  className="mt-2 w-full border border-black/10 px-3 py-2 text-sm font-normal normal-case tracking-normal"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateActive({
                    points: active.points?.slice(0, -1),
                  })}
                  className="admin-btn-light"
                  disabled={!active.points?.length || active.locked}
                >
                  Undo point
                </button>
                <button
                  type="button"
                  onClick={() => updateActive({
                    locked: !active.locked,
                  })}
                  className="admin-btn-light"
                >
                  {active.locked ? "Unlock" : "Lock"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 border-t border-black/10 pt-4">
            <label className="flex items-center justify-between text-xs font-bold">
              Preview paint
              <input
                type="checkbox"
                checked={preview}
                onChange={(event) => setPreview(event.target.checked)}
              />
            </label>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-black/50">
              Preview colour
              <input
                type="color"
                value={previewHex}
                onChange={(event) => setPreviewHex(event.target.value)}
                className="mt-2 h-10 w-full"
              />
            </label>
            <p className="mt-3 text-[10px] leading-4 text-black/50">
              {shades.length} database shades available. Preview colour tests
              alignment only.
            </p>
            <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-black/50">
              Approval status
              <select
                value={document.status}
                onChange={(event) => setDocument((current) => ({
                  ...current,
                  status: event.target.value as MaskStatus,
                }))}
                className="mt-2 w-full border border-black/10 px-3 py-2 text-sm normal-case"
              >
                <option value="draft">Draft</option>
                <option value="needs_review">Needs review</option>
                <option value="approved">Approved</option>
              </select>
            </label>
            <button
              type="button"
              onClick={approve}
              className="admin-btn mt-4 w-full"
            >
              <Check size={14} /> Validate & Approve
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 border-l-2 border-[#C9A45C] bg-[#C9A45C]/10 p-3 text-xs leading-5">
            <Check className="mt-0.5 shrink-0" size={14} />
            {status}
          </div>
        </aside>
      </div>
      <p className="mt-3 text-xs text-black/50">
        Masks save in original image pixels. Public gallery rooms only use
        approved mask documents.
      </p>
    </section>
  );
}
