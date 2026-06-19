import { handlePaintWizardRoute } from "@/lib/ai/route-handler";

export async function POST(request: Request, context: RouteContext<"/api/site/[clientSlug]/ai/color-consultant">) {
  return handlePaintWizardRoute(request, (await context.params).clientSlug, "color_consultant");
}
