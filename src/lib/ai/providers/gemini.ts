import "server-only";

import { parseProviderJson, providerPrompt, type PaintAdviceInput } from "../schemas";

export async function requestGeminiAdvice(input: PaintAdviceInput) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: providerPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.25 },
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => null) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${payload?.error?.message || "request failed"}`);
  return parseProviderJson(payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""));
}
