import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { shuffle, prioritizeWeakCards, formatTime } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";
import { GripVertical } from "lucide-react";

export default function SpeedSort({ cards, onComplete, onCancel }: GameProps) {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [termOrder, setTermOrder] = useState<number[]>([]);
  const [defOrder, setDefOrder] = useState<number[]>([]);
  const [dragging, setDragging] = useState<{ side: "term" | "def"; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ side: "term" | "def"; index: number } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalPairs, setTotalPairs] = useState(0);
  const roundStart = useRef(Date.now());
  const gameStart = useRef(Date.now());
  const PAIRS_PER_ROUND = 6;

  useEffect(() => {
    const picked = prioritizeWeakCards(cards).slice(0, Math.min(cards.length, 20));
    setDeck(picked);
    newRound(picked, 0);
  }, [cards]);

  function newRound(allCards: Flashcard[], r: number) {
    const start = (r * PAIRS_PER_ROUND) % Math.max(allCards.length, PAIRS_PER_ROUND);
    const slice = [...allCards, ...allCards].slice(start, start + PAIRS_PER_ROUND);
    if (slice.length < 3) return setGameOver(true);
    const indices = slice.map((_, i) => i);
    setTermOrder([...indices]);
    setDefOrder(shuffle([...indices]));
    setSubmitted(false);
    setDragging(null);
    setDragOver(null);
    roundStart.current = Date.now();
  }

  const currentCards = useMemo(() => {
    const start = (round * PAIRS_PER_ROUND) % Math.max(deck.length, PAIRS_PER_ROUND);
    return [...deck, ...deck].slice(start, start + PAIRS_PER_ROUND);
  }, [deck, round]);

  const handleDragStart = (side: "term" | "def", index: number) => { setDragging({ side, index }); };
  const handleDragOver = (e: React.DragEvent, side: "term" | "def", index: number) => { e.preventDefault(); setDragOver({ side, index }); };
  const handleDrop = (side: "term" | "def", targetIndex: number) => {
    if (!dragging) return;
    if (dragging.side === side) {
      const order = side === "term" ? [...termOrder] : [...defOrder];
      const [moved] = order.splice(dragging.index, 1);
      order.splice(targetIndex, 0, moved);
      if (side === "term") setTermOrder(order); else setDefOrder(order);
    }
    setDragging(null); setDragOver(null);
  };

  const handleSubmit = useCallback(() => {
    let correct = 0;
    for (let i = 0; i < currentCards.length; i++) { if (termOrder[i] === defOrder[i]) correct++; }
    const timeMs = Date.now() - roundStart.current;
    const timeBonus = timeMs < 15000 ? 500 : timeMs < 30000 ? 250 : 0;
    const roundScore = correct * 100 + timeBonus + (correct === currentCards.length ? 500 : 0);
    setScore((s) => s + roundScore);
    setTotalCorrect((c) => c + correct);
    setTotalPairs((p) => p + currentCards.length);
    setSubmitted(true);
  }, [currentCards, termOrder, defOrder]);

  const nextRound = useCallback(() => {
    if ((round + 1) * PAIRS_PER_ROUND >= deck.length && deck.length > 0) { setGameOver(true); }
    else { setRound((r) => r + 1); newRound(deck, round + 1); }
  }, [round, deck]);

  useEffect(() => {
    if (gameOver && onComplete && deck.length > 0) {
      const now = Date.now();
      onComplete({ gameId: "speed-sort", noteId: cards[0]?.noteId ?? "", score, accuracy: totalPairs > 0 ? totalCorrect / totalPairs : 0, cardsSeen: totalPairs, timePlayedMs: now - gameStart.current, correctIds: [], wrongIds: [], playedAt: now });
    }
  }, [gameOver]);

  if (deck.length < 3) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 3 flashcards to play Speed Sort.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back to Games</button></div>;
  }

  const dragOverClass = (side: string, idx: number) => dragOver?.side === side && dragOver.index === idx ? "border-accent bg-accent/5" : "border-transparent";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-dim hover:bg-card-hover">Back</button>
        <div className="flex items-center gap-4 text-sm font-mono text-ink-dim">
          <span>Score: {score}</span>
          <span>Round {round + 1}</span>
          <span>{formatTime(Date.now() - gameStart.current)}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center gap-6 px-8 pb-8">
        <p className="text-center text-ink-dim">Drag rows to pair each <strong>term</strong> (left) with its correct <strong>definition</strong> (right).</p>
        <div className="flex w-full max-w-3xl gap-8">
          <div className="flex-1 space-y-2">
            <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-ink-faint">Terms</h3>
            {termOrder.map((cardIdx, rowIdx) => (
              <div key={`term-${cardIdx}`} draggable onDragStart={() => handleDragStart("term", rowIdx)} onDragOver={(e) => handleDragOver(e, "term", rowIdx)} onDrop={() => handleDrop("term", rowIdx)} onDragEnd={() => { setDragging(null); setDragOver(null); }}
                className={`flex cursor-grab items-center gap-2 rounded-xl border-2 bg-card px-4 py-3 transition active:cursor-grabbing ${dragOverClass("term", rowIdx)} ${submitted && termOrder[rowIdx] === defOrder[rowIdx] ? "border-green-500/30 bg-green-500/5" : submitted && termOrder[rowIdx] !== defOrder[rowIdx] ? "border-red-500/30 bg-red-500/5" : ""}`}>
                <GripVertical className="size-4 shrink-0 text-ink-faint" />
                <span className="text-sm font-semibold text-ink" dangerouslySetInnerHTML={{ __html: renderRichInline(currentCards[cardIdx]?.front ?? "") }} />
              </div>
            ))}
          </div>
          <div className="flex-1 space-y-2">
            <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wider text-ink-faint">Definitions</h3>
            {defOrder.map((cardIdx, rowIdx) => (
              <div key={`def-${cardIdx}`} draggable onDragStart={() => handleDragStart("def", rowIdx)} onDragOver={(e) => handleDragOver(e, "def", rowIdx)} onDrop={() => handleDrop("def", rowIdx)} onDragEnd={() => { setDragging(null); setDragOver(null); }}
                className={`flex cursor-grab items-center gap-2 rounded-xl border-2 bg-card px-4 py-3 transition active:cursor-grabbing ${dragOverClass("def", rowIdx)} ${submitted && termOrder[rowIdx] === defOrder[rowIdx] ? "border-green-500/30 bg-green-500/5" : submitted && termOrder[rowIdx] !== defOrder[rowIdx] ? "border-red-500/30 bg-red-500/5" : ""}`}>
                <GripVertical className="size-4 shrink-0 text-ink-faint" />
                <span className="text-sm text-ink-dim" dangerouslySetInnerHTML={{ __html: renderRichInline(currentCards[cardIdx]?.back ?? "") }} />
              </div>
            ))}
          </div>
        </div>
        {!submitted ? (
          <button onClick={handleSubmit} className="rounded-xl bg-accent px-8 py-3 font-display font-bold text-white hover:opacity-90">Check Answers</button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-lg font-semibold text-ink">{termOrder.filter((t, i) => t === defOrder[i]).length} / {currentCards.length} correct</p>
            {gameOver ? null : <button onClick={nextRound} className="rounded-xl bg-accent px-8 py-3 font-display font-bold text-white hover:opacity-90">Next Round</button>}
          </div>
        )}
        {gameOver && (
          <div className="flex flex-col items-center gap-4">
            <p className="font-display text-2xl font-bold text-ink">Game Over</p>
            <p className="text-ink-dim">Final Score: <span className="font-bold text-ink">{score}</span> &middot; {totalCorrect}/{totalPairs} correct &middot; {formatTime(Date.now() - gameStart.current)}</p>
            <button onClick={onCancel} className="rounded-xl bg-accent px-8 py-3 font-display font-bold text-white hover:opacity-90">Back to Games</button>
          </div>
        )}
      </div>
    </div>
  );
}
