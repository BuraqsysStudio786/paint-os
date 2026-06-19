"use client";

import { Check, ImageUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type Mask = {
  id: string;
  name: string;
  points: [number, number][];
  opacity?: number;
  blendMode?: string;
  source?: string;
};
type MaskDocument = { imageWidth: number; imageHeight: number; masks: Mask[] };
type ShadeOption = { id: string; name: string; code?: string };

function normalize(value: unknown): MaskDocument {
  const candidate = value && typeof value === "object" ? value as Partial<MaskDocument> : {};
  const masks = Array.isArray(candidate.masks)
    ? candidate.masks.map((mask, index) => ({
        id: String(mask.id || `wall-${index + 1}`),
        name: String(mask.name || `Wall ${index + 1}`),
        points: Array.isArray(mask.points)
          ? mask.points.filter((point) => Array.isArray(point) && point.length >= 2)
              .map((point) => [Number(point[0]), Number(point[1])] as [number, number])
          : [],
        opacity: Number(mask.opacity ?? 0.55),
        blendMode: String(mask.blendMode || "multiply"),
        source: String(mask.source || "admin-manual"),
      }))
    : [];
  return {
    imageWidth: Number(candidate.imageWidth || 1600),
    imageHeight: Number(candidate.imageHeight || 1000),
    masks,
  };
}

async function uploadImage(file: File) {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/visualizer/upload", { method: "POST", body: form });
  const result = await response.json() as { ok?: boolean; url?: string; error?: string };
  if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Upload failed.");
  return result.url;
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
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [document, setDocument] = useState(() => normalize(initialMaskJson));
  const [activeId, setActiveId] = useState(() => normalize(initialMaskJson).masks[0]?.id || "");
  const [dragPoint, setDragPoint] = useState<number | null>(null);
  const [preview, setPreview] = useState(true);
  const [previewHex, setPreviewHex] = useState("#C9A45C");
  const [status, setStatus] = useState("Click the image to add points. Drag handles to refine wall edges.");
  const [detecting, setDetecting] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const active = document.masks.find((mask) => mask.id === activeId);
  const serialized = useMemo(() => JSON.stringify(document), [document]);

  const pointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return [0, 0] as [number, number];
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM()?.inverse();
    const mapped = matrix ? point.matrixTransform(matrix) : point;
    return [
      Math.max(0, Math.min(document.imageWidth, Math.round(mapped.x))),
      Math.max(0, Math.min(document.imageHeight, Math.round(mapped.y))),
    ] as [number, number];
  };

  const updateActive = (patch: Partial<Mask>) => {
    setDocument((current) => ({
      ...current,
      masks: current.masks.map((mask) => mask.id === activeId ? { ...mask, ...patch } : mask),
    }));
  };

  const addMask = () => {
    const id = `wall-${crypto.randomUUID()}`;
    const next: Mask = {
      id,
      name: `Wall ${document.masks.length + 1}`,
      points: [],
      opacity: 0.55,
      blendMode: "multiply",
      source: "admin-manual",
    };
    setDocument((current) => ({ ...current, masks: [...current.masks, next] }));
    setActiveId(id);
    setStatus("New wall created. Click around its boundary.");
  };

  const removeMask = () => {
    if (!activeId) return;
    const remaining = document.masks.filter((mask) => mask.id !== activeId);
    setDocument({ ...document, masks: remaining });
    setActiveId(remaining[0]?.id || "");
  };

  const detectWalls = async () => {
    if (!imageUrl) return;
    setDetecting(true);
    setStatus("Running local wall detection. Every result still needs manual approval.");
    try {
      const response = await fetch(`/api/site/${clientSlug}/visualizer/segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          width: document.imageWidth,
          height: document.imageHeight,
          mode: "auto",
          expectedWallsCount: 3,
        }),
      });
      const result = await response.json() as {
        ok?: boolean;
        masks?: Mask[];
        imageWidth?: number;
        imageHeight?: number;
        message?: string;
        warnings?: string[];
      };
      if (!response.ok || !result.ok) throw new Error(result.message || "Wall detection failed.");
      if (!result.masks?.length) {
        setStatus(result.message || result.warnings?.join(" ") || "No confident wall detected. Draw manually.");
        return;
      }
      const masks = result.masks.map((mask, index) => ({
        ...mask,
        id: mask.id || `detected-wall-${index + 1}`,
        name: mask.name || `Detected wall ${index + 1}`,
        source: mask.source || "local-python",
      }));
      setDocument({
        imageWidth: result.imageWidth || document.imageWidth,
        imageHeight: result.imageHeight || document.imageHeight,
        masks,
      });
      setActiveId(masks[0].id);
      setStatus(`Added ${masks.length} detected candidate${masks.length === 1 ? "" : "s"}. Drag every point to approve alignment.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Detection unavailable. Draw the wall manually.");
    } finally {
      setDetecting(false);
    }
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!active) {
      addMask();
      return;
    }
    const target = event.target as SVGElement;
    const handle = target.dataset.point;
    if (handle !== undefined) {
      setDragPoint(Number(handle));
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (target.dataset.mask) {
      setActiveId(target.dataset.mask);
      return;
    }
    updateActive({ points: [...active.points, pointer(event)] });
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragPoint === null || !active) return;
    const points = [...active.points];
    points[dragPoint] = pointer(event);
    updateActive({ points });
  };

  const loadDimensions = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (!image.naturalWidth || !image.naturalHeight) return;
    if (!document.masks.some((mask) => mask.points.length)) {
      setDocument((current) => ({ ...current, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight }));
    }
  };

  return (
    <section className="md:col-span-2 border border-black/10 bg-[#F7F4EC] p-5">
      <input type="hidden" name="maskJson" value={serialized} />
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <label className="text-xs font-black uppercase tracking-wider text-black/55">
          Room image URL
          <input name="imageUrl" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-3 text-sm font-normal normal-case tracking-normal outline-none" />
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
                setStatus("Image uploaded. Add or refine wall masks.");
              } catch (error) {
                setStatus(error instanceof Error ? error.message : "Upload failed.");
              }
            }}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative min-h-80 overflow-hidden bg-[#151916]">
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" onLoad={loadDimensions} className="block h-auto w-full select-none" draggable={false} />
              <svg
                ref={svgRef}
                viewBox={`0 0 ${document.imageWidth} ${document.imageHeight}`}
                preserveAspectRatio="none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={(event) => {
                  setDragPoint(null);
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                className="absolute inset-0 size-full touch-none cursor-crosshair"
              >
                {document.masks.map((mask) => (
                  <g key={mask.id}>
                    {mask.points.length >= 3 && (
                      <polygon
                        data-mask={mask.id}
                        points={mask.points.map((point) => point.join(",")).join(" ")}
                        fill={preview ? previewHex : "transparent"}
                        fillOpacity={preview ? mask.opacity ?? 0.55 : 0}
                        stroke={mask.id === activeId ? "#ffffff" : "#C9A45C"}
                        strokeWidth={mask.id === activeId ? 5 : 3}
                        strokeDasharray={mask.id === activeId ? "14 9" : "8 8"}
                        style={{ mixBlendMode: preview ? "multiply" : "normal" }}
                      />
                    )}
                    {mask.id === activeId && mask.points.map(([x, y], index) => (
                      <circle key={`${x}-${y}-${index}`} data-point={index} cx={x} cy={y} r={10} fill="#fff" stroke="#173F32" strokeWidth={4} className="cursor-move" />
                    ))}
                  </g>
                ))}
              </svg>
            </>
          ) : <div className="grid min-h-96 place-items-center text-sm text-white/60">Add an image URL or upload a room.</div>}
        </div>

        <aside className="bg-white p-4">
          <div className="flex items-center justify-between">
            <strong className="text-sm">Wall masks</strong>
            <button type="button" onClick={addMask} className="admin-btn-light !min-h-9 !px-3"><Plus size={14} /> Add</button>
          </div>
          <div className="mt-3 grid gap-2">
            {document.masks.map((mask) => (
              <button type="button" key={mask.id} onClick={() => setActiveId(mask.id)} className={`flex items-center justify-between border px-3 py-3 text-left text-xs font-bold ${activeId === mask.id ? "border-[#173F32] bg-[#173F32] text-white" : "border-black/10"}`}>
                {mask.name}<span>{mask.points.length} pts</span>
              </button>
            ))}
          </div>
          {active && (
            <div className="mt-4 border-t border-black/10 pt-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-black/50">
                Wall name
                <input value={active.name} onChange={(event) => updateActive({ name: event.target.value })} className="mt-2 w-full border border-black/10 px-3 py-2 text-sm font-normal normal-case tracking-normal" />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updateActive({ points: active.points.slice(0, -1) })} className="admin-btn-light" disabled={!active.points.length}>Undo point</button>
                <button type="button" onClick={removeMask} className="admin-btn-light"><Trash2 size={14} /> Delete</button>
              </div>
            </div>
          )}
          <div className="mt-4 border-t border-black/10 pt-4">
            <label className="flex items-center justify-between text-xs font-bold">Preview paint<input type="checkbox" checked={preview} onChange={(event) => setPreview(event.target.checked)} /></label>
            <label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-black/50">Preview colour<input type="color" value={previewHex} onChange={(event) => setPreviewHex(event.target.value)} className="mt-2 h-10 w-full" /></label>
            <p className="mt-3 text-[10px] leading-4 text-black/50">{shades.length} database shades available. Preview colour is for alignment testing only.</p>
            <button type="button" onClick={detectWalls} disabled={detecting || !imageUrl} className="admin-btn mt-4 w-full disabled:opacity-40">
              <Sparkles size={14} /> {detecting ? "Detecting…" : "Detect wall candidates"}
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 border-l-2 border-[#C9A45C] bg-[#C9A45C]/10 p-3 text-xs leading-5"><Check className="mt-0.5 shrink-0" size={14} />{status}</div>
        </aside>
      </div>
      <p className="mt-3 text-xs text-black/50">Responsive alignment uses the original image coordinate viewBox. Masks save in original image pixels, not browser pixels.</p>
    </section>
  );
}
