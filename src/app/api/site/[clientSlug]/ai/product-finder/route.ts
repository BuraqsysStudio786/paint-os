import { handlePaintWizardRoute } from "@/lib/ai/route-handler";

export async function POST(request: Request, context: RouteContext<"/api/site/[clientSlug]/ai/product-finder">) {
  return handlePaintWizardRoute(request, (await context.params).clientSlug, "product_finder");
}
