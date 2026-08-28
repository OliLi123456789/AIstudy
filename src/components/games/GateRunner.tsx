import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, buildGameChoices, clamp, lerp } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const LANES = 3;
const LIVES = 3;

interface Gate { x: number; lane: number; answer: string; correct: boolean; passed: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }

export default function GateRunner({ cards, gameChoices, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [question, setQuestion] = useState<Flashcard | null>(null);
  const startTime = useRef(Date.now());

  const s = useRef({
    lane: 1, speed: 3.5, distance: 0,
    gates: [] as Gate[], particles: [] as Particle[],
    deck: [] as Flashcard[],
    animId: 0, w: 800, h: 500, stunned: 0, invincible: 0, frame: 0,
    playerY: 300, shake: 0, hillOff: 0, treeOff: 0,
    question: null as Flashcard | null,
    lives: LIVES, over: false,
  });

  useEffect(() => {
    if (cards.length < 4) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    st.question = st.deck[0];
    setQuestion(st.question);
    spawnGates(st.question);
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function spawnGates(q: Flashcard) {
    const st = s.current;
    const choices = buildGameChoices(q, st.deck, gameChoices, LANES);
    const gx = st.w + 80;
    for (let l = 0; l < LANES; l++) {
      st.gates.push({ x: gx, lane: l, answer: choices[l]?.text ?? "—", correct: choices[l]?.correct ?? false, passed: false });
    }
  }

  function nextQuestion() {
    const st = s.current;
    const idx = (st.deck.indexOf(st.question!) + 1) % st.deck.length;
    st.question = st.deck[idx];
    setQuestion(st.question);
    spawnGates(st.question);
  }

  function burst(x: number, y: number, color: string, n = 18) {
    const st = s.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      st.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 30 + Math.random() * 25, maxLife: 55, color, size: 2 + Math.random() * 3 });
    }
  }

  function laneY(l: number, h: number) {
    // Lanes sit on the brown ground area (ground starts at 0.58h)
    const top = h * 0.70;
    const span = h * 0.26;
    return top + (l + 0.5) * (span / LANES);
  }

  function loop() {
    const st = s.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    st.w = canvas.clientWidth;
    st.h = canvas.clientHeight;
    canvas.width = st.w;
    canvas.height = st.h;
    st.frame++;

    st.distance += st.speed;
    st.speed = clamp(3.5 + st.distance / 4000, 3.5, 9);
    if (st.stunned > 0) st.stunned--;
    if (st.invincible > 0) st.invincible--;
    st.shake *= 0.85;
    st.hillOff = (st.hillOff + st.speed * 0.25) % 400;
    st.treeOff = (st.treeOff + st.speed * 0.6) % 220;

    const effSpeed = st.stunned > 0 ? st.speed * 0.3 : st.speed;
    for (const g of st.gates) g.x -= effSpeed;

    const pyTarget = laneY(st.lane, st.h);
    st.playerY = lerp(st.playerY, pyTarget, 0.18);

    const px = st.w * 0.22;
    for (const g of st.gates) {
      if (!g.passed && g.x + 60 < px) {
        g.passed = true;
        if (g.lane === st.lane && g.correct) {
          setScore((sc) => sc + 250);
          burst(px, st.playerY, "#4ade80");
        } else if (g.lane === st.lane && !g.correct && st.invincible <= 0) {
          st.lives--;
          if (st.lives <= 0) { st.over = true; setGameOver(true); }
          st.invincible = 50;
          st.stunned = 25;
          st.shake = 10;
          burst(px, st.playerY, "#f87171");
        }
      }
    }
    const rowPassed = st.gates.length > 0 && st.gates.every((g) => g.passed || g.x < px - 80);
    if (rowPassed) {
      st.gates = st.gates.filter((g) => g.x > -160);
      if (st.gates.length === 0) nextQuestion();
    }

    for (const p of st.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }
    st.particles = st.particles.filter((p) => p.life > 0);

    // ---------- RENDER ----------
    ctx.save();
    ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);

    const sky = ctx.createLinearGradient(0, 0, 0, st.h);
    sky.addColorStop(0, "#0b1026");
    sky.addColorStop(0.45, "#1e2a5a");
    sky.addColorStop(0.7, "#5a3f8c");
    sky.addColorStop(0.85, "#c2410c");
    sky.addColorStop(1, "#f59e0b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, st.w, st.h);

    const sunY = st.h * 0.55;
    const sunGrad = ctx.createRadialGradient(st.w * 0.7, sunY, 8, st.w * 0.7, sunY, 60);
    sunGrad.addColorStop(0, "rgba(253,186,116,0.9)");
    sunGrad.addColorStop(1, "rgba(253,186,116,0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(st.w * 0.7, sunY, 60, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 40; i++) {
      const sx = (i * 149) % st.w;
      const sy = (i * 71) % (st.h * 0.45);
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(st.frame * 0.02 + i));
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#16213c";
    ctx.beginPath();
    ctx.moveTo(0, st.h * 0.58);
    for (let x = 0; x <= st.w; x += 40) {
      ctx.lineTo(x, st.h * 0.58 - 25 - Math.sin((x + st.hillOff) * 0.012) * 22);
    }
    ctx.lineTo(st.w, st.h * 0.58);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#0d1626";
    for (let x = -st.treeOff; x < st.w + 220; x += 220) {
      const base = st.h * 0.56;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x + 14, base - 46);
      ctx.lineTo(x + 28, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x + 12, base - 4, 4, 10);
    }

    const ground = ctx.createLinearGradient(0, st.h * 0.58, 0, st.h);
    ground.addColorStop(0, "#3f2c1e");
    ground.addColorStop(1, "#1c120b");
    ctx.fillStyle = ground;
    ctx.fillRect(0, st.h * 0.58, st.w, st.h * 0.42);

    const laneW = st.w / LANES;
    for (let l = 1; l < LANES; l++) {
      ctx.strokeStyle = "rgba(251,191,36,0.25)";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 18]);
      ctx.lineDashOffset = -st.distance;
      ctx.beginPath();
      ctx.moveTo(l * laneW, st.h * 0.60);
      ctx.lineTo(l * laneW, st.h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const g of st.gates) {
      const gy = laneY(g.lane, st.h);
      const gw = 110, gh = 66;
      const gx = g.x;

      ctx.fillStyle = g.correct ? "#14532d" : "#450a0a";
      ctx.fillRect(gx, gy - gh, 8, gh);
      ctx.fillRect(gx + gw, gy - gh, 8, gh);
      const beam = ctx.createLinearGradient(gx, gy - gh, gx, gy - gh + 30);
      if (g.correct) { beam.addColorStop(0, "#4ade80"); beam.addColorStop(1, "#16a34a"); }
      else { beam.addColorStop(0, "#f87171"); beam.addColorStop(1, "#b91c1c"); }
      ctx.fillStyle = beam;
      ctx.fillRect(gx - 4, gy - gh - 8, gw + 16, 26);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(gx - 4, gy - gh - 8, gw + 16, 26);

      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      const label = g.answer.length > 15 ? g.answer.slice(0, 13) + "…" : g.answer;
      ctx.fillText(label, gx + gw / 2 + 4, gy - gh + 9);
      ctx.shadowBlur = 0;
    }

    if (!(st.invincible > 0 && Math.floor(st.invincible / 4) % 2 === 0)) {
      const py2 = st.playerY;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(px, py2 + 18, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const ph = st.frame * 0.28;
      ctx.strokeStyle = "#312e81";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px, py2 - 2);
      ctx.lineTo(px - 8 + Math.sin(ph) * 9, py2 + 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px, py2 - 2);
      ctx.lineTo(px + 8 + Math.sin(ph + Math.PI) * 9, py2 + 16);
      ctx.stroke();
      const bodyG = ctx.createLinearGradient(px, py2 - 30, px, py2);
      bodyG.addColorStop(0, "#6366f1");
      bodyG.addColorStop(1, "#4338ca");
      ctx.fillStyle = bodyG;
      ctx.beginPath();
      ctx.roundRect(px - 11, py2 - 32, 22, 32, 7);
      ctx.fill();
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px - 10, py2 - 26);
      ctx.quadraticCurveTo(px - 24, py2 - 26 + Math.sin(st.frame * 0.2) * 4, px - 34, py2 - 20 + Math.sin(st.frame * 0.2 + 1) * 5);
      ctx.stroke();
      ctx.fillStyle = "#fde68a";
      ctx.beginPath();
      ctx.arc(px, py2 - 40, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(px - 9, py2 - 44, 18, 4);
    }

    for (const p of st.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // HUD
    ctx.fillStyle = "rgba(10,10,25,0.75)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 150, 56, 10);
    ctx.fill();
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("SCORE", 22, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(score.toLocaleString(), 22, 48);

    for (let i = 0; i < LIVES; i++) {
      const hx = st.w - 26 - i * 28;
      const hy = 26;
      ctx.fillStyle = i < st.lives ? "#ef4444" : "#3f3f46";
      ctx.beginPath();
      ctx.moveTo(hx, hy + 6);
      ctx.bezierCurveTo(hx - 8, hy - 4, hx - 12, hy + 6, hx, hy + 12);
      ctx.bezierCurveTo(hx + 12, hy + 6, hx + 8, hy - 4, hx, hy + 6);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(st.distance / 10)}m`, st.w - 14, 56);

    if (!st.over) st.animId = requestAnimationFrame(loop);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const st = s.current;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "ArrowUp") { st.lane = Math.max(0, st.lane - 1); e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "ArrowDown") { st.lane = Math.min(LANES - 1, st.lane + 1); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "gate-runner", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: 0, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 4) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 4 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="relative flex h-full flex-col bg-black">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
        <div className="rounded-xl border border-indigo-400/40 bg-black/75 px-6 py-2 shadow-xl backdrop-blur">
          <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(question?.back ?? "") }} />
        </div>
      </div>
      <button onClick={onCancel} className="absolute left-3 top-3 z-20 rounded-lg bg-black/50 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-black/70">Back</button>
      <canvas ref={canvasRef} className="flex-1 w-full" />
      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">Run Complete</p>
            <p className="text-ink-dim">Distance: <span className="font-bold text-ink">{Math.floor(s.current.distance / 10)}m</span></p>
            <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
            <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
