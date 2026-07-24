/* Folder view — sub-grid of documents inside a folder, with Study All
   and configurable Practice Test generation. */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, FilePlus2, FileText, Layers, Link2, Loader2, Upload, X } from "lucide-react";
import CreateNoteModal, { type NoteSource } from "../components/CreateNoteModal";
import { useApp } from "../lib/app";
import type { IngestInput } from "../lib/ingest";
import { createNoteFromSources } from "../lib/generation/pipeline";
import { generateMultiDocFlashcards, generateMultiDocQuiz, generatePracticeTest } from "../lib/generation/index";
import type { Folder, Job, Note } from "../lib/types";

function relTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export default function FolderView() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const { repo, engine, prefs, bump } = useApp();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [studying, setStudying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [modal, setModal] = useState<NoteSource | null>(null);

  // Practice test config
  const [showTestConfig, setShowTestConfig] = useState(false);
  const [testMcq, setTestMcq] = useState(10);
  const [testFrq, setTestFrq] = useState(3);
  const [testEssay, setTestEssay] = useState(1);
  const [testDifficulty, setTestDifficulty] = useState<"basic" | "intermediate" | "exam">("intermediate");

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
      // Move the new note into this folder
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
      navigate(`/notes/${notes[0].id}/flashcards`);
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
      // Store MCQ questions as quiz questions on the first note
      const mcqQuestions = test.mcq.map((q) => ({
        id: crypto.randomUUID(), noteId: notes[0].id,
        type: "mcq" as const, topic: q.topic, difficulty: testDifficulty,
        question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation,
      }));
      if (mcqQuestions.length > 0) await repo.putQuestions(mcqQuestions);
      // Also generate flashcards from the test content for review
      const cards = await generateMultiDocFlashcards(engine, notes);
      if (cards.length > 0) await repo.putCards(cards);
      bump();
      navigate(`/notes/${notes[0].id}/quiz`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Test generation failed");
    } finally { setStudying(false); }
  }

  if (!folder) {
    return <div className="flex h-full items-center justify-center text-ink-faint"><Loader2 className="size-5 animate-spin" /></div>;
  }

  return (
    <div className="px-10 py-8">
      <button onClick={() => navigate("/")} className="flex items-center gap-2 text-ink-faint hover:text-ink mb-4 transition">
        <ArrowLeft className="size-4" /> Back to Study Spaces
      </button>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{folder.name}</h1>
          <p className="mt-1 text-lg text-ink-faint">{notes.length} {notes.length === 1 ? "document" : "documents"}</p>
        </div>
        <div className="flex items-center gap-2">
          {notes.length > 0 && (
            <>
              <button onClick={studyAll} disabled={studying || !engine} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50 shadow-soft">
                {studying ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
                Study All
              </button>
              <button onClick={() => setShowTestConfig(true)} disabled={studying || !engine} className="flex items-center gap-2 rounded-xl border-2 border-accent bg-accent-softer px-5 py-2.5 text-sm font-bold text-accent hover:bg-accent-soft disabled:opacity-50 shadow-soft">
                <ClipboardList className="size-4" />
                Practice Test
              </button>
            </>
          )}
        </div>
      </div>

      {err && <div className="mt-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">{err}</div>}
      {job && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3 text-sm font-semibold shadow-soft">
          <Loader2 className="size-4 animate-spin text-accent" /> {job.message} ({Math.round(job.progress * 100)}%)
        </div>
      )}

      {/* Add document cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <button onClick={() => setModal("document")} className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-edge bg-panel/50 p-5 text-ink-faint hover:border-accent hover:text-accent transition shadow-soft">
          <Upload className="size-7" />
          <span className="font-display text-sm font-bold">Upload Document</span>
          <span className="text-xs">PDF, DOCX, PPT, TXT</span>
        </button>
        <button onClick={() => setModal("link")} className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-edge bg-panel/50 p-5 text-ink-faint hover:border-accent hover:text-accent transition shadow-soft">
          <Link2 className="size-7" />
          <span className="font-display text-sm font-bold">Website Link</span>
          <span className="text-xs">Import from any URL</span>
        </button>
        <button onClick={async () => {
          if (!repo || !folderId) return;
          const note: Note = {
            id: crypto.randomUUID(), title: "Untitled Document", sourceKind: "blank",
            sourceText: "", blocks: [], folderId, createdAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: Date.now(),
          };
          await repo.putNote(note); bump();
          navigate(`/notes/${note.id}/editor`);
        }} className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-edge bg-panel/50 p-5 text-ink-faint hover:border-accent hover:text-accent transition shadow-soft">
          <FilePlus2 className="size-7" />
          <span className="font-display text-sm font-bold">Blank Document</span>
          <span className="text-xs">Start from scratch</span>
        </button>
      </div>

      {/* Notes grid */}
      {notes.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center text-ink-faint">
          <FileText className="size-12 mb-3 opacity-40" />
          <p className="font-display text-lg font-bold">No documents yet</p>
          <p className="text-sm mt-1">Add documents using the buttons above.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {notes.map((n) => (
            <button key={n.id} onClick={() => navigate(`/notes/${n.id}/editor`)} className="flex flex-col items-center gap-2 rounded-card border border-edge bg-card p-5 shadow-soft transition hover:bg-card-hover">
              <FileText className="size-12 text-ink-dim" />
              <span className="font-display text-sm font-bold text-center line-clamp-2">{n.title}</span>
              <span className="text-xs text-ink-faint">{relTime(n.lastOpenedAt)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Practice Test config modal */}
      {showTestConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowTestConfig(false)}>
          <div className="w-full max-w-md rounded-card border border-edge bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold"><ClipboardList className="size-5 text-accent" /> Practice Test</h2>
              <button onClick={() => setShowTestConfig(false)} className="rounded-lg p-1 text-ink-faint hover:bg-panel"><X className="size-4" /></button>
            </div>
            <p className="text-sm text-ink-faint mb-4">Configure your test. Questions will be generated from all {notes.length} documents in this folder.</p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-ink-dim">Difficulty</label>
                <div className="mt-1 flex rounded-full border border-edge bg-panel p-1">
                  {(["basic", "intermediate", "exam"] as const).map((d) => (
                    <button key={d} onClick={() => setTestDifficulty(d)} className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${testDifficulty === d ? "bg-accent text-white" : "text-ink-faint hover:text-ink"}`}>
                      {d === "basic" ? "Basic" : d === "intermediate" ? "Medium" : "Exam"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <label className="text-xs font-semibold text-ink-dim">MCQ</label>
                  <input type="number" min={0} max={30} value={testMcq} onChange={(e) => setTestMcq(Math.max(0, Math.min(30, Number(e.target.value))))}
                    className="mt-1 w-full rounded-lg border border-edge bg-panel py-1.5 text-center text-sm font-bold outline-none" />
                </div>
                <div className="text-center">
                  <label className="text-xs font-semibold text-ink-dim">FRQ</label>
                  <input type="number" min={0} max={15} value={testFrq} onChange={(e) => setTestFrq(Math.max(0, Math.min(15, Number(e.target.value))))}
                    className="mt-1 w-full rounded-lg border border-edge bg-panel py-1.5 text-center text-sm font-bold outline-none" />
                </div>
                <div className="text-center">
                  <label className="text-xs font-semibold text-ink-dim">Essay</label>
                  <input type="number" min={0} max={5} value={testEssay} onChange={(e) => setTestEssay(Math.max(0, Math.min(5, Number(e.target.value))))}
                    className="mt-1 w-full rounded-lg border border-edge bg-panel py-1.5 text-center text-sm font-bold outline-none" />
                </div>
              </div>
              <p className="text-xs text-ink-faint text-center">
                Total: {testMcq + testFrq + testEssay} questions · ~$0.01
              </p>

              <button onClick={generateTest} disabled={testMcq + testFrq + testEssay === 0 || studying}
                className="w-full rounded-xl bg-accent py-3 font-display font-bold text-white hover:bg-accent-hover disabled:opacity-50 transition">
                {studying ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Generating…</span> : "Generate Test"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <CreateNoteModal source={modal} busy={!!job} onGenerate={handleGenerate} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
