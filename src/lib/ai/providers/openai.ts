import "server-only";

import { requestStructuredPaintAdvice } from "../openai-client";
import type { PaintAdviceInput } from "../schemas";

export async function requestOpenAIAdvice(input: PaintAdviceInput) {
  const result = await requestStructuredPaintAdvice(input);
  if (!result) throw new Error("OpenAI is not configured.");
  return result;
}
