import { useCallback, useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";
import type { GameProps } from "../../lib/games/types";
import { prioritizeWeakCards, formatTime, stripLatex } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

interface JeopardyClue { card: Flashcard; value: number; revealed: boolean; dailyDouble: boolean; }

export default function Jeopardy({ cards, onComplete, onCancel }: GameProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [board, setBoard] = useState<JeopardyClue[][]>([]);
  const [score, setScore] = useState(0);
  const [activeClue, setActiveClue] = useState<{ row: number; col: number } | null>(null);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [finalJeopardy, setFinalJeopardy] = useState(false);
  const [fjWager, setFjWager] = useState(0);
  const [fjCard, setFjCard] = useState<Flashcard | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalClues, setTotalClues] = useState(0);
  const startTime = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const ROWS = 5; const COLS = 5; const VALUES = [100, 200, 300, 400, 500];

  useEffect(() => {
    if (cards.length < 5) return;
    const picked = prioritizeWeakCards(cards).slice(0, ROWS * COLS + 1);
    const cats: string[] = [];
    const perCat = Math.floor((picked.length - 1) / COLS);
    for (let c = 0; c < COLS; c++) {
      const catCards = picked.slice(c * perCat, (c + 1) * perCat);
      const topics = catCards.map((cc) => cc.topic).filter(Boolean);
      const topTopic = topics.sort((a, b) => topics.filter((t) => t === b).length - topics.filter((t) => t === a).length)[0];
      cats.push(topTopic || `Category ${c + 1}`);
    }
    const boardData: JeopardyClue[][] = [];
    for (let c = 0; c < COLS; c++) {
      const col: JeopardyClue[] = [];
      for (let r = 0; r < ROWS; r++) {
        const idx = c * perCat + r;
        const isDD = Math.random() < 0.08;
        col.push({ card: picked[idx] ?? picked[0], value: VALUES[r], revealed: false, dailyDouble: isDD });
      }
      boardData.push(col);
    }
    setBoard(boardData);
    setCategories(cats);
    setFjCard(picked[picked.length - 1] ?? null);
  }, [cards]);

  const revealedCount = board.flat().filter((c) => c.revealed).length;
  const allRevealed = revealedCount >= ROWS * COLS;

  const handleSelect = (col: number, row: number) => {
    if (board[col]?.[row]?.revealed || activeClue || finalJeopardy || gameOver) return;
    setActiveClue({ row, col });
    setAnswer("");
    setMessage(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const submitAnswer = useCallback(() => {
    if (!activeClue) return;
    const clue = board[activeClue.col]?.[activeClue.row];
    if (!clue) return;
    const trimmed = stripLatex(answer.trim()).toLowerCase();
    const expected = stripLatex(clue.card.front.trim()).toLowerCase();
    const correct = trimmed === expected || (trimmed.length > 2 && expected.includes(trimmed)) || (expected.length > 2 && trimmed.includes(expected));
    const newBoard = board.map((col) => col.map((c) => ({ ...c })));
    newBoard[activeClue.col][activeClue.row].revealed = true;
    setBoard(newBoard);
    if (correct) { setScore((s) => s + clue.value); setTotalCorrect((c) => c + 1); setMessage(`Correct! +${clue.value}`); }
    else { setScore((s) => s - clue.value); setMessage(`Incorrect. The answer was: ${clue.card.front}`); }
    setTotalClues((t) => t + 1);
    setAnswer("");
    setTimeout(() => { setActiveClue(null); setMessage(null); }, 1500);
  }, [activeClue, answer, board]);

  const startFinalJeopardy = () => { setFinalJeopardy(true); setActiveClue(null); };

  const submitFJ = useCallback(() => {
    if (!fjCard) return;
    const trimmed = stripLatex(answer.trim()).toLowerCase();
    const expected = stripLatex(fjCard.front.trim()).toLowerCase();
    const correct = trimmed === expected || (trimmed.length > 2 && expected.includes(trimmed));
    if (correct) setScore((s) => s + fjWager); else setScore((s) => s - fjWager);
    setGameOver(true);
  }, [answer, fjCard, fjWager]);

  useEffect(() => {
    if (gameOver && onComplete) {
      const now = Date.now();
      onComplete({ gameId: "jeopardy", noteId: cards[0]?.noteId ?? "", score, accuracy: totalClues > 0 ? totalCorrect / totalClues : 0, cardsSeen: totalClues, timePlayedMs: now - startTime.current, correctIds: [], wrongIds: [], playedAt: now });
    }
  }, [gameOver]);

  if (cards.length < 5) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">Need at least 5 flashcards for Jeopardy.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back</button></div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-dim hover:bg-card-hover">Back</button>
        <div className="flex items-center gap-4 text-sm font-mono">
          <span className="text-ink font-bold">Score: {score.toLocaleString()}</span>
          <span className="text-ink-dim">{formatTime(Date.now() - startTime.current)}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center gap-4 px-6 pb-8 overflow-auto">
        {allRevealed && !finalJeopardy && !gameOver && (
          <button onClick={startFinalJeopardy} className="rounded-xl bg-amber-500 px-8 py-3 font-display font-bold text-white hover:opacity-90">Final Jeopardy</button>
        )}
        {finalJeopardy && !gameOver && fjCard && (
          <div className="w-full max-w-lg rounded-card border-2 border-amber-500 bg-card p-8 text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-amber-500">Final Jeopardy</p>
            <div className="mt-4 text-lg text-ink-dim italic" dangerouslySetInnerHTML={{ __html: renderRichInline(fjCard.back) }} />
            {fjWager === 0 ? (
              <div className="mt-4">
                <p className="text-sm text-ink-faint mb-2">Enter your wager (max {Math.max(score, 500)}):</p>
                <input type="number" min={0} max={Math.max(score, 500)} className="w-32 rounded-lg border border-edge bg-panel px-3 py-2 text-center text-ink" onChange={(e) => setFjWager(Number(e.target.value))} />
                {fjWager > 0 && <button onClick={() => { setAnswer(""); setTimeout(() => inputRef.current?.focus(), 100); }} className="ml-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white">Set Wager</button>}
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm text-ink-faint mb-2">Wager: {fjWager}</p>
                <div className="flex items-center justify-center gap-3">
                  <input ref={inputRef} type="text" value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitFJ()} placeholder="Your response..." className="w-64 rounded-lg border border-edge bg-panel px-4 py-2 text-ink" />
                  <button onClick={submitFJ} className="rounded-lg bg-amber-500 px-4 py-2 font-bold text-white">Submit</button>
                </div>
              </div>
            )}
          </div>
        )}
        {activeClue && board[activeClue.col]?.[activeClue.row] && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50" onClick={() => setActiveClue(null)}>
            <div className="w-full max-w-lg rounded-card border-2 border-accent bg-card p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs font-bold uppercase tracking-wider text-accent">{categories[activeClue.col]}</p>
              <p className="mt-1 text-sm text-ink-faint">for {board[activeClue.col][activeClue.row].value} points</p>
              <div className="mt-4 text-lg text-ink-dim italic" dangerouslySetInnerHTML={{ __html: renderRichInline(board[activeClue.col][activeClue.row].card.back) }} />
              <div className="mt-6 flex items-center gap-3">
                <input ref={inputRef} type="text" value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAnswer()} placeholder="What is...?" className="flex-1 rounded-lg border border-edge bg-panel px-4 py-2 text-ink" autoFocus />
                <button onClick={submitAnswer} className="rounded-lg bg-accent px-6 py-2 font-bold text-white">Submit</button>
              </div>
              {message && <p className={`mt-4 text-center font-semibold ${message.startsWith("Correct") ? "text-green-500" : "text-red-500"}`}>{message}</p>}
            </div>
          </div>
        )}
        {!finalJeopardy && (
          <div className="w-full max-w-4xl overflow-x-auto">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS + 1}, minmax(100px, 1fr))` }}>
              <div className="rounded-lg bg-card p-2 text-center text-xs font-bold text-ink-faint uppercase">Jeopardy</div>
              {categories.map((cat, c) => (
                <div key={c} className="rounded-lg bg-accent px-2 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">{cat}</div>
              ))}
              {Array.from({ length: ROWS }).map((_, r) => (
                <>
                  <div key={`val-${r}`} className="flex items-center justify-center rounded-lg bg-card px-2 py-4 text-sm font-bold text-accent">{VALUES[r]}</div>
                  {Array.from({ length: COLS }).map((_, c) => {
                    const clue = board[c]?.[r];
                    if (!clue) return <div key={c} className="rounded-lg bg-panel py-4" />;
                    return (
                      <button key={c} onClick={() => handleSelect(c, r)} disabled={clue.revealed}
                        className={`rounded-lg py-4 text-center transition ${clue.revealed ? "bg-panel/50 text-ink-faint/30 cursor-default" : clue.dailyDouble ? "bg-amber-500/20 hover:bg-amber-500/40 font-bold text-amber-600" : "bg-card hover:bg-accent/10 font-bold text-accent"}`}>
                        {clue.revealed ? "" : clue.dailyDouble ? "DD" : clue.value}
                      </button>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        )}
      </div>
      {gameOver && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-4 rounded-card border border-edge bg-card p-8 shadow-2xl">
            <p className="font-display text-2xl font-bold text-ink">Game Over</p>
            <p className="text-ink-dim">Final Score: <span className="font-bold text-ink">{score.toLocaleString()}</span></p>
            <button onClick={onCancel} className="rounded-xl bg-accent px-8 py-3 font-display font-bold text-white hover:opacity-90">Back to Games</button>
          </div>
        </div>
      )}
    </div>
  );
}
