import type { Provider } from "../types";

/* API key handling for the SaaS web app.
 *
 * The DeepSeek API key NEVER reaches the browser. The client talks to our own
 * /api/ai proxy using an anonymous session token (see ./auth.ts). This module
 * only keeps display helpers. */

export function detectProvider(key: string): Provider | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  // Both OpenAI and DeepSeek use sk- prefix — rely on stored provider preference
  if (k.startsWith("sk-")) return null; // ambiguous, need explicit config
  return null;
}

/* Display-only masking (the server does the real redaction). */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
