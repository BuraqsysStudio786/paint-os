import { handlePaintWizardRoute } from "@/lib/ai/route-handler";

export async function POST(request: Request, context: RouteContext<"/api/site/[clientSlug]/ai/problem-solver">) {
  return handlePaintWizardRoute(request, (await context.params).clientSlug, "problem_solver");
}
