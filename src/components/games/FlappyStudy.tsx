import { useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, buildGameChoices } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const GRAVITY = 0.35;
const FLAP = -6.5;
const PIPE_W = 70;
const GAP = 150;
const SPACING = 280;

interface Pipe { x: number; gapY: number; answer: string; correct: boolean; scored: boolean; }
interface Cloud { x: number; y: number; scale: number; speed: number; }

export default function FlappyStudy({ cards, gameChoices, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [question, setQuestion] = useState<Flashcard | null>(null);
  const [started, setStarted] = useState(false);
  const startTime = useRef(Date.now());

  const s = useRef({
    birdY: 250, birdV: 0, tilt: 0,
    pipes: [] as Pipe[], clouds: [] as Cloud[],
    deck: [] as Flashcard[], question: null as Flashcard | null,
    animId: 0, w: 700, h: 520, frame: 0,
  });

  useEffect(() => {
    if (cards.length < 3) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    st.question = st.deck[0];
    setQuestion(st.question);
    for (let i = 0; i < 3; i++) addPipe(500 + i * SPACING);
    for (let i = 0; i < 6; i++) {
      st.clouds.push({ x: Math.random() * 1200, y: 40 + Math.random() * 140, scale: 0.6 + Math.random() * 0.8, speed: 0.3 + Math.random() * 0.4 });
    }
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function addPipe(x: number) {
    const st = s.current;
    const gapY = 90 + Math.random() * (st.h - GAP - 220);
    // Half of pipes are the correct answer; half are AI-generated wrong answers
    const correct = Math.random() > 0.5;
    const choices = buildGameChoices(st.question!, st.deck, gameChoices, 4);
    const wrongs = choices.filter((o) => !o.correct).map((o) => o.text);
    const answer = correct ? st.question!.front : (wrongs[Math.floor(Math.random() * wrongs.length)] ?? "?");
    st.pipes.push({ x, gapY, answer, correct, scored: false });
  }

  function flap() {
    if (gameOver) return;
    if (!started) setStarted(true);
    s.current.birdV = FLAP;
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

    if (started && !gameOver) {
      st.birdV += GRAVITY;
      st.birdY += st.birdV;
      st.tilt = Math.max(-0.4, Math.min(0.9, st.birdV * 0.08));
      if (st.birdY < 10 || st.birdY > st.h - 60) { setGameOver(true); }
    }

    for (const p of st.pipes) if (started) p.x -= 2.6;
    st.pipes = st.pipes.filter((p) => p.x > -PIPE_W - 10);
    if (st.pipes.length > 0 && st.pipes[st.pipes.length - 1].x < st.w - SPACING) addPipe(st.w + 60);

    // Clouds drift
    for (const c of st.clouds) { c.x -= c.speed; if (c.x < -120) { c.x = st.w + 100; c.y = 40 + Math.random() * 140; } }

    // Collision + scoring
    const bx = 90;
    for (const p of st.pipes) {
      if (!p.scored && p.x + PIPE_W < bx) {
        p.scored = true;
        // Passed the pipe
        if (p.correct) { setScore((sc) => sc + 100); }
        else { setScore((sc) => sc + 25); }
      }
      if (started && bx + 16 > p.x && bx - 16 < p.x + PIPE_W) {
        const inGap = st.birdY - 12 > p.gapY && st.birdY + 12 < p.gapY + GAP;
        if (!inGap) { setGameOver(true); }
      }
      // Cycle question when the pipe leaves the left edge
      if (p.x + PIPE_W < 0 && !p.correct) {
        const idx = (st.deck.indexOf(st.question!) + 1) % st.deck.length;
        st.question = st.deck[idx];
        setQuestion(st.question);
      }
    }

    // ---------- RENDER ----------
    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, st.h);
    sky.addColorStop(0, "#38bdf8");
    sky.addColorStop(0.6, "#7dd3fc");
    sky.addColorStop(1, "#bae6fd");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, st.w, st.h);

    // Clouds
    for (const c of st.clouds) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 34 * c.scale, 16 * c.scale, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 22 * c.scale, c.y + 5 * c.scale, 26 * c.scale, 13 * c.scale, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x - 22 * c.scale, c.y + 6 * c.scale, 24 * c.scale, 12 * c.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground
    const gnd = ctx.createLinearGradient(0, st.h - 56, 0, st.h);
    gnd.addColorStop(0, "#84cc16");
    gnd.addColorStop(0.25, "#65a30d");
    gnd.addColorStop(1, "#3f6212");
    ctx.fillStyle = gnd;
    ctx.fillRect(0, st.h - 56, st.w, 56);
    // Moving grass stripes
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    const gs = (st.frame * 2.6) % 46;
    for (let x = -gs; x < st.w; x += 46) ctx.fillRect(x, st.h - 52, 18, 4);

    // Pipes
    for (const p of st.pipes) {
      const pipeGrad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
      pipeGrad.addColorStop(0, "#16a34a");
      pipeGrad.addColorStop(0.5, "#4ade80");
      pipeGrad.addColorStop(1, "#15803d");
      ctx.fillStyle = pipeGrad;
      // Top pipe
      ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
      ctx.fillStyle = "#166534";
      ctx.fillRect(p.x - 5, p.gapY - 22, PIPE_W + 10, 22); // cap
      // Bottom pipe
      ctx.fillStyle = pipeGrad;
      ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, st.h - p.gapY - GAP);
      ctx.fillStyle = "#166534";
      ctx.fillRect(p.x - 5, p.gapY + GAP, PIPE_W + 10, 22); // cap
      // Answer plaque on top cap
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.roundRect(p.x - 30, p.gapY - 48, PIPE_W + 60, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      const label = p.answer.length > 14 ? p.answer.slice(0, 12) + "…" : p.answer;
      ctx.fillText(label, p.x + PIPE_W / 2, p.gapY - 34);
    }

    // Bird
    ctx.save();
    ctx.translate(bx, st.birdY);
    ctx.rotate(st.tilt);
    // Wing
    const wingFlap = Math.sin(st.frame * 0.4) * 6;
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.ellipse(-4, -2 + wingFlap, 10, 6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Body
    const birdG = ctx.createRadialGradient(-3, -4, 2, 0, 0, 17);
    birdG.addColorStop(0, "#fde047");
    birdG.addColorStop(1, "#f59e0b");
    ctx.fillStyle = birdG;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    // Belly
    ctx.fillStyle = "#fef3c7";
    ctx.beginPath();
    ctx.ellipse(2, 5, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(6, -4, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c1917";
    ctx.beginPath();
    ctx.arc(7, -4, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Beak
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(12, -1);
    ctx.lineTo(20, 2);
    ctx.lineTo(12, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // HUD
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 130, 52, 10);
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("SCORE", 22, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(score.toLocaleString(), 22, 48);

    // Start prompt
    if (!started && !gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.roundRect(st.w / 2 - 170, st.h * 0.45, 340, 70, 14);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Click or press Space to flap", st.w / 2, st.h * 0.45 + 28);
      ctx.fillStyle = "#bae6fd";
      ctx.font = "12px system-ui";
      ctx.fillText("Fly through pipes. Question cycles as pipes pass.", st.w / 2, st.h * 0.45 + 50);
    }

    if (!gameOver) st.animId = requestAnimationFrame(loop);
  }

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); } };
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, [gameOver, started]);

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "flappy-study", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: 0, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 3) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 3 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="relative flex h-full flex-col bg-sky-400">
      <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
        <div className="rounded-xl border border-white/30 bg-black/60 px-6 py-2 shadow-xl backdrop-blur">
          <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(question?.back ?? "") }} />
        </div>
      </div>
      <button onClick={onCancel} className="absolute left-3 top-3 z-20 rounded-lg bg-black/40 px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-black/60">Back</button>
      <canvas ref={canvasRef} className="flex-1 w-full" onClick={flap} />
      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
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
