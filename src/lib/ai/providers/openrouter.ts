import "server-only";

import { parseProviderJson, providerPrompt, type PaintAdviceInput } from "../schemas";

export async function requestOpenRouterAdvice(input: PaintAdviceInput) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OpenRouter is not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "Paint Website OS",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: providerPrompt(input) }],
    }),
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
  return parseProviderJson(payload?.choices?.[0]?.message?.content);
}
