import type { Provider } from "../types";

/* API key handling for the SaaS web app. The key is fetched from the backend
   at runtime (stored in Vercel KV via /api/get-key), with a build-time
   VITE_API_KEY fallback for local dev without the API server. */

export function detectProvider(key: string): Provider | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  // Both OpenAI and DeepSeek use sk- prefix — rely on stored provider preference
  if (k.startsWith("sk-")) return null; // ambiguous, need explicit config
  return null;
}

let cachedKey: string | null = null;
let cachedProvider: Provider | null = null;

/* Fetches the API key and provider from the server (or build-time env var fallback).
   Result is cached in memory for the lifetime of the page. */
export async function loadApiKey(): Promise<string> {
  if (cachedKey !== null) return cachedKey;
  try {
    const res = await fetch("/api/get-key");
    if (res.ok) {
      const data = await res.json();
      if (data.key) {
        cachedKey = data.key as string;
        cachedProvider = (data.provider as Provider) || null;
        return cachedKey;
      }
    }
  } catch { /* network error — fall through */ }
  // Fallback: build-time env vars (local dev without Vercel Functions)
  cachedKey = (import.meta as { env?: { VITE_API_KEY?: string } }).env?.VITE_API_KEY ?? "";
  cachedProvider = ((import.meta as { env?: { VITE_AI_PROVIDER?: string } }).env?.VITE_AI_PROVIDER as Provider) || null;
  return cachedKey;
}

/* Returns the stored provider, or auto-detects if possible. */
export function getProvider(): Provider | null {
  if (cachedProvider) return cachedProvider;
  // Fallback: try auto-detection from key prefix
  if (cachedKey) {
    const detected = detectProvider(cachedKey);
    if (detected) return detected;
  }
  return null;
}
