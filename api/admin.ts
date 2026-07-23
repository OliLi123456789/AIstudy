/* Admin API — owner portal backend for managing the AI API key.
 *
 *   GET  /api/admin?action=get-key  → returns the stored API key
 *   POST /api/admin                  → { action, password, key }
 *
 * Requires ADMIN_PASSWORD env var. Uses Vercel KV for storage; falls back
 * to the VITE_API_KEY env var when KV is not configured (local dev). */

import { kv } from "@vercel/kv";

const KV_KEY = "aistudy:api_key";

function auth(request: Request): Response | null {
  const pw = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || pw !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

async function getKey(): Promise<string> {
  try {
    const stored = await kv.get<string>(KV_KEY);
    if (stored) return stored;
  } catch { /* KV not configured — fall through */ }
  return process.env.VITE_API_KEY ?? "";
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "get-key") {
    // Public: the frontend needs this to build the engine.
    const key = await getKey();
    return new Response(JSON.stringify({ key }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  return new Response(JSON.stringify({ error: "unknown action" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: { action?: string; password?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { action, password, key } = body;

  // Login: just validate the password.
  if (action === "login") {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected || password !== expected) {
      return new Response(JSON.stringify({ ok: false, error: "bad password" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  // All other actions require auth header.
  const unauth = auth(req);
  if (unauth) return unauth;

  if (action === "set-key") {
    if (!key || typeof key !== "string") {
      return new Response(JSON.stringify({ error: "missing key" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    try {
      await kv.set(KV_KEY, key.trim());
    } catch {
      return new Response(JSON.stringify({ error: "KV storage unavailable — set VITE_API_KEY env var instead" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, provider: detectProviderFromKey(key.trim()) }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "unknown action" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

function detectProviderFromKey(k: string): string | null {
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-")) return "openai";
  return null;
}
