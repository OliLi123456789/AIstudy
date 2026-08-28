/* Proxy-mode engine tests: the client must talk to the same-origin /api/ai
 * proxy with the anonymous session token — never to api.deepseek.com. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEngine } from "./index";

const authMocks = vi.hoisted(() => ({
  getClientAuthToken: vi.fn<() => Promise<string>>(),
  resetClientAuthToken: vi.fn(),
}));

vi.mock("./auth", () => authMocks);

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function sse(delta: string, done = true): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n${
    done ? "data: [DONE]\n\n" : ""
  }`;
}

describe("proxy-mode OpenAIEngine (DeepSeek via /api/ai)", () => {
  beforeEach(() => {
    authMocks.getClientAuthToken.mockReset();
    authMocks.resetClientAuthToken.mockReset();
    authMocks.getClientAuthToken.mockResolvedValue("anon-token-1");
  });

  it("posts completions to the same-origin proxy with the session token", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe("/api/ai/chat");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer anon-token-1");
      return streamResponse([sse("Hello"), sse(" world")]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const engine = createEngine({ provider: "deepseek", apiKey: "anon-token-1", baseUrl: "/api/ai" });
    const out = await engine.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(out).toBe("Hello world");
    vi.unstubAllGlobals();
  });

  it("refreshes the session token once and retries on 401", async () => {
    authMocks.getClientAuthToken.mockResolvedValue("anon-token-2");
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }))
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer anon-token-2");
        return streamResponse([sse("retried")]);
      });
    vi.stubGlobal("fetch", fetchMock);

    const engine = createEngine({ provider: "deepseek", apiKey: "anon-token-1", baseUrl: "/api/ai" });
    const out = await engine.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(out).toBe("retried");
    expect(authMocks.resetClientAuthToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("validates via the proxy without calling DeepSeek directly", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toBe("/api/ai/validate");
      return new Response(JSON.stringify({ ok: true, provider: "deepseek" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const engine = createEngine({ provider: "deepseek", apiKey: "anon-token-1", baseUrl: "/api/ai" });
    await expect(engine.validate()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("maps a proxy 503 (no provider configured) to an auth EngineError", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: "AI provider is not configured." }), { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const engine = createEngine({ provider: "deepseek", apiKey: "anon-token-1", baseUrl: "/api/ai" });
    await expect(engine.validate()).rejects.toMatchObject({ kind: "unknown" });
    vi.unstubAllGlobals();
  });

  it("rejects unsupported proxy features (tts/embed/transcribe)", async () => {
    const engine = createEngine({ provider: "deepseek", apiKey: "anon-token-1", baseUrl: "/api/ai" });
    await expect(engine.tts("hi", { voice: "alloy" })).rejects.toMatchObject({ kind: "unsupported" });
    await expect(engine.embed(["hi"])).rejects.toMatchObject({ kind: "unsupported" });
  });
});
