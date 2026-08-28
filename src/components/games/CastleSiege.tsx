import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, buildGameChoices } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const PLAYER_HP = 100;
const ENEMY_HP = 100;
const DAMAGE = 5;

interface Soldier { x: number; side: "player" | "enemy"; id: number; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }

export default function CastleSiege({ cards, gameChoices, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [enemyHP, setEnemyHP] = useState(ENEMY_HP);
  const [gameOver, setGameOver] = useState(false);
  const [question, setQuestion] = useState<Flashcard | null>(null);
  const [choices, setChoices] = useState<{ text: string; correct: boolean }[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<number | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const startTime = useRef(Date.now());

  const s = useRef({
    soldiers: [] as Soldier[], particles: [] as Particle[],
    deck: [] as Flashcard[],
    animId: 0, w: 900, h: 460, frame: 0, wave: 1,
    enemySpawnTimer: 0, enemySpawnInterval: 280,
    recentAnswers: [] as { correct: boolean; ms: number }[],
    lastAnswerTime: 0,
    currentQuestion: null as Flashcard | null,
    playerHP: PLAYER_HP, enemyHP: ENEMY_HP, over: false,
  });

  useEffect(() => {
    if (cards.length < 4) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    newQuestion();
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function newQuestion() {
    const st = s.current;
    const idx = st.deck.length > 0 && st.currentQuestion !== null ? (st.deck.indexOf(st.currentQuestion) + 1) % st.deck.length : 0;
    const q = st.deck[idx];
    st.currentQuestion = q;
    setQuestion(q);
    // 2 options to start, scaling up to 4 as waves progress
    const n = Math.min(4, 2 + Math.floor(st.wave / 2));
    setChoices(buildGameChoices(q, st.deck, gameChoices, n));
    st.lastAnswerTime = Date.now();
  }

  // Adaptive difficulty: adjust enemy spawn rate based on rolling accuracy
  function difficultyInterval(): number {
    const st = s.current;
    const recent = st.recentAnswers.slice(-5);
    if (recent.length < 3) return st.enemySpawnInterval;
    const acc = recent.filter((r) => r.correct).length / recent.length;
    if (acc < 0.4) return st.enemySpawnInterval * 1.6; // struggling → slower enemies
    if (acc > 0.85) return st.enemySpawnInterval * 0.75; // crushing it → faster
    return st.enemySpawnInterval;
  }

  function burst(x: number, y: number, color: string, n = 14) {
    const st = s.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.5 + Math.random() * 2.5;
      st.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 22 + Math.random() * 16, maxLife: 38, color, size: 2 + Math.random() * 3 });
    }
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

    // Enemy spawning (adaptive)
    st.enemySpawnTimer++;
    if (st.enemySpawnTimer >= difficultyInterval() && st.soldiers.filter((x) => x.side === "enemy").length < 14) {
      st.enemySpawnTimer = 0;
      st.soldiers.push({ x: st.w - 130, side: "enemy", id: Math.random() });
    }

    // Move soldiers (slowed down for readability)
    for (const sd of st.soldiers) sd.x += sd.side === "player" ? 1.2 : -1.2;

    // Clash
    for (const p of st.soldiers.filter((x) => x.side === "player")) {
      for (const e of st.soldiers.filter((x) => x.side === "enemy")) {
        if (Math.abs(p.x - e.x) < 18) {
          burst(p.x, st.h * 0.62, "#fbbf24");
          st.soldiers = st.soldiers.filter((x) => x.id !== p.id && x.id !== e.id);
          break;
        }
      }
    }

    // Castle damage — player soldiers hit the enemy castle, enemies hit ours
    for (const p of st.soldiers.filter((x) => x.side === "player" && x.x > st.w - 150)) {
      st.soldiers = st.soldiers.filter((x) => x.id !== p.id);
      burst(st.w - 110, st.h * 0.5, "#a5b4fc");
      st.enemyHP = Math.max(0, st.enemyHP - DAMAGE);
      setEnemyHP(st.enemyHP);
      if (st.enemyHP <= 0) { st.over = true; setGameOver(true); }
    }
    for (const e of st.soldiers.filter((x) => x.side === "enemy" && x.x < 150)) {
      st.soldiers = st.soldiers.filter((x) => x.id !== e.id);
      burst(110, st.h * 0.5, "#f87171");
      st.playerHP = Math.max(0, st.playerHP - DAMAGE);
      if (st.playerHP <= 0) { st.over = true; setGameOver(true); }
    }

    for (const p of st.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--; }
    st.particles = st.particles.filter((p) => p.life > 0);

    // ---------- RENDER ----------
    // Sunset sky
    const sky = ctx.createLinearGradient(0, 0, 0, st.h * 0.6);
    sky.addColorStop(0, "#1e1b4b");
    sky.addColorStop(0.6, "#7c2d12");
    sky.addColorStop(1, "#ea580c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, st.w, st.h * 0.6);

    // Distant castle silhouettes
    ctx.fillStyle = "#1a1430";
    for (let x = 0; x < st.w; x += 180) {
      ctx.fillRect(x + 30, st.h * 0.42, 50, st.h * 0.18);
      ctx.fillRect(x + 20, st.h * 0.42, 12, 22);
      ctx.fillRect(x + 68, st.h * 0.42, 12, 22);
    }

    // Battlefield ground
    const gnd = ctx.createLinearGradient(0, st.h * 0.6, 0, st.h);
    gnd.addColorStop(0, "#57534e");
    gnd.addColorStop(1, "#292524");
    ctx.fillStyle = gnd;
    ctx.fillRect(0, st.h * 0.6, st.w, st.h * 0.4);

    // Battle scarred ground details
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let i = 0; i < 12; i++) {
      const bx = (i * 173) % st.w;
      ctx.beginPath();
      ctx.ellipse(bx, st.h * (0.65 + (i % 3) * 0.09), 20 + (i % 4) * 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Castles ---
    const drawCastle = (x: number, flip: boolean, hpFrac: number, isEnemy: boolean) => {
      const baseY = st.h * 0.6;
      const cw = 130, ch = 130;
      // Main keep
      const keep = ctx.createLinearGradient(x, baseY - ch, x, baseY);
      keep.addColorStop(0, isEnemy ? "#57534e" : "#64748b");
      keep.addColorStop(1, isEnemy ? "#292524" : "#334155");
      ctx.fillStyle = keep;
      ctx.fillRect(x, baseY - ch, cw, ch);
      // Battlements
      for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 34, baseY - ch - 16, 24, 16);
      // Towers
      ctx.fillRect(x - 14, baseY - ch * 0.7, 20, ch * 0.7);
      ctx.fillRect(x + cw - 6, baseY - ch * 0.7, 20, ch * 0.7);
      ctx.fillStyle = isEnemy ? "#44403c" : "#475569";
      ctx.beginPath();
      ctx.moveTo(x - 16, baseY - ch * 0.7);
      ctx.lineTo(x - 4, baseY - ch * 0.7 - 18);
      ctx.lineTo(x + 8, baseY - ch * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + cw - 8, baseY - ch * 0.7);
      ctx.lineTo(x + cw + 4, baseY - ch * 0.7 - 18);
      ctx.lineTo(x + cw + 16, baseY - ch * 0.7);
      ctx.closePath();
      ctx.fill();
      // Gate
      ctx.fillStyle = "#1c1917";
      ctx.beginPath();
      ctx.roundRect(x + cw / 2 - 16, baseY - 34, 32, 34, [16, 16, 0, 0]);
      ctx.fill();
      // Flag
      ctx.strokeStyle = "#44403c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + cw / 2, baseY - ch - 16);
      ctx.lineTo(x + cw / 2, baseY - ch - 42);
      ctx.stroke();
      ctx.fillStyle = isEnemy ? "#ef4444" : "#3b82f6";
      const wave = Math.sin(st.frame * 0.1) * 4;
      ctx.beginPath();
      ctx.moveTo(x + cw / 2, baseY - ch - 42);
      ctx.lineTo(x + cw / 2 + (flip ? -26 : 26), baseY - ch - 38 + wave);
      ctx.lineTo(x + cw / 2, baseY - ch - 30);
      ctx.closePath();
      ctx.fill();
      // HP bar
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(x, baseY - ch - 60, cw, 12, 6);
      ctx.fill();
      ctx.fillStyle = hpFrac > 0.5 ? "#22c55e" : hpFrac > 0.25 ? "#fbbf24" : "#ef4444";
      ctx.beginPath();
      ctx.roundRect(x + 2, baseY - ch - 58, (cw - 4) * Math.max(0, hpFrac), 8, 4);
      ctx.fill();
    };

    drawCastle(30, false, st.playerHP / PLAYER_HP, false);
    drawCastle(st.w - 160, true, st.enemyHP / ENEMY_HP, true);

    // --- Soldiers ---
    const soldierY = st.h * 0.62;
    for (const sd of st.soldiers) {
      const isP = sd.side === "player";
      const x = sd.x;
      const march = Math.sin(st.frame * 0.25 + sd.id * 10) * 3;
      // Legs
      ctx.strokeStyle = isP ? "#1e3a8a" : "#7f1d1d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, soldierY + 12);
      ctx.lineTo(x - 4 + march, soldierY + 22);
      ctx.moveTo(x, soldierY + 12);
      ctx.lineTo(x + 4 - march, soldierY + 22);
      ctx.stroke();
      // Body (armor)
      ctx.fillStyle = isP ? "#3b82f6" : "#ef4444";
      ctx.beginPath();
      ctx.roundRect(x - 6, soldierY - 6, 12, 18, 4);
      ctx.fill();
      // Head (helm)
      ctx.fillStyle = isP ? "#93c5fd" : "#fca5a5";
      ctx.beginPath();
      ctx.arc(x, soldierY - 12, 6, 0, Math.PI * 2);
      ctx.fill();
      // Sword
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + (isP ? 8 : -8), soldierY + 2);
      ctx.lineTo(x + (isP ? 18 : -18), soldierY - 6);
      ctx.stroke();
      // Shield
      ctx.fillStyle = isP ? "#1d4ed8" : "#b91c1c";
      ctx.beginPath();
      ctx.arc(x + (isP ? -8 : 8), soldierY + 2, 5, 0, Math.PI * 2);
      ctx.fill();
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

    if (!st.over) st.animId = requestAnimationFrame(loop);
  }

  // Keyboard shortcuts: 1-4 for choices
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (gameOver || cooldown || choices.length === 0) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= choices.length) answer(num - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [gameOver, cooldown, choices]);

  function answer(i: number) {
    const st = s.current;
    if (cooldown || gameOver || choices.length === 0) return;
    const correct = choices[i].correct;
    const ms = Date.now() - st.lastAnswerTime;
    st.recentAnswers.push({ correct, ms });
    if (st.recentAnswers.length > 5) st.recentAnswers.shift();
    setLastAnswer(i);
    setLastCorrect(correct);
    if (correct) {
      st.wave++;
      st.soldiers.push({ x: 165, side: "player", id: Math.random() });
      setScore((sc) => sc + (ms < 2000 ? 150 : 100));
      setMessage("Knight deployed!");
      setTimeout(() => { setLastAnswer(null); newQuestion(); }, 350);
    } else {
      setCooldown(true);
      setMessage("Missed. Regrouping...");
      setTimeout(() => { setCooldown(false); setLastAnswer(null); setMessage(null); }, 900);
    }
  }

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "castle-siege", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: s.current.recentAnswers.length, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 4) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 4 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  const won = enemyHP <= 0;

  return (
    <div className="relative flex h-full flex-col bg-[#1e1b4b]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={onCancel} className="rounded-lg bg-black/40 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-black/60">Back</button>
        <span className="font-mono text-sm text-white/80">Score: {score.toLocaleString()}</span>
      </div>

      {/* Battlefield */}
      <canvas ref={canvasRef} className="w-full min-h-0 flex-1" />

      {/* Question panel (DOM — KaTeX renders here) */}
      <div className="shrink-0 border-t border-white/10 bg-black/70 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 rounded-lg border border-indigo-400/40 bg-indigo-950/60 px-4 py-1.5 text-center">
            <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(question?.back ?? "") }} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {choices.map((c, i) => (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={cooldown}
                className={`min-w-32 rounded-lg border px-3 py-3 text-base font-semibold transition ${
                  lastAnswer === i
                    ? lastCorrect ? "border-green-400 bg-green-500/30 text-green-200" : "border-red-400 bg-red-500/30 text-red-200"
                    : cooldown
                      ? "border-white/10 bg-white/5 text-white/40"
                      : "border-indigo-400/40 bg-indigo-900/40 text-indigo-100 hover:bg-indigo-700/50 hover:border-indigo-300/60"
                }`}
              >
                <span className="mr-1.5 text-xs opacity-50">{i + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: renderRichInline(c.text) }} />
              </button>
            ))}
          </div>
          {message && (
            <p className={`mt-2 text-center text-sm font-semibold ${lastCorrect ? "text-green-400" : "text-red-400"}`}>{message}</p>
          )}
        </div>
      </div>

      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">{won ? "Victory!" : "Castle Fallen"}</p>
            <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
            <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
