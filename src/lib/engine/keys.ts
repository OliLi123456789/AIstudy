import type { Provider } from "../types";

/* API key handling for the SaaS web app. The key is fetched from the backend
   at runtime (stored in Vercel KV via /api/get-key), with a build-time
   VITE_API_KEY fallback for local dev without the API server. */

export function detectProvider(key: string): Provider | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-")) return "openai";
  return null;
}

let cachedKey: string | null = null;

/* Fetches the API key from the server (or build-time env var fallback).
   Result is cached in memory for the lifetime of the page. */
export async function loadApiKey(): Promise<string> {
  if (cachedKey !== null) return cachedKey;
  try {
    const res = await fetch("/api/get-key");
    if (res.ok) {
      const data = await res.json();
      if (data.key) {
        cachedKey = data.key as string;
        return cachedKey;
      }
    }
  } catch { /* network error — fall through */ }
  // Fallback: build-time env var (local dev without Vercel Functions)
  cachedKey = (import.meta as { env?: { VITE_API_KEY?: string } }).env?.VITE_API_KEY ?? "";
  return cachedKey;
}
