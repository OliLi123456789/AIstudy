/* Folder view — same rail/tabs as individual docs, but pulls from ALL documents
   in the folder. Uses the first note as anchor for storage. */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Brain,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  FilePlus2,
  FileText,
  Layers,
  Link2,
  ListChecks,
  Loader2,
  Target,
  Upload,
  X,
} from "lucide-react";
import CreateNoteModal, { type NoteSource } from "../components/CreateNoteModal";
import FlashcardsView from "../components/FlashcardsView";
import { useApp } from "../lib/app";
import type { IngestInput } from "../lib/ingest";
import { createNoteFromSources } from "../lib/generation/pipeline";
import {
  generateMultiDocFlashcards,
  generateMultiDocQuiz,
  generatePracticeTest,
  multiDocContent,
} from "../lib/generation/index";
import type { Flashcard, Folder, Job, Note, QuizAttempt, QuizQuestion } from "../lib/types";

/* Folder-level study (Study All, folder quiz, folder practice test) is HIDDEN
   for now: folders are organization-only, open a doc to study it. Flip this
   flag back to true to restore the folder study rail — nothing was deleted. */
const FOLDER_STUDY_ENABLED = false;

const railViews = [
  { view: "overview", icon: BarChart3, label: "Overview" },
  { view: "flashcards", icon: Layers, label: "Flashcards" },
  { view: "quiz", icon: ListChecks, label: "Quiz" },
];

export default function FolderView() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { repo, engine, prefs, bump } = useApp();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeView, setActiveView] = useState("overview");
  const [studying, setStudying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [modal, setModal] = useState<NoteSource | null>(null);

  const [showTestConfig, setShowTestConfig] = useState(false);
  const [testMcq, setTestMcq] = useState(10);
  const [testFrq, setTestFrq] = useState(3);
  const [testEssay, setTestEssay] = useState(1);
  const [testDifficulty, setTestDifficulty] = useState<"basic" | "intermediate" | "exam">("intermediate");

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!repo || !folderId) return;
    repo.listFolders().then((fs) => setFolder(fs.find((f) => f.id === folderId) ?? null));
    repo.notesByFolder(folderId).then(setNotes);
  }, [repo, folderId]);

  async function handleGenerate(inputs: IngestInput[]) {
    if (!repo || !engine || !folderId) { setModal(null); setErr("Engine not ready."); return; }
    setErr(null);
    try {
      const id = await createNoteFromSources({ repo, engine, inputs, language: prefs.language, onProgress: setJob });
      const note = await repo.getNote(id);
      if (note) { note.folderId = folderId; await repo.putNote(note); }
      setModal(null); setJob(null); bump();
    } catch (e) {
      setJob(null); setModal(null);
      setErr(e instanceof Error ? e.message : "Generation failed.");
    }
  }

  async function studyAll() {
    if (!repo || !engine || notes.length === 0) return;
    setStudying(true); setErr(null);
    try {
      const cards = await generateMultiDocFlashcards(engine, notes);
      if (cards.length > 0) await repo.putCards(cards);
      const quiz = await generateMultiDocQuiz(engine, notes);
      if (quiz.length > 0) await repo.putQuestions(quiz);
      bump();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Study generation failed");
    } finally { setStudying(false); }
  }

  async function generateTest() {
    if (!repo || !engine || notes.length === 0) return;
    setStudying(true); setErr(null); setShowTestConfig(false);
    try {
      const test = await generatePracticeTest(engine, notes, {
        mcqCount: testMcq, frqCount: testFrq, essayCount: testEssay, difficulty: testDifficulty,
      });
      const mcqQuestions = test.mcq.map((q) => ({
        id: crypto.randomUUID(), noteId: notes[0].id,
        type: "mcq" as const, topic: q.topic, difficulty: testDifficulty,
        question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation,
      }));
      if (mcqQuestions.length > 0) await repo.putQuestions(mcqQuestions);
      const cards = await generateMultiDocFlashcards(engine, notes);
      if (cards.length > 0) await repo.putCards(cards);
      bump();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Test generation failed");
    } finally { setStudying(false); }
  }

  if (!folder) {
    return <div className="flex h-full items-center justify-center text-ink-faint"><Loader2 className="size-5 animate-spin" /></div>;
  }

  const anchorNote = notes[0];
  const combinedContent = notes.length > 0 ? multiDocContent(notes) : "";

  return (
    <div className="flex h-full bg-bg">
      {/* Sidebar rail — same style as NoteView (hidden while folder study is disabled) */}
      {FOLDER_STUDY_ENABLED && (
      <aside className={`flex shrink-0 flex-col border-r border-edge bg-panel transition-all ${collapsed ? "w-16" : "w-48"}`}>
        <div className="flex items-center justify-between px-4 py-5">
          {!collapsed && <span className="font-display text-sm font-bold truncate">{folder.name}</span>}
          <button onClick={() => setCollapsed((c) => !c)} className="rounded-lg p-1.5 text-ink-dim hover:bg-card-hover hover:text-ink" aria-label="Toggle sidebar">
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>
        <button onClick={() => navigate("/")} className="mx-3 mb-4 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-faint hover:text-ink transition">
          <ArrowLeft className="size-3.5" /> {!collapsed && "Back"}
        </button>
        <nav className="flex flex-col gap-1 px-2">
          {railViews.map(({ view: v, icon: Icon, label }) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              title={label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activeView === v ? "bg-card text-ink shadow-soft" : "text-ink-dim hover:bg-card-hover hover:text-ink"}`}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && label}
            </button>
          ))}
        </nav>
        <div className="mt-4 flex flex-col items-center gap-2 border-t border-edge pt-4 px-2">
          {notes.length > 0 && (
            <button onClick={() => setShowTestConfig(true)} title="Practice Test" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-dim hover:bg-accent-softer hover:text-accent transition w-full">
              <ClipboardList className="size-5 shrink-0" />
              {!collapsed && "Test"}
            </button>
          )}
        </div>
      </aside>
      )}

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {!FOLDER_STUDY_ENABLED && (
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-edge bg-panel/95 px-6 py-3 backdrop-blur">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-faint hover:text-ink transition">
              <ArrowLeft className="size-4" /> Back
            </button>
            <span className="font-display text-sm font-bold truncate">{folder.name}</span>
            <span className="text-xs text-ink-faint">Organization only — open a document to study</span>
          </div>
        )}
        {err && <div className="m-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">{err}</div>}
        {job && (
          <div className="m-4 flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3 text-sm font-semibold shadow-soft">
            <Loader2 className="size-4 animate-spin text-accent" /> {job.message} ({Math.round(job.progress * 100)}%)
          </div>
        )}

        {activeView === "overview" && (
          <FolderOverview
            folder={folder}
            notes={notes}
            studying={studying}
            engine={!!engine}
            onStudyAll={studyAll}
            onUpload={() => setModal("document")}
            onLink={() => setModal("link")}
            onBlank={async () => {
              if (!repo || !folderId) return;
              const note: Note = { id: crypto.randomUUID(), title: "Untitled", sourceKind: "blank", sourceText: "", blocks: [], folderId, createdAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: Date.now() };
              await repo.putNote(note); bump(); navigate(`/notes/${note.id}/editor`);
            }}
            onOpenNote={(id) => navigate(`/notes/${id}/editor`)}
          />
        )}

        {FOLDER_STUDY_ENABLED && activeView === "flashcards" && anchorNote && <FlashcardsView note={{ ...anchorNote, sourceText: combinedContent }} />}
        {FOLDER_STUDY_ENABLED && activeView === "quiz" && anchorNote && <FolderQuizView notes={notes} anchorNote={anchorNote} />}
      </main>

      {/* Practice Test modal */}
      {showTestConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowTestConfig(false)}>
          <div className="w-full max-w-md rounded-card border border-edge bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold"><ClipboardList className="size-5 text-accent" /> Practice Test</h2>
              <button onClick={() => setShowTestConfig(false)} className="rounded-lg p-1 text-ink-faint hover:bg-panel"><X className="size-4" /></button>
            </div>
            <p className="text-sm text-ink-faint mb-4">From {notes.length} docs in <strong>{folder.name}</strong>.</p>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-ink-dim">Difficulty</label>
                <div className="mt-1 flex rounded-full border border-edge bg-panel p-1">
                  {(["basic", "intermediate", "exam"] as const).map((d) => (
                    <button key={d} onClick={() => setTestDifficulty(d)} className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${testDifficulty === d ? "bg-accent text-white" : "text-ink-faint hover:text-ink"}`}>{d==="basic"?"Basic":d==="intermediate"?"Medium":"Exam"}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[{l:"MCQ",v:testMcq,s:setTestMcq,max:20},{l:"FRQ",v:testFrq,s:setTestFrq,max:10},{l:"Essay",v:testEssay,s:setTestEssay,max:1}].map(({l,v,s,max}) => (
                  <div key={l} className="text-center">
                    <label className="text-xs font-semibold text-ink-dim">{l}</label>
                    <input type="number" min={0} max={max} value={v} onChange={(e) => { const nv = Math.max(0, Math.min(max, Number(e.target.value))); if (testMcq + testFrq + testEssay - v + nv <= 20) s(nv); }} className="mt-1 w-full rounded-lg border border-edge bg-panel py-1.5 text-center text-sm font-bold outline-none" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-faint text-center">Total: {testMcq + testFrq + testEssay} questions · ~$0.01</p>
              <button onClick={generateTest} disabled={testMcq + testFrq + testEssay === 0 || studying} className="w-full rounded-xl bg-accent py-3 font-display font-bold text-white hover:bg-accent-hover disabled:opacity-50">Generate Test</button>
            </div>
          </div>
        </div>
      )}

      {modal && <CreateNoteModal source={modal} busy={!!job} onGenerate={handleGenerate} onClose={() => setModal(null)} />}
    </div>
  );
}

/* Combined overview: progress KPIs + doc grid + focus areas */
function FolderOverview({
  folder, notes, studying, engine,
  onStudyAll, onUpload, onLink, onBlank, onOpenNote,
}: {
  folder: Folder; notes: Note[]; studying: boolean; engine: boolean;
  onStudyAll: () => void; onUpload: () => void; onLink: () => void; onBlank: () => void;
  onOpenNote: (id: string) => void;
}) {
  const { repo } = useApp();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);

  useEffect(() => {
    if (!repo || notes.length === 0) return;
    Promise.all(notes.map((n) => Promise.all([repo.cardsFor(n.id), repo.attemptsFor(n.id), repo.questionsFor(n.id)]))).then((results) => {
      const allCards: Flashcard[] = [];
      const allAttempts: QuizAttempt[] = [];
      const allQuestions: QuizQuestion[] = [];
      for (const [cs, as, qs] of results) { allCards.push(...cs); allAttempts.push(...as); allQuestions.push(...qs); }
      setCards(allCards); setAttempts(allAttempts); setQuestions(allQuestions);
    });
  }, [repo, notes]);

  const learned = cards.filter((c) => c.state === "review" && c.stability > 7).length;
  const reviewing = cards.filter((c) => c.state === "review" && c.stability <= 7).length;
  const learning = cards.filter((c) => c.state === "learning").length;
  const newCards = cards.filter((c) => c.state === "new").length;
  const masteryPct = cards.length > 0 ? Math.round((learned / cards.length) * 100) : 0;
  const quizAvg = attempts.length > 0 ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : null;

  // Weak topic detection
  const weakTopics = (() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const a of attempts) {
      const q = questions.find((q) => q.id === a.questionId);
      const t = q?.topic || "General";
      const e = map.get(t) || { correct: 0, total: 0 };
      e.total++; if (a.correct) e.correct++;
      map.set(t, e);
    }
    return Array.from(map.entries())
      .map(([t, s]) => ({ topic: t, pct: Math.round((s.correct / s.total) * 100), total: s.total }))
      .filter((s) => s.pct < 70 && s.total >= 2)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5);
  })();

  return (
    <div className="px-10 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{folder.name}</h1>
          <p className="mt-1 text-ink-faint">{notes.length} {notes.length === 1 ? "document" : "documents"} · open one to study it</p>
        </div>
        {FOLDER_STUDY_ENABLED && notes.length > 0 && (
          <button onClick={onStudyAll} disabled={studying || !engine} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50">
            {studying ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />} Study All
          </button>
        )}
      </div>

      {/* KPI snapshot */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-card border border-edge bg-card p-4 shadow-soft text-center">
          <p className="text-2xl font-bold">{cards.length}</p>
          <p className="text-xs text-ink-faint mt-1">Flashcards</p>
        </div>
        <div className="rounded-card border border-edge bg-card p-4 shadow-soft text-center">
          <p className="text-2xl font-bold">{attempts.length}</p>
          <p className="text-xs text-ink-faint mt-1">Quiz Attempts</p>
        </div>
        <div className="rounded-card border border-edge bg-card p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-accent">{masteryPct}%</p>
          <p className="text-xs text-ink-faint mt-1">Mastery</p>
        </div>
        <div className="rounded-card border border-edge bg-card p-4 shadow-soft text-center">
          <p className="text-2xl font-bold">{quizAvg !== null ? `${quizAvg}%` : "—"}</p>
          <p className="text-xs text-ink-faint mt-1">Quiz Avg</p>
        </div>
      </div>

      {/* Flashcard breakdown + Weak topics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {cards.length > 0 && (
          <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm mb-3"><Brain className="size-4 text-accent" /> Card Status</h3>
            {[{l:"Learned",c:learned,cl:"bg-green-500"},{l:"Reviewing",c:reviewing,cl:"bg-accent"},{l:"Learning",c:learning,cl:"bg-yellow-500"},{l:"New",c:newCards,cl:"bg-slate-300"}].map(({l,c,cl}) => (
              <div key={l} className="flex items-center gap-2 mb-1.5">
                <span className="w-16 text-xs font-semibold text-ink-dim">{l}</span>
                <div className="flex-1 h-1.5 rounded-full bg-panel overflow-hidden"><div className={`h-full rounded-full ${cl}`} style={{width:`${cards.length?Math.round(c/cards.length*100):0}%`}} /></div>
                <span className="w-6 text-right text-xs font-semibold">{c}</span>
              </div>
            ))}
          </div>
        )}
        {weakTopics.length > 0 && (
          <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm mb-3"><Target className="size-4 text-amber-600" /> Focus Areas</h3>
            {weakTopics.map((s) => (
              <div key={s.topic} className="flex items-center gap-2 mb-1.5">
                <span className="w-24 text-xs font-semibold text-ink-dim truncate">{s.topic}</span>
                <div className="flex-1 h-1.5 rounded-full bg-panel overflow-hidden"><div className="h-full rounded-full bg-amber-500" style={{width:`${s.pct}%`}} /></div>
                <span className="w-8 text-right text-xs font-semibold text-amber-600">{s.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document grid */}
      <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-sm">Documents</h3>
          <div className="flex gap-2">
            <button onClick={onUpload} className="flex items-center gap-1 rounded-lg border-2 border-dashed border-edge px-2.5 py-1 text-xs font-semibold text-ink-faint hover:border-accent hover:text-accent transition"><Upload className="size-3" /> Upload</button>
            <button onClick={onLink} className="flex items-center gap-1 rounded-lg border-2 border-dashed border-edge px-2.5 py-1 text-xs font-semibold text-ink-faint hover:border-accent hover:text-accent transition"><Link2 className="size-3" /> Link</button>
            <button onClick={onBlank} className="flex items-center gap-1 rounded-lg border-2 border-dashed border-edge px-2.5 py-1 text-xs font-semibold text-ink-faint hover:border-accent hover:text-accent transition"><FilePlus2 className="size-3" /> Blank</button>
          </div>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-ink-faint text-center py-4">No documents yet. Add one above.</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {notes.map((n) => (
              <button key={n.id} onClick={() => onOpenNote(n.id)} className="flex flex-col items-center gap-1 rounded-lg border border-edge bg-panel p-2.5 hover:bg-card-hover transition">
                <FileText className="size-6 text-ink-dim" />
                <span className="font-display text-2xs font-bold text-center line-clamp-2 leading-tight">{n.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Quiz tab for folder — uses combined content */
function FolderQuizView({ notes, anchorNote }: { notes: Note[]; anchorNote: Note }) {
  const { repo, engine } = useApp();
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    if (!repo || !anchorNote) return;
    repo.questionsFor(anchorNote.id).then((qs) => { if (qs.length > 0) { setQuiz(qs); setGenerated(true); } });
  }, [repo, anchorNote]);

  async function genQuiz() {
    if (!engine || notes.length === 0) return;
    setLoading(true);
    try {
      const qs = await generateMultiDocQuiz(engine, notes);
      if (qs.length > 0) await repo?.putQuestions(qs);
      setQuiz(qs); setGenerated(true);
    } catch {} finally { setLoading(false); }
  }

  if (!generated) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <ListChecks className="size-10 text-ink-faint" />
        <p className="text-ink-faint">Generate a quiz from all {notes.length} documents</p>
        <button onClick={genQuiz} disabled={loading} className="rounded-xl bg-accent px-6 py-3 font-display font-bold text-white hover:bg-accent-hover disabled:opacity-50">
          {loading ? <Loader2 className="size-4 animate-spin inline" /> : null} Generate Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="font-display text-2xl font-bold mb-6">Folder Quiz</h2>
      <div className="space-y-4">
        {quiz.slice(0, 20).map((q, i) => (
          <div key={q.id} className="rounded-card border border-edge bg-card p-5 shadow-soft">
            <p className="font-display font-semibold"><span className="text-ink-faint mr-2">{i+1}.</span>{q.question}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {q.options.map((opt, j) => (
                <span key={j} className={`text-sm px-3 py-1.5 rounded-lg border ${j === q.correctIndex ? 'border-green-500 bg-green-50 text-green-800' : 'border-edge bg-panel text-ink-dim'}`}>{opt}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => { setGenerated(false); setQuiz([]); }} className="mt-6 text-sm font-semibold text-ink-faint hover:text-ink">Regenerate</button>
    </div>
  );
}
