import { handlePaintWizardRoute } from "@/lib/ai/route-handler";

export async function POST(request: Request, context: RouteContext<"/api/site/[clientSlug]/ai/budget-guidance">) {
  return handlePaintWizardRoute(request, (await context.params).clientSlug, "budget_guidance");
}
