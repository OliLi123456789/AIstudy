/* OpenAI-compatible implementation of the Engine interface. Supports OpenAI,
   DeepSeek, and any other OpenAI-format API by swapping baseUrl + models. */

import type {
  ChatMessage,
  CompletionOptions,
  Engine,
  EngineCapabilities,
  StructuredOptions,
  TokenHandler,
  TranscriptResult,
  TranscriptSegment,
  TtsOptions,
} from "./types";
import { EngineError } from "./types";
import type { Provider } from "../types";

interface ProviderConfig {
  baseUrl: string;
  fastModel: string;
  strongModel: string;
  hasTranscription: boolean;
  hasTts: boolean;
  hasEmbeddings: boolean;
  supportsJsonSchema: boolean;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    fastModel: "gpt-4o-mini",
    strongModel: "gpt-4o",
    hasTranscription: true,
    hasTts: true,
    hasEmbeddings: true,
    supportsJsonSchema: true,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    fastModel: "deepseek-chat",
    strongModel: "deepseek-chat",
    hasTranscription: false,
    hasTts: false,
    hasEmbeddings: false,
    supportsJsonSchema: false,
  },
  anthropic: {
    // Anthropic has its own engine class; this entry exists for type coverage
    // but should never be used — createEngine routes to AnthropicEngine instead.
    baseUrl: "https://api.anthropic.com/v1",
    fastModel: "claude-3-5-haiku-latest",
    strongModel: "claude-sonnet-4-20250514",
    hasTranscription: false,
    hasTts: false,
    hasEmbeddings: false,
    supportsJsonSchema: false,
  },
};

export class OpenAIEngine implements Engine {
  readonly provider: Provider;
  private readonly baseUrl: string;
  private readonly cfg: ProviderConfig;

  constructor(
    provider: Provider,
    private readonly apiKey: string,
    private readonly modelOverride?: string,
  ) {
    this.provider = provider;
    this.cfg = PROVIDERS[provider];
    this.baseUrl = this.cfg.baseUrl;
  }

  capabilities(): EngineCapabilities {
    return {
      chat: true,
      transcription: this.cfg.hasTranscription,
      tts: this.cfg.hasTts,
      embeddings: this.cfg.hasEmbeddings,
    };
  }

  async complete(opts: CompletionOptions, onToken?: TokenHandler): Promise<string> {
    const res = await this.post("/chat/completions", {
      model: this.resolveModel(opts.tier),
      messages: buildMessages(opts),
      stream: true,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }, opts.signal);

    const label = this.provider === "deepseek" ? "DeepSeek" : "OpenAI";
    if (!res.body) throw new EngineError(`${label} returned an empty stream.`, "unknown");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta: string | undefined = json.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onToken?.(delta);
          }
        } catch {
          /* malformed SSE chunk; skip it */
        }
      }
    }
    return full;
  }

  async structured<T>(opts: StructuredOptions<T>): Promise<T> {
    const messages = buildMessages(opts);

    if (this.cfg.supportsJsonSchema) {
      // OpenAI native strict structured output
      const res = await this.post("/chat/completions", {
        model: this.resolveModel(opts.tier),
        messages,
        stream: false,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
        },
      }, opts.signal);

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new EngineError("No structured content returned.", "unknown");
      }
      return JSON.parse(content) as T;
    }

    // Fallback for providers without json_schema (DeepSeek):
    // Use json_object mode + inject the schema into the system prompt.
    const schemaStr = JSON.stringify(opts.schema, null, 2);
    const systemMsg = messages[0]?.role === "system" ? messages[0] : null;
    const userMsgs = systemMsg ? messages.slice(1) : messages;

    const promptMessages = [
      ...(systemMsg ? [systemMsg] : []),
      {
        role: "system" as const,
        content: `You must respond with a JSON object that strictly follows this schema. Do not include any text outside the JSON:\n\`\`\`json\n${schemaStr}\n\`\`\``,
      },
      ...userMsgs,
    ];

    const res = await this.post("/chat/completions", {
      model: this.resolveModel(opts.tier),
      messages: promptMessages,
      stream: false,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      response_format: { type: "json_object" },
    }, opts.signal);

    const json = await res.json();
    let content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new EngineError("No structured content returned.", "unknown");
    }
    // Strip markdown code fences if the model wrapped the JSON
    content = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
    return JSON.parse(content) as T;
  }

  async transcribe(audio: Blob, signal?: AbortSignal): Promise<TranscriptResult> {
    if (!this.cfg.hasTranscription) {
      throw new EngineError("Transcription is not supported by this provider.", "unsupported");
    }
    const form = new FormData();
    form.append("file", audio, "audio.webm");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal,
      });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (!res.ok) throw await mapError(res);

    const json = await res.json();
    const segments: TranscriptSegment[] = Array.isArray(json.segments)
      ? json.segments.map((s: { start: number; end: number; text: string }) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        }))
      : [];
    return { text: json.text ?? "", segments, language: json.language };
  }

  async tts(text: string, opts: TtsOptions): Promise<Blob> {
    if (!this.cfg.hasTts) {
      throw new EngineError("Text-to-speech is not supported by this provider.", "unsupported");
    }
    /* Try TTS models newest→oldest for OpenAI */
    const models = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];
    const tried: string[] = [];
    for (const model of models) {
      try {
        const res = await this.post(
          "/audio/speech",
          { model, voice: opts.voice, input: text, ...(opts.format ? { response_format: opts.format } : {}) },
          opts.signal,
        );
        return res.blob();
      } catch (e) {
        if (e instanceof EngineError && e.kind === "model_missing") { tried.push(model); continue; }
        throw e;
      }
    }
    throw new EngineError(
      `Your project can't access any TTS model (tried ${tried.join(", ")}).`,
      "model_missing",
    );
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!this.cfg.hasEmbeddings) {
      throw new EngineError("Embeddings are not supported by this provider.", "unsupported");
    }
    const res = await this.post("/embeddings", {
      model: "text-embedding-3-small",
      input: texts,
    }, signal);
    const json = await res.json();
    return (json.data ?? []).map((d: { embedding: number[] }) => d.embedding);
  }

  async validate(): Promise<void> {
    // DeepSeek doesn't have a /models endpoint — use /chat/completions with a minimal request
    const label = this.provider === "deepseek" ? "DeepSeek" : "OpenAI";
    let res: Response;
    try {
      if (this.provider === "deepseek") {
        res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model: this.cfg.fastModel,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          }),
        });
      } else {
        res = await fetch(`${this.baseUrl}/models`, { method: "GET", headers: this.headers() });
      }
    } catch (err) {
      throw toNetworkError(err);
    }
    if (res.status === 401) throw new EngineError(`Invalid ${label} API key.`, "auth");
    if (!res.ok) throw await mapError(res);
  }

  private resolveModel(tier?: "fast" | "strong"): string {
    if (this.modelOverride) return this.modelOverride;
    return tier === "strong" ? this.cfg.strongModel : this.cfg.fastModel;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /* Shared POST helper: sends JSON, handles network failure + non-2xx mapping. */
  private async post(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (!res.ok) throw await mapError(res);
    return res;
  }
}

function buildMessages(opts: CompletionOptions): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (opts.system) out.push({ role: "system", content: opts.system });
  for (const m of opts.messages as ChatMessage[]) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/* User-initiated cancellation should surface as a native AbortError, not get
   reinterpreted as a network failure. */
function toNetworkError(err: unknown): EngineError {
  if (err instanceof Error && err.name === "AbortError") throw err;
  const message = err instanceof Error ? err.message : "Network request failed.";
  return new EngineError(message, "network");
}

async function mapError(res: Response): Promise<EngineError> {
  let message = res.statusText || "OpenAI request failed.";
  let code: string | undefined;
  let type: string | undefined;
  try {
    const body = await res.json();
    if (body?.error?.message) message = body.error.message;
    code = body?.error?.code;
    type = body?.error?.type;
  } catch {
    /* body wasn't JSON */
  }
  /* OpenAI returns HTTP 429 for both rate limits and quota exhaustion — check
     the error code first so quota errors aren't misreported as rate_limit. */
  if (code === "insufficient_quota" || type === "insufficient_quota") {
    return new EngineError(message, "quota");
  }
  /* Project-scoped keys can be missing access to specific models (e.g. TTS).
     Surface that as a clear, actionable message rather than a raw API error. */
  if (
    code === "model_not_found" ||
    /does not have access to model|model_not_found|must be verified to use the model/i.test(
      message,
    )
  ) {
    return new EngineError(
      `${message} — enable this model for your OpenAI project at platform.openai.com → Settings → Project → Limits.`,
      "model_missing",
    );
  }
  if (res.status === 401) return new EngineError(message, "auth");
  if (res.status === 429) return new EngineError(message, "rate_limit");
  if (res.status === 403) return new EngineError(message, "model_missing");
  return new EngineError(message, "unknown");
}
