import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, collectAllWrongs } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

interface Rock { x: number; y: number; vx: number; vy: number; r: number; answer: string; correct: boolean; verts: number[]; rot: number; rotSpeed: number; id: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; life: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
interface Star { x: number; y: number; layer: number; size: number; }

export default function Asteroids({ cards, gameChoices, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [question, setQuestion] = useState<Flashcard | null>(null);
  const startTime = useRef(Date.now());

  const s = useRef({
    shipX: 400, shipY: 300, shipAngle: -Math.PI / 2, shipVX: 0, shipVY: 0,
    bullets: [] as Bullet[], rocks: [] as Rock[], particles: [] as Particle[], stars: [] as Star[],
    deck: [] as Flashcard[], question: null as Flashcard | null,
    keys: {} as Record<string, boolean>, animId: 0, w: 800, h: 600,
    invuln: 0, shootCd: 0, thrust: false, wave: 1, frame: 0,
  });

  useEffect(() => {
    if (cards.length < 4) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    st.question = st.deck[0];
    setQuestion(st.question);
    for (let i = 0; i < 120; i++) {
      st.stars.push({ x: Math.random() * 2000, y: Math.random() * 2000, layer: 0.3 + Math.random() * 0.7, size: 0.5 + Math.random() * 1.8 });
    }
    // Spawn wave: 1 correct rock + 3 wrong rocks
    spawnRock(st.question!.front);
    for (let i = 0; i < 3; i++) spawnRock();
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function spawnRock(correctAnswer?: string) {
    const st = s.current;
    if (!st.question) return;
    const isCorrect = correctAnswer !== undefined;
    const pooledWrongs = collectAllWrongs(st.deck, gameChoices, st.question.id);
    const answer = isCorrect
      ? correctAnswer!
      : (pooledWrongs[Math.floor(Math.random() * pooledWrongs.length)] ?? "??");
    const edge = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (edge === 0) { x = Math.random() * st.w; y = -40; }
    else if (edge === 1) { x = st.w + 40; y = Math.random() * st.h; }
    else if (edge === 2) { x = Math.random() * st.w; y = st.h + 40; }
    else { x = -40; y = Math.random() * st.h; }
    const a = Math.random() * Math.PI * 2;
    const sp = 0.3 + Math.random() * 0.7;
    const verts: number[] = [];
    for (let i = 0; i < 10; i++) verts.push(0.75 + Math.random() * 0.45);
    st.rocks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 34 + Math.random() * 14, answer, correct: isCorrect, verts, rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.02, id: Math.random() });
  }

  function explode(x: number, y: number, color: string, n = 20) {
    const st = s.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3.5;
      st.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 24 + Math.random() * 20, maxLife: 44, color, size: 1.5 + Math.random() * 3 });
    }
  }

  function wrap(v: number, max: number) { if (v < 0) return v + max; if (v > max) return v - max; return v; }

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

    if (st.invuln > 0) st.invuln--;
    if (st.shootCd > 0) st.shootCd--;

    // Ship
    if (st.keys["ArrowLeft"] || st.keys["a"]) st.shipAngle -= 0.05;
    if (st.keys["ArrowRight"] || st.keys["d"]) st.shipAngle += 0.05;
    st.thrust = !!(st.keys["ArrowUp"] || st.keys["w"]);
    if (st.thrust) {
      st.shipVX += Math.cos(st.shipAngle) * 0.10;
      st.shipVY += Math.sin(st.shipAngle) * 0.10;
      if (st.frame % 3 === 0) {
        st.particles.push({ x: st.shipX - Math.cos(st.shipAngle) * 16, y: st.shipY - Math.sin(st.shipAngle) * 16, vx: -Math.cos(st.shipAngle) * 2 + (Math.random() - 0.5), vy: -Math.sin(st.shipAngle) * 2 + (Math.random() - 0.5), life: 18, maxLife: 18, color: "#fbbf24", size: 2 });
      }
    }
    st.shipVX *= 0.985; st.shipVY *= 0.985;
    st.shipX = wrap(st.shipX + st.shipVX, st.w);
    st.shipY = wrap(st.shipY + st.shipVY, st.h);

    // Shoot
    if (st.keys[" "] && st.shootCd <= 0) {
      st.bullets.push({ x: st.shipX + Math.cos(st.shipAngle) * 16, y: st.shipY + Math.sin(st.shipAngle) * 16, vx: Math.cos(st.shipAngle) * 5.5, vy: Math.sin(st.shipAngle) * 5.5, life: 70 });
      st.shootCd = 10;
    }

    for (const b of st.bullets) { b.x += b.vx; b.y += b.vy; b.life--; }
    st.bullets = st.bullets.filter((b) => b.life > 0 && b.x > -10 && b.x < st.w + 10 && b.y > -10 && b.y < st.h + 10);

    for (const r of st.rocks) { r.x = wrap(r.x + r.vx, st.w); r.y = wrap(r.y + r.vy, st.h); r.rot += r.rotSpeed; }

    // Bullet-rock collisions
    let correctDestroyed = false;
    for (const b of [...st.bullets]) {
      for (const r of [...st.rocks]) {
        const dx = b.x - r.x, dy = b.y - r.y;
        if (Math.sqrt(dx * dx + dy * dy) < r.r) {
          st.bullets = st.bullets.filter((bb) => bb !== b);
          if (r.correct) {
            setScore((sc) => sc + (r.r > 40 ? 200 : r.r > 28 ? 350 : 500));
            explode(r.x, r.y, "#4ade80");
            correctDestroyed = true;
          } else {
            explode(r.x, r.y, "#f97316");
            if (r.r > 16) {
              for (let i = 0; i < 2; i++) {
                const verts: number[] = [];
                for (let v = 0; v < 10; v++) verts.push(0.75 + Math.random() * 0.45);
                st.rocks.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 2.5, vy: (Math.random() - 0.5) * 2.5, r: r.r * 0.55, answer: r.answer, correct: false, verts, rot: 0, rotSpeed: (Math.random() - 0.5) * 0.05, id: Math.random() });
              }
            }
          }
          st.rocks = st.rocks.filter((rr) => rr !== r);
          break;
        }
      }
    }

    // Advance question when the correct rock is destroyed
    if (correctDestroyed) {
      st.wave++;
      const idx = (st.deck.indexOf(st.question!) + 1) % st.deck.length;
      st.question = st.deck[idx];
      setQuestion(st.question);
      st.rocks = [];
      spawnRock(st.question!.front);
      const wrongCount = 3 + Math.min(st.wave, 3);
      for (let i = 0; i < wrongCount; i++) spawnRock();
    }

    // Ship-rock collision
    if (st.invuln <= 0) {
      for (const r of st.rocks) {
        const dx = st.shipX - r.x, dy = st.shipY - r.y;
        if (Math.sqrt(dx * dx + dy * dy) < r.r + 12) {
          setLives((l) => { const nl = l - 1; if (nl <= 0) setGameOver(true); return nl; });
          explode(st.shipX, st.shipY, "#f87171", 26);
          st.invuln = 70;
          st.shipVX = 0; st.shipVY = 0;
          break;
        }
      }
    }

    // Particles
    for (const p of st.particles) { p.x += p.vx; p.y += p.vy; p.life--; }
    st.particles = st.particles.filter((p) => p.life > 0);

    // ---------- RENDER ----------
    // Space background
    const bg = ctx.createRadialGradient(st.w / 2, st.h / 2, 50, st.w / 2, st.h / 2, st.w * 0.7);
    bg.addColorStop(0, "#0d1026");
    bg.addColorStop(1, "#03030c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, st.w, st.h);

    // Parallax stars (drift opposite ship movement)
    for (const star of st.stars) {
      const sx = wrap(star.x - st.shipVX * 20 * star.layer, st.w);
      const sy = wrap(star.y - st.shipVY * 20 * star.layer, st.h);
      ctx.globalAlpha = star.layer;
      ctx.fillStyle = star.layer > 0.7 ? "#fff" : "#9aa4d0";
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Rocks
    for (const r of st.rocks) {
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.rot);
      // Glow for correct answers
      if (r.correct) {
        ctx.shadowColor = "#22c55e";
        ctx.shadowBlur = 16;
      }
      const rg = ctx.createRadialGradient(-r.r * 0.3, -r.r * 0.3, 2, 0, 0, r.r);
      rg.addColorStop(0, "#78716c");
      rg.addColorStop(1, "#292524");
      ctx.fillStyle = rg;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = r.r * r.verts[i];
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = r.correct ? "#4ade80" : "#57534e";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      // Answer label
      ctx.fillStyle = r.correct ? "#bbf7d0" : "#d6d3d1";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 4;
      const label = r.answer.length > 14 ? r.answer.slice(0, 12) + "…" : r.answer;
      ctx.fillText(label, r.x, r.y + 4);
      ctx.shadowBlur = 0;
    }

    // Bullets
    for (const b of st.bullets) {
      ctx.fillStyle = "#fef08a";
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Particles
    for (const p of st.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ship
    if (st.invuln <= 0 || Math.floor(st.invuln / 4) % 2 === 0) {
      ctx.save();
      ctx.translate(st.shipX, st.shipY);
      ctx.rotate(st.shipAngle);
      // Thrust flame
      if (st.thrust) {
        const flick = 1 + Math.random() * 0.4;
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.moveTo(-14, -5);
        ctx.lineTo(-14 - 14 * flick, 0);
        ctx.lineTo(-14, 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.moveTo(-14, -2.5);
        ctx.lineTo(-14 - 8 * flick, 0);
        ctx.lineTo(-14, 2.5);
        ctx.closePath();
        ctx.fill();
      }
      // Hull — classic dart-shaped spaceship (same footprint as before)
      const hull = ctx.createLinearGradient(-14, 0, 18, 0);
      hull.addColorStop(0, "#4f46e5");
      hull.addColorStop(1, "#a5b4fc");
      // Rear wings
      ctx.fillStyle = "#4338ca";
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-15, -13);
      ctx.lineTo(-10, -2);
      ctx.lineTo(-15, 13);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#818cf8";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Main body
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(19, 0);      // nose
      ctx.lineTo(6, -5);
      ctx.lineTo(-12, -6);
      ctx.lineTo(-14, 0);
      ctx.lineTo(-12, 6);
      ctx.lineTo(6, 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#c7d2fe";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Side fins
      ctx.fillStyle = "#6366f1";
      ctx.beginPath();
      ctx.moveTo(8, -5);
      ctx.lineTo(2, -10);
      ctx.lineTo(-2, -4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, 5);
      ctx.lineTo(2, 10);
      ctx.lineTo(-2, 4);
      ctx.closePath();
      ctx.fill();
      // Cockpit canopy
      ctx.fillStyle = "#0ea5e9";
      ctx.beginPath();
      ctx.ellipse(6, 0, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.ellipse(6.5, -1, 2.4, 1.2, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // Engine nozzles
      ctx.fillStyle = "#1e1b4b";
      ctx.beginPath();
      ctx.roundRect(-16, -5, 4, 3.5, 1);
      ctx.roundRect(-16, 1.5, 4, 3.5, 1);
      ctx.fill();
      ctx.restore();
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
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "11px monospace";
    ctx.fillText(`WAVE ${st.wave}`, 22, 64);

    for (let i = 0; i < 3; i++) {
      const hx = st.w - 26 - i * 28;
      const hy = 26;
      ctx.fillStyle = i < lives ? "#ef4444" : "#3f3f46";
      ctx.beginPath();
      ctx.moveTo(hx, hy + 6);
      ctx.bezierCurveTo(hx - 8, hy - 4, hx - 12, hy + 6, hx, hy + 12);
      ctx.bezierCurveTo(hx + 12, hy + 6, hx + 8, hy - 4, hx, hy + 6);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("Arrows to fly · Space to shoot · Green rocks = correct", st.w - 14, st.h - 14);

    if (!gameOver) st.animId = requestAnimationFrame(loop);
  }

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { s.current.keys[e.key] = true; if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => { s.current.keys[e.key] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "asteroids", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: 0, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 4) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 4 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="relative flex h-full flex-col bg-[#03030c]">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
        <div className="rounded-xl border border-emerald-400/40 bg-black/75 px-6 py-2 shadow-xl backdrop-blur">
          <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(question?.back ?? "") }} />
        </div>
      </div>
      <button onClick={onCancel} className="absolute left-3 top-3 z-20 rounded-lg bg-black/50 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-black/70">Back</button>
      <canvas ref={canvasRef} className="flex-1 w-full" />
      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">Ship Destroyed</p>
            <p className="text-ink-dim">Wave: <span className="font-bold text-ink">{s.current.wave}</span></p>
            <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
            <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
