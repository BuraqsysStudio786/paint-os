export function providerErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b429\b|quota|rate.?limit/i.test(message)) return "quota_or_rate_limit";
  if (/\b401\b|\b403\b|unauthor|forbidden|api.?key/i.test(message)) return "authentication";
  if (/timeout|aborted/i.test(message)) return "timeout";
  if (/json|schema|parse/i.test(message)) return "invalid_response";
  return "provider_error";
}

export function providerConfigured(name: string) {
  if (name === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (name === "groq") return Boolean(process.env.GROQ_API_KEY);
  if (name === "openrouter") return Boolean(process.env.OPENROUTER_API_KEY);
  if (name === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (name === "ollama") return Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL);
  return false;
}
