/* Study progress for a single document. Zero AI cost — pure math from
   existing flashcard FSRS states and quiz attempt history. */

import { useEffect, useState } from "react";
import { BarChart3, Brain, TrendingUp } from "lucide-react";
import { useApp } from "../lib/app";
import type { Flashcard, Note, QuizAttempt, QuizQuestion } from "../lib/types";

interface TopicStat {
  topic: string;
  correct: number;
  total: number;
  pct: number;
}

export default function ProgressView({ note }: { note: Note }) {
  const { repo } = useApp();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  useEffect(() => {
    if (!repo) return;
    repo.cardsFor(note.id).then(setCards);
    repo.attemptsFor(note.id).then(setAttempts);
    repo.questionsFor(note.id).then(setQuestions);
  }, [repo, note.id]);

  const learned = cards.filter((c) => c.state === "review" && c.stability > 7).length;
  const reviewing = cards.filter((c) => c.state === "review" && c.stability <= 7).length;
  const learning = cards.filter((c) => c.state === "learning").length;
  const newCards = cards.filter((c) => c.state === "new").length;

  // Topic stats from quiz attempts
  const topicStats: TopicStat[] = (() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const a of attempts) {
      const q = questions.find((q) => q.id === a.questionId);
      const topic = q?.topic || "General";
      const entry = map.get(topic) || { correct: 0, total: 0 };
      entry.total++;
      if (a.correct) entry.correct++;
      map.set(topic, entry);
    }
    return Array.from(map.entries())
      .map(([topic, s]) => ({ topic, ...s, pct: Math.round((s.correct / s.total) * 100) }))
      .sort((a, b) => a.pct - b.pct);
  })();

  const quizAvg = attempts.length > 0
    ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100)
    : null;

  return (
    <div className="flex flex-col gap-6 p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <BarChart3 className="size-6 text-accent" />
        <h2 className="font-display text-2xl font-bold">Study Progress</h2>
      </div>

      {/* Flashcard overview */}
      {cards.length > 0 && (
        <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
          <h3 className="flex items-center gap-2 font-display font-bold"><Brain className="size-4 text-accent" /> Flashcards</h3>
          <div className="mt-3 space-y-2">
            {[
              { label: "Learned", count: learned, color: "bg-green-500", pct: cards.length ? Math.round((learned / cards.length) * 100) : 0 },
              { label: "Reviewing", count: reviewing, color: "bg-accent", pct: cards.length ? Math.round((reviewing / cards.length) * 100) : 0 },
              { label: "Learning", count: learning, color: "bg-yellow-500", pct: cards.length ? Math.round((learning / cards.length) * 100) : 0 },
              { label: "New", count: newCards, color: "bg-ink-faint", pct: cards.length ? Math.round((newCards / cards.length) * 100) : 0 },
            ].map(({ label, count, color, pct }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-20 text-sm font-semibold text-ink-dim">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-panel overflow-hidden">
                  <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-semibold">{count}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-faint">{cards.length} total cards · FSRS spaced repetition active</p>
        </div>
      )}

      {/* Quiz topic breakdown */}
      {topicStats.length > 0 && (
        <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
          <h3 className="flex items-center gap-2 font-display font-bold"><TrendingUp className="size-4 text-accent" /> Quiz Performance</h3>
          {quizAvg !== null && (
            <p className="mt-1 text-sm text-ink-faint">{attempts.length} {attempts.length === 1 ? "attempt" : "attempts"} · avg {quizAvg}%</p>
          )}
          <div className="mt-3 space-y-2">
            {topicStats.map((s) => (
              <div key={s.topic} className="flex items-center gap-3">
                <span className={`w-24 text-sm font-semibold truncate ${s.pct < 60 ? "text-danger-ink" : "text-ink-dim"}`}>
                  {s.pct < 60 && "⚠ "}{s.topic}
                </span>
                <div className="flex-1 h-2 rounded-full bg-panel overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${s.pct >= 80 ? "bg-green-500" : s.pct >= 60 ? "bg-accent" : "bg-danger-ink"}`} style={{ width: `${s.pct}%` }} />
                </div>
                <span className="w-10 text-right text-sm font-semibold">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cards.length === 0 && attempts.length === 0 && (
        <div className="text-center text-ink-faint py-8">
          <Brain className="size-10 mx-auto mb-3 opacity-30" />
          <p className="font-display font-bold">No study data yet</p>
          <p className="text-sm mt-1">Generate flashcards or take a quiz to see your progress here.</p>
        </div>
      )}
    </div>
  );
}
