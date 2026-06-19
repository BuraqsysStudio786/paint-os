import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { aiResultSchema, type PaintAdviceInput } from "./schemas";
export { aiResultSchema, type RawAIResult } from "./schemas";

let client: OpenAI | null = null;
export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function requestStructuredPaintAdvice(input: PaintAdviceInput) {
  const openai = getOpenAI();
  if (!openai) return null;
  const response = await openai.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    reasoning: { effort: "low" },
    instructions: [
      "You are a careful paint-system advisor.",
      "Recommend only product slugs and shade codes present in the supplied catalog.",
      "Never invent catalog records. Use empty arrays when no record fits.",
      "For dampness or seepage, avoid structural certainty and include an inspection warning.",
      input.instructions,
    ].join("\n"),
    input: JSON.stringify({ tool: input.tool, answers: input.answers, catalog: input.catalog }),
    text: { format: zodTextFormat(aiResultSchema, "paint_advice") },
  });
  return response.output_parsed ? aiResultSchema.parse(response.output_parsed) : null;
}
