/* Essay Review — paste essay + optional rubric, get AI-graded feedback.
   One structured() AI call. */

import { useState } from "react";
import { ClipboardCheck, Loader2, Star, AlertTriangle, CheckCircle } from "lucide-react";
import { useApp } from "../lib/app";
import { gradeEssay, type EssayResult } from "../lib/generation/index";

export default function EssayReview() {
  const { engine } = useApp();
  const [essay, setEssay] = useState("");
  const [rubric, setRubric] = useState("");
  const [result, setResult] = useState<EssayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleGrade() {
    if (!engine || !essay.trim()) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await gradeEssay(engine, essay.trim(), rubric.trim() || undefined);
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Grading failed");
    } finally {
      setLoading(false);
    }
  }

  const grade = result ? (result.overallScore / result.maxScore) * 100 : null;
  const letterGrade = grade !== null
    ? grade >= 90 ? "A" : grade >= 80 ? "B" : grade >= 70 ? "C" : grade >= 60 ? "D" : "F"
    : null;

  return (
    <div className="px-10 py-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="size-6 text-accent" />
        <h1 className="text-4xl font-bold tracking-tight">Essay Review</h1>
      </div>
      <p className="mt-1 text-lg text-ink-faint">Paste your essay and an optional rubric for AI-powered grading and feedback.</p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-sm font-semibold text-ink-dim">Your Essay</label>
          <textarea value={essay} onChange={(e) => setEssay(e.target.value)}
            placeholder="Paste or type your essay here..."
            rows={10} className="mt-1 w-full rounded-xl border border-edge bg-card px-4 py-3 text-sm outline-none placeholder:text-ink-faint resize-y shadow-soft" />
        </div>
        <div>
          <label className="text-sm font-semibold text-ink-dim">Rubric (optional)</label>
          <textarea value={rubric} onChange={(e) => setRubric(e.target.value)}
            placeholder="Paste grading criteria, point breakdown, etc. If left empty, the AI will evaluate on standard criteria."
            rows={4} className="mt-1 w-full rounded-xl border border-edge bg-card px-4 py-3 text-sm outline-none placeholder:text-ink-faint resize-y shadow-soft" />
        </div>
        <button onClick={handleGrade} disabled={!essay.trim() || loading || !engine}
          className="w-full rounded-xl bg-accent py-3 font-display font-bold text-white hover:bg-accent-hover disabled:opacity-50 transition shadow-soft">
          {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Grading…</span> : "Grade My Essay"}
        </button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">{err}</div>}

      {result && (
        <div className="mt-8 space-y-6">
          {/* Overall score */}
          <div className="rounded-card border border-edge bg-card p-6 shadow-soft text-center">
            <Star className="size-8 text-accent mx-auto" />
            <p className="mt-2 font-display text-4xl font-bold">{result.overallScore}/{result.maxScore}</p>
            <p className="text-lg font-bold text-accent">{letterGrade}</p>
          </div>

          {/* Criteria breakdown */}
          <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
            <h3 className="font-display text-lg font-bold mb-4">Criteria Breakdown</h3>
            <div className="space-y-3">
              {result.criteria.map((c, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`mt-0.5 ${c.score / c.maxScore >= 0.7 ? "text-green-600" : c.score / c.maxScore >= 0.5 ? "text-yellow-600" : "text-danger-ink"}`}>
                    {c.score / c.maxScore >= 0.7 ? <CheckCircle className="size-4" /> : <AlertTriangle className="size-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{c.name}</span>
                      <span className="text-sm font-bold">{c.score}/{c.maxScore}</span>
                    </div>
                    <p className="text-sm text-ink-faint mt-0.5">{c.feedback}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Strengths + Improvements */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
              <h3 className="flex items-center gap-2 font-display font-bold text-green-700"><CheckCircle className="size-4" /> Strengths</h3>
              <ul className="mt-2 space-y-1.5">
                {result.strengths.map((s, i) => <li key={i} className="text-sm text-ink-dim flex gap-2"><span className="text-green-600 shrink-0">•</span>{s}</li>)}
              </ul>
            </div>
            <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
              <h3 className="flex items-center gap-2 font-display font-bold text-amber-700"><AlertTriangle className="size-4" /> Improvements</h3>
              <ul className="mt-2 space-y-1.5">
                {result.improvements.map((s, i) => <li key={i} className="text-sm text-ink-dim flex gap-2"><span className="text-amber-600 shrink-0">•</span>{s}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
