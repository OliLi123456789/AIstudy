import type { Flashcard } from "../types";

export interface GameResult {
  gameId: GameId;
  noteId: string;
  score: number;
  accuracy: number;
  cardsSeen: number;
  timePlayedMs: number;
  correctIds: string[];
  wrongIds: string[];
  playedAt: number;
}

export type GameId =
  | "scatter-match" | "speed-sort" | "answer-fall" | "gate-runner"
  | "hangman" | "castle-siege" | "flappy-study" | "pac-card"
  | "asteroids" | "lane-dodge" | "flashcard-tetris" | "hot-potato"
  | "jeopardy" | "city-defender";

export interface GameHighScore {
  id: string;
  gameId: GameId;
  noteId: string;
  highScore: number;
  bestAccuracy: number;
  bestTimeMs: number;
  totalPlays: number;
  updatedAt: number;
}

export interface GameMeta {
  id: GameId;
  name: string;
  emoji: string;
  description: string;
  minCards: number;
  category: "arcade" | "puzzle" | "speed" | "classic" | "strategy";
  /** Hidden games are kept for type compat but not shown in the picker. */
  hidden?: boolean;
}

export const GAME_META: Record<GameId, GameMeta> = {
  "scatter-match": { id: "scatter-match", name: "Scatter Match", emoji: "🃏", description: "Drag & drop to match terms with definitions", minCards: 6, category: "puzzle" },
  "speed-sort": { id: "speed-sort", name: "Speed Sort", emoji: "⚡", description: "Sort columns to pair terms with definitions against the clock", minCards: 5, category: "speed" },
  "answer-fall": { id: "answer-fall", name: "Answer Fall", emoji: "🪣", description: "Catch the right answer while dodging wrong ones", minCards: 6, category: "arcade" },
  "gate-runner": { id: "gate-runner", name: "Gate Runner", emoji: "🏃", description: "Run through the correct answer gate to survive", minCards: 6, category: "arcade" },
  "hangman": { id: "hangman", name: "Hangman", emoji: "💀", description: "Guess the term letter by letter before the hangman is complete", minCards: 3, category: "classic" },
  "castle-siege": { id: "castle-siege", name: "Castle Siege", emoji: "🏰", description: "Answer rapidly to spawn knights and conquer the enemy castle", minCards: 8, category: "strategy" },
  "flappy-study": { id: "flappy-study", name: "Flappy Study", emoji: "🐦", description: "Fly through the correct answer gap — Flappy Bird style", minCards: 6, category: "arcade" },
  "pac-card": { id: "pac-card", name: "Pac-Card", emoji: "🟡", description: "Navigate the maze and eat the correct answer pellet", minCards: 6, category: "arcade" },
  "asteroids": { id: "asteroids", name: "Asteroids", emoji: "🌑", description: "Shoot the asteroid with the right answer before it hits you", minCards: 6, category: "arcade" },
  "lane-dodge": { id: "lane-dodge", name: "Lane Dodge", emoji: "🚗", description: "Switch lanes to avoid obstacles using correct answers", minCards: 6, category: "arcade" },
  "flashcard-tetris": { id: "flashcard-tetris", name: "Flashcard Tetris", emoji: "🧱", description: "Type definitions to hard-drop blocks — Tetris with a twist", minCards: 5, category: "arcade", hidden: true },
  "hot-potato": { id: "hot-potato", name: "Hot Potato", emoji: "🥔", description: "Answer before the fuse burns out — how many can you survive?", minCards: 3, category: "speed" },
  "jeopardy": { id: "jeopardy", name: "Jeopardy!", emoji: "📺", description: "Classic quiz board with categories, Daily Doubles & Final Jeopardy", minCards: 30, category: "classic", hidden: true },
  "city-defender": { id: "city-defender", name: "City Defender", emoji: "🏙️", description: "Save your city from fires, floods & monsters by answering flashcards", minCards: 10, category: "strategy" },
};

export interface GameProps {
  cards: Flashcard[];
  /** Pre-generated wrong-answer choices keyed by card id.
   *  When available, arcade games use these AI-generated choices
   *  instead of picking random front values from other cards. */
  gameChoices?: Map<string, string[]>;
  onComplete: (result: GameResult) => void;
  onCancel: () => void;
}
