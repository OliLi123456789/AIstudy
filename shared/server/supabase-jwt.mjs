/* Supabase JWT verification for serverless functions (no external deps).
 * Fetches the project JWKS, verifies RS256 signature, expiry, audience,
 * and issuer. Returns the decoded payload (with `sub` = user uuid) or null. */

import { createPublicKey, verify as cryptoVerify } from "node:crypto";

let jwksCache = null;
let jwksCacheUrl = "";

export async function verifySupabaseJwt(token) {
  const base = process.env.SUPABASE_URL;
  if (!base || !token) return null;

  const parts = String(token).split(".");
  if (parts.length !== 3) return null;

  let header;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

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
    signatureOk = cryptoVerify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      pub,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    return null;
  }
  if (!signatureOk) return null;

  let payload;
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
