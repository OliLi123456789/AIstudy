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
  MessageCircle,
  Target,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import CreateNoteModal, { type NoteSource } from "../components/CreateNoteModal";
import Assistant from "../components/Assistant";
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

const railViews = [
  { view: "docs", icon: FileText, label: "Docs" },
  { view: "progress", icon: BarChart3, label: "Progress" },
  { view: "chat", icon: MessageCircle, label: "Chat" },
  { view: "flashcards", icon: Layers, label: "Flashcards" },
  { view: "quiz", icon: ListChecks, label: "Quiz" },
];

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function FolderView() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { repo, engine, prefs, bump } = useApp();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeView, setActiveView] = useState("docs");
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
      {/* Sidebar rail — same style as NoteView */}
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

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {err && <div className="m-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">{err}</div>}
        {job && (
          <div className="m-4 flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3 text-sm font-semibold shadow-soft">
            <Loader2 className="size-4 animate-spin text-accent" /> {job.message} ({Math.round(job.progress * 100)}%)
          </div>
        )}

        {activeView === "docs" && (
          <div className="px-10 py-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{folder.name}</h1>
                <p className="mt-1 text-ink-faint">{notes.length} {notes.length === 1 ? "document" : "documents"}</p>
              </div>
              {notes.length > 0 && (
                <div className="flex gap-2">
                  <button onClick={studyAll} disabled={studying || !engine} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50">
                    {studying ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />} Study All
                  </button>
                </div>
              )}
            </div>

            {/* Add document cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              <button onClick={() => setModal("document")} className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-edge bg-panel/50 p-4 text-ink-faint hover:border-accent hover:text-accent transition">
                <Upload className="size-6" /><span className="font-display text-xs font-bold">Upload</span>
              </button>
              <button onClick={() => setModal("link")} className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-edge bg-panel/50 p-4 text-ink-faint hover:border-accent hover:text-accent transition">
                <Link2 className="size-6" /><span className="font-display text-xs font-bold">Link</span>
              </button>
              <button onClick={async () => {
                if (!repo || !folderId) return;
                const note: Note = { id: crypto.randomUUID(), title: "Untitled", sourceKind: "blank", sourceText: "", blocks: [], folderId, createdAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: Date.now() };
                await repo.putNote(note); bump(); navigate(`/notes/${note.id}/editor`);
              }} className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-edge bg-panel/50 p-4 text-ink-faint hover:border-accent hover:text-accent transition">
                <FilePlus2 className="size-6" /><span className="font-display text-xs font-bold">Blank</span>
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-ink-faint py-12">
                <FileText className="size-12 mb-3 opacity-40" /><p className="font-display font-bold">Empty folder</p><p className="text-sm mt-1">Add documents above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {notes.map((n) => (
                  <button key={n.id} onClick={() => navigate(`/notes/${n.id}/editor`)} className="flex flex-col items-center gap-2 rounded-card border border-edge bg-card p-4 shadow-soft hover:bg-card-hover transition">
                    <FileText className="size-10 text-ink-dim" />
                    <span className="font-display text-xs font-bold text-center line-clamp-2">{n.title}</span>
                    <span className="text-xs text-ink-faint">{relTime(n.lastOpenedAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === "progress" && <FolderProgressWithDocs notes={notes} folderName={folder.name} navigate={navigate} onAddDoc={() => setModal("document")} onAddLink={() => setModal("link")} onAddBlank={async () => {
          if (!repo || !folderId) return;
          const note: Note = { id: crypto.randomUUID(), title: "Untitled", sourceKind: "blank", sourceText: "", blocks: [], folderId, createdAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: Date.now() };
          await repo.putNote(note); bump(); navigate(`/notes/${note.id}/editor`);
        }} />}
        {activeView === "chat" && anchorNote && <Assistant note={{ ...anchorNote, sourceText: combinedContent }} variant="hero" />}
        {activeView === "flashcards" && anchorNote && <FlashcardsView note={{ ...anchorNote, sourceText: combinedContent }} />}
        {activeView === "quiz" && anchorNote && <FolderQuizView notes={notes} anchorNote={anchorNote} />}
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

/* Progress with doc sidebar — merged view */
function FolderProgressWithDocs({ notes, folderName, navigate, onAddDoc, onAddLink, onAddBlank }: {
  notes: Note[];
  folderName: string;
  navigate: (path: string) => void;
  onAddDoc: () => void;
  onAddLink: () => void;
  onAddBlank: () => void;
}) {
  const { repo } = useApp();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  useEffect(() => {
    if (!repo || notes.length === 0) return;
    Promise.all(notes.map((n) => Promise.all([repo.cardsFor(n.id), repo.attemptsFor(n.id)]))).then((results) => {
      const allCards: Flashcard[] = [];
      const allAttempts: QuizAttempt[] = [];
      for (const [cs, as] of results) { allCards.push(...cs); allAttempts.push(...as); }
      setCards(allCards); setAttempts(allAttempts);
    });
  }, [repo, notes]);

  const learned = cards.filter((c) => c.state === "review" && c.stability > 7).length;
  const reviewing = cards.filter((c) => c.state === "review" && c.stability <= 7).length;
  const learning = cards.filter((c) => c.state === "learning").length;
  const newCards = cards.filter((c) => c.state === "new").length;
  const cardMastery = cards.length > 0 ? Math.round(((learned * 1.0 + reviewing * 0.7 + learning * 0.3) / cards.length) * 100) : null;
  const quizAvg = attempts.length > 0 ? Math.round((attempts.filter((a) => a.correct).length / attempts.length) * 100) : null;
  const mastery = cardMastery ?? quizAvg ?? null;

  const bars = [
    { l: "Learned", c: learned, cl: "bg-green-500" },
    { l: "Reviewing", c: reviewing, cl: "bg-accent" },
    { l: "Learning", c: learning, cl: "bg-yellow-500" },
    { l: "New", c: newCards, cl: "bg-slate-300" },
  ];

  return (
    <div className="flex h-full">
      {/* Doc sidebar */}
      <aside className="w-56 shrink-0 border-r border-edge bg-panel overflow-y-auto p-4 flex flex-col gap-1">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Documents ({notes.length})</p>
        {notes.map((n) => (
          <button key={n.id} onClick={() => navigate(`/notes/${n.id}/editor`)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-dim hover:bg-card-hover hover:text-ink transition text-left">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{n.title}</span>
          </button>
        ))}
        <div className="border-t border-edge mt-2 pt-2 space-y-1">
          <button onClick={onAddDoc} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-ink-faint hover:text-accent transition w-full"><Upload className="size-3.5" /> Upload doc</button>
          <button onClick={onAddLink} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-ink-faint hover:text-accent transition w-full"><Link2 className="size-3.5" /> Add link</button>
          <button onClick={onAddBlank} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-ink-faint hover:text-accent transition w-full"><FilePlus2 className="size-3.5" /> Blank doc</button>
        </div>
      </aside>

      {/* Progress dashboard */}
      <div className="flex-1 overflow-y-auto p-8">
        <h2 className="font-display text-2xl font-bold mb-6">{folderName} · Progress</h2>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="flex flex-col items-center gap-1 rounded-card border border-edge bg-card p-4 shadow-soft">
            <Target className="size-5 text-accent" />
            <span className="font-display text-xl font-bold">{mastery !== null ? `${mastery}%` : "—"}</span>
            <span className="text-xs text-ink-faint">Mastery</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-card border border-edge bg-card p-4 shadow-soft">
            <Layers className="size-5 text-blue-500" />
            <span className="font-display text-xl font-bold">{cards.length || "—"}</span>
            <span className="text-xs text-ink-faint">Cards</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-card border border-edge bg-card p-4 shadow-soft">
            <ListChecks className="size-5 text-purple-500" />
            <span className="font-display text-xl font-bold">{quizAvg !== null ? `${quizAvg}%` : "—"}</span>
            <span className="text-xs text-ink-faint">Quiz Avg</span>
          </div>
        </div>

        {/* Flashcard breakdown */}
        {cards.length > 0 && (
          <div className="rounded-card border border-edge bg-card p-5 shadow-soft mb-6">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm mb-4"><Layers className="size-4 text-accent" /> Flashcard Breakdown</h3>
            <div className="space-y-3">
              {bars.map(({ l, c, cl }) => (
                <div key={l} className="flex items-center gap-3">
                  <span className="w-20 text-sm font-semibold text-ink-dim">{l}</span>
                  <div className="flex-1 h-3 rounded-full bg-panel overflow-hidden"><div className={`h-full rounded-full ${cl}`} style={{ width: `${cards.length ? Math.round((c / cards.length) * 100) : 0}%` }} /></div>
                  <span className="w-8 text-right text-sm font-bold">{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quiz summary */}
        {quizAvg !== null && (
          <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm mb-2"><TrendingUp className="size-4 text-accent" /> Quiz Performance</h3>
            <p className="text-sm text-ink-faint">{attempts.length} attempts across all docs · average {quizAvg}%</p>
          </div>
        )}

        {cards.length === 0 && attempts.length === 0 && (
          <div className="text-center text-ink-faint py-12">
            <Brain className="size-12 mx-auto mb-3 opacity-30" />
            <p className="font-display font-bold">No study data yet</p>
            <p className="text-sm mt-1">Use "Study All" on the Docs tab to generate flashcards and quizzes.</p>
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
