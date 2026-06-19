import "server-only";

import { providerConfigured, providerErrorCode } from "./fallback-rules";
import { requestGeminiAdvice } from "./providers/gemini";
import { requestGroqAdvice } from "./providers/groq";
import { requestOllamaAdvice } from "./providers/ollama";
import { requestOpenAIAdvice } from "./providers/openai";
import { requestOpenRouterAdvice } from "./providers/openrouter";
import type { PaintAdviceInput, RawAIResult } from "./schemas";

export type AIProviderName = "gemini" | "groq" | "openrouter" | "openai" | "ollama";
type Attempt = { provider: AIProviderName; error: string; code: string };

const runners: Record<AIProviderName, (input: PaintAdviceInput) => Promise<RawAIResult>> = {
  gemini: requestGeminiAdvice,
  groq: requestGroqAdvice,
  openrouter: requestOpenRouterAdvice,
  openai: requestOpenAIAdvice,
  ollama: requestOllamaAdvice,
};

export async function requestPaintAdvice(input: PaintAdviceInput): Promise<{
  result: RawAIResult | null;
  providerUsed: AIProviderName | "deterministic";
  fallbackUsed: boolean;
  attempts: Attempt[];
}> {
  const configured = (process.env.AI_PROVIDER || "auto").toLowerCase();
  const order: AIProviderName[] = configured === "auto"
    ? ["gemini", "groq", "openrouter", "openai", "ollama"]
    : [configured as AIProviderName];
  const attempts: Attempt[] = [];

  for (const provider of order) {
    if (!(provider in runners)) {
      attempts.push({ provider: "openai", code: "invalid_provider", error: `Unknown AI provider: ${provider}` });
      continue;
    }
    if (!providerConfigured(provider)) {
      attempts.push({ provider, code: "not_configured", error: `${provider} is not configured.` });
      continue;
    }
    try {
      const result = await runners[provider](input);
      return {
        result,
        providerUsed: provider,
        fallbackUsed: attempts.length > 0,
        attempts,
      };
    } catch (error) {
      attempts.push({
        provider,
        code: providerErrorCode(error),
        error: error instanceof Error ? error.message.slice(0, 300) : "Provider failed.",
      });
    }
  }

  return { result: null, providerUsed: "deterministic", fallbackUsed: true, attempts };
}
