import type { Engine } from "../engine/types";
import type { Flashcard, GameCard, Note } from "../types";
import { uuid } from "../ids";
import { gameCardsSystem, gameCardsSchema } from "../prompts";
import { studyContent } from "./index";

/**
 * Generate game-optimised short multiple-choice cards directly from a note's
 * source material. The LLM reads the full source text and creates fresh
 * game-friendly cards with short PLAIN-TEXT answers (no LaTeX) that players
 * can actually type on a keyboard.
 *
 * This is entirely separate from regular flashcard generation — the system
 * prompt enforces 1-4 word typable answers suitable for arcade games.
 */
export async function generateGameCards(
  engine: Engine,
  note: Note,
): Promise<GameCard[]> {
  const content = studyContent(note);
  if (!content.trim()) return [];

  const { cards } = await engine.structured<{
    cards: { question: string; shortAnswer: string; wrongChoices: string[] }[];
  }>({
    system: gameCardsSystem,
    messages: [{ role: "user", content }],
    schema: gameCardsSchema as unknown as Record<string, unknown>,
    schemaName: "gameCards",
    tier: "strong",
  });

  return sanitizeGameCards((cards || []).map((c) => ({
    id: uuid(),
    noteId: note.id,
    question: c.question || "",
    shortAnswer: c.shortAnswer || "",
    wrongChoices: (c.wrongChoices || []).slice(0, 8),
  })));
}

/** Reject cards whose shortAnswer or wrongChoices contain LaTeX markers.
 *  The AI sometimes ignores the plain-text instruction and still emits $, \, etc. */
const LATEX_RE = /[\$\\\{\}]/;

function sanitizeGameCards(cards: GameCard[]): GameCard[] {
  return cards.filter((c) => {
    if (!c.shortAnswer || LATEX_RE.test(c.shortAnswer)) return false;
    c.wrongChoices = (c.wrongChoices || []).filter((w) => w && !LATEX_RE.test(w));
    return c.wrongChoices.length >= 2;
  });
}

/** Convert GameCard[] to pseudo-Flashcard[] so existing game components work.
 *  front = shortAnswer (typable plain text, fits on moving elements).
 *  back = question (full definition/clue, shown in the DOM banner).
 *  Also returns a Map of card ID -> wrong choices for use by buildGameChoices. */
export function gameCardsToFlashcards(
  gcs: GameCard[],
  noteId: string,
): { cards: Flashcard[]; choices: Map<string, string[]> } {
  const choices = new Map<string, string[]>();
  const cards = gcs.map((gc) => {
    choices.set(gc.id, gc.wrongChoices);
    return {
      id: gc.id,
      noteId,
      front: gc.shortAnswer,
      back: gc.question,
      topic: "",
      due: 0,
      stability: 1,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: "new" as const,
    };
  });
  return { cards, choices };
}
