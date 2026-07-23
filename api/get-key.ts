/* Public endpoint: returns the current AI API key so the frontend can
 * build the engine without baking the key into the JS bundle. */

import { kv } from "@vercel/kv";

const KV_KEY = "aistudy:api_key";
const KV_PROVIDER = "aistudy:api_provider";

export async function GET(): Promise<Response> {
  let key = "";
  let provider = "openai";
  try {
    const stored = await kv.get<string>(KV_KEY);
    if (stored) key = stored;
    const storedProv = await kv.get<string>(KV_PROVIDER);
    if (storedProv) provider = storedProv;
  } catch { /* KV not configured */ }
  if (!key) key = process.env.VITE_API_KEY ?? "";
  if (!provider || provider === "openai") {
    const envProv = process.env.VITE_AI_PROVIDER;
    if (envProv) provider = envProv;
  }

  return new Response(JSON.stringify({ key, provider }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
