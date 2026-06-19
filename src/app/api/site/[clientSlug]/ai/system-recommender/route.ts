import { handlePaintWizardRoute } from "@/lib/ai/route-handler";

export async function POST(request: Request, context: RouteContext<"/api/site/[clientSlug]/ai/system-recommender">) {
  return handlePaintWizardRoute(request, (await context.params).clientSlug, "system_recommender");
}
