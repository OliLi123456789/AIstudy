import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";
import { buildGameChoices } from "../../lib/games/utils";

const TILE = 32;
// 21 wide x 13 tall, # = wall, . = pellet path, o = power pellet
const MAZE = [
  "#####################",
  "#.........#.........#",
  "#.###.###.#.###.###.#",
  "#o###.###.#.###.###o#",
  "#...................#",
  "#.###.#.#####.#.###.#",
  "#.....#...#...#.....#",
  "#.###.###.#.###.###.#",
  "#.###.#...#...#.###.#",
  "#.....#...#...#.....#",
  "#.###.#.#####.#.###.#",
  "#...................#",
  "#####################",
];

const ROWS = MAZE.length;
const COLS = MAZE[0].length;

interface Pellet { x: number; y: number; correct: boolean; answer: string; power: boolean; }
interface Ghost { x: number; y: number; dx: number; dy: number; color: string; id: number; }

export default function PacCard({ cards, gameChoices, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [question, setQuestion] = useState<Flashcard | null>(null);
  const [powerTime, setPowerTime] = useState(0);
  const startTime = useRef(Date.now());

  const s = useRef({
    px: 10.5 * TILE, py: 9.5 * TILE, dx: 1, dy: 0, nextDx: 1, nextDy: 0,
    pellets: [] as Pellet[], ghosts: [] as Ghost[],
    deck: [] as Flashcard[], question: null as Flashcard | null,
    animId: 0, frame: 0, power: 0, correctLeft: 0, hitCd: 0,
  });

  useEffect(() => {
    if (cards.length < 4) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    st.question = st.deck[0];
    setQuestion(st.question);
    buildBoard();
    st.ghosts = [
      { x: 10.5 * TILE, y: 6.5 * TILE, dx: 1, dy: 0, color: "#ef4444", id: 1 },
      { x: 9.5 * TILE, y: 6.5 * TILE, dx: -1, dy: 0, color: "#f472b6", id: 2 },
      { x: 10.5 * TILE, y: 5.5 * TILE, dx: 0, dy: 1, color: "#22d3ee", id: 3 },
    ];
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function buildBoard() {
    const st = s.current;
    st.pellets = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = MAZE[r][c];
        if (cell === "." || cell === "o") {
          st.pellets.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, correct: false, answer: "", power: cell === "o" });
        }
      }
    }
    assignAnswers();
  }

  function assignAnswers() {
    const st = s.current;
    if (!st.question) return;
    // A fixed handful of pellets are correct (never zero, never half the maze)
    st.correctLeft = 0;
    const wrongPool = buildGameChoices(st.question, st.deck, gameChoices, 4)
      .filter((o) => !o.correct)
      .map((o) => o.text);
    const pool = st.pellets.filter((p) => !p.power);
    const target = Math.min(6, Math.max(3, Math.floor(pool.length * 0.15)));
    for (const p of pool) {
      p.correct = false;
      p.answer = wrongPool[Math.floor(Math.random() * wrongPool.length)] ?? "";
    }
    const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, target);
    for (const p of chosen) {
      p.correct = true;
      p.answer = st.question.front;
      st.correctLeft++;
    }
  }

  function isWall(x: number, y: number): boolean {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    return MAZE[r][c] === "#";
  }

  function loop() {
    const st = s.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE;
    st.frame++;
    if (st.power > 0) { st.power--; setPowerTime(Math.ceil(st.power / 60)); }
    if (st.hitCd > 0) st.hitCd--;

    // Player movement (grid-aligned turning)
    const speed = 2;
    const atCenter = Math.abs((st.px % TILE) - TILE / 2) < 3 && Math.abs((st.py % TILE) - TILE / 2) < 3;
    if (atCenter && !isWall(st.px + st.nextDx * TILE * 0.6, st.py + st.nextDy * TILE * 0.6)) {
      st.dx = st.nextDx; st.dy = st.nextDy;
    }
    if (!isWall(st.px + st.dx * speed, st.py + st.dy * speed)) {
      st.px += st.dx * speed;
      st.py += st.dy * speed;
    }

    // Ghost movement
    for (const g of st.ghosts) {
      const gSpeed = st.power > 0 ? 1.2 : 1.7;
      const gAtCenter = Math.abs((g.x % TILE) - TILE / 2) < 4 && Math.abs((g.y % TILE) - TILE / 2) < 4;
      if (gAtCenter) {
        const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
        const valid = dirs.filter((d) => !isWall(g.x + d.dx * TILE, g.y + d.dy * TILE));
        if (valid.length > 0) {
          // Chase player when not powered, flee when powered
          let best = valid[Math.floor(Math.random() * valid.length)];
          if (Math.random() < 0.7) {
            const targetDir = st.power > 0 ? -1 : 1;
            let bestScore = -Infinity;
            for (const d of valid) {
              const nx = g.x + d.dx * TILE;
              const ny = g.y + d.dy * TILE;
              const dist = Math.hypot(nx - st.px, ny - st.py);
              const score = dist * targetDir + Math.random() * 30;
              if (score > bestScore) { bestScore = score; best = d; }
            }
          }
          g.dx = best.dx; g.dy = best.dy;
        }
      }
      if (!isWall(g.x + g.dx * gSpeed, g.y + g.dy * gSpeed)) {
        g.x += g.dx * gSpeed;
        g.y += g.dy * gSpeed;
      }
    }

    // Pellet eating
    for (const p of st.pellets) {
      if (Math.hypot(st.px - p.x, st.py - p.y) < TILE * 0.45) {
        st.pellets = st.pellets.filter((pp) => pp !== p);
        if (p.power) { st.power = 420; }
        else if (p.correct) {
          setScore((sc) => sc + 100);
          st.correctLeft--;
          if (st.correctLeft <= 0) {
            const idx = (st.deck.indexOf(st.question!) + 1) % st.deck.length;
            st.question = st.deck[idx];
            setQuestion(st.question);
            assignAnswers();
          }
        } else {
          setScore((sc) => sc + 5);
        }
      }
    }

    // Ghost collision
    if (st.hitCd <= 0) {
      for (const g of st.ghosts) {
        if (Math.hypot(st.px - g.x, st.py - g.y) < TILE * 0.7) {
          if (st.power > 0) {
            setScore((sc) => sc + 400);
            g.x = 10.5 * TILE; g.y = 6.5 * TILE;
            st.hitCd = 30;
          } else {
            setLives((l) => { const nl = l - 1; if (nl <= 0) setGameOver(true); return nl; });
            st.px = 10.5 * TILE; st.py = 9.5 * TILE;
            st.hitCd = 90;
          }
        }
      }
    }

    // ---------- RENDER ----------
    ctx.fillStyle = "#050514";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Maze walls with neon glow
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (MAZE[r][c] === "#") {
          const x = c * TILE, y = r * TILE;
          ctx.fillStyle = "#131339";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = "#3b3b8f";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        }
      }
    }

    // Pellets
    for (const p of st.pellets) {
      if (p.power) {
        const pulse = 4 + Math.sin(st.frame * 0.15) * 2;
        ctx.fillStyle = "#fbbf24";
        ctx.shadowColor = "#fbbf24";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulse + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = p.correct ? "#4ade80" : "#52525b";
        if (p.correct) { ctx.shadowColor = "#4ade80"; ctx.shadowBlur = 8; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Ghosts
    for (const g of st.ghosts) {
      const fleeing = st.power > 0;
      ctx.fillStyle = fleeing ? (st.power < 100 && Math.floor(st.frame / 8) % 2 === 0 ? "#e0e7ff" : "#3b3bd4") : g.color;
      // Body
      ctx.beginPath();
      ctx.arc(g.x, g.y - 2, TILE / 2 - 3, Math.PI, 0);
      ctx.lineTo(g.x + TILE / 2 - 3, g.y + TILE / 2 - 4);
      // Wavy bottom
      for (let i = 0; i < 3; i++) {
        ctx.lineTo(g.x + TILE / 2 - 3 - (i * 2 + 1) * (TILE - 6) / 6, g.y + TILE / 2 - 4 - (i % 2 === 0 ? 4 : 0));
      }
      ctx.lineTo(g.x - TILE / 2 + 3, g.y + TILE / 2 - 4);
      ctx.closePath();
      ctx.fill();
      // Eyes
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(g.x - 4, g.y - 4, 3.5, 0, Math.PI * 2);
      ctx.arc(g.x + 4, g.y - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fleeing ? "#1e1b4b" : "#1e3a8a";
      ctx.beginPath();
      ctx.arc(g.x - 4 + g.dx * 1.5, g.y - 4 + g.dy * 1.5, 1.8, 0, Math.PI * 2);
      ctx.arc(g.x + 4 + g.dx * 1.5, g.y - 4 + g.dy * 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player (pac)
    if (!(st.hitCd > 0 && Math.floor(st.hitCd / 5) % 2 === 0)) {
      const mouth = 0.28 * Math.abs(Math.sin(st.frame * 0.12));
      const angle = Math.atan2(st.dy, st.dx);
      ctx.fillStyle = "#fde047";
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(st.px, st.py, TILE / 2 - 3, angle + mouth, angle + Math.PI * 2 - mouth);
      ctx.lineTo(st.px, st.py);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (!gameOver) st.animId = requestAnimationFrame(loop);
  }

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const st = s.current;
      if (e.key === "ArrowLeft" || e.key === "a") { st.nextDx = -1; st.nextDy = 0; e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "d") { st.nextDx = 1; st.nextDy = 0; e.preventDefault(); }
      if (e.key === "ArrowUp" || e.key === "w") { st.nextDx = 0; st.nextDy = -1; e.preventDefault(); }
      if (e.key === "ArrowDown" || e.key === "s") { st.nextDx = 0; st.nextDy = 1; e.preventDefault(); }
    };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, []);

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "pac-card", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: 0, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 4) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 4 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="relative flex h-full flex-col bg-[#050514]">
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/20">Back</button>
        <div className="rounded-xl border border-indigo-400/40 bg-black/70 px-5 py-1.5">
          <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(question?.back ?? "") }} />
        </div>
        <div className="flex items-center gap-3 font-mono text-sm text-white/80">
          {powerTime > 0 && <span className="rounded bg-amber-500/20 border border-amber-400/50 px-2 py-0.5 text-amber-300 font-bold">POWER {powerTime}s</span>}
          <span>Score: {score}</span>
          <span>Lives: {lives}</span>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} style={{ maxWidth: "100%", maxHeight: "100%", aspectRatio: `${COLS}/${ROWS}` }} />
      </div>
      <p className="pb-2 text-center text-xs text-white/50">Arrows / WASD to move · Green pellets = correct answers · Gold = power pellet</p>
      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">Game Over</p>
            <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
            <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
