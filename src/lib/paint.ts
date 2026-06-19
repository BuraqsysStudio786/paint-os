export const PRODUCT_BUCKET_FALLBACK = "/placeholders/paint-bucket-aurora.svg";

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function asList(value: FormDataEntryValue | null | undefined) {
  return String(value ?? "")
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function asBool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

export function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseJsonList(value: FormDataEntryValue | null | undefined, fallback: unknown[] = []) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return asList(raw);
  }
}

export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return "";
  const n = Number.parseInt(clean, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function productImage(product: { bucketImageUrl?: string | null; imageUrl?: string | null }) {
  return product.bucketImageUrl || product.imageUrl || PRODUCT_BUCKET_FALLBACK;
}

export function normalizeMask(maskJson: unknown, width = 1600, height = 1000) {
  if (maskJson && typeof maskJson === "object" && "masks" in maskJson) return maskJson;
  if (Array.isArray(maskJson)) {
    const first = maskJson[0] as { points?: number[] } | undefined;
    if (Array.isArray(first?.points)) {
      const pairs = first.points.reduce<number[][]>((acc, n, i, arr) => {
        if (i % 2 === 0) acc.push([n, arr[i + 1] ?? 0]);
        return acc;
      }, []);
      return {
        imageWidth: 1200,
        imageHeight: 700,
        masks: [{ id: "wall-1", name: "Main wall", points: pairs, opacity: 0.58, blendMode: "multiply", source: "manual" }],
      };
    }
  }
  return {
    imageWidth: width,
    imageHeight: height,
    masks: [{ id: "wall-1", name: "Main wall", points: [[100, 100], [width - 100, 120], [width - 140, height - 180], [120, height - 160]], opacity: 0.55, blendMode: "multiply", source: "manual" }],
  };
}

export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const r = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const x = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * r * Math.asin(Math.sqrt(x));
}
