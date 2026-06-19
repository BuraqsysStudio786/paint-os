import "server-only";

import { parseProviderJson, providerPrompt, type PaintAdviceInput } from "../schemas";

export async function requestGroqAdvice(input: PaintAdviceInput) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq is not configured.");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
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
  if (!response.ok) throw new Error(`Groq HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
  return parseProviderJson(payload?.choices?.[0]?.message?.content);
}
