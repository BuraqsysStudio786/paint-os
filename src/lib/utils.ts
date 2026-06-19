import { z } from "zod";

export const calculatorSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  doors: z.number().min(0),
  windows: z.number().min(0),
  coats: z.number().min(1).max(5),
  wastage: z.number().min(0).max(30),
  ceiling: z.boolean(),
});

export function suggestPackCombination(required: number, sizes: number[]) {
  const sorted = [...sizes].sort((a, b) => b - a);
  const result: number[] = [];
  let remaining = required;
  for (const size of sorted) {
    while (remaining > 0 && (remaining >= size || size === sorted.at(-1))) {
      result.push(size);
      remaining -= size;
    }
  }
  return result;
}

export function calculatePaint(input: z.infer<typeof calculatorSchema>, product: {coverageSqftPerLiterOneCoat:number;packSizesJson:unknown}) {
  const walls = 2 * input.height * (input.length + input.width);
  const ceiling = input.ceiling ? input.length * input.width : 0;
  const area = Math.max(0, walls + ceiling - input.doors * 21 - input.windows * 12);
  const liters = (area * input.coats) / product.coverageSqftPerLiterOneCoat * (1 + input.wastage / 100);
  const sizes=Array.isArray(product.packSizesJson)?product.packSizesJson.map(Number):[1,4,16];
  return { area: Math.round(area), liters: Math.ceil(liters * 10) / 10, packs: suggestPackCombination(liters, sizes) };
}

export function diagnoseProblem(problem: string, exterior: boolean) {
  const data: Record<string, { cause: string; steps: string[]; system: string }> = {
    Dampness: { cause: "Moisture ingress or trapped water behind the coating.", steps: ["Identify and stop the water source", "Remove loose paint", "Dry and clean the wall"], system: `Aurora Damp Block → Aurora Prime Seal → ${exterior ? "Aurora Weather Shield" : "Aurora Silk Emulsion"}` },
    Peeling: { cause: "Weak adhesion, moisture, or painting over an unstable surface.", steps: ["Scrape loose coating", "Sand and clean", "Seal the stable surface"], system: "Aurora Wall Putty → Aurora Prime Seal → selected topcoat" },
    Cracks: { cause: "Surface movement or shrinkage in plaster.", steps: ["Open and clean cracks", "Repair and allow to cure", "Level the surface"], system: "Aurora Wall Putty → Aurora Prime Seal → selected topcoat" },
    Fungus: { cause: "Persistent moisture with low ventilation.", steps: ["Treat the moisture source", "Clean affected surface safely", "Improve ventilation"], system: "Aurora Damp Block → Aurora Prime Seal → anti-fungal topcoat" },
    Stains: { cause: "High-contact surfaces or absorbent old coating.", steps: ["Clean and dry surface", "Spot-prime persistent marks"], system: "Aurora Prime Seal → Aurora Stain Guard" },
    Fading: { cause: "UV exposure and weathering.", steps: ["Remove chalky coating", "Prime exposed areas"], system: "Aurora Prime Seal → Aurora Weather Shield" },
  };
  return data[problem] ?? { cause: "An unstable or powdery surface.", steps: ["Clean and sand", "Seal before painting"], system: "Surface preparation → Aurora Prime Seal → selected topcoat" };
}

export function assignNearestDealer<T extends {city:string}>(city: string, all: T[]) {
  return all.find((dealer) => dealer.city.toLowerCase() === city.toLowerCase()) ?? all[0];
}

export function buildWhatsAppMessage(input: { product?: string; shade?: string; room?: string; area?: number; liters?: number; packs?: number[]; city?: string }) {
  return `Hello Aurora Paints, I selected ${input.product ?? "a paint system"}${input.shade ? ` in ${input.shade}` : ""}${input.room ? ` for my ${input.room}` : ""}.${input.area ? ` Estimated area is ${input.area} sqft` : ""}${input.liters ? ` and required paint is around ${input.liters} liters` : ""}${input.packs ? ` (${input.packs.map((p) => `${p}L`).join(" + ")})` : ""}. Please send price, pack recommendation, and nearest dealer details.${input.city ? ` City: ${input.city}.` : ""}`;
}

export function parseShadeCardText(text: string) {
  const fallback: Record<string, string> = { ivory:"#F6E8D0",white:"#F8F4EA",beige:"#D9BE9A",blue:"#9EC9E8",green:"#1E4D3A",grey:"#D6D8D6",red:"#8E3B2F",yellow:"#F4C95D" };
  return text.split(/,|\n/).filter(Boolean).map((part, index) => {
    const hex = part.match(/#[0-9a-f]{6}/i)?.[0];
    const code = part.match(/[A-Z]{2,}-?\d{2,}/)?.[0] ?? `NEW-${index + 1}`;
    const name = part.replace(code, "").replace(hex ?? "", "").trim();
    const key = Object.keys(fallback).find((word) => name.toLowerCase().includes(word));
    return { name, code, hex: hex ?? fallback[key ?? ""] ?? "#D6D8D6" };
  });
}

export function trackEvent(clientId: string, eventName: string, metadata: unknown = {}) {
  if (typeof window !== "undefined") {
    console.info("[Paint Website OS]", clientId, eventName, metadata);
  }
}
