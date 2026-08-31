/* Anonymous session endpoint: issues a short-lived, HMAC-signed token that
 * the browser must present on every /api/ai/* call. There are no accounts
 * yet — this token exists purely so the server can throttle/quota abuse and
 * so the DeepSeek key never reaches the browser. */

import { signToken, tokenSecret, hasSecureSecret } from "../../shared/server/tokens.mjs";

export async function POST(): Promise<Response> {
  if (process.env.NODE_ENV === "production" && !hasSecureSecret()) {
    return new Response(JSON.stringify({ error: "TOKEN_SECRET is not configured on the server." }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const id = crypto.randomUUID();
  const token = signToken({ t: "anon", id }, tokenSecret(), 30 * 24 * 3600);

  return new Response(JSON.stringify({ token }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* Node.js runtime is required (shared/server/tokens.mjs uses node:crypto). */
export const config = { runtime: "nodejs" };
