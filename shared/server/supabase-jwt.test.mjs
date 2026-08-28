import { describe, it, expect, beforeAll, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifySupabaseJwt } from "./supabase-jwt.mjs";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256" };
const now = Math.floor(Date.now() / 1000);

function makeJwt(overrides = {}) {
  const header = { alg: "RS256", kid: "test-kid", typ: "JWT" };
  const payload = {
    sub: "user-123",
    aud: "authenticated",
    iss: "https://test.supabase.co/auth/v1",
    exp: now + 3600,
    ...overrides,
  };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign("sha256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url");
  return `${h}.${p}.${sig}`;
}

describe("verifySupabaseJwt", () => {
  beforeAll(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })),
    );
  });

  it("accepts a validly signed token", async () => {
    const payload = await verifySupabaseJwt(makeJwt());
    expect(payload?.sub).toBe("user-123");
  });

  it("rejects tampered signatures", async () => {
    const t = makeJwt();
    const [h, p] = t.split(".");
    expect(await verifySupabaseJwt(`${h}.${p}.AAAA`)).toBeNull();
  });

  it("rejects expired tokens", async () => {
    expect(await verifySupabaseJwt(makeJwt({ exp: now - 10 }))).toBeNull();
  });

  it("rejects wrong audience", async () => {
    expect(await verifySupabaseJwt(makeJwt({ aud: "anon" }))).toBeNull();
  });

  it("rejects wrong issuer", async () => {
    expect(await verifySupabaseJwt(makeJwt({ iss: "https://evil.example" }))).toBeNull();
  });
});
