import { z } from "zod";

export const aiResultSchema = z.object({
  headline: z.string().max(160),
  summary: z.string().max(800),
  reason: z.string().max(1200),
  severity: z.string().max(80),
  warning: z.string().max(800),
  recommendedFinish: z.string().max(80),
  productSlugs: z.array(z.string()).max(4),
  alternativeProductSlugs: z.array(z.string()).max(4),
  shadeCodes: z.array(z.string()).max(12),
  system: z.array(z.string().max(240)).max(8),
  nextSteps: z.array(z.string().max(240)).max(8),
  palettes: z.array(z.object({
    name: z.string().max(80),
    mainShadeCode: z.string(),
    accentShadeCode: z.string(),
    trimShadeCode: z.string(),
    productSlug: z.string(),
    finish: z.string().max(80),
    reason: z.string().max(500),
  })).max(3),
  quantity: z.object({
    areaSqft: z.number().nonnegative(),
    liters: z.number().nonnegative(),
    packs: z.array(z.number()).max(12),
    estimatedCost: z.number().nonnegative(),
  }),
});

export type RawAIResult = z.infer<typeof aiResultSchema>;

export type PaintAdviceInput = {
  tool: string;
  instructions: string;
  answers: Record<string, string>;
  catalog: unknown;
};

export function providerPrompt(input: PaintAdviceInput) {
  return [
    "You are a careful paint-system advisor.",
    "Return only one valid JSON object. Do not use markdown fences.",
    "Recommend only product slugs and shade codes present in the supplied catalog.",
    "Never invent catalog records. Use empty arrays when no record fits.",
    "For dampness or seepage, avoid structural certainty and include an inspection warning.",
    "Required JSON keys: headline, summary, reason, severity, warning, recommendedFinish, productSlugs, alternativeProductSlugs, shadeCodes, system, nextSteps, palettes, quantity.",
    "Each palette requires name, mainShadeCode, accentShadeCode, trimShadeCode, productSlug, finish, reason.",
    "quantity requires numeric areaSqft, liters, packs, and estimatedCost.",
    input.instructions,
    JSON.stringify({ tool: input.tool, answers: input.answers, catalog: input.catalog }),
  ].join("\n");
}

export function parseProviderJson(value: unknown): RawAIResult {
  if (typeof value === "object" && value !== null) return aiResultSchema.parse(value);
  const text = String(value || "").trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Provider did not return JSON.");
  return aiResultSchema.parse(JSON.parse(unfenced.slice(start, end + 1)));
}
