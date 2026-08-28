import { useCallback, useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, fuzzyMatch, formatTime } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

interface Building { x: number; y: number; w: number; h: number; hp: number; maxHp: number; name: string; windows: boolean[][]; onFire: boolean; }
interface Fire { x: number; y: number; life: number; size: number; }
interface Disaster { buildingIdx: number; type: "fire" | "storm" | "monster"; timer: number; maxTimer: number; question: Flashcard; }

const CITY: Omit<Building, "windows" | "onFire">[] = [
  { x: 60, y: 250, w: 70, h: 90, hp: 3, maxHp: 3, name: "Bakery" },
  { x: 180, y: 220, w: 80, h: 120, hp: 4, maxHp: 4, name: "Library" },
  { x: 310, y: 260, w: 60, h: 80, hp: 2, maxHp: 2, name: "Cafe" },
  { x: 420, y: 200, w: 90, h: 140, hp: 5, maxHp: 5, name: "Hospital" },
  { x: 570, y: 250, w: 70, h: 90, hp: 3, maxHp: 3, name: "Workshop" },
  { x: 700, y: 270, w: 60, h: 70, hp: 2, maxHp: 2, name: "Bookshop" },
];

export default function CityDefender({ cards, onComplete, onCancel }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [disaster, setDisaster] = useState<Disaster | null>(null);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const startTime = useRef(Date.now());

  const s = useRef({
    buildings: [] as Building[], fires: [] as Fire[],
    deck: [] as Flashcard[],
    disaster: null as Disaster | null,
    animId: 0, w: 840, h: 420, frame: 0, calmTimer: 240,
    stars: [] as { x: number; y: number }[],
  });

  useEffect(() => {
    if (cards.length < 4) return;
    const st = s.current;
    st.deck = prioritizeWeakCards(cards);
    st.buildings = CITY.map((b) => ({
      ...b,
      onFire: false,
      windows: Array.from({ length: Math.floor(b.h / 18) }, () =>
        Array.from({ length: Math.floor(b.w / 16) }, () => Math.random() > 0.4),
      ),
    }));
    for (let i = 0; i < 50; i++) st.stars.push({ x: Math.random() * 900, y: Math.random() * 180 });
    st.animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(st.animId);
  }, [cards]);

  function startDisaster() {
    const st = s.current;
    const alive = st.buildings.map((b, i) => ({ b, i })).filter((x) => x.b.hp > 0);
    if (alive.length === 0) { setGameOver(true); return; }
    const pick = alive[Math.floor(Math.random() * alive.length)];
    const types: Disaster["type"][] = ["fire", "storm", "monster"];
    const q = st.deck[Math.floor(Math.random() * st.deck.length)];
    const d: Disaster = {
      buildingIdx: pick.i,
      type: types[Math.floor(Math.random() * types.length)],
      timer: 600, maxTimer: 600, question: q,
    };
    st.disaster = d;
    setDisaster(d);
    setAnswer("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const handleAnswer = useCallback(() => {
    const st = s.current;
    const cur = st.disaster;
    if (!cur || !answer.trim()) return;
    if (fuzzyMatch(answer, cur.question.back, 2)) {
      st.buildings[cur.buildingIdx].onFire = false;
      st.fires = [];
      setScore((sc) => sc + 500);
      setMessage("Saved the " + st.buildings[cur.buildingIdx].name + "!");
      st.disaster = null;
      setDisaster(null);
      st.calmTimer = 220;
    } else {
      setMessage("Wrong — definition was: " + cur.question.back.slice(0, 50));
      cur.timer -= 90;
      setDisaster({ ...cur });
    }
    setAnswer("");
    setTimeout(() => setMessage(null), 1600);
  }, [answer, disaster]);

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

    // Scale city to canvas width
    const cityScale = Math.min(1, st.w / 840);

    // Disaster logic (uses the ref so the loop always sees fresh state)
    const cur = st.disaster;
    if (cur) {
      cur.timer--;
      // Spawn fire particles on the target building
      if (cur.type === "fire" && st.frame % 3 === 0) {
        const b = st.buildings[cur.buildingIdx];
        st.fires.push({ x: (b.x + Math.random() * b.w) * cityScale, y: (b.y + Math.random() * b.h * 0.4) * cityScale, life: 20, size: 5 + Math.random() * 8 });
      }
      if (cur.timer <= 0) {
        const b = st.buildings[cur.buildingIdx];
        b.hp--;
        setScore((sc) => sc - 150);
        st.disaster = null;
        setDisaster(null);
        st.calmTimer = 180;
        if (st.buildings.every((bb) => bb.hp <= 0)) setGameOver(true);
      } else if (st.frame % 6 === 0) {
        setDisaster({ ...cur }); // refresh the countdown display
      }
    } else {
      st.calmTimer--;
      if (st.calmTimer <= 0) startDisaster();
    }

    for (const f of st.fires) { f.y -= 1.2; f.life--; }
    st.fires = st.fires.filter((f) => f.life > 0);

    // ---------- RENDER ----------
    // Night sky
    const sky = ctx.createLinearGradient(0, 0, 0, st.h * 0.7);
    sky.addColorStop(0, "#0c0a1d");
    sky.addColorStop(0.7, "#1e1b4b");
    sky.addColorStop(1, "#312e81");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, st.w, st.h);

    // Stars
    ctx.fillStyle = "#fff";
    for (const star of st.stars) {
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(st.frame * 0.02 + star.x));
      ctx.fillRect((star.x * cityScale) % st.w, star.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // Moon
    ctx.fillStyle = "#fef3c7";
    ctx.beginPath();
    ctx.arc(st.w * 0.82, 60, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0c0a1d";
    ctx.beginPath();
    ctx.arc(st.w * 0.82 + 10, 55, 22, 0, Math.PI * 2);
    ctx.fill();

    // Ground
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(0, st.h * 0.78, st.w, st.h * 0.22);
    // Road
    ctx.fillStyle = "#292524";
    ctx.fillRect(0, st.h * 0.82, st.w, st.h * 0.1);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 16]);
    ctx.lineDashOffset = -st.frame;
    ctx.beginPath();
    ctx.moveTo(0, st.h * 0.87);
    ctx.lineTo(st.w, st.h * 0.87);
    ctx.stroke();
    ctx.setLineDash([]);

    // Buildings
    for (let i = 0; i < st.buildings.length; i++) {
      const b = st.buildings[i];
      const bx = b.x * cityScale;
      const bw = b.w * cityScale;
      const bh = b.h * cityScale;
      const baseY = st.h * 0.78;
      const top = baseY - bh;

      if (b.hp <= 0) {
        // Rubble
        ctx.fillStyle = "#292524";
        ctx.beginPath();
        ctx.moveTo(bx, baseY);
        ctx.lineTo(bx + bw * 0.2, baseY - bh * 0.25);
        ctx.lineTo(bx + bw * 0.5, baseY - bh * 0.12);
        ctx.lineTo(bx + bw * 0.8, baseY - bh * 0.3);
        ctx.lineTo(bx + bw, baseY);
        ctx.closePath();
        ctx.fill();
        continue;
      }

      const targeted = disaster && disaster.buildingIdx === i;
      // Building body
      const bodyG = ctx.createLinearGradient(bx, top, bx, baseY);
      bodyG.addColorStop(0, targeted ? "#7f1d1d" : "#3f3f46");
      bodyG.addColorStop(1, targeted ? "#450a0a" : "#1c1917");
      ctx.fillStyle = bodyG;
      ctx.fillRect(bx, top, bw, bh);
      ctx.strokeStyle = targeted ? "#ef4444" : "#52525b";
      ctx.lineWidth = targeted ? 2.5 : 1;
      ctx.strokeRect(bx, top, bw, bh);

      // Windows
      const winRows = Math.floor(b.h / 18);
      const winCols = Math.floor(b.w / 16);
      for (let wr = 0; wr < winRows; wr++) {
        for (let wc = 0; wc < winCols; wc++) {
          const lit = b.windows[wr]?.[wc];
          ctx.fillStyle = lit ? "#fbbf24" : "#18181b";
          ctx.fillRect(bx + 6 + wc * 16 * cityScale, top + 8 + wr * 18 * cityScale, 8 * cityScale, 10 * cityScale);
        }
      }

      // HP bar
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx, top - 10, bw, 5);
      ctx.fillStyle = b.hp / b.maxHp > 0.5 ? "#22c55e" : "#ef4444";
      ctx.fillRect(bx, top - 10, bw * (b.hp / b.maxHp), 5);

      // Name
      ctx.fillStyle = "#a1a1aa";
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(b.name, bx + bw / 2, baseY - 4);

      // Disaster visuals
      if (targeted && disaster) {
        if (disaster.type === "storm") {
          // Lightning bolt above building
          const lx = bx + bw / 2;
          ctx.strokeStyle = "#fef08a";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#fef08a";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(lx, 40);
          ctx.lineTo(lx - 12, 80);
          ctx.lineTo(lx + 4, 80);
          ctx.lineTo(lx - 10, top - 4);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (disaster.type === "monster") {
          // Monster approaching from left
          const mx = bx - 60 + Math.sin(st.frame * 0.1) * 4;
          const my = baseY - 30;
          ctx.fillStyle = "#581c87";
          ctx.beginPath();
          ctx.arc(mx, my, 22, 0, Math.PI * 2);
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(mx - 7, my - 5, 4, 0, Math.PI * 2);
          ctx.arc(mx + 7, my - 5, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.arc(mx - 7, my - 5, 2, 0, Math.PI * 2);
          ctx.arc(mx + 7, my - 5, 2, 0, Math.PI * 2);
          ctx.fill();
          // Legs
          ctx.strokeStyle = "#581c87";
          ctx.lineWidth = 4;
          const step = Math.sin(st.frame * 0.2) * 6;
          ctx.beginPath();
          ctx.moveTo(mx - 10, my + 18);
          ctx.lineTo(mx - 12 + step, my + 32);
          ctx.moveTo(mx + 10, my + 18);
          ctx.lineTo(mx + 12 - step, my + 32);
          ctx.stroke();
        }
      }
    }

    // Fire particles
    for (const f of st.fires) {
      const alpha = f.life / 20;
      ctx.globalAlpha = alpha;
      const fireG = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, f.size);
      fireG.addColorStop(0, "#fef08a");
      fireG.addColorStop(0.5, "#f97316");
      fireG.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = fireG;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.fillStyle = "rgba(10,10,25,0.75)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 150, 52, 10);
    ctx.fill();
    ctx.fillStyle = "#a5b4fc";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("SCORE", 22, 26);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(score.toLocaleString(), 22, 48);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "12px monospace";
    ctx.textAlign = "right";
    const aliveCount = st.buildings.filter((b) => b.hp > 0).length;
    ctx.fillText(`Buildings: ${aliveCount}/${st.buildings.length}`, st.w - 14, 26);

    if (!gameOver) st.animId = requestAnimationFrame(loop);
  }

  useEffect(() => {
    if (gameOver && onComplete) {
      onComplete({ gameId: "city-defender", noteId: cards[0]?.noteId ?? "", score, accuracy: 0, cardsSeen: 0, timePlayedMs: Date.now() - startTime.current, correctIds: [], wrongIds: [], playedAt: Date.now() });
    }
  }, [gameOver]);

  if (cards.length < 4) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 4 flashcards.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="flex h-full flex-col bg-[#0c0a1d]">
      <div className="flex items-center justify-between px-4 py-2">
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/80 hover:bg-white/20">Back</button>
        <span className="font-mono text-sm text-white/80">{formatTime(Date.now() - startTime.current)}</span>
      </div>
      <canvas ref={canvasRef} className="w-full flex-1" />
      {disaster && (
        <div className="border-t border-red-500/40 bg-red-950/60 px-4 py-3">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <span className="text-sm font-bold text-red-300">
              {disaster.type === "fire" ? "FIRE at" : disaster.type === "storm" ? "LIGHTNING at" : "MONSTER attacking"} the {s.current.buildings[disaster.buildingIdx]?.name}!
              <span className="ml-2 font-mono text-red-400">{(disaster.timer / 60).toFixed(0)}s</span>
            </span>
          </div>
          <div className="mx-auto mt-2 max-w-2xl rounded-lg bg-black/40 px-3 py-2 text-center">
            <span className="text-sm font-semibold text-white" dangerouslySetInnerHTML={{ __html: renderRichInline(disaster.question.front) }} />
          </div>
          <div className="mx-auto mt-2 flex max-w-2xl items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnswer()}
              placeholder="Type the definition to respond..."
              className="flex-1 rounded-lg border border-red-400/40 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-red-400 focus:outline-none"
            />
            <button onClick={handleAnswer} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-500">Respond</button>
          </div>
        </div>
      )}
      {message && (
        <div className="bg-black/40 py-1 text-center">
          <p className={`text-sm font-semibold ${message.startsWith("Saved") ? "text-green-400" : "text-red-400"}`}>{message}</p>
        </div>
      )}
      {gameOver && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">City Fallen</p>
            <p className="text-ink-dim">Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
            <button onClick={onCancel} className="mt-2 rounded-xl bg-accent px-8 py-3 font-bold text-white">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
