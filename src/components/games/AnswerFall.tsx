import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, buildGameChoices, clamp } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const LIVES = 3;
const ITEM_W = 150;
const ITEM_H = 46;

interface Orb { x: number; y: number; vy: number; text: string; correct: boolean; id: number; }
interface PowerUp { x: number; y: number; vy: number; type: "star" | "shield" | "slow"; id: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
interface Star { x: number; y: number; size: number; layer: number; twinkle: number; }

export default function AnswerFall({ cards, gameChoices, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [streak, setStreak] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [question, setQuestion] = useState<Flashcard | null>(null);
  const [shieldOn, setShieldOn] = useState(false);
  const startTime = useRef(Date.now());

  const s = useRef({
    basketX: 400, orbs: [] as Orb[], powerUps: [] as PowerUp[], particles: [] as Particle[], stars: [] as Star[],
    question: null as Flashcard | null, deck: [] as Flashcard[],
    spawnTimer: 0, lastTime: 0, shield: 0, slow: 0,
    animId: 0, w: 800, h: 600, frame: 0, catches: 0,
  });

  useEffect(() => {
    if (cards.length < 4) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    st.question = st.deck[0];
    setQuestion(st.question);
    st.lastTime = performance.now();
    // Build parallax starfield
    for (let i = 0; i < 90; i++) {
      st.stars.push({
        x: Math.random() * 2000, y: Math.random() * 1200,
        size: 0.5 + Math.random() * 2,
        layer: 0.2 + Math.random() * 0.8,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function burst(x: number, y: number, color: string, n = 16) {
    const st = s.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3.5;
      st.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 28 + Math.random() * 20, maxLife: 48, color, size: 2 + Math.random() * 3 });
    }
  }

  function spawnWave() {
    const st = s.current;
    if (!st.question) return;
    const choices = buildGameChoices(st.question, st.deck, gameChoices, 4);
    const spread = st.w / (choices.length + 1);
    choices.forEach((c, i) => {
      st.orbs.push({
        x: spread * (i + 1) + (Math.random() - 0.5) * 60 - ITEM_W / 2,
        y: -ITEM_H - Math.random() * 60,
        vy: 1.6 + Math.random() * 1.2 + st.catches * 0.04,
        text: c.text, correct: c.correct, id: Math.random(),
      });
    });
    if (Math.random() < 0.12) {
      const types: PowerUp["type"][] = ["star", "shield", "slow"];
      st.powerUps.push({ x: 30 + Math.random() * (st.w - 60), y: -30, vy: 1.5, type: types[Math.floor(Math.random() * types.length)], id: Math.random() });
    }
  }

  function loop(t: number) {
    const st = s.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    st.w = canvas.clientWidth;
    st.h = canvas.clientHeight;
    canvas.width = st.w;
    canvas.height = st.h;

    const dt = clamp(t - st.lastTime, 0, 50);
    st.lastTime = t;
    st.frame++;
    st.spawnTimer += dt * (st.slow > 0 ? 0.5 : 1);
    if (st.shield > 0) { st.shield -= dt; if (st.shield <= 0) setShieldOn(false); }
    if (st.slow > 0) st.slow -= dt;

    const spawnMs = clamp(1900 - st.catches * 40, 900, 1900);
    if (st.spawnTimer >= spawnMs) { st.spawnTimer = 0; spawnWave(); }

    const basketW = 110;
    const basketY = st.h - 46;
    const slowMul = st.slow > 0 ? 0.55 : 1;

    // Update orbs
    for (const o of st.orbs) {
      o.y += o.vy * slowMul * (dt / 16.6);
      const inY = o.y + ITEM_H >= basketY && o.y <= basketY + 26;
      const inX = Math.abs(o.x + ITEM_W / 2 - st.basketX) < basketW / 2 + ITEM_W / 2 - 10;
      if (inY && inX) {
        if (o.correct) {
          const mult = streak >= 10 ? 4 : streak >= 5 ? 2 : 1;
          setScore((sc) => sc + 100 * mult);
          setStreak((x) => x + 1);
          burst(o.x + ITEM_W / 2, o.y, "#a5b4fc");
          st.catches++;
          // Answer given once -> advance to the next question immediately
          const idx = (st.deck.indexOf(st.question!) + 1) % st.deck.length;
          st.question = st.deck[idx];
          setQuestion(st.question);
          st.orbs = []; // clear stale orbs from the old question
          st.spawnTimer = 0;
          spawnWave();
        } else {
          if (st.shield <= 0) {
            setLives((l) => { const nl = l - 1; if (nl <= 0) setGameOver(true); return nl; });
          }
          setStreak(0);
          burst(o.x + ITEM_W / 2, o.y, "#f87171");
          st.orbs = st.orbs.filter((it) => it.id !== o.id);
        }
        break;
      }
    }
    st.orbs = st.orbs.filter((o) => o.y < st.h + 60);

    // Update power-ups
    for (const pu of st.powerUps) {
      pu.y += pu.vy * (dt / 16.6);
      const inY = pu.y + 16 >= basketY && pu.y <= basketY + 26;
      const inX = Math.abs(pu.x - st.basketX) < basketW / 2 + 16;
      if (inY && inX) {
        if (pu.type === "star") { setScore((sc) => sc + 250); burst(pu.x, pu.y, "#fbbf24"); }
        if (pu.type === "shield") { st.shield = 8000; setShieldOn(true); burst(pu.x, pu.y, "#60a5fa"); }
        if (pu.type === "slow") { st.slow = 6000; burst(pu.x, pu.y, "#c084fc"); }
        st.powerUps = st.powerUps.filter((p) => p.id !== pu.id);
      }
    }
    st.powerUps = st.powerUps.filter((p) => p.y < st.h + 40);

    // Particles
    for (const p of st.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--; }
    st.particles = st.particles.filter((p) => p.life > 0);

    // ---------- RENDER ----------
    // Nebula background
    const bg = ctx.createLinearGradient(0, 0, 0, st.h);
    bg.addColorStop(0, "#050514");
    bg.addColorStop(0.5, "#0d0b2e");
    bg.addColorStop(1, "#1b1240");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, st.w, st.h);

    // Nebula glows
    for (let i = 0; i < 3; i++) {
      const gx = st.w * (0.25 + i * 0.28);
      const gy = st.h * (0.2 + Math.sin(i * 2.2) * 0.12);
      const neb = ctx.createRadialGradient(gx, gy, 10, gx, gy, 220);
      const colors = ["rgba(99,102,241,0.08)", "rgba(168,85,247,0.08)", "rgba(59,130,246,0.07)"];
      neb.addColorStop(0, colors[i]);
      neb.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neb;
      ctx.beginPath();
      ctx.arc(gx, gy, 220, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stars
    for (const star of st.stars) {
      const sx = (star.x % st.w);
      const sy = (star.y % st.h);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(st.frame * 0.02 + star.twinkle));
      ctx.globalAlpha = tw * star.layer;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Falling orbs — uniform neutral styling (no green/red hints)
    for (const o of st.orbs) {
      const cx = o.x + ITEM_W / 2;
      const cy = o.y + ITEM_H / 2;
      // Outer glow
      const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, ITEM_W / 2);
      glow.addColorStop(0, "rgba(129,140,248,0.30)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, ITEM_W / 2, 0, Math.PI * 2);
      ctx.fill();
      // Orb body (rounded rect)
      const body = ctx.createLinearGradient(o.x, o.y, o.x, o.y + ITEM_H);
      body.addColorStop(0, "rgba(67,56,202,0.85)");
      body.addColorStop(1, "rgba(30,27,75,0.85)");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, ITEM_W, ITEM_H, 22);
      ctx.fill();
      ctx.strokeStyle = "#a5b4fc";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Text
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 3;
      const label = o.text.length > 20 ? o.text.slice(0, 18) + "…" : o.text;
      ctx.fillText(label, cx, cy + 4);
      ctx.shadowBlur = 0;
    }

    // Power-ups
    for (const pu of st.powerUps) {
      const col = pu.type === "star" ? "#fbbf24" : pu.type === "shield" ? "#60a5fa" : "#c084fc";
      const pulse = 1 + Math.sin(st.frame * 0.15) * 0.15;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, 12 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#000";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(pu.type === "star" ? "★" : pu.type === "shield" ? "◈" : "⏱", pu.x, pu.y + 4);
    }

    // Particles
    for (const p of st.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Catcher (hover basket)
    const bx = st.basketX;
    const by = basketY;
    // Thruster glow
    const thr = ctx.createRadialGradient(bx, by + 20, 2, bx, by + 20, 30);
    thr.addColorStop(0, "rgba(99,102,241,0.5)");
    thr.addColorStop(1, "rgba(99,102,241,0)");
    ctx.fillStyle = thr;
    ctx.beginPath();
    ctx.arc(bx, by + 20, 30, 0, Math.PI * 2);
    ctx.fill();
    // Basket
    const bgrad = ctx.createLinearGradient(bx, by, bx, by + 24);
    bgrad.addColorStop(0, "#818cf8");
    bgrad.addColorStop(1, "#4338ca");
    ctx.fillStyle = bgrad;
    ctx.beginPath();
    ctx.roundRect(bx - basketW / 2, by, basketW, 24, 10);
    ctx.fill();
    ctx.strokeStyle = "#c7d2fe";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Shield bubble
    if (st.shield > 0) {
      ctx.strokeStyle = "rgba(96,165,250,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by + 4, basketW / 2 + 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    // HUD
    ctx.fillStyle = "rgba(10,10,25,0.75)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 170, 62, 10);
    ctx.fill();
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("SCORE", 22, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(score.toLocaleString(), 22, 48);
    if (streak >= 3) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 12px monospace";
      ctx.fillText(`STREAK x${streak >= 10 ? 4 : 2}`, 22, 64);
    }

    // Lives
    for (let i = 0; i < LIVES; i++) {
      const hx = st.w - 26 - i * 28;
      const hy = 26;
      ctx.fillStyle = i < lives ? "#ef4444" : "#3f3f46";
      ctx.beginPath();
      ctx.moveTo(hx, hy + 6);
      ctx.bezierCurveTo(hx - 8, hy - 4, hx - 12, hy + 6, hx, hy + 12);
      ctx.bezierCurveTo(hx + 12, hy + 6, hx + 8, hy - 4, hx, hy + 6);
      ctx.fill();
    }

    if (!gameOver) st.animId = requestAnimationFrame(loop);
  }

  useEffect(() => {
    const move = (e: MouseEvent | TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = "touches" in e ? (e as TouchEvent).touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      s.current.basketX = clamp(x - rect.left, 55, rect.width - 55);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: true });
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("touchmove", move); };
  }, []);

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "answer-fall", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: s.current.catches, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 4) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 4 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="relative flex h-full flex-col bg-[#050514]">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
        <div className="rounded-xl border border-indigo-400/40 bg-black/75 px-6 py-2 shadow-xl backdrop-blur">
          <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(question?.back ?? "") }} />
        </div>
      </div>
      <button onClick={onCancel} className="absolute left-3 top-3 z-20 rounded-lg bg-black/50 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-black/70">Back</button>
      {shieldOn && <div className="absolute right-3 top-16 z-20 rounded-lg bg-blue-500/20 border border-blue-400/50 px-3 py-1 text-xs font-bold text-blue-300">SHIELD ACTIVE</div>}
      <canvas ref={canvasRef} className="flex-1 w-full" />
      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">Game Over</p>
            <p className="text-ink-dim">Caught: <span className="font-bold text-ink">{s.current.catches}</span> correct answers</p>
            <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
            <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
