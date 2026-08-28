/* Versioned prompt templates + JSON schemas for all generation tasks.
   Structured tasks (flashcards, quiz, podcast) use strict JSON-schema output;
   free-form tasks (notes, chat, title) stream markdown/text. No source citations
   are emitted in generated content by design. */

export const PROMPTS_VERSION = 1;

/* ---- Notes -------------------------------------------------------------- */

export function noteSystem(language: string): string {
  return [
    "You are an expert study-note writer. Turn the user's source material into",
    "clear, well-structured study notes in GitHub-flavored Markdown.",
    "",
    "Requirements:",
    "- Open with a one-paragraph overview of what the material covers.",
    "- Use multi-level headings (#, ##, ###) to organize by concept, following the",
    "  source's natural order.",
    "- Use bullet and numbered lists; **bold** key terms and definitions.",
    "- Use Markdown tables for comparisons or structured data.",
    "- Use blockquote callouts `> [!note]` for important definitions or warnings.",
    "- Render math with KaTeX: inline `$x^2$`, display `$$...$$`. Preserve all",
    "  formulas, symbols, and code exactly.",
    "- Genuinely synthesize and explain — do NOT merely reorder the source.",
    "- End with a `## Key Takeaways` list.",
    "- Produce the COMPLETE notes. Never truncate or add a paywall.",
    `- Write in ${language}.`,
    "Output ONLY the raw Markdown notes — no preamble, and do NOT wrap the whole",
    "response in a ``` code fence.",
  ].join("\n");
}

export function noteUser(sourceText: string): string {
  return `Source material:\n\n${sourceText}`;
}

/* For large documents processed in chunks (map step): notes for ONE section. */
export function noteSectionSystem(
  language: string,
  part: number,
  total: number,
): string {
  return [
    `You are writing study notes for section ${part} of ${total} of a longer`,
    "document. Produce clear, well-structured Markdown notes for THIS section",
    "only. Use ## and ### headings, bullet lists, **bold** key terms, tables, and",
    "KaTeX math ($…$, $$…$$) where relevant. Genuinely explain — do not just",
    "restate. Do NOT add an overall introduction, overview, or conclusion; those",
    `are added once at the end. Write in ${language}. Output only the Markdown.`,
  ].join("\n");
}

/* Reduce step: merge per-section notes into one coherent document. */
export function noteReduceSystem(language: string): string {
  return [
    "You are given study notes assembled from consecutive sections of one",
    "document. Merge them into a single coherent set of notes: open with a short",
    "overview paragraph, keep ALL substantive content, remove duplicated headings",
    "or repeated points, keep a logical order, and close with a `## Key Takeaways`",
    `list. Do not truncate. Write in ${language}. Output only the Markdown.`,
  ].join("\n");
}

/* ---- Title -------------------------------------------------------------- */

export const titleSystem =
  "You write concise, specific document titles. Given study notes or source " +
  "text, reply with a single title of at most 8 words. No quotes, no trailing " +
  'punctuation, no filler like "Notes on" or "Summary of". Title only.';

export function titleUser(text: string): string {
  return `Material:\n\n${text.slice(0, 4000)}`;
}

/* ---- Flashcards (two-phase) --------------------------------------------- */

export const topicsSystem =
  "You identify the main study topics in source material. Return 4–8 concise " +
  "topic labels (2–4 words each) that together cover the material.";

export const topicsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["topics"],
  properties: {
    topics: { type: "array", items: { type: "string" } },
  },
} as const;

export function flashcardsSystem(topics: string[]): string {
  return [
    "You create study flashcards from source material.",
    "Rules: one atomic concept per card; the front is a question or term, the",
    "back is a complete, self-contained answer. Prefer active recall over",
    "recognition. Tag each card with the single most relevant topic from this",
    `list: ${topics.join(", ")}.`,
    "Create thorough coverage — aim for 2–4 cards per topic.",
    "For ANY math, use KaTeX notation: inline `$...$` and display `$$...$$`.",
  ].join("\n");
}

export const flashcardsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back", "topic"],
        properties: {
          front: { type: "string" },
          back: { type: "string" },
          topic: { type: "string" },
        },
      },
    },
  },
} as const;

/* ---- Quiz --------------------------------------------------------------- */

export function quizSystem(opts: {
  count: number;
  difficulty: string;
  types: string[];
}): string {
  return [
    `Create a ${opts.count}-question quiz from the source material at`,
    `${opts.difficulty} difficulty. Use these question types: ${opts.types.join(", ")}.`,
    "For mcq: exactly 4 plausible options, one correct. For true_false: options",
    'are ["True","False"]. For fill_blank: options is a single-element array with',
    "the exact answer, and correctIndex is 0; write the question with a ___ blank.",
    "correctIndex is the 0-based index of the correct option. Every question needs",
    "a one-sentence explanation of why the answer is correct. Tag each with a topic.",
    "For ANY math, use KaTeX notation: inline `$...$` and display `$$...$$`.",
  ].join("\n");
}

export const quizSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "topic",
          "difficulty",
          "question",
          "options",
          "correctIndex",
          "explanation",
        ],
        properties: {
          type: { type: "string", enum: ["mcq", "true_false", "fill_blank"] },
          topic: { type: "string" },
          difficulty: {
            type: "string",
            enum: ["basic", "intermediate", "exam"],
          },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;

/* ---- Chat --------------------------------------------------------------- */

export function chatSystem(noteTitle: string, sourceText: string): string {
  return [
    `You are a study assistant helping with the document "${noteTitle}".`,
    "Answer questions using the source material below. Be clear and concise, and",
    "use Markdown (headings, lists, **bold**) when helpful. For ANY math, symbols,",
    "or formulas, use KaTeX delimiters — inline `$E = mc^2$` and display `$$…$$` —",
    "never plain parentheses like ( F ). If the answer is not in the material, say",
    "so plainly rather than guessing. Do not add source citations.",
    "",
    "--- SOURCE MATERIAL ---",
    sourceText.slice(0, 100_000),
    "--- END SOURCE MATERIAL ---",
  ].join("\n");
}

/* ---- Podcast ------------------------------------------------------------ */

const PODCAST_TARGET: Record<string, number> = {
  short: 12,
  medium: 24,
  long: 40,
};

export function podcastSystem(length: "short" | "medium" | "long"): string {
  const lines = PODCAST_TARGET[length];
  return [
    "Write a two-host audio dialogue that teaches the source material, like a",
    "study podcast. host = the explainer, guest = the curious learner who asks",
    "good questions. Natural, engaging, accurate. Cover the key ideas.",
    `Aim for about ${lines} turns total.`,
    "For EACH line also provide a `spoken` field: the same content rewritten for",
    "text-to-speech — expand abbreviations, spell out symbols and equations in",
    "words, and phonetically respell hard/foreign/technical terms so a TTS voice",
    "pronounces them correctly (e.g. 'DLENA' -> 'duh-LAY-nuh'). The `text` field",
    "keeps the original readable version.",
  ].join("\n");
}

export const podcastSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["speaker", "text", "spoken"],
        properties: {
          speaker: { type: "string", enum: ["host", "guest"] },
          text: { type: "string" },
          spoken: { type: "string" },
        },
      },
    },
  },
} as const;

/* ---- Essay Grading ------------------------------------------------------ */

export const essaySystem = [
  "You are an experienced teacher grading a student essay. Be fair, constructive,",
  "and specific. If a rubric is provided, grade against each criterion exactly.",
  "If no rubric is provided, evaluate on: Thesis/Argument, Evidence & Analysis,",
  "Organization & Structure, Clarity & Style, and Grammar & Mechanics.",
  "For each criterion, give a score, the max score, and 1-2 sentences of specific",
  "feedback. List 2-4 overall strengths and 2-4 specific improvements. The",
  "overallScore should be the sum of all criterion scores. Be encouraging but",
  "honest — point out what needs work without being harsh.",
].join("\n");

export function essayUser(essay: string, rubric?: string): string {
  const parts = ["Please grade this essay:"];
  if (rubric) parts.push(`Rubric:\n${rubric}`);
  parts.push(`Essay:\n${essay}`);
  return parts.join("\n\n");
}

export const essayResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["result"],
  properties: {
    result: {
      type: "object",
      additionalProperties: false,
      required: ["overallScore", "maxScore", "criteria", "strengths", "improvements"],
      properties: {
        overallScore: { type: "number" },
        maxScore: { type: "number" },
        criteria: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "score", "maxScore", "feedback"],
            properties: {
              name: { type: "string" },
              score: { type: "number" },
              maxScore: { type: "number" },
              feedback: { type: "string" },
            },
          },
        },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

/* ---- Practice Test (configurable: MCQ + FRQ + Essay) -------------------- */

export function practiceTestSystem(opts: {
  mcqCount: number;
  frqCount: number;
  essayCount: number;
  difficulty: string;
}): string {
  return [
    `Create a practice test from the source material at ${opts.difficulty} difficulty.`,
    `Include exactly:`,
    opts.mcqCount > 0 ? `- ${opts.mcqCount} multiple-choice questions (each with 4 options, one correct, tagged with topic, with explanation)` : "",
    opts.frqCount > 0 ? `- ${opts.frqCount} free-response questions (require short paragraph answers, include model answer + 3-5 key points to look for, tagged with topic)` : "",
    opts.essayCount > 0 ? `- ${opts.essayCount} essay prompts (require multi-paragraph analysis, include a rubric with 3-4 criteria each scored 1-5, and a model thesis statement, tagged with topic)` : "",
    "Cover the full breadth of the material. Questions should test understanding, not just recall.",
    "For ANY math, use KaTeX notation: inline `$...$` and display `$$...$$`.",
  ].filter(Boolean).join("\n");
}

export const practiceTestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mcq", "frq", "essay"],
  properties: {
    mcq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "correctIndex", "topic", "explanation"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctIndex: { type: "integer" },
          topic: { type: "string" },
          explanation: { type: "string" },
        },
      },
    },
    frq: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "modelAnswer", "keyPoints", "topic", "maxPoints"],
        properties: {
          question: { type: "string" },
          modelAnswer: { type: "string" },
          keyPoints: { type: "array", items: { type: "string" } },
          topic: { type: "string" },
          maxPoints: { type: "integer" },
        },
      },
    },
    essay: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "rubric", "modelThesis", "topic"],
        properties: {
          prompt: { type: "string" },
          rubric: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "maxPoints"],
              properties: {
                name: { type: "string" },
                maxPoints: { type: "integer" },
              },
            },
          },
          modelThesis: { type: "string" },
          topic: { type: "string" },
        },
      },
    },
  },
} as const;

/* ---- Game Cards --------------------------------------------------------- */

/** Generate game-friendly multiple-choice cards from source material.
 *  Creates fresh SHORT cards — never converts existing flashcards.
 *  All answers are PLAIN TEXT so players can type them on a keyboard. */
export const gameCardsSystem = [
  "You create game-optimised multiple-choice study cards directly from source",
  "material. These cards power arcade learning games where a question/definition",
  "is displayed and the player must select the correct SHORT answer from moving",
  "elements (gates, asteroids, falling orbs, etc.) or type the answer.",
  "",
  "Create 8-15 cards covering the key concepts in the material.",
  "",
  "For each card provide:",
  "1. `question` — the full definition or clue the player reads. Keep KaTeX for",
  "   math display here (e.g. `$f'(x)$`, `$\\int v(t)dt$`). This can be long.",
  "2. `shortAnswer` — 1-4 PLAIN-TEXT words. The correct answer the player must",
  "   pick or type. NO LaTeX, NO markup, NO symbols — a normal person must be",
  "   able to type this on a keyboard. For math concepts use WORD DESCRIPTIONS:",
  '   "the derivative of f" -> `derivative` (NOT f\'(x) or dy/dx)',
  '   "integral of velocity" -> `displacement` (NOT ∫ v dt)',
  '   "function is rising" -> `increasing` (NOT f\'(x)>0)',
  '   "rate of change of position" -> `velocity` (NOT v(t)=s\'(t))',
  '   "point where derivative is zero" -> `critical point` (NOT f\'(x)=0)',
  '   "second derivative test" -> `concave up` or `concave down` (NOT f\'\'(x))',
  '   "evaluate limit from left" -> `left-hand limit` (NOT lim x->a⁻)',
  '   "area under velocity curve" -> `displacement` (NOT area under v(t))',
  "   DO NOT use: `4$x`, `dy/dx`, `f'(x)`, `\\frac{d}{dx}`, `∫v dt`, `lim_{x→a}`.",
  "   These contain backslashes, braces, or dollar signs — always use word names.",
  "3. `wrongChoices` — 5-7 other short PLAIN-TEXT answers from the SAME material.",
  "   Each must also be 1-4 words, typable, and plausibly confused with the",
  "   correct answer. Never use LaTeX or markup in wrong choices either.",
  "",
  "CRITICAL: every shortAnswer AND every wrongChoice must be something a person",
  "can type on a normal keyboard. Test: would a student know how to type it?",
  "If it contains backslashes, braces, or dollar signs, it's wrong.",
].join("\n");

export const gameCardsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "shortAnswer", "wrongChoices"],
        properties: {
          question: { type: "string" },
          shortAnswer: { type: "string", maxLength: 80 },
          wrongChoices: {
            type: "array",
            items: { type: "string", maxLength: 80 },
            minItems: 3,
            maxItems: 8,
          },
        },
      },
    },
  },
} as const;
