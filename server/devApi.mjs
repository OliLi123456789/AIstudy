/* Local dev API server — mirrors the Vercel Functions in api/ so `npm run
 * dev` has the same security model as production:
 *
 *   POST /api/session          → anon session token
 *   POST /api/ai/chat          → DeepSeek streaming proxy (key stays server-side)
 *   POST /api/ai/validate      → key-configured check
 *   GET/POST /api/admin        → login (token), masked get-key, set-key → .env
 *   GET  /api/health           → liveness
 *
 * The DeepSeek key is read from .env at RUNTIME (DEEPSEEK_API_KEY or the
 * legacy VITE_API_KEY) — it is never bundled into the client.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const { createHmac, timingSafeEqual, createPublicKey, verify: cryptoVerify } = crypto;
const b64url = (buf) => Buffer.from(buf).toString("base64url");

function tokenSecret() {
  return process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD || "local-dev-insecure-secret";
}

function signToken(payload, secret, ttlSeconds = 60 * 60) {
  const exp = Date.now() + ttlSeconds * 1000;
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token, secret) {
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

function secureEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function maskKey(key) {
  const s = String(key || "");
  if (s.length <= 8) return "••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

let jwksCache = null;
let jwksCacheUrl = "";

async function verifySupabaseJwt(token) {
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4179;
const ENV_FILE = path.join(__dirname, "..", ".env");

/* Minimal .env loader (KEY=VALUE lines only). */
function loadDotEnv() {
  try {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
    }
  } catch { /* no .env file — fine */ }
}
loadDotEnv();

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const ALLOWED_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);
const MAX_REQUEST_CHARS = 500_000;
const RPM = 20;
const DAILY_TOKENS = Number(process.env.AI_DAILY_TOKEN_BUDGET || 200_000);
const DAILY_SPEND_USD = Number(process.env.AI_DAILY_SPEND_CAP_USD || 5);

/* In-memory counters (reset on restart — local dev only). */
const counters = new Map();
function incr(key) {
  const n = (counters.get(key) || 0) + 1;
  counters.set(key, n);
  return n;
}
function add(key, amount) {
  counters.set(key, (counters.get(key) || 0) + amount);
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}
function deepSeekKey() {
  return process.env.DEEPSEEK_API_KEY || process.env.VITE_API_KEY || "";
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
function updateEnvKey(newKey) {
  try {
    const lines = fs.readFileSync(ENV_FILE, "utf8").split("\n");
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("VITE_API_KEY=")) {
        lines[i] = `VITE_API_KEY=${newKey}`;
        found = true;
        break;
      }
    }
    if (!found) lines.push(`VITE_API_KEY=${newKey}`);
    fs.writeFileSync(ENV_FILE, lines.join("\n"));
    process.env.VITE_API_KEY = newKey;
    return true;
  } catch {
    return false;
  }
}

/* Resolve the quota principal: Supabase user id when signed in, else the
   anonymous session id. Returns null when unauthorized. */
async function quotaPrincipal(authHeader) {
  const supabaseUser = await verifySupabaseJwt(authHeader);
  if (supabaseUser?.sub) return `user:${supabaseUser.sub}`;
  const session = verifyToken(authHeader, tokenSecret());
  if (!session || session.t !== "anon") return null;
  return `anon:${session.id}`;
}

async function handleAiChat(req, res, body) {
  if (process.env.AI_GENERATION_DISABLED === "1") return json(res, 503, { error: "AI generation is temporarily disabled." });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const principal = await quotaPrincipal(token);
  if (!principal) return json(res, 401, { error: "unauthorized" });

  const parsed = JSON.parse(body);
  const model = parsed.model || "deepseek-chat";
  if (!ALLOWED_MODELS.has(model)) return json(res, 400, { error: `model ${model} is not allowed` });
  if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    return json(res, 400, { error: "messages must be a non-empty array" });
  }
  const requestChars = JSON.stringify(parsed.messages).length;
  if (requestChars > MAX_REQUEST_CHARS) return json(res, 413, { error: "request too large" });

  const id = principal;
  const minute = Math.floor(Date.now() / 60000);
  if (incr(`rl:${id}:${minute}`) > RPM) {
    res.setHeader("retry-after", "60");
    return json(res, 429, { error: "rate limit exceeded" });
  }
  const clientDay = `${id}:${dayKey()}`;
  if ((counters.get(`tokens:${clientDay}`) || 0) >= DAILY_TOKENS) {
    return json(res, 429, { error: "daily AI budget reached — please try again tomorrow." });
  }
  if ((counters.get(`spend:${dayKey()}`) || 0) >= DAILY_SPEND_USD * 1e6) {
    return json(res, 429, { error: "service is temporarily at capacity." });
  }

  const key = deepSeekKey();
  if (!key) return json(res, 503, { error: "AI provider is not configured (set DEEPSEEK_API_KEY in .env)." });

  const estInput = Math.max(1, Math.ceil(requestChars / 4));
  const wantStream = parsed.stream !== false;
  const upstream = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(
      wantStream
        ? { ...parsed, model, stream: true, stream_options: { include_usage: true } }
        : { ...parsed, model, stream: false },
    ),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return json(res, upstream.status, { error: text || "upstream error" });
  }

  if (!wantStream) {
    let data;
    try {
      data = await upstream.json();
    } catch {
      return json(res, 502, { error: "upstream returned an unreadable response" });
    }
    const promptTokens = Number(data?.usage?.prompt_tokens) || estInput;
    const completionTokens = Number(data?.usage?.completion_tokens) || 1;
    const costUsd = promptTokens * (0.14 / 1e6) + completionTokens * (0.28 / 1e6);
    add(`tokens:${clientDay}`, promptTokens + completionTokens);
    add(`spend:${dayKey()}`, Math.max(1, Math.round(costUsd * 1e6)));
    return json(res, 200, data);
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
  });
  const reader = upstream.body.getReader();
  let outputBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputBytes += value.length;
      res.write(value);
    }
  } finally {
    const estOutput = Math.max(1, Math.ceil(outputBytes / 4));
    const costUsd = estInput * (0.14 / 1e6) + estOutput * (0.28 / 1e6);
    add(`tokens:${clientDay}`, estInput + estOutput);
    add(`spend:${dayKey()}`, Math.max(1, Math.round(costUsd * 1e6)));
    res.end();
  }
}

async function handleAdmin(req, res, url, body) {
  const action = url.searchParams.get("action");
  if (req.method === "GET" && action === "get-key") {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const payload = verifyToken(token, tokenSecret());
    if (!payload || payload.t !== "admin") return json(res, 401, { error: "unauthorized" });
    return json(res, 200, { key: maskKey(deepSeekKey()), provider: process.env.VITE_AI_PROVIDER || "deepseek" });
  }
  if (req.method === "POST" && body) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: "invalid json" }); }
    if (parsed.action === "login") {
      const expected = process.env.ADMIN_PASSWORD;
      if (!expected || !secureEqual(parsed.password, expected)) {
        return json(res, 401, { ok: false, error: "bad password" });
      }
      const token = signToken({ t: "admin" }, tokenSecret(), 12 * 60 * 60);
      return json(res, 200, { ok: true, token });
    }
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const payload = verifyToken(token, tokenSecret());
    if (!payload || payload.t !== "admin") return json(res, 401, { error: "unauthorized" });
    if (parsed.action === "set-key") {
      if (!parsed.key) return json(res, 400, { error: "missing key" });
      return json(res, 200, { ok: true, savedToEnv: updateEnvKey(parsed.key.trim()) });
    }
    return json(res, 400, { error: "unknown action" });
  }
  return json(res, 400, { error: "unknown action" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/session") {
      return json(res, 200, { token: signToken({ t: "anon", id: crypto.randomUUID() }, tokenSecret()) });
    }
    if (req.method === "POST" && url.pathname === "/api/ai/validate") {
      const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const principal = await quotaPrincipal(token);
      if (!principal) return json(res, 401, { error: "unauthorized" });
      return json(res, 200, { ok: true, provider: "deepseek" });
    }
    if (req.method === "POST" && url.pathname === "/api/ai/chat") {
      return await handleAiChat(req, res, await readBody(req));
    }
    if (url.pathname.startsWith("/api/admin")) {
      return await handleAdmin(req, res, url, await readBody(req));
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error("dev API error:", err);
    json(res, 500, { error: "internal error" });
  }
});

server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT} (DeepSeek key: ${deepSeekKey() ? "configured" : "MISSING"})`);
});
