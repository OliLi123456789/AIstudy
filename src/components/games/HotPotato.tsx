import { useCallback, useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { shuffle, prioritizeWeakCards, fuzzyMatch, formatTime } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const INITIAL_TIME = 10;
const MIN_TIME = 3.5;
const WRONG_PENALTY = 2;
const SKIP_PENALTY = 3;

export default function HotPotato({ cards, onComplete, onCancel }: GameProps) {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME);
  const [roundTime, setRoundTime] = useState(INITIAL_TIME);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalWrong, setTotalWrong] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(Date.now());

  useEffect(() => { setDeck(shuffle(prioritizeWeakCards(cards))); }, [cards]);
  const current = deck[index];

  useEffect(() => {
    if (gameOver || !current) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 0.1) { setGameOver(true); return 0; }
        return Math.max(0, t - 0.1);
      });
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameOver, current, index]);

  useEffect(() => { inputRef.current?.focus(); }, [index]);

  const submit = useCallback(() => {
    if (!current || gameOver) return;
    const trimmed = answer.trim();
    if (!trimmed) return;
    if (fuzzyMatch(trimmed, current.front)) {
      const newStreak = streak + 1;
      const speedBonus = roundTime - timeLeft < 2 ? 50 : roundTime - timeLeft < 4 ? 25 : 0;
      const streakMult = newStreak >= 10 ? 3 : newStreak >= 5 ? 2 : 1;
      const points = (100 + speedBonus) * streakMult;
      setScore((s) => s + points);
      setStreak(newStreak);
      setTotalCorrect((c) => c + 1);
      setMessage("Correct! +" + points);
      const nextRoundTime = Math.max(MIN_TIME, INITIAL_TIME - index * 0.2);
      const bonus = newStreak > 0 && newStreak % 5 === 0 ? 3 : 0;
      setTimeout(() => {
        if (index + 1 >= deck.length) setGameOver(true);
        else {
          setIndex((i) => i + 1);
          setRoundTime(nextRoundTime);
          setTimeLeft(nextRoundTime + bonus);
          setAnswer("");
          setMessage(null);
        }
      }, 500);
    } else {
      setTotalWrong((w) => w + 1);
      setStreak(0);
      setTimeLeft((t) => Math.max(0, t - WRONG_PENALTY));
      setMessage("Wrong -2s");
      setAnswer("");
      setTimeout(() => setMessage(null), 700);
    }
  }, [answer, current, gameOver, index, streak, timeLeft, roundTime, deck.length]);

  const skip = useCallback(() => {
    if (!current || gameOver) return;
    setTimeLeft((t) => Math.max(0, t - SKIP_PENALTY));
    setStreak(0);
    setAnswer("");
    if (index + 1 >= deck.length) setGameOver(true);
    else {
      const nextTime = Math.max(MIN_TIME, INITIAL_TIME - (index + 1) * 0.2);
      setIndex((i) => i + 1);
      setRoundTime(nextTime);
      setTimeLeft(Math.max(0, nextTime - SKIP_PENALTY));
    }
  }, [current, gameOver, index, deck.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Enter") submit(); else if (e.key === "Escape") skip(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submit, skip]);

  useEffect(() => {
    if (gameOver) {
      const total = totalCorrect + totalWrong;
      onComplete?.({ gameId: "hot-potato", noteId: cards[0]?.noteId ?? "", score, accuracy: total > 0 ? totalCorrect / total : 0, cardsSeen: index + 1, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (deck.length === 0) {
    return <div className="flex h-full items-center justify-center"><div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  }

  const pct = timeLeft / roundTime;
  const urgent = timeLeft <= 3;
  // Fuse burn position: from 100 (full) to 0
  const fuseEndX = 20 + pct * 160;

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-zinc-900 via-zinc-900 to-orange-950/30">
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/20">Back</button>
        <div className="flex items-center gap-4 text-sm font-mono text-white/70">
          <span>Score: {score.toLocaleString()}</span>
          {streak >= 3 && <span className="text-amber-400">Streak x{streak >= 10 ? 3 : 2}</span>}
          <span>Card {index + 1}/{deck.length}</span>
          <span>{formatTime(Date.now() - startTime.current)}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
        {/* Bomb with burning fuse */}
        <div className={`relative ${urgent ? "animate-pulse" : ""}`}>
          <svg width="200" height="150" viewBox="0 0 200 150">
            {/* Fuse rope */}
            <path
              d={`M 100 55 Q 120 30 145 25 L ${fuseEndX} 22`}
              fill="none"
              stroke="#a16207"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Spark at fuse end */}
            {!gameOver && (
              <g>
                <circle cx={fuseEndX} cy={22} r={urgent ? 8 : 5} fill="#fbbf24">
                  <animate attributeName="r" values={`${urgent ? 8 : 5};${urgent ? 11 : 7};${urgent ? 8 : 5}`} dur="0.3s" repeatCount="indefinite" />
                </circle>
                <circle cx={fuseEndX} cy={22} r={urgent ? 4 : 2.5} fill="#fef08a" />
              </g>
            )}
            {/* Bomb body */}
            <circle cx="100" cy="95" r="48" fill={gameOver ? "#7f1d1d" : urgent ? "#292524" : "#18181b"} stroke="#3f3f46" strokeWidth="3" />
            {/* Shine */}
            <ellipse cx="82" cy="75" rx="14" ry="9" fill="rgba(255,255,255,0.12)" transform="rotate(-30 82 75)" />
            {/* Cap */}
            <rect x="90" y="42" width="20" height="14" rx="4" fill="#3f3f46" />
            {/* Face */}
            {gameOver ? (
              <>
                <text x="100" y="102" textAnchor="middle" fontSize="28" fill="#f87171">✕</text>
              </>
            ) : (
              <>
                <circle cx="86" cy="90" r="4" fill="#71717a" />
                <circle cx="114" cy="90" r="4" fill="#71717a" />
                <path d="M 88 108 Q 100 ${urgent ? 100 : 114} 112 108" stroke="#71717a" strokeWidth="3" fill="none" strokeLinecap="round" />
              </>
            )}
          </svg>
        </div>

        {/* Timer bar */}
        <div className="h-3 w-full max-w-md overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: `${Math.max(0, pct * 100)}%`,
              background: urgent ? "linear-gradient(90deg,#ef4444,#f97316)" : pct < 0.5 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#22c55e,#4ade80)",
            }}
          />
        </div>
        <p className={`font-mono text-2xl font-bold ${urgent ? "text-red-400" : "text-white/90"}`}>{timeLeft.toFixed(1)}s</p>

        {/* Question with KaTeX */}
        <div className="max-w-lg rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-center backdrop-blur">
          <div className="text-lg text-white/90 italic" dangerouslySetInnerHTML={{ __html: renderRichInline(current?.back ?? "") }} />
          <p className="mt-2 text-xs uppercase tracking-wider text-white/40">Type the matching term</p>
        </div>

        {/* Input */}
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={gameOver}
            placeholder="Type the term..."
            className="w-72 rounded-xl border border-white/20 bg-black/50 px-4 py-3 text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={submit} disabled={gameOver || !answer.trim()} className="rounded-xl bg-amber-500 px-6 py-3 font-bold text-black hover:bg-amber-400 disabled:opacity-40">Go</button>
          <button onClick={skip} disabled={gameOver} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/10">Skip</button>
        </div>

        {message && (
          <p className={`text-lg font-semibold ${message.startsWith("Correct") ? "text-green-400" : "text-red-400"}`}>{message}</p>
        )}

        {gameOver && (
          <div className="flex flex-col items-center gap-4">
            <p className="font-display text-2xl font-bold text-white">Time's Up</p>
            <p className="text-white/70 text-center">
              Survived <span className="font-bold text-white">{index + 1}</span> rounds &middot;{" "}
              <span className="font-bold text-white">{score.toLocaleString()}</span> pts &middot;{" "}
              {formatTime(Date.now() - startTime.current)}
            </p>
            <button onClick={onCancel} className="rounded-xl bg-amber-500 px-8 py-3 font-display font-bold text-black hover:bg-amber-400">Back to Games</button>
          </div>
        )}
      </div>
    </div>
  );
}
