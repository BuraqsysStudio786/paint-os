import "server-only";

import { db } from "@/lib/db";
import { suggestPackCombination } from "@/lib/utils";
import { requestPaintAdvice } from "./provider";
import type { RawAIResult } from "./schemas";
import { productFinderPrompt } from "./product-finder";
import { colorConsultantPrompt } from "./color-consultant";
import { problemSolverPrompt } from "./problem-solver";
import { systemRecommenderPrompt } from "./system-recommender";
import { budgetGuidancePrompt } from "./budget-guidance";
import { shadeMatchPrompt } from "./shade-match";

export const wizardTypes = [
  "product_finder",
  "color_consultant",
  "problem_solver",
  "system_recommender",
  "budget_guidance",
  "shade_match",
] as const;

export type WizardType = (typeof wizardTypes)[number];
export type WizardContact = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
};

const prompts = {
  product_finder: productFinderPrompt,
  color_consultant: colorConsultantPrompt,
  problem_solver: problemSolverPrompt,
  system_recommender: systemRecommenderPrompt,
  budget_guidance: budgetGuidancePrompt,
  shade_match: shadeMatchPrompt,
} satisfies Record<WizardType, { type: string; instructions: string }>;

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return list(value).map(String).filter(Boolean);
}

function numberList(value: unknown): number[] {
  return list(value).map(Number).filter((item) => Number.isFinite(item) && item > 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function answerText(answers: Record<string, string>) {
  return Object.values(answers).join(" ").toLowerCase();
}

function numericAnswer(answers: Record<string, string>, keys: string[]) {
  const entry = Object.entries(answers).find(([key]) => keys.includes(key.toLowerCase()));
  if (!entry) return 0;
  const match = entry[1].replaceAll(",", "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

async function loadCatalog(clientId: string) {
  const [products, shades] = await Promise.all([
    db.product.findMany({
      where: { clientId },
      include: { category: true },
      orderBy: [{ isBestSeller: "desc" }, { isFeatured: "desc" }, { name: "asc" }],
    }),
    db.shade.findMany({
      where: { clientId, isActive: true },
      orderBy: [{ isTrending: "desc" }, { isColorOfYear: "desc" }, { code: "asc" }],
    }),
  ]);
  return { products, shades };
}

type Catalog = Awaited<ReturnType<typeof loadCatalog>>;

function rankProducts(type: WizardType, answers: Record<string, string>, products: Catalog["products"]) {
  const text = answerText(answers);
  return [...products].sort((a, b) => {
    const score = (product: Catalog["products"][number]) => {
      const haystack = [
        product.name,
        product.category.name,
        product.finish,
        product.surface,
        product.productType,
        product.interiorExterior,
        ...strings(product.spacesJson),
        ...strings(product.featuresJson),
        ...strings(product.benefitsJson),
      ].join(" ").toLowerCase();
      let points = product.isBestSeller ? 4 : 0;
      points += product.isFeatured ? 2 : 0;
      for (const token of text.split(/\W+/).filter((word) => word.length > 3)) {
        if (haystack.includes(token)) points += 2;
      }
      if (/damp|seep|fungus|water|roof/.test(text) && /damp|water|roof|seal|proof/.test(haystack)) points += 14;
      if (/exterior|outside|weather/.test(text) && /exterior|both/.test(product.interiorExterior)) points += 10;
      if (/interior|inside|bedroom|living|office/.test(text) && product.interiorExterior !== "exterior") points += 7;
      if (/wood/.test(text) && /wood/.test(haystack)) points += 12;
      if (/metal/.test(text) && /metal|enamel/.test(haystack)) points += 12;
      if (/wash|stain|kids|pet|traffic/.test(text) && /wash|stain|scrub|durab/.test(haystack)) points += 8;
      if (type === "problem_solver" && /primer|seal|damp|water/.test(haystack)) points += 4;
      return points;
    };
    return score(b) - score(a);
  });
}

function rankShades(answers: Record<string, string>, shades: Catalog["shades"]) {
  const text = answerText(answers);
  return [...shades].sort((a, b) => {
    const score = (shade: Catalog["shades"][number]) => {
      const haystack = [
        shade.name,
        shade.code,
        shade.colorFamily,
        shade.temperature,
        shade.mood,
        shade.lightness,
        shade.season || "",
        shade.collection,
        ...strings(shade.spacesJson),
        ...strings(shade.bestRoomsJson),
      ].join(" ").toLowerCase();
      let points = shade.isTrending ? 3 : 0;
      points += shade.isColorOfYear ? 2 : 0;
      for (const token of text.split(/\W+/).filter((word) => word.length > 3)) {
        if (haystack.includes(token)) points += 2;
      }
      return points;
    };
    return score(b) - score(a);
  });
}

function quantityFor(answers: Record<string, string>, product?: Catalog["products"][number]) {
  const areaSqft = numericAnswer(answers, ["area", "estimated area", "approximate area in sqft"]);
  if (!product || !areaSqft) return { areaSqft, liters: 0, packs: [], estimatedCost: 0 };
  const liters = Math.ceil(
    (areaSqft * product.recommendedCoats / product.coverageSqftPerLiterOneCoat) * 1.1 * 10,
  ) / 10;
  return {
    areaSqft,
    liters,
    packs: suggestPackCombination(liters, numberList(product.packSizesJson)),
    estimatedCost: product.startingPrice ? Math.round(liters * product.startingPrice) : 0,
  };
}

function deterministicFallback(
  type: WizardType,
  answers: Record<string, string>,
  catalog: Catalog,
): RawAIResult {
  const rankedProducts = rankProducts(type, answers, catalog.products);
  const rankedShades = rankShades(answers, catalog.shades);
  const chosen = rankedProducts[0];
  const alternative = rankedProducts[1];
  const paletteShades = Array.from({ length: 9 }, (_, index) =>
    rankedShades[index] || rankedShades[index % Math.max(rankedShades.length, 1)],
  ).filter(Boolean);
  const text = answerText(answers);
  const severe = type === "problem_solver" && (/seep|active water|fungus|damp/.test(text) || /active water[^n]*yes/.test(text));
  const problemCause = /shora|salt crystal/.test(text)
    ? "Moisture is carrying soluble salts through the masonry, leaving crystalline deposits as it evaporates."
    : /fungus/.test(text)
      ? "Persistent moisture, weak ventilation, or condensation is supporting fungal growth on the coating."
      : /peel|flak|chalk|powder/.test(text)
        ? "The coating has lost adhesion, often because of moisture, surface contamination, weak preparation, or an unstable previous coat."
        : /crack/.test(text)
          ? "The visible crack may be a coating or plaster movement issue; widening, recurring, or deep cracks need site inspection."
          : /seep|damp|active water/.test(text)
            ? "Moisture is entering or remaining in the wall from plumbing, roof, exterior, ground, or condensation sources."
            : "The coating is weathering or reacting to the underlying surface and should be inspected before repainting.";
  const headlines: Record<WizardType, string> = {
    product_finder: "A paint system matched to your surface",
    color_consultant: "Three palettes shaped around your room",
    problem_solver: "Treat the source before the finish",
    system_recommender: "A complete preparation-to-topcoat system",
    budget_guidance: "A practical quantity and budget direction",
    shade_match: "The closest catalogue shades to your reference",
  };
  const paletteNames = ["Safe", "Premium", "Bold"];
  return {
    headline: headlines[type],
    summary: chosen
      ? type === "problem_solver"
        ? `${problemCause} The recommended system starts with source control and surface preparation before ${chosen.name}.`
        : `${chosen.name} is the strongest catalogue match for the information provided.`
      : "No matching paint product is currently available in this catalogue.",
    reason: type === "problem_solver"
      ? problemCause
      : "This recommendation was calculated deterministically from the tenant product and shade records.",
    severity: severe ? "High" : type === "problem_solver" ? "Moderate" : "Not applicable",
    warning: severe
      ? "For active leakage or severe dampness, inspect plumbing/roof/exterior source before repainting."
      : "",
    recommendedFinish: chosen?.finish || "Matt",
    productSlugs: type === "problem_solver"
      ? rankedProducts.slice(0, 4).map((product) => product.slug)
      : chosen ? [chosen.slug] : [],
    alternativeProductSlugs: alternative ? [alternative.slug] : [],
    shadeCodes: unique(paletteShades.slice(0, 9).map((shade) => shade.code)),
    system: type === "problem_solver"
      ? [
          "Stop active water entry and allow the wall to dry.",
          "Scrape loose paint, remove salts or fungus safely, and clean the substrate.",
          "Repair cracks and level damaged areas with a compatible filler or putty.",
          ...rankedProducts.slice(0, 4).map((product) => product.name),
          "Apply the selected topcoat only after the substrate is stable and dry.",
        ]
      : chosen ? strings(chosen.recommendedSystemJson) : [],
    nextSteps: [
      type === "problem_solver" ? "Inspect and stop the moisture source before coating" : "Review the recommended product system",
      "Approve physical shade samples in the intended light",
      "Calculate final site quantity",
      "Request a dealer or paint advisor quote",
    ],
    palettes: paletteNames.map((name, index) => ({
      name,
      mainShadeCode: paletteShades[index * 3]?.code || paletteShades[0]?.code || "",
      accentShadeCode: paletteShades[index * 3 + 1]?.code || paletteShades[1]?.code || paletteShades[0]?.code || "",
      trimShadeCode: paletteShades[index * 3 + 2]?.code || paletteShades[2]?.code || paletteShades[0]?.code || "",
      productSlug: chosen?.slug || "",
      finish: chosen?.finish || "Matt",
      reason: `${name} direction selected from real catalogue shades.`,
    })),
    quantity: quantityFor(answers, chosen),
  };
}

function catalogSafeResult(
  type: WizardType,
  raw: RawAIResult,
  fallback: RawAIResult,
  answers: Record<string, string>,
  catalog: Catalog,
) {
  const productBySlug = new Map(catalog.products.map((product) => [product.slug, product]));
  const shadeByCode = new Map(catalog.shades.map((shade) => [shade.code, shade]));
  const allowedProductSlugs = (values: string[]) => unique(values.filter((slug) => productBySlug.has(slug)));
  const allowedShadeCodes = (values: string[]) => unique(values.filter((code) => shadeByCode.has(code)));

  const productSlugs = allowedProductSlugs(raw.productSlugs);
  const alternativeProductSlugs = allowedProductSlugs(raw.alternativeProductSlugs)
    .filter((slug) => !productSlugs.includes(slug));
  const safeProducts = productSlugs.length ? productSlugs : fallback.productSlugs;
  const safeAlternatives = alternativeProductSlugs.length
    ? alternativeProductSlugs
    : fallback.alternativeProductSlugs.filter((slug) => !safeProducts.includes(slug));
  const primaryProduct = productBySlug.get(safeProducts[0]);

  const paletteSource = type === "color_consultant"
    ? [...raw.palettes, ...fallback.palettes].slice(0, 3)
    : raw.palettes;
  const palettes = paletteSource.map((palette, index) => {
    const backup = fallback.palettes[index] || fallback.palettes[0];
    const validCode = (code: string, backupCode: string) =>
      shadeByCode.has(code) ? code : backupCode;
    return {
      ...palette,
      name: palette.name || backup?.name || `Palette ${index + 1}`,
      mainShadeCode: validCode(palette.mainShadeCode, backup?.mainShadeCode || ""),
      accentShadeCode: validCode(palette.accentShadeCode, backup?.accentShadeCode || ""),
      trimShadeCode: validCode(palette.trimShadeCode, backup?.trimShadeCode || ""),
      productSlug: productBySlug.has(palette.productSlug)
        ? palette.productSlug
        : backup?.productSlug || safeProducts[0] || "",
      finish: palette.finish || primaryProduct?.finish || "Matt",
    };
  });
  const paletteCodes = palettes.flatMap((palette) => [
    palette.mainShadeCode,
    palette.accentShadeCode,
    palette.trimShadeCode,
  ]);
  const shadeCodes = allowedShadeCodes([...raw.shadeCodes, ...paletteCodes]);
  const safeShadeCodes = shadeCodes.length ? shadeCodes : fallback.shadeCodes;

  return {
    ...raw,
    productSlugs: safeProducts,
    alternativeProductSlugs: safeAlternatives,
    shadeCodes: safeShadeCodes,
    palettes,
    recommendedFinish: primaryProduct?.finish || raw.recommendedFinish,
    system: type === "problem_solver"
      ? (raw.system.length ? raw.system : fallback.system)
      : primaryProduct ? strings(primaryProduct.recommendedSystemJson) : [],
    quantity: quantityFor(answers, primaryProduct),
  };
}

export async function runPaintWizard(input: {
  clientSlug: string;
  type: WizardType;
  answers: Record<string, string>;
  contact?: WizardContact;
}) {
  const client = await db.client.findUnique({
    where: { slug: input.clientSlug, isActive: true },
    select: { id: true, slug: true },
  });
  if (!client) throw new Error("Paint brand not found.");

  const catalog = await loadCatalog(client.id);
  const fallback = deterministicFallback(input.type, input.answers, catalog);
  const prompt = prompts[input.type];
  const aiCatalog = {
    products: catalog.products.map((product) => ({
      slug: product.slug,
      name: product.name,
      category: product.category.name,
      finish: product.finish,
      surface: product.surface,
      scope: product.interiorExterior,
      spaces: product.spacesJson,
      features: product.featuresJson,
      system: product.recommendedSystemJson,
      coverage: product.coverageSqftPerLiterOneCoat,
      coats: product.recommendedCoats,
      packs: product.packSizesJson,
      price: product.startingPrice,
    })),
    shades: catalog.shades.map((shade) => ({
      code: shade.code,
      name: shade.name,
      family: shade.colorFamily,
      temperature: shade.temperature,
      lightness: shade.lightness,
      mood: shade.mood,
      season: shade.season,
      spaces: shade.spacesJson,
      collection: shade.collection,
    })),
  };

  const generated = await requestPaintAdvice({
    tool: prompt.type,
    instructions: prompt.instructions,
    answers: input.answers,
    catalog: aiCatalog,
  });
  const raw: RawAIResult = generated.result || fallback;
  const provider = generated.providerUsed;
  const fallbackReason = generated.result
    ? generated.attempts[0]?.code || ""
    : generated.attempts.at(-1)?.code || "no_provider_available";

  const safe = catalogSafeResult(input.type, raw, fallback, input.answers, catalog);
  const selectedSlugOrder = unique([...safe.productSlugs, ...safe.alternativeProductSlugs]);
  const selectedCodeOrder = unique(safe.shadeCodes);
  const products = selectedSlugOrder
    .map((slug) => catalog.products.find((product) => product.slug === slug))
    .filter((product): product is Catalog["products"][number] => Boolean(product));
  const shades = selectedCodeOrder
    .map((code) => catalog.shades.find((shade) => shade.code === code))
    .filter((shade): shade is Catalog["shades"][number] => Boolean(shade));
  const output = {
    ...safe,
    provider,
    providerUsed: provider,
    fallbackUsed: generated.fallbackUsed,
    fallbackReason: generated.fallbackUsed ? fallbackReason : null,
    providerAttempts: generated.attempts,
    catalogValidated: true,
    products: products.map((product, index) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      finish: product.finish,
      shortDescription: product.shortDescription,
      bucketImageUrl: product.bucketImageUrl || product.imageUrl,
      category: product.category.name,
      coverage: product.coverageSqftPerLiterOneCoat,
      packSizes: product.packSizesJson,
      currency: product.currency,
      startingPrice: product.startingPrice,
      role: index < safe.productSlugs.length ? "Recommended" : "Alternative",
    })),
    shades: shades.map((shade) => ({
      id: shade.id,
      slug: shade.slug,
      name: shade.name,
      code: shade.code,
      hex: shade.hex,
      family: shade.colorFamily,
      mood: shade.mood,
    })),
  };

  const saved = await db.$transaction(async (transaction) => {
    const primaryProduct = products[0];
    const primaryShade = shades[0];
    const lead = input.contact
      ? await transaction.lead.create({
          data: {
            clientId: client.id,
            name: input.contact.name,
            phone: input.contact.phone,
            email: input.contact.email || null,
            city: input.contact.city || null,
            source: `ai_${input.type}`,
            message: safe.summary,
            selectedProductId: primaryProduct?.id,
            selectedShadeId: primaryShade?.id,
            estimatedArea: safe.quantity.areaSqft || null,
            estimatedLiters: safe.quantity.liters || null,
            estimatedBudget: safe.quantity.estimatedCost || null,
            metadataJson: { answers: input.answers, providerUsed: provider, fallbackUsed: generated.fallbackUsed, providerAttempts: generated.attempts },
          },
        })
      : null;
    const session = await transaction.aISession.create({
      data: {
        clientId: client.id,
        type: input.type,
        inputJson: { answers: input.answers, contactProvided: Boolean(input.contact) },
        outputJson: output,
        leadId: lead?.id,
      },
    });
    return { sessionId: session.id, leadId: lead?.id || null };
  });

  return { ...output, ...saved };
}
