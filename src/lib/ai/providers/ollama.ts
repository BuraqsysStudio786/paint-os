import "server-only";

import { parseProviderJson, providerPrompt, type PaintAdviceInput } from "../schemas";

export async function requestOllamaAdvice(input: PaintAdviceInput) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3.1:8b",
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
      messages: [{ role: "user", content: providerPrompt(input) }],
    }),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as {
    message?: { content?: string };
    error?: string;
  } | null;
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${payload?.error || "request failed"}`);
  return parseProviderJson(payload?.message?.content);
}
