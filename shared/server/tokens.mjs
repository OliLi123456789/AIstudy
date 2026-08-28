/* Shared server-side auth helpers (plain ESM so both Vercel Functions in
 * api/ and the local dev server in server/ can import this exact file).
 *
 * Tokens are HMAC-signed and self-contained:
 *   base64url(JSON payload incl. exp) "." base64url(HMAC-SHA256 signature)
 * The signing secret never leaves the server.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** Sign a payload, adding a server-set `exp` (epoch ms). */
export function signToken(payload, secret, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify a token's signature and expiry. Returns the payload or null. */
export function verifyToken(token, secret) {
  try {
    const [body, sig] = String(token).split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Constant-time string comparison (for passwords). */
export function secureEqual(a, b) {
  const ha = createHmac("sha256", "aistudy:eq").update(String(a ?? "")).digest();
  const hb = createHmac("sha256", "aistudy:eq").update(String(b ?? "")).digest();
  return timingSafeEqual(ha, hb);
}

/** Show only the first 3 and last 4 chars of a secret key. */
export function maskKey(key) {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

/** Resolve the token-signing secret with a fail-safe fallback for local dev. */
export function tokenSecret() {
  return process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD || "local-dev-insecure-secret";
}

/** In production the signing secret MUST be explicitly configured. */
export function hasSecureSecret() {
  return Boolean(process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD);
}
