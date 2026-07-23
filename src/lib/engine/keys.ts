import type { Provider } from "../types";

/* API key handling for the SaaS web app. The API key is injected at build
   time via VITE_API_KEY and auto-detected by prefix. No user key entry needed. */

export function detectProvider(key: string): Provider | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

/* Returns the build-time API key, or empty string if not configured. */
export function loadApiKey(): string {
  // Vite injects import.meta.env.VITE_API_KEY at build time
  return (import.meta as { env?: { VITE_API_KEY?: string } }).env?.VITE_API_KEY ?? "";
}
