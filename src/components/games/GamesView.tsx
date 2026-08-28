import { useEffect, useState } from "react";
import { Gamepad2, Loader2, Trophy } from "lucide-react";
import { useApp } from "../../lib/app";
import type { Flashcard, GameCard, Note } from "../../lib/types";
import type { GameId, GameResult, GameHighScore } from "../../lib/games/types";
import { GAME_META } from "../../lib/games/types";
import { loadAllScores, saveResult } from "../../lib/games/scoring";
import { generateGameCards, gameCardsToFlashcards } from "../../lib/generation/gameCards";
import Hangman from "./Hangman";
import HotPotato from "./HotPotato";
import SpeedSort from "./SpeedSort";
import ScatterMatch from "./ScatterMatch";
import LaneDodge from "./LaneDodge";
import Jeopardy from "./Jeopardy";
import AnswerFall from "./AnswerFall";
import GateRunner from "./GateRunner";
import FlappyStudy from "./FlappyStudy";
import Asteroids from "./Asteroids";
import PacCard from "./PacCard";
import FlashcardTetris from "./FlashcardTetris";
import CastleSiege from "./CastleSiege";
import CityDefender from "./CityDefender";

export default function GamesView({ note }: { note: Note }) {
  const { repo, engine } = useApp();
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [gameCards, setGameCards] = useState<GameCard[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [scores, setScores] = useState<GameHighScore[]>([]);
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  useEffect(() => {
    if (!repo) return;
    (async () => {
      const cs = await repo.cardsFor(note.id);
      setCards(cs);
      // Also load any previously-generated game cards
      try { setGameCards(await repo.gameCardsFor(note.id)); } catch { setGameCards([]); }
      setScores(await loadAllScores((repo as any).store, note.id));
    })();
  }, [repo, note.id]);

  /** Arcade games need short answers on moving elements. Lazy-generate game cards. */
  const needsGameCards = (id: GameId) =>
    ["gate-runner","answer-fall","asteroids","lane-dodge","flappy-study","pac-card","castle-siege"].includes(id);

  const handlePlay = async (id: GameId) => {
    if (!cards || cards.length < GAME_META[id].minCards) return;
    // If this game type needs short game cards and we don't have them yet...
    if (needsGameCards(id) && (!gameCards || gameCards.length === 0)) {
      if (!engine) { setActiveGame(id); return; } // fallback: use regular cards
      setGenerating(true);
      setGenError(null);
      try {
        const gcs = await generateGameCards(engine, note);
        if (repo) await repo.putGameCards(gcs);
        setGameCards(gcs);
      } catch (e) {
        setGenError(e instanceof Error ? e.message : "Failed to generate game cards");
        setGenerating(false);
        return;
      }
      setGenerating(false);
    }
    setActiveGame(id);
  };

  // Build the cards and choices map to pass to the active game
  function buildGameData(): { cards: Flashcard[]; choices?: Map<string, string[]> } {
    if (!cards) return { cards: [] };
    if (activeGame && needsGameCards(activeGame) && gameCards && gameCards.length > 0) {
      const { cards: gCards, choices } = gameCardsToFlashcards(gameCards, note.id);
      return { cards: gCards, choices };
    }
    return { cards };
  }

  const handleComplete = async (result: GameResult) => {
    const store = (repo as any)?.store;
    if (store) {
      const updated = await saveResult(store, { ...result, noteId: note.id });
      setScores((prev) => {
        const filtered = prev.filter((s) => s.id !== updated.id);
        return [...filtered, updated];
      });
    }
  };

  if (generating) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-4 rounded-card border border-edge bg-card p-8 shadow-2xl">
          <Loader2 className="size-8 animate-spin text-accent" />
          <p className="text-ink-dim text-lg">Generating game cards...</p>
          <p className="text-sm text-ink-faint">Creating short answers for fast-paced play. This only happens once.</p>
        </div>
      </div>
    );
  }

  if (genError) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-4 rounded-card border border-edge bg-card p-8 shadow-2xl">
          <p className="text-red-500 font-semibold">Failed to generate game cards</p>
          <p className="text-sm text-ink-dim">{genError}</p>
          <button onClick={() => { setGenError(null); setActiveGame(null); }} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back to Games</button>
        </div>
      </div>
    );
  }

  if (activeGame && cards) {
    const { cards: gCards, choices: gChoices } = buildGameData();
    const minCards = GAME_META[activeGame].minCards;
    const gameCards2 = gCards.length >= minCards ? gCards : gCards;
    const gc = gChoices;
    switch (activeGame) {
      case "hangman": return <div className="fixed inset-0 z-40 bg-app"><Hangman cards={gameCards2} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "hot-potato": return <div className="fixed inset-0 z-40 bg-app"><HotPotato cards={gameCards2} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "speed-sort": return <div className="fixed inset-0 z-40 bg-app"><SpeedSort cards={gameCards2} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "scatter-match": return <div className="fixed inset-0 z-40 bg-app"><ScatterMatch cards={gameCards2} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "lane-dodge": return <div className="fixed inset-0 z-40 bg-app"><LaneDodge cards={gameCards2} gameChoices={gc} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "jeopardy": return <div className="fixed inset-0 z-40 bg-app"><Jeopardy cards={gameCards2} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "answer-fall": return <div className="fixed inset-0 z-40 bg-app"><AnswerFall cards={gameCards2} gameChoices={gc} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "gate-runner": return <div className="fixed inset-0 z-40 bg-app"><GateRunner cards={gameCards2} gameChoices={gc} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "flappy-study": return <div className="fixed inset-0 z-40 bg-app"><FlappyStudy cards={gameCards2} gameChoices={gc} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "asteroids": return <div className="fixed inset-0 z-40 bg-app"><Asteroids cards={gameCards2} gameChoices={gc} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "pac-card": return <div className="fixed inset-0 z-40 bg-app"><PacCard cards={gameCards2} gameChoices={gc} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "flashcard-tetris": return <div className="fixed inset-0 z-40 bg-app"><FlashcardTetris cards={gameCards2} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "castle-siege": return <div className="fixed inset-0 z-40 bg-app"><CastleSiege cards={gameCards2} gameChoices={gc} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
      case "city-defender": return <div className="fixed inset-0 z-40 bg-app"><CityDefender cards={gameCards2} onComplete={handleComplete} onCancel={() => setActiveGame(null)} /></div>;
    }
  }

  const categories = [...new Set(Object.values(GAME_META).map((g) => g.category))];
  const scoreMap = new Map(scores.map((s) => [s.gameId, s]));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 py-6">
        <h1 className="font-display text-3xl font-bold text-ink flex items-center gap-3">
          <Gamepad2 className="size-7 text-accent" />
          Study Games
        </h1>
        <p className="mt-2 text-ink-dim">Learn faster by playing. All games use your flashcards — no extra setup needed.</p>
        {cards && <p className="mt-1 text-sm text-ink-faint">{cards.length} flashcards available</p>}
      </div>
      {cards === null ? (
        <div className="flex flex-1 items-center justify-center"><div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>
      ) : cards.length < 3 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <p className="text-ink-dim text-lg">You need at least 3 flashcards to play games. Generate some flashcards first!</p>
        </div>
      ) : (
        <div className="flex-1 px-6 pb-8">
          {categories.map((cat) => {
            const catGames = Object.values(GAME_META).filter((g) => g.category === cat && !g.hidden);
            return (
              <div key={cat} className="mb-8">
                <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-ink-faint">{cat}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {catGames.map((game) => {
                    const disabled = cards.length < game.minCards;
                    const hs = scoreMap.get(game.id);
                    return (
                      <button key={game.id} onClick={() => handlePlay(game.id)} disabled={disabled}
                        className={`rounded-card border p-4 text-left transition ${disabled ? "cursor-not-allowed border-edge bg-panel/50 opacity-50" : "border-edge bg-card hover:border-accent/30 hover:shadow-soft"}`}>
                        <div className="text-3xl">{game.emoji}</div>
                        <div className="mt-2 font-semibold text-ink">{game.name}</div>
                        <div className="mt-1 text-xs text-ink-faint leading-relaxed">{game.description}</div>
                        {disabled && <div className="mt-2 text-xs text-amber-500">Needs {game.minCards} cards (have {cards.length})</div>}
                        {hs && <div className="mt-2 flex items-center gap-1 text-xs text-accent"><Trophy className="size-3" /><span>Best: {hs.highScore.toLocaleString()}</span></div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
