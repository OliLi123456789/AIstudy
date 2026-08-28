import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, formatTime, buildGameChoices } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const LANES = 3;
const LIVES = 5;

interface Row { question: Flashcard; safeLane: number; wrongs: string[]; id: number; }

export default function LaneDodge({ cards, gameChoices, onComplete, onCancel }: GameProps) {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [lane, setLane] = useState(1);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [streak, setStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState(0); // 0-100 how far the row has traveled
  const rowIdRef = useRef(0);
  const speedRef = useRef(4.5);
  const animRef = useRef(0);
  const startTime = useRef(Date.now());
  const lastTime = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cards.length < 4) return;
    const picked = prioritizeWeakCards(cards);
    setDeck(picked);
    const first = makeRow(picked);
    setRows([first]);
    lastTime.current = performance.now();
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [cards]);

  function makeRow(pool: Flashcard[]): Row {
    const q = pool[Math.floor(Math.random() * pool.length)];
    const safeLane = Math.floor(Math.random() * LANES);
    const wrongs = buildGameChoices(q, pool, gameChoices, LANES).filter((o: { correct: boolean }) => !o.correct).map((o: { text: string }) => o.text).slice(0, LANES - 1);
    return { question: q, safeLane, wrongs, id: rowIdRef.current++ };
  }

  function tick(t: number) {
    const dt = Math.min(t - lastTime.current, 100);
    lastTime.current = t;
    speedRef.current = Math.max(1.8, 4.5 - score / 3500);
    setProgress((p) => {
      const np = p + (dt / (speedRef.current * 1000)) * 100;
      if (np >= 100) {
        // Row reached the player
        const row = rows[0];
        if (row) {
          if (row.safeLane === lane) {
            setScore((sc) => sc + 100 + streak * 20);
            setStreak((x) => x + 1);
          } else {
            setLives((l) => { const nl = l - 1; if (nl <= 0) setGameOver(true); return nl; });
            setStreak(0);
          }
        }
        const next = makeRow(deck.length > 0 ? deck : cards);
        setRows([next]);
        return 0;
      }
      return np;
    });
    if (!gameOver) animRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a") { setLane((l) => Math.max(0, l - 1)); e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "d") { setLane((l) => Math.min(LANES - 1, l + 1)); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "lane-dodge", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: 0, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 4) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 4 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  const row = rows[0];
  const laneTexts: string[] = [];
  if (row) {
    const arr = [...row.wrongs];
    arr.splice(row.safeLane, 0, row.question.front);
    for (let i = 0; i < LANES; i++) laneTexts.push(arr[i] ?? "");
  }
  const rowTop = Math.min(88, 10 + progress * 0.78); // travels from 10% to 88% of container

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="flex items-center justify-between px-6 py-3">
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/20">Back</button>
        <div className="flex items-center gap-4 text-sm font-mono text-white/70">
          <span>Score: {score}</span>
          {streak >= 3 && <span className="text-amber-400">x{streak}</span>}
          <span className="flex gap-1">
            {Array.from({ length: LIVES }).map((_, i) => (
              <span key={i} className={i < lives ? "text-red-500" : "text-zinc-600"}>●</span>
            ))}
          </span>
          <span>{formatTime(Date.now() - startTime.current)}</span>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {/* Question banner with KaTeX */}
        {row && (
          <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
            <div className="rounded-xl border border-indigo-400/40 bg-black/70 px-6 py-2 shadow-xl backdrop-blur">
              <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(row.question.back) }} />
            </div>
          </div>
        )}

        {/* Road lanes */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: LANES }).map((_, i) => (
            <div key={i} className={`relative flex-1 border-r border-dashed border-white/15 transition-colors ${i === lane ? "bg-indigo-500/10" : ""}`}>
              {/* Road texture */}
              <div className="absolute inset-0" style={{
                backgroundImage: "repeating-linear-gradient(to bottom, transparent 0px, transparent 28px, rgba(255,255,255,0.07) 28px, rgba(255,255,255,0.07) 32px)",
                backgroundPositionY: `${(progress * 3) % 32}px`,
              }} />
            </div>
          ))}
        </div>

        {/* Answer barriers */}
        {row && laneTexts.map((text, i) => (
          <div
            key={`${row.id}-${i}`}
            className={`absolute rounded-xl border-2 px-3 py-2.5 text-center shadow-lg transition-transform ${
              i === row.safeLane
                ? "border-green-400/70 bg-green-950/80"
                : "border-red-400/60 bg-red-950/80"
            }`}
            style={{
              left: `${(i * 100) / LANES + 100 / LANES / 2}%`,
              top: `${rowTop}%`,
              transform: "translate(-50%, -50%)",
              width: `${100 / LANES - 6}%`,
              zIndex: 10,
            }}
          >
            <span className="text-xs font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(text) }} />
          </div>
        ))}

        {/* Player car */}
        <div
          className="absolute bottom-10 z-10 transition-all duration-150 ease-out"
          style={{ left: `${(lane * 100) / LANES + 100 / LANES / 2}%`, transform: "translateX(-50%)" }}
        >
          <div className="relative">
            {/* Headlights */}
            <div className="absolute -top-3 left-1/2 h-6 w-14 -translate-x-1/2 rounded-full bg-yellow-200/30 blur-md" />
            {/* Car body */}
            <div className="relative mx-auto h-16 w-11 rounded-t-xl rounded-b-md bg-gradient-to-b from-indigo-400 to-indigo-700 shadow-lg shadow-indigo-500/40">
              {/* Windshield */}
              <div className="absolute left-1/2 top-2 h-5 w-7 -translate-x-1/2 rounded-md bg-sky-200/80" />
              {/* Wheels */}
              <div className="absolute -left-1.5 top-3 h-4 w-2 rounded bg-zinc-800" />
              <div className="absolute -right-1.5 top-3 h-4 w-2 rounded bg-zinc-800" />
              <div className="absolute -left-1.5 bottom-2 h-4 w-2 rounded bg-zinc-800" />
              <div className="absolute -right-1.5 bottom-2 h-4 w-2 rounded bg-zinc-800" />
            </div>
          </div>
        </div>

        {/* Controls hint */}
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/40">Arrow keys / A D or click a lane</p>

        {/* Click zones */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: LANES }).map((_, i) => (
            <button key={i} onClick={() => setLane(i)} className="flex-1" aria-label={`Lane ${i + 1}`} />
          ))}
        </div>

        {gameOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
              <p className="font-display text-2xl font-bold text-ink">Crashed Out</p>
              <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
              <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
