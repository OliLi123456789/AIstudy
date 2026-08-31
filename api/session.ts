/* Anonymous session endpoint: issues a short-lived, HMAC-signed token that
 * the browser must present on every /api/ai/* call. There are no accounts
 * yet — this token exists purely so the server can throttle/quota abuse and
 * so the DeepSeek key never reaches the browser. */

import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString("base64url");

function signToken(payload: Record<string, unknown>, secret: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function tokenSecret(): string {
  return process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD || "local-dev-insecure-secret";
}

function hasSecureSecret(): boolean {
  return Boolean(process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD);
}

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

/* Node.js runtime is required (uses node:crypto). */
export const config = { runtime: "nodejs" };
