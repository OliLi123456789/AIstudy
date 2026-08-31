/* Credentials sanity check for the engine's validate() call.
 * Deliberately does NOT ping DeepSeek (that would cost money) — it verifies
 * the session token and that a server-side key is configured. */

import { kv } from "@vercel/kv";
import { verifyToken, tokenSecret, hasSecureSecret } from "../../shared/server/tokens.mjs";
import { verifySupabaseJwt } from "../../shared/server/supabase-jwt.mjs";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function POST(req: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production" && !hasSecureSecret()) {
    return json({ error: "TOKEN_SECRET is not configured on the server." }, 500);
  }
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUser = await verifySupabaseJwt(auth);
  if (!supabaseUser) {
    const session = verifyToken(auth, tokenSecret());
    if (!session || session.t !== "anon") {
      return json({ error: "unauthorized" }, 401);
    }
  }

  let key = "";
  try {
    key = (await kv.get<string>("aistudy:api_key")) ?? "";
  } catch { /* KV not configured */ }
  if (!key) key = process.env.DEEPSEEK_API_KEY || process.env.VITE_API_KEY || "";

  if (!key) return json({ ok: false, error: "AI provider is not configured." }, 503);
  return json({ ok: true, provider: "deepseek" });
}

/* Node.js runtime is required (shared/server/tokens.mjs uses node:crypto). */
export const config = { runtime: "nodejs" };
