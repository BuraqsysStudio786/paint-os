import "server-only";

import { z } from "zod";
import { runPaintWizard, type WizardType } from "./wizard-engine";

const requestSchema = z.object({
  answers: z.record(z.string(), z.string().trim().max(1000)).refine(
    (answers) => Object.values(answers).some(Boolean),
    "Answer at least one question.",
  ),
  contact: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    email: z.string().trim().email().optional().or(z.literal("")),
    city: z.string().trim().max(100).optional(),
  }).optional(),
});

export async function handlePaintWizardRoute(
  request: Request,
  clientSlug: string,
  type: WizardType,
) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: parsed.error.issues[0]?.message || "Invalid wizard request." },
        { status: 400 },
      );
    }
    const result = await runPaintWizard({
      clientSlug,
      type,
      answers: parsed.data.answers,
      contact: parsed.data.contact
        ? { ...parsed.data.contact, email: parsed.data.contact.email || undefined }
        : undefined,
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The recommendation could not be created.";
    return Response.json({ ok: false, error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
