/* Study progress dashboard — KPI cards, flashcard breakdown, topic mastery.
   Zero AI cost — pure math from FSRS card states and quiz attempt history. */

import { useEffect, useState } from "react";
import { Brain, CheckCircle, Layers, ListChecks, Loader2, Target, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/app";
import { generateQuiz } from "../lib/generation";
import type { Flashcard, Note, QuizAttempt, QuizQuestion } from "../lib/types";

interface TopicStat {
  topic: string;
  correct: number;
  total: number;
  pct: number;
}

function KpiCard({ icon: Icon, value, label, color }: { icon: typeof Brain; value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-card border border-edge bg-card p-5 shadow-soft">
      <Icon className={`size-6 ${color}`} />
      <span className="font-display text-2xl font-bold">{value}</span>
      <span className="text-xs text-ink-faint">{label}</span>
    </div>
  );
}

export default function ProgressView({ note }: { note: Note }) {
  const { repo, engine } = useApp();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [genQuizOnWeak, setGenQuizOnWeak] = useState(false);

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

  // Overall mastery: weighted blend of flashcard state + quiz accuracy
  const cardMastery = cards.length > 0
    ? Math.round(((learned * 1.0 + reviewing * 0.7 + learning * 0.3) / cards.length) * 100)
    : null;
  const quizAvg = attempts.length > 0
    ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100)
    : null;
  const mastery = cardMastery !== null && quizAvg !== null
    ? Math.round(cardMastery * 0.6 + quizAvg * 0.4)
    : cardMastery ?? quizAvg ?? null;

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

  async function handleWeakQuiz() {
    if (!repo || !engine) return;
    setGenQuizOnWeak(true);
    try {
      const qs = await generateQuiz(engine, note, { count: 8, difficulty: "intermediate" });
      if (qs.length > 0) await repo.putQuestions(qs);
      navigate(`/notes/${note.id}/quiz`);
    } catch {} finally { setGenQuizOnWeak(false); }
  }

  const bars = [
    { label: "Learned", count: learned, color: "bg-green-500", icon: CheckCircle },
    { label: "Reviewing", count: reviewing, color: "bg-accent", icon: Layers },
    { label: "Learning", count: learning, color: "bg-yellow-500", icon: TrendingUp },
    { label: "New", count: newCards, color: "bg-slate-300", icon: Layers },
  ];

  return (
    <div className="flex flex-col gap-6 p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Brain className="size-6 text-accent" />
        <h2 className="font-display text-2xl font-bold">Study Progress</h2>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard icon={Target} value={mastery !== null ? `${mastery}%` : "—"} label="Mastery" color="text-accent" />
        <KpiCard icon={Layers} value={cards.length > 0 ? String(cards.length) : "—"} label="Flashcards" color="text-blue-500" />
        <KpiCard icon={ListChecks} value={quizAvg !== null ? `${quizAvg}%` : "—"} label="Quiz Avg" color="text-purple-500" />
      </div>

      {/* Flashcard breakdown */}
      {cards.length > 0 && (
        <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
          <h3 className="flex items-center gap-2 font-display font-bold text-sm mb-4">
            <Layers className="size-4 text-accent" /> Flashcard Breakdown
          </h3>
          <div className="space-y-3">
            {bars.map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-20 text-sm font-semibold text-ink-dim">{label}</span>
                <div className="flex-1 h-3 rounded-full bg-panel overflow-hidden">
                  <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${cards.length ? Math.round((count / cards.length) * 100) : 0}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-bold">{count}</span>
                <span className="w-10 text-right text-xs text-ink-faint">{cards.length ? Math.round((count / cards.length) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Topic mastery */}
      {topicStats.length > 0 && (
        <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
          <h3 className="flex items-center gap-2 font-display font-bold text-sm mb-4">
            <Target className="size-4 text-accent" /> Topic Mastery
          </h3>
          <div className="space-y-2">
            {topicStats.map((s) => (
              <div key={s.topic} className="flex items-center gap-3">
                <span className="w-28 text-sm font-semibold text-ink-dim truncate flex items-center gap-1">
                  {s.pct < 60 && <span className="text-amber-500 shrink-0">⚠</span>}
                  {s.pct >= 90 && <span className="text-green-500 shrink-0">✓</span>}
                  {s.topic}
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-panel overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${s.pct >= 80 ? "bg-green-500" : s.pct >= 60 ? "bg-accent" : "bg-amber-500"}`}
                    style={{ width: `${s.pct}%` }} />
                </div>
                <span className="w-10 text-right text-sm font-bold">{s.pct}%</span>
                <span className="text-xs text-ink-faint w-14 text-right">{s.correct}/{s.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate quiz on weak topics */}
      {topicStats.some((t) => t.pct < 70) && (
        <button onClick={handleWeakQuiz} disabled={genQuizOnWeak || !engine}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/40 bg-accent-softer py-3 font-display text-sm font-bold text-accent hover:bg-accent-soft disabled:opacity-50 transition">
          {genQuizOnWeak ? <Loader2 className="size-4 animate-spin" /> : <Target className="size-4" />}
          Generate quiz on weak topics
        </button>
      )}

      {cards.length === 0 && attempts.length === 0 && (
        <div className="text-center text-ink-faint py-12">
          <Brain className="size-12 mx-auto mb-3 opacity-30" />
          <p className="font-display font-bold text-lg">No study data yet</p>
          <p className="text-sm mt-1">Generate flashcards or take a quiz to see your progress.</p>
        </div>
      )}
    </div>
  );
}
