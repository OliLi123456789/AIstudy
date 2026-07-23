/* Public endpoint: returns the current AI API key so the frontend can
 * build the engine without baking the key into the JS bundle. */

import { kv } from "@vercel/kv";

const KV_KEY = "aistudy:api_key";

export async function GET(): Promise<Response> {
  let key = "";
  try {
    const stored = await kv.get<string>(KV_KEY);
    if (stored) key = stored;
  } catch { /* KV not configured */ }
  if (!key) key = process.env.VITE_API_KEY ?? "";

  return new Response(JSON.stringify({ key }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
