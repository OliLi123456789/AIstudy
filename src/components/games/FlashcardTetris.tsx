import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, fuzzyMatch, formatTime, stripLatex } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const COLS = 10;
const ROWS = 20;
const CELL = 26;
const SHAPES: { cells: number[][]; color: string }[] = [
  { cells: [[1,1,1,1]], color: "#22d3ee" },
  { cells: [[1,1],[1,1]], color: "#facc15" },
  { cells: [[0,1,0],[1,1,1]], color: "#c084fc" },
  { cells: [[1,0,0],[1,1,1]], color: "#60a5fa" },
  { cells: [[0,0,1],[1,1,1]], color: "#fb923c" },
  { cells: [[1,1,0],[0,1,1]], color: "#4ade80" },
  { cells: [[0,1,1],[1,1,0]], color: "#f87171" },
];

export default function FlashcardTetris({ cards, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [currentTerm, setCurrentTerm] = useState<Flashcard | null>(null);
  const startTime = useRef(Date.now());

  const s = useRef({
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null) as (string | null)[]),
    piece: { cells: SHAPES[0].cells, color: SHAPES[0].color, x: 3, y: 0 },
    next: SHAPES[1],
    deck: [] as Flashcard[], cardIdx: 0,
    animId: 0, dropTimer: 0, dropInterval: 42, frame: 0,
  });

  useEffect(() => {
    if (cards.length < 3) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    newPiece();
    newPiece();
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function newPiece() {
    const st = s.current;
    st.piece = { cells: st.next.cells, color: st.next.color, x: Math.floor(COLS / 2) - 1, y: 0 };
    st.next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const card = st.deck[st.cardIdx % st.deck.length];
    st.cardIdx++;
    setCurrentTerm(card);
    if (collides(st.piece.cells, st.piece.x, st.piece.y)) setGameOver(true);
  }

  function collides(cells: number[][], px: number, py: number): boolean {
    const st = s.current;
    for (let r = 0; r < cells.length; r++) {
      for (let c = 0; c < cells[r].length; c++) {
        if (!cells[r][c]) continue;
        const nx = px + c, ny = py + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && st.grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function lockPiece() {
    const st = s.current;
    for (let r = 0; r < st.piece.cells.length; r++) {
      for (let c = 0; c < st.piece.cells[r].length; c++) {
        if (st.piece.cells[r][c] && st.piece.y + r >= 0) {
          st.grid[st.piece.y + r][st.piece.x + c] = st.piece.color;
        }
      }
    }
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (st.grid[r].every((cell) => cell)) {
        st.grid.splice(r, 1);
        st.grid.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      const pts = [0, 100, 300, 500, 800][cleared] * level;
      setScore((sc) => sc + pts);
      setLines((l) => {
        const nl = l + cleared;
        const newLevel = Math.floor(nl / 8) + 1;
        setLevel(newLevel);
        st.dropInterval = Math.max(8, 42 - (newLevel - 1) * 3);
        return nl;
      });
    }
    newPiece();
  }

  function hardDrop() {
    const st = s.current;
    while (!collides(st.piece.cells, st.piece.x, st.piece.y + 1)) st.piece.y++;
    lockPiece();
  }

  function submitAnswer() {
    if (!answer.trim() || !currentTerm) return;
    if (fuzzyMatch(stripLatex(answer), stripLatex(currentTerm.back), 2)) {
      hardDrop();
      setScore((sc) => sc + 150);
      setMessage("Correct — hard drop!");
    } else {
      s.current.dropTimer += 12; // speed up as punishment
      setMessage("Wrong — it was: " + currentTerm.back.slice(0, 40));
    }
    setAnswer("");
    setTimeout(() => setMessage(null), 1400);
  }

  function ghostY(): number {
    const st = s.current;
    let gy = st.piece.y;
    while (!collides(st.piece.cells, st.piece.x, gy + 1)) gy++;
    return gy;
  }

  function loop() {
    const st = s.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    st.frame++;
    canvas.width = COLS * CELL + 150;
    canvas.height = ROWS * CELL;

    st.dropTimer++;
    if (st.dropTimer >= st.dropInterval) {
      st.dropTimer = 0;
      if (!collides(st.piece.cells, st.piece.x, st.piece.y + 1)) st.piece.y++;
      else lockPiece();
    }

    // ---------- RENDER ----------
    ctx.fillStyle = "#0a0a18";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid background
    ctx.strokeStyle = "rgba(99,102,241,0.08)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, ROWS * CELL); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(COLS * CELL, r * CELL); ctx.stroke(); }

    // Locked blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = st.grid[r][c];
        if (color) drawBlock(ctx, c, r, color);
      }
    }

    // Ghost piece
    const gy = ghostY();
    ctx.globalAlpha = 0.18;
    for (let r = 0; r < st.piece.cells.length; r++) {
      for (let c = 0; c < st.piece.cells[r].length; c++) {
        if (st.piece.cells[r][c]) drawBlock(ctx, st.piece.x + c, gy + r, st.piece.color);
      }
    }
    ctx.globalAlpha = 1;

    // Active piece
    for (let r = 0; r < st.piece.cells.length; r++) {
      for (let c = 0; c < st.piece.cells[r].length; c++) {
        if (st.piece.cells[r][c]) drawBlock(ctx, st.piece.x + c, st.piece.y + r, st.piece.color);
      }
    }

    // Sidebar
    const sx = COLS * CELL + 12;
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("SCORE", sx, 22);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px monospace";
    ctx.fillText(score.toLocaleString(), sx, 42);
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "10px monospace";
    ctx.fillText("LEVEL", sx, 70);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.fillText(String(level), sx, 88);
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "10px monospace";
    ctx.fillText("LINES", sx, 112);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.fillText(String(lines), sx, 130);

    // Next piece
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "10px monospace";
    ctx.fillText("NEXT", sx, 164);
    for (let r = 0; r < st.next.cells.length; r++) {
      for (let c = 0; c < st.next.cells[r].length; c++) {
        if (st.next.cells[r][c]) drawMiniBlock(ctx, sx + c * 16, 172 + r * 16, st.next.color);
      }
    }

    if (!gameOver) st.animId = requestAnimationFrame(loop);
  }

  function drawBlock(ctx: CanvasRenderingContext2D, c: number, r: number, color: string) {
    const x = c * CELL, y = r * CELL;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, CELL - 2, CELL - 2, 4);
    ctx.fill();
    // Inner highlight
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x + 3, y + 3, CELL - 6, 5);
  }

  function drawMiniBlock(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, 14, 14, 3);
    ctx.fill();
  }

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return; // let typing work
      const st = s.current;
      if (e.key === "ArrowLeft") { if (!collides(st.piece.cells, st.piece.x - 1, st.piece.y)) st.piece.x--; e.preventDefault(); }
      if (e.key === "ArrowRight") { if (!collides(st.piece.cells, st.piece.x + 1, st.piece.y)) st.piece.x++; e.preventDefault(); }
      if (e.key === "ArrowDown") { if (!collides(st.piece.cells, st.piece.x, st.piece.y + 1)) st.piece.y++; e.preventDefault(); }
      if (e.key === "ArrowUp") {
        const rotated = st.piece.cells[0].map((_, i) => st.piece.cells.map((row) => row[i]).reverse());
        if (!collides(rotated, st.piece.x, st.piece.y)) st.piece.cells = rotated;
        e.preventDefault();
      }
      if (e.key === " ") { hardDrop(); e.preventDefault(); }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, []);

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "flashcard-tetris", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: 0, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 3) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 3 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0a18]">
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/20">Back</button>
        <span className="font-mono text-sm text-white/80">{formatTime(Date.now() - startTime.current)}</span>
      </div>
      <div className="flex flex-1 items-start justify-center gap-4 overflow-hidden p-4">
        <canvas ref={canvasRef} style={{ maxHeight: "100%" }} />
        <div className="flex w-64 flex-col gap-3 rounded-xl border border-indigo-400/30 bg-black/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Answer to hard-drop</p>
          <div className="rounded-lg bg-indigo-950/60 px-3 py-2">
            <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(currentTerm?.front ?? "") }} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") submitAnswer(); }}
            placeholder="Type the definition..."
            className="rounded-lg border border-indigo-400/30 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-indigo-400 focus:outline-none"
          />
          <button onClick={submitAnswer} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500">Drop It</button>
          {message && (
            <p className={`text-xs font-semibold ${message.startsWith("Correct") ? "text-green-400" : "text-red-400"}`}>{message}</p>
          )}
          <div className="mt-2 text-[11px] leading-relaxed text-white/40">
            Arrows move & rotate · Space hard-drops · Type the definition + Enter to hard-drop and clear faster
          </div>
        </div>
      </div>
      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">Stacked Out</p>
            <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span> · Level {level} · {lines} lines</p>
            <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
