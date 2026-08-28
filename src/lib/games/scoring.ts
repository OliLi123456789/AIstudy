import type { Store } from "../db";
import { COLLECTIONS } from "../db";
import type { GameHighScore, GameId, GameResult } from "./types";

function scoreKey(gameId: GameId, noteId: string): string {
  return `${gameId}:${noteId}`;
}

export async function loadHighScore(store: Store, gameId: GameId, noteId: string): Promise<GameHighScore | null> {
  return store.get<GameHighScore>(COLLECTIONS.gameScores, scoreKey(gameId, noteId)).then((r) => r ?? null);
}

export async function loadAllScores(store: Store, noteId: string): Promise<GameHighScore[]> {
  return store.where<GameHighScore>(COLLECTIONS.gameScores, { noteId });
}

export async function saveResult(store: Store, result: GameResult): Promise<GameHighScore> {
  const id = scoreKey(result.gameId, result.noteId);
  const existing = await store.get<GameHighScore>(COLLECTIONS.gameScores, id);
  const now = Date.now();
  const entry: GameHighScore = {
    id, gameId: result.gameId, noteId: result.noteId,
    highScore: existing ? Math.max(existing.highScore, result.score) : result.score,
    bestAccuracy: existing ? Math.max(existing.bestAccuracy, result.accuracy) : result.accuracy,
    bestTimeMs: existing ? Math.min(existing.bestTimeMs || Infinity, result.timePlayedMs) : result.timePlayedMs,
    totalPlays: (existing?.totalPlays ?? 0) + 1,
    updatedAt: now,
  };
  await store.put(COLLECTIONS.gameScores, entry);
  return entry;
}
