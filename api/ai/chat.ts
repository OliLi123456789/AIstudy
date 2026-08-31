/* AI generation proxy — the ONLY code that touches the DeepSeek API key.
 *
 *   POST /api/ai/chat   → streams a chat completion (SSE passthrough)
 *
 * Protections:
 *   - The DeepSeek key is read server-side (Vercel KV or env) and never
 *     leaves the server.
 *   - Requires a valid anon session token (issued by /api/session).
 *   - Model allowlist (no user-controllable model), request size cap,
 *     per-client rate limit, per-client daily token budget, business-wide
 *     daily spend cap, and a kill switch env var.
 *   - Browser cross-origin requests are rejected.
 */

import { kv } from "@vercel/kv";
import { createHmac, timingSafeEqual, createPublicKey, verify as cryptoVerify } from "node:crypto";

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
  const base = process.env.SUPABASE_URL;
  if (!base || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
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

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const ALLOWED_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);
const MAX_REQUEST_CHARS = 500_000;

const DEFAULT_RPM = 20;                      // requests per minute per client
const DEFAULT_DAILY_TOKENS = 200_000;        // per client per day
const DEFAULT_DAILY_SPEND_USD = 5;           // business-wide spend cap per day
const INPUT_USD_PER_TOKEN = 0.14 / 1e6;      // cache-miss price (worst case)
const OUTPUT_USD_PER_TOKEN = 0.28 / 1e6;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client — still needs a valid token
  const host = req.headers.get("host") || "";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* Sliding-window counter in KV. Fails OPEN on KV outage (rate limiting is a
   best-effort guard, not the primary defence). */
async function incrLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const n = await kv.incr(key);
    if (n === 1) await kv.expire(key, windowSec).catch(() => {});
    return n <= limit;
  } catch (err) {
    console.error("rate limit KV failure", err);
    return true;
  }
}

async function counterValue(key: string): Promise<number> {
  try {
    return (await kv.get<number>(key)) ?? 0;
  } catch {
    return 0;
  }
}

async function addCounter(key: string, amount: number): Promise<void> {
  try {
    await kv.incrby(key, amount);
  } catch {
    /* best effort */
  }
}

/* Best-effort per-account usage counters in Postgres (service role, RPC). */
async function recordSupabaseUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/increment_usage`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_day: dayKey(),
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
      }),
    });
  } catch {
    /* best effort */
  }
}

async function deepSeekKey(): Promise<{ key: string; provider: string }> {
  try {
    const stored = await kv.get<string>("aistudy:api_key");
    const storedProv = await kv.get<string>("aistudy:api_provider");
    if (stored) return { key: stored, provider: storedProv || "deepseek" };
  } catch { /* KV not configured — fall through to env */ }
  const envKey = process.env.DEEPSEEK_API_KEY || process.env.VITE_API_KEY || "";
  return { key: envKey, provider: process.env.VITE_AI_PROVIDER || "deepseek" };
}

export async function POST(req: Request): Promise<Response> {
  // Kill switch
  if (process.env.AI_GENERATION_DISABLED === "1") {
    return json({ error: "AI generation is temporarily disabled." }, 503);
  }
  if (process.env.NODE_ENV === "production" && !hasSecureSecret()) {
    return json({ error: "TOKEN_SECRET is not configured on the server." }, 500);
  }
  if (!sameOrigin(req)) {
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  }

  // Auth: a signed-in Supabase user's JWT, or a valid anon session token.
  // Quotas key on the Supabase user id when signed in (per-account budgets),
  // otherwise on the anonymous session id.
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  let principal: string | null = null;
  let supabaseUserId: string | null = null;
  const supabaseUser = await verifySupabaseJwt(authHeader);
  if (supabaseUser?.sub) {
    supabaseUserId = String(supabaseUser.sub);
    principal = `user:${supabaseUserId}`;
  } else {
    const session = verifyToken(authHeader, tokenSecret());
    if (!session || session.t !== "anon") {
      return json({ error: "unauthorized" }, 401);
    }
    principal = `anon:${String(session.id)}`;
  }

  // Body + shape validation.
  let body: { model?: string; messages?: unknown[]; stream?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "messages must be a non-empty array" }, 400);
  }
  const model = body.model || "deepseek-chat";
  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: `model ${model} is not allowed` }, 400);
  }

  // Size cap (client-side token caps are advisory; this is enforced).
  const requestChars = JSON.stringify(body.messages).length;
  if (requestChars > MAX_REQUEST_CHARS) {
    return json({ error: "request too large" }, 413);
  }

  // Quotas.
  const id = principal as string;
  const rpm = Number(process.env.AI_RPM || DEFAULT_RPM);
  const dailyTokens = Number(process.env.AI_DAILY_TOKEN_BUDGET || DEFAULT_DAILY_TOKENS);
  const dailySpendUsd = Number(process.env.AI_DAILY_SPEND_CAP_USD || DEFAULT_DAILY_SPEND_USD);

  const now = new Date();
  const minute = `${id}:${Math.floor(now.getTime() / 60000)}`;
  if (!(await incrLimit(`rl:${minute}`, rpm, 90))) {
    return json({ error: "rate limit exceeded", retryAfter: 60 }, 429, { "retry-after": "60" });
  }

  const clientDay = `${id}:${dayKey()}`;
  const used = await counterValue(`tokens:${clientDay}`);
  if (used >= dailyTokens) {
    return json({ error: "daily AI budget reached — please try again tomorrow." }, 429);
  }

  const spendMicroUsd = await counterValue(`spend:${dayKey()}`);
  if (spendMicroUsd >= dailySpendUsd * 1e6) {
    console.warn("daily spend cap reached — blocking generation");
    return json({ error: "service is temporarily at capacity." }, 429);
  }

  // Server-side key.
  const { key, provider } = await deepSeekKey();
  if (!key) {
    return json({ error: "AI provider is not configured." }, 503);
  }
  if (provider && provider !== "deepseek") {
    return json({ error: "only DeepSeek is supported through the proxy." }, 400);
  }

  // Forward to DeepSeek. Streaming is the default, but structured-output
  // requests (flashcards/quiz generation) are sent with stream:false and
  // expect a plain JSON body back — honor that instead of forcing SSE.
  const wantStream = body.stream !== false;
  const upstreamBody = wantStream
    ? { ...body, model, stream: true, stream_options: { include_usage: true } }
    : { ...body, model, stream: false };
  const estInputTokens = Math.max(1, Math.ceil(requestChars / 4));
  let upstream: Response;
  try {
    upstream = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (err) {
    console.error("deepseek fetch failed", err);
    return json({ error: "upstream request failed" }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the upstream error through unchanged.
    return new Response(upstream.body ?? JSON.stringify({ error: "upstream error" }), {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (!wantStream) {
    // Non-streaming: read the complete JSON response, record usage, return as-is.
    let data: any;
    try {
      data = await upstream.json();
    } catch (err) {
      console.error("upstream non-stream parse failed", err);
      return json({ error: "upstream returned an unreadable response" }, 502);
    }
    const promptTokens = Number(data?.usage?.prompt_tokens) || estInputTokens;
    const completionTokens = Number(data?.usage?.completion_tokens) || 1;
    const costUsd = promptTokens * INPUT_USD_PER_TOKEN + completionTokens * OUTPUT_USD_PER_TOKEN;
    void addCounter(`tokens:${clientDay}`, promptTokens + completionTokens);
    void addCounter(`spend:${dayKey()}`, Math.max(1, Math.round(costUsd * 1e6)));
    if (supabaseUserId) {
      void recordSupabaseUsage(supabaseUserId, promptTokens, completionTokens);
    }
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  // Meter output bytes while streaming, then record rough usage.
  const reader = upstream.body.getReader();
  let outputBytes = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            outputBytes += value.length;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        } finally {
          const estOutputTokens = Math.max(1, Math.ceil(outputBytes / 4));
          const costUsd = estInputTokens * INPUT_USD_PER_TOKEN + estOutputTokens * OUTPUT_USD_PER_TOKEN;
          void addCounter(`tokens:${clientDay}`, estInputTokens + estOutputTokens);
          void addCounter(`spend:${dayKey()}`, Math.max(1, Math.round(costUsd * 1e6)));
          if (supabaseUserId) {
            void recordSupabaseUsage(supabaseUserId, estInputTokens, estOutputTokens);
          }
        }
      };
      void pump();
    },
    cancel() {
      void reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

/* Node.js runtime is required (shared/tokens.mjs uses node:crypto). */
export const config = { runtime: "nodejs" };

