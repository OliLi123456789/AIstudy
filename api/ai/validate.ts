/* Credentials sanity check for the engine's validate() call.
 * Deliberately does NOT ping DeepSeek (that would cost money) — it verifies
 * the session token and that a server-side key is configured. */

import { kv } from "@vercel/kv";
import { createHmac, timingSafeEqual, createPublicKey, createVerify, verify as cryptoVerify } from "node:crypto";

const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString("base64url");

function verifyToken(token: string | null | undefined, secret: string): Record<string, unknown> | null {
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

function tokenSecret(): string {
  return process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD || "local-dev-insecure-secret";
}

function hasSecureSecret(): boolean {
  return Boolean(process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD);
}

let jwksCache: { keys?: Array<{ kid?: string }> } | null = null;
let jwksCacheUrl = "";

async function verifySupabaseJwt(token: string | null | undefined): Promise<Record<string, unknown> | null> {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!base || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  // Supabase signs with RS256 (older projects) or ES256 (newer projects).
  if ((header.alg !== "RS256" && header.alg !== "ES256") || !header.kid) return null;
  const jwksUrl = `${base.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  if (!jwksCache || jwksCacheUrl !== jwksUrl) {
    try {
      const res = await fetch(jwksUrl);
      if (!res.ok) return null;
      jwksCache = await res.json();
      jwksCacheUrl = jwksUrl;
    } catch {
      return null;
    }
  }
  const jwk = jwksCache?.keys?.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  let signatureOk = false;
  try {
    const pub = createPublicKey({ key: jwk, format: "jwk" });
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    const sig = Buffer.from(parts[2], "base64url");
    if (header.alg === "RS256") {
      signatureOk = cryptoVerify("RSA-SHA256", data, pub, sig);
    } else {
      const verifier = createVerify("SHA256");
      verifier.update(data);
      verifier.end();
      signatureOk = verifier.verify({ key: pub, dsaEncoding: "ieee-p1363" }, sig);
    }
  } catch {
    return null;
  }
  if (!signatureOk) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = Date.now() / 1000;
  if (typeof payload.exp !== "number" || now > payload.exp) return null;
  if (payload.aud !== "authenticated") return null;
  const expectedIss = base.replace(/\/$/, "");
  if (payload.iss && !String(payload.iss).startsWith(expectedIss)) return null;
  return payload;
}

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

/* Node.js runtime is required (shared/tokens.mjs uses node:crypto). */
export const config = { runtime: "nodejs" };
