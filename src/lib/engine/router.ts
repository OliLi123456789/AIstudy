/* Capability routing. Generation code calls supportsTask() before invoking
   an engine method that not every engine implements (e.g. Anthropic has no
   transcription/TTS/embeddings, local has no transcription/TTS yet), and
   falls back to unsupportedMessage() for a clean, user-facing explanation
   instead of letting the raw EngineError surface. */

import type { Engine } from "./types";

export type Task = "chat" | "transcription" | "tts" | "embeddings";

export function supportsTask(engine: Engine, task: Task): boolean {
  const caps = engine.capabilities();
  switch (task) {
    case "chat":
      return caps.chat;
    case "transcription":
      return caps.transcription;
    case "tts":
      return caps.tts;
    case "embeddings":
      return caps.embeddings;
  }
}

export function unsupportedMessage(task: Task): string {
  switch (task) {
    case "chat":
      return "This engine doesn't support chat.";
    case "transcription":
      return "This engine doesn't support speech-to-text. Use an OpenAI key for transcription.";
    case "tts":
      return "This engine doesn't support text-to-speech. Use an OpenAI key for TTS.";
    case "embeddings":
      return "This engine doesn't support embeddings. Use an OpenAI key for embeddings.";
  }
}
