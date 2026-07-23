/* Engine factory. This is the single entry point generation/UI code should
   use to get an Engine — never `new` a provider class directly, so switching
   providers stays a one-line change at the call site. */

import type { Provider } from "../types";
import type { Engine } from "./types";
import { EngineError } from "./types";
import { OpenAIEngine } from "./openai";
import { AnthropicEngine } from "./anthropic";

export * from "./types";
export { detectProvider } from "./keys";

export interface CreateEngineOptions {
  provider?: Provider;
  apiKey?: string;
  model?: string;
}

export function createEngine(opts: CreateEngineOptions): Engine {
  const key = opts.apiKey;
  if (!key) {
    throw new EngineError("No API key configured.", "auth");
  }

  switch (opts.provider) {
    case "anthropic":
      return new AnthropicEngine(key, opts.model);
    case "deepseek":
      return new OpenAIEngine("deepseek", key, opts.model);
    case "openai":
    default:
      return new OpenAIEngine("openai", key, opts.model);
  }
}

/* Cheap liveness/credentials check without the caller needing to hold onto
   the Engine instance. Throws EngineError on failure. */
export async function validateCredentials(opts: CreateEngineOptions): Promise<void> {
  await createEngine(opts).validate();
}
