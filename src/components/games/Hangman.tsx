import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "../../lib/games/types";
import { shuffle, prioritizeWeakCards, formatTime, stripLatex } from "../../lib/games/utils";
import { renderRichInline } from "../../lib/markdown";

const MAX_WRONG = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const BODY_PARTS: [number, number, number, number][] = [
  [50, 20, 50, 35], [50, 35, 50, 65], [50, 42, 38, 55],
  [50, 42, 62, 55], [50, 65, 42, 82], [50, 65, 58, 82],
];

interface HangmanEntry { id: string; word: string; clue: string; }

/** A term is hangman-friendly if it is 1-5 plain words of letters only
 *  (no numbers, no math notation), after stripping LaTeX delimiters. */
function typableTerm(text: string): string | null {
  const cleaned = stripLatex(text).trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const ok =
    words.length >= 1 &&
    words.length <= 5 &&
    cleaned.length >= 2 &&
    cleaned.length <= 28 &&
    /^[A-Za-zÀ-ÿ\s'-]+$/.test(cleaned);
  return ok ? cleaned : null;
}

export default function Hangman({ cards, onComplete, onCancel }: GameProps) {
  const [deck, setDeck] = useState<HangmanEntry[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [wrongCount, setWrongCount] = useState(0);
  const [score, setScore] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalWrong, setTotalWrong] = useState(0);
  const [cardsSeen, setCardsSeen] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    // For each card, guess the short typable term — it can live on either
    // side (regular flashcards: front=question, back=answer; game cards:
    // front=short answer, back=question). The other side becomes the clue.
    const entries: HangmanEntry[] = [];
    for (const c of prioritizeWeakCards(cards)) {
      const frontTerm = typableTerm(c.front);
      const backTerm = typableTerm(c.back);
      if (frontTerm) {
        entries.push({ id: c.id, word: frontTerm, clue: c.back });
      } else if (backTerm) {
        entries.push({ id: c.id, word: backTerm, clue: c.front });
      }
    }
    setDeck(shuffle(entries));
  }, [cards]);

  const current = deck[cardIndex];
  const word = current ? current.word.trim().toUpperCase() : "";
  const normalizedWord = word.replace(/[^A-Z]/g, "");

  const displayWord = useMemo(() => {
    return word.split("").map((ch) => (!/[A-Z]/.test(ch) ? ch : guessed.has(ch) ? ch : "_")).join(" ");
  }, [word, guessed]);

  const wordSolved = normalizedWord.split("").every((ch) => guessed.has(ch));
  const dead = wrongCount >= MAX_WRONG;

  const handleLetter = useCallback((letter: string) => {
    if (gameOver || !current || wordSolved || dead) return;
    const upper = letter.toUpperCase();
    if (guessed.has(upper)) return;
    const newGuessed = new Set(guessed);
    newGuessed.add(upper);
    setGuessed(newGuessed);
    if (!normalizedWord.includes(upper)) {
      const newWrong = wrongCount + 1;
      setWrongCount(newWrong);
      if (newWrong >= MAX_WRONG) {
        setTotalWrong((w) => w + 1);
        setCardsSeen((s) => s + 1);
        setMessage("Incorrect. The answer was: " + current.word);
      }
    }
    if (normalizedWord.split("").every((ch) => newGuessed.has(ch))) {
      const bonus = MAX_WRONG - wrongCount;
      setScore((s) => s + 100 + bonus * 50);
      setTotalCorrect((c) => c + 1);
      setCardsSeen((s) => s + 1);
      setMessage("Correct! +" + (100 + bonus * 50));
    }
  }, [gameOver, current, wordSolved, dead, guessed, wrongCount, normalizedWord]);

  const nextCard = useCallback(() => {
    if (cardIndex + 1 >= deck.length) { setGameOver(true); }
    else { setCardIndex((i) => i + 1); setGuessed(new Set()); setWrongCount(0); setMessage(null); }
  }, [cardIndex, deck.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (wordSolved || dead)) { nextCard(); return; }
      if (gameOver || wordSolved || dead) return;
      if (/^[a-zA-Z]$/.test(e.key)) handleLetter(e.key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleLetter, nextCard, gameOver, wordSolved, dead]);

  useEffect(() => {
    if (gameOver && onComplete) {
      const now = Date.now();
      onComplete({ gameId: "hangman", noteId: cards[0]?.noteId ?? "", score, accuracy: totalCorrect + totalWrong > 0 ? totalCorrect / (totalCorrect + totalWrong) : 0, cardsSeen, timePlayedMs: now - startTime.current, correctIds: [], wrongIds: [], playedAt: now });
    }
  }, [gameOver]);

  if (deck.length === 0) {
    return <div className="flex h-full flex-col items-center justify-center gap-4 p-8"><p className="text-ink-dim text-lg">No typable word answers found in these flashcards.</p><p className="text-sm text-ink-faint">Hangman needs 1-5 word answers made of letters only — no numbers or math notation. Try generating game cards for this note first.</p><button onClick={onCancel} className="rounded-xl bg-accent px-6 py-2 font-bold text-white">Back to Games</button></div>;
  }

  const isCorrectMsg = message?.startsWith("Correct");
  const isWrongMsg = message?.startsWith("Incorrect");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-dim hover:bg-card-hover">Back</button>
        <div className="flex items-center gap-4 text-sm font-mono text-ink-dim">
          <span>Score: {score}</span>
          <span>Card {cardIndex + 1}/{deck.length}</span>
          <span>{formatTime(Date.now() - startTime.current)}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8">
        <svg viewBox="0 0 100 100" className="h-44 w-44">
          <line x1={10} y1={95} x2={90} y2={95} stroke="currentColor" strokeWidth="2" className="text-ink-dim" />
          <line x1={30} y1={95} x2={30} y2={10} stroke="currentColor" strokeWidth="2" className="text-ink-dim" />
          <line x1={30} y1={10} x2={60} y2={10} stroke="currentColor" strokeWidth="2" className="text-ink-dim" />
          <line x1={60} y1={10} x2={60} y2={20} stroke="currentColor" strokeWidth="2" className="text-ink-dim" />
          {BODY_PARTS.map(([x1, y1, x2, y2], i) =>
            i < wrongCount ? (
              i === 0 ? (
                <circle key={i} cx={50} cy={27} r={7} fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500" />
              ) : (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" className="text-red-500" strokeLinecap="round" />
              )
            ) : null,
          )}
        </svg>
        <div className="max-w-lg text-center text-lg text-ink-dim italic" dangerouslySetInnerHTML={{ __html: renderRichInline(current?.clue ?? "") }} />
        <div className="font-mono text-3xl font-bold tracking-widest text-ink">{displayWord}</div>
        {message && <p className={`text-lg font-semibold ${isCorrectMsg ? "text-green-500" : isWrongMsg ? "text-red-500" : "text-ink-dim"}`}>{message}</p>}
        {!gameOver && !wordSolved && !dead && (
          <div className="grid max-w-md grid-cols-9 gap-1.5">
            {ALPHABET.map((letter) => {
              const used = guessed.has(letter);
              const correct = used && normalizedWord.includes(letter);
              const wrong = used && !normalizedWord.includes(letter);
              return (
                <button key={letter} onClick={() => handleLetter(letter)} disabled={used}
                  className={`rounded-lg px-0 py-2 text-sm font-bold transition ${correct ? "bg-green-500 text-white" : wrong ? "bg-red-500/30 text-ink-faint" : used ? "bg-card-hover text-ink-faint" : "bg-card text-ink hover:bg-accent hover:text-white"}`}>
                  {letter}
                </button>
              );
            })}
          </div>
        )}
        {(wordSolved || dead) && !gameOver && (
          <button onClick={nextCard} className="rounded-xl bg-accent px-8 py-3 font-display font-bold text-white hover:opacity-90">Next Word</button>
        )}
        {gameOver && (
          <div className="flex flex-col items-center gap-4">
            <p className="font-display text-2xl font-bold text-ink">Game Over</p>
            <p className="text-ink-dim">Final Score: <span className="font-bold text-ink">{score}</span> &middot; {totalCorrect}/{cardsSeen} correct &middot; {formatTime(Date.now() - startTime.current)}</p>
            <button onClick={onCancel} className="rounded-xl bg-accent px-8 py-3 font-display font-bold text-white hover:opacity-90">Back to Games</button>
          </div>
        )}
      </div>
    </div>
  );
}
