import type { Flashcard } from "../types";

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickRandom<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

export function pickWrongAnswers(correct: Flashcard, allCards: readonly Flashcard[], count: number): string[] {
  return shuffle(allCards.filter((c) => c.id !== correct.id)).slice(0, count).map((c) => c.back);
}

export function levenshtein(a: string, b: string): number {
  const an = a.length, bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = new Uint16Array(bn + 1);
  for (let j = 0; j <= bn; j++) matrix[j] = j;
  for (let i = 1; i <= an; i++) {
    let prev = matrix[0];
    matrix[0] = i;
    for (let j = 1; j <= bn; j++) {
      const temp = matrix[j];
      matrix[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, matrix[j], matrix[j - 1]);
      prev = temp;
    }
  }
  return matrix[bn];
}

export function fuzzyMatch(userAnswer: string, expected: string, maxDistance = 2): boolean {
  const a = userAnswer.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  if (a === b) return true;
  if (maxDistance <= 0) return false;
  if (b.length <= 3) return a === b;
  return levenshtein(a, b) <= maxDistance;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function prioritizeWeakCards(cards: readonly Flashcard[]): Flashcard[] {
  if (cards.length === 0) return [];
  const stateOrder: Record<string, number> = { new: 0, learning: 1, relearning: 2, review: 3 };
  return [...cards].sort((a, b) => {
    const sa = stateOrder[a.state] ?? 4;
    const sb = stateOrder[b.state] ?? 4;
    if (sa !== sb) return sa - sb;
    return b.difficulty - a.difficulty;
  });
}

export function buildChoices(correct: Flashcard, allCards: readonly Flashcard[], totalOptions: number): { text: string; correct: boolean }[] {
  const wrongs = pickWrongAnswers(correct, allCards, totalOptions - 1);
  const options = [{ text: correct.back, correct: true }, ...wrongs.map((text) => ({ text, correct: false }))];
  return shuffle(options).slice(0, totalOptions);
}

/**
 * Build short-term choices for fast-paced arcade games.
 * Uses the flashcard FRONT (term) as choices so text fits on moving
 * game elements. The question displayed is the BACK (definition).
 */
export function buildTermChoices(correct: Flashcard, allCards: readonly Flashcard[], totalOptions: number): { text: string; correct: boolean }[] {
  const others = allCards.filter((c) => c.id !== correct.id);
  const wrongFronts = shuffle(others).slice(0, totalOptions - 1).map((c) => c.front);
  const options = [{ text: correct.front, correct: true }, ...wrongFronts.map((text) => ({ text, correct: false }))];
  return shuffle(options).slice(0, totalOptions);
}

/**
 * Build choices from pre-generated game card wrong-answer data.
 * Uses the AI's curated wrong choices (plausible, same-topic) instead of
 * random fronts from other cards. Pools wrongs from ALL game cards for
 * maximum variety. Falls back to buildTermChoices if no map is provided.
 */
export function buildGameChoices(
  correct: Flashcard,
  allCards: readonly Flashcard[],
  gameChoices: Map<string, string[]> | undefined,
  totalOptions: number,
): { text: string; correct: boolean }[] {
  // Pool wrong choices from all cards (deduped, shuffled) for maximum variety
  const allWrongs = collectAllWrongs(allCards, gameChoices, correct.id);
  if (allWrongs.length > 0) {
    const options = [
      { text: correct.front, correct: true },
      ...allWrongs.slice(0, totalOptions - 1).map((text) => ({ text, correct: false })),
    ];
    return shuffle(options).slice(0, totalOptions);
  }
  // Fallback
  return buildTermChoices(correct, allCards, totalOptions);
}

/** Collect all wrong choices from all game cards, deduped and shuffled.
 *  Useful when arcade games need many wrong answers and shouldn't reuse
 *  the same few. Falls back to card fronts if no gameChoices map. */
export function collectAllWrongs(
  allCards: readonly Flashcard[],
  gameChoices: Map<string, string[]> | undefined,
  excludeCardId?: string,
): string[] {
  const wrongs = new Set<string>();
  if (gameChoices) {
    for (const [id, choices] of gameChoices) {
      if (id === excludeCardId) continue;
      for (const w of choices) {
        if (w && w.length <= 80) wrongs.add(w);
      }
    }
  }
  // Also include fronts from other cards as additional fallback variety
  for (const c of allCards) {
    if (c.id === excludeCardId) continue;
    if (c.front && c.front.length <= 80) wrongs.add(c.front);
  }
  return shuffle([...wrongs]);
}

/** Truncate text to maxLen characters, adding "…" if cut. */
export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "…";
}

/** Strip LaTeX markup so typed answers can be compared against plain text.
 *  Removes $...$, $$...$$, \(...\), \[...\] delimiters and their contents. */
export function stripLatex(text: string): string {
  return text
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$]*?)\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .trim();
}

export function seededRandom(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
