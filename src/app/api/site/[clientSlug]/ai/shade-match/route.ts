import { handlePaintWizardRoute } from "@/lib/ai/route-handler";

export async function POST(request: Request, context: RouteContext<"/api/site/[clientSlug]/ai/shade-match">) {
  return handlePaintWizardRoute(request, (await context.params).clientSlug, "shade_match");
}
