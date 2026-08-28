import { useCallback, useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { shuffle, prioritizeWeakCards, formatTime } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

interface CardPos { id: string; x: number; y: number; rotation: number; type: "term" | "def"; cardIdx: number; }

export default function ScatterMatch({ cards, onComplete, onCancel }: GameProps) {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [positions, setPositions] = useState<CardPos[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startTime = useRef(Date.now());
  const dragOffset = useRef({ x: 0, y: 0 });
  const PAIRS = 8;

  useEffect(() => {
    const picked = prioritizeWeakCards(cards).slice(0, Math.min(cards.length, PAIRS));
    if (picked.length < 3) return;
    setDeck(picked);
    scatterCards(picked);
  }, [cards]);

  function scatterCards(picked: Flashcard[]) {
    const w = containerRef.current?.clientWidth || 900;
    const h = containerRef.current?.clientHeight || 600;
    const margin = 40;
    const cardW = 220; // must match rendered width
    const cardH = 100;
    const availW = w - margin * 2;
    const availH = h - margin * 2;
    const cols = Math.max(2, Math.floor(availW / (cardW + 40)));
    const rowsNeeded = Math.ceil((picked.length * 2) / cols);
    const rowsMax = Math.max(1, Math.floor(availH / (cardH + 12)));
    const rows = Math.min(rowsNeeded, rowsMax);
    const cellW = availW / cols;
    const cellH = availH / rows;
    // Build cell centers, shuffle, then jitter within each cell.
    const cells: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({ x: margin + c * cellW, y: margin + r * cellH });
      }
    }
    const shuffled = shuffle(cells);
    const jitterW = Math.max(0, cellW - cardW);
    const jitterH = Math.max(0, cellH - cardH);
    const items: CardPos[] = [];
    for (let i = 0; i < picked.length; i++) {
      const termCell = shuffled[(i * 2) % shuffled.length];
      const defCell = shuffled[(i * 2 + 1) % shuffled.length];
      items.push({
        id: `term-${i}`,
        x: termCell.x + Math.random() * jitterW,
        y: termCell.y + Math.random() * jitterH,
        rotation: (Math.random() - 0.5) * 12,
        type: "term",
        cardIdx: i,
      });
      items.push({
        id: `def-${i}`,
        x: defCell.x + Math.random() * jitterW,
        y: defCell.y + Math.random() * jitterH,
        rotation: (Math.random() - 0.5) * 12,
        type: "def",
        cardIdx: i,
      });
    }
    setPositions(shuffle(items));
  }

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    if (matched.has(positions.find((p) => p.id === id)?.cardIdx ?? -1)) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragOffset.current.x;
    const y = e.clientY - rect.top - dragOffset.current.y;
    setPositions((prev) => prev.map((p) => (p.id === dragging ? { ...p, x, y, rotation: 0 } : p)));
    const dragged = positions.find((p) => p.id === dragging);
    if (!dragged) return;
    let closest: string | null = null;
    let closestDist = Infinity;
    for (const p of positions) {
      if (p.id === dragging || p.type === dragged.type) continue;
      if (matched.has(p.cardIdx)) continue;
      const dx = x + 130 - (p.x + 130);
      const dy = y + 40 - (p.y + 40);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 80 && dist < closestDist) { closestDist = dist; closest = p.id; }
    }
    setDragTarget(closest);
  };

  const handlePointerUp = useCallback(() => {
    if (!dragging || !dragTarget) { setDragging(null); setDragTarget(null); return; }
    const dragged = positions.find((p) => p.id === dragging);
    const target = positions.find((p) => p.id === dragTarget);
    if (!dragged || !target) return;
    if (dragged.cardIdx === target.cardIdx) {
      setMatched((m) => new Set(m).add(dragged.cardIdx));
      const newStreak = streak + 1;
      setStreak(newStreak);
      const mult = newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1;
      setScore((s) => s + 100 * mult);
      setMessage(`Matched! +${100 * mult}`);
      setTimeout(() => setMessage(null), 1200);
      if (matched.size + 1 >= deck.length) { setTimeout(() => setGameOver(true), 800); }
    } else {
      setStreak(0);
      setMessage("Try again");
      setTimeout(() => setMessage(null), 800);
    }
    setDragging(null); setDragTarget(null);
  }, [dragging, dragTarget, positions, streak, matched, deck]);

  useEffect(() => {
    if (gameOver && onComplete && deck.length > 0) {
      const now = Date.now();
      onComplete({ gameId: "scatter-match", noteId: cards[0]?.noteId ?? "", score, accuracy: deck.length > 0 ? matched.size / deck.length : 0, cardsSeen: deck.length, timePlayedMs: now - startTime.current, correctIds: [], wrongIds: [], playedAt: now });
    }
  }, [gameOver]);

  if (deck.length < 3) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 3 flashcards for Scatter Match.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-dim hover:bg-card-hover">Back</button>
        <div className="flex items-center gap-4 text-sm font-mono text-ink-dim">
          <span>Score: {score}</span>
          <span>Matched: {matched.size}/{deck.length}</span>
          <span>{formatTime(Date.now() - startTime.current)}</span>
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1 overflow-hidden" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} style={{ touchAction: "none" }}>
        {positions.map((pos) => {
          const isMatched = matched.has(pos.cardIdx);
          const isDragging = dragging === pos.id;
          const isTarget = dragTarget === pos.id;
          const card = deck[pos.cardIdx];
          if (!card) return null;
          return (
            <div key={pos.id} onPointerDown={(e) => handlePointerDown(e, pos.id)}
              className={`absolute cursor-grab rounded-xl border-2 px-4 py-3 shadow-md transition-shadow select-none active:cursor-grabbing ${isMatched ? "border-green-500/50 bg-green-500/10 opacity-70 scale-90" : isDragging ? "border-accent bg-card z-30 shadow-lg scale-105" : isTarget ? "border-accent/60 bg-accent/5 z-20" : pos.type === "term" ? "border-edge bg-card hover:border-accent/30" : "border-edge bg-card-muted hover:border-accent/30"}`}
              style={{ left: pos.x, top: pos.y, width: 220, transform: `rotate(${pos.rotation}deg)`, zIndex: isDragging ? 30 : isTarget ? 20 : 1, transition: isDragging ? "none" : "transform 0.3s ease, opacity 0.3s ease" }}>
              <div className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${pos.type === "term" ? "text-accent" : "text-ink-faint"}`}>{pos.type === "term" ? "Term" : "Definition"}</div>
              <div className={`text-sm ${pos.type === "term" ? "font-semibold text-ink" : "text-ink-dim"}`} dangerouslySetInnerHTML={{ __html: renderRichInline(pos.type === "term" ? card.front : card.back) }} />
            </div>
          );
        })}
        {message && <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-accent px-6 py-2 font-bold text-white shadow-lg">{message}</div>}
        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-app/80">
            <div className="flex flex-col items-center gap-4 rounded-card border border-edge bg-card p-8 shadow-2xl">
              <p className="font-display text-2xl font-bold text-ink">All Matched</p>
              <p className="text-ink-dim">Final Score: <span className="font-bold text-ink">{score}</span> &middot; {formatTime(Date.now() - startTime.current)}</p>
              <button onClick={onCancel} className="rounded-xl bg-accent px-8 py-3 font-display font-bold text-white hover:opacity-90">Back to Games</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
