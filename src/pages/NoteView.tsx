import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  History,
  BarChart3,
  Layers,
  ListChecks,
  Loader2,
  Menu,
  MessageCircle,
  MoreVertical,
  Palette,
  X,
} from "lucide-react";
import { toggleTheme } from "../lib/theme";
import { useApp } from "../lib/app";
import BlockEditor from "../components/BlockEditor";
import Assistant from "../components/Assistant";
import FlashcardsView from "../components/FlashcardsView";
import QuizView from "../components/QuizView";
import ProgressView from "../components/ProgressView";
import { generatePracticeTest } from "../lib/generation/index";
import {
  downloadText,
  exportDocxHtml,
  exportMarkdown,
  printPdf,
} from "../lib/export";
import { now } from "../lib/ids";
import type { Block, Note } from "../lib/types";

const railViews = [
  { view: "editor", icon: FileText, label: "Editor" },
  { view: "progress", icon: BarChart3, label: "Progress" },
  { view: "chat", icon: MessageCircle, label: "Chat" },
  { view: "flashcards", icon: Layers, label: "Flashcards" },
  { view: "quiz", icon: ListChecks, label: "Quiz" },
];

export default function NoteView() {
  const { id, view = "editor" } = useParams();
  const navigate = useNavigate();
  const { repo, engine } = useApp();
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);

  // Practice test config
  const [showTestConfig, setShowTestConfig] = useState(false);
  const [testMcq, setTestMcq] = useState(10);
  const [testFrq, setTestFrq] = useState(3);
  const [testEssay, setTestEssay] = useState(1);
  const [testDifficulty, setTestDifficulty] = useState<"basic" | "intermediate" | "exam">("intermediate");
  const [testGenerating, setTestGenerating] = useState(false);

  useEffect(() => {
    if (!repo || !id) return;
    let alive = true;
    repo.getNote(id).then((n) => {
      if (!alive) return;
      if (!n) {
        setMissing(true);
        return;
      }
      n.lastOpenedAt = now();
      repo.putNote(n);
      setNote(n);
    });
    return () => {
      alive = false;
    };
  }, [repo, id]);

  useEffect(() => {
    if (missing) navigate("/", { replace: true });
  }, [missing, navigate]);

  return (
    <div className="flex h-full bg-bg">
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-edge bg-panel py-4">
        <button
          onClick={() => navigate("/")}
          className="rounded-lg p-2 text-ink-dim hover:bg-card-hover hover:text-ink"
          aria-label="Back to dashboard"
        >
          <Menu className="size-5" />
        </button>
        <nav className="mt-6 flex flex-col gap-2">
          {railViews.map(({ view: v, icon: Icon, label }) => (
            <NavLink
              key={v}
              to={`/notes/${id}/${v}`}
              title={label}
              className={({ isActive }) =>
                `rounded-xl p-2.5 ${
                  isActive
                    ? "bg-card text-ink shadow-soft"
                    : "text-ink-dim hover:bg-card-hover hover:text-ink"
                }`
              }
            >
              <Icon className="size-5" />
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex flex-col items-center gap-2 border-t border-edge pt-4">
          {note && (
            <button onClick={() => setShowTestConfig(true)} className="rounded-xl p-2.5 text-ink-dim hover:bg-accent-softer hover:text-accent transition" title="Practice Test">
              <ClipboardList className="size-5" />
            </button>
          )}
        </div>
        <div className="mt-auto flex flex-col items-center gap-3">
          <button
            onClick={() => toggleTheme()}
            className="rounded-xl p-2.5 text-ink-dim hover:bg-card-hover hover:text-ink"
            aria-label="Toggle theme"
          >
            <Palette className="size-5" />
          </button>
          <div className="flex size-8 items-center justify-center rounded-full bg-accent-soft font-display text-xs font-bold text-accent">
            N
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {!note ? (
          <div className="flex h-full items-center justify-center gap-2.5 text-ink-faint">
            <Loader2 className="size-5 animate-spin text-accent" />
            <span>Loading…</span>
          </div>
        ) : view === "editor" ? (
          <EditorView note={note} onNote={setNote} />
        ) : view === "progress" ? (
          <ProgressView note={note} />
        ) : view === "chat" ? (
          <Assistant note={note} variant="hero" />
        ) : view === "flashcards" ? (
          <FlashcardsView note={note} />
        ) : view === "quiz" ? (
          <QuizView note={note} />
        ) : null}

        {/* Practice Test modal */}
        {showTestConfig && note && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowTestConfig(false)}>
            <div className="w-full max-w-md rounded-card border border-edge bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold"><ClipboardList className="size-5 text-accent" /> Practice Test</h2>
                <button onClick={() => setShowTestConfig(false)} className="rounded-lg p-1 text-ink-faint hover:bg-panel"><X className="size-4" /></button>
              </div>
              <p className="text-sm text-ink-faint mb-4">Configure a test from <strong>{note.title}</strong>.</p>

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
                <p className="text-xs text-ink-faint text-center">Total: {testMcq + testFrq + testEssay} questions · ~$0.01</p>
                <button onClick={async () => {
                  if (!repo || !engine || testMcq + testFrq + testEssay === 0) return;
                  setTestGenerating(true);
                  try {
                    const test = await generatePracticeTest(engine, [note],
                      { mcqCount: testMcq, frqCount: testFrq, essayCount: testEssay, difficulty: testDifficulty },
                    );
                    const mcqQuestions = test.mcq.map((q) => ({
                      id: crypto.randomUUID(), noteId: note.id,
                      type: "mcq" as const, topic: q.topic, difficulty: testDifficulty,
                      question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation,
                    }));
                    if (mcqQuestions.length > 0) await repo.putQuestions(mcqQuestions);
                    setShowTestConfig(false);
                    navigate(`/notes/${note.id}/quiz`);
                  } catch { /* silently fail */ }
                  finally { setTestGenerating(false); }
                }} disabled={testMcq + testFrq + testEssay === 0 || testGenerating}
                  className="w-full rounded-xl bg-accent py-3 font-display font-bold text-white hover:bg-accent-hover disabled:opacity-50 transition">
                  {testGenerating ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Generating…</span> : "Generate Test"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function EditorView({
  note,
  onNote,
}: {
  note: Note;
  onNote: (n: Note) => void;
}) {
  const { repo } = useApp();
  const [panelOpen, setPanelOpen] = useState(true);
  const [title, setTitle] = useState(note.title);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persist(patch: Partial<Note>) {
    const next = { ...note, ...patch, updatedAt: now() };
    onNote(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => repo?.putNote(next), 400);
  }

  function onBlocks(blocks: Block[]) {
    persist({ blocks });
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-6 py-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => persist({ title: title.trim() || "Untitled Document" })}
            className="min-w-0 flex-1 bg-transparent font-display text-xl font-bold outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg p-2 text-ink-dim hover:bg-card-hover hover:text-ink"
              aria-label="Version history"
            >
              <History className="size-4.5" />
            </button>
            <ExportMenu note={{ ...note, title }} />
            {!panelOpen && (
              <button
                onClick={() => setPanelOpen(true)}
                className="rounded-xl bg-accent-soft px-4 py-1.5 font-display text-sm font-bold text-ink hover:opacity-90"
              >
                Assistant
              </button>
            )}
          </div>
        </div>
        <div className="mx-6 mb-6 flex-1 overflow-y-auto rounded-card border border-edge bg-card p-8 shadow-soft">
          <BlockEditor key={note.id} blocks={note.blocks} onChange={onBlocks} />
        </div>
      </div>

      {panelOpen ? (
        <div className="my-6 mr-6 flex w-[420px] shrink-0 flex-col rounded-card border border-edge bg-card shadow-soft">
          <div className="flex items-center justify-between p-3">
            <span className="pl-1 font-display text-sm font-bold text-ink-dim">Assistant</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPanelOpen(false)}
                className="rounded-xl bg-accent-soft p-2 text-ink hover:opacity-90"
                aria-label="Collapse assistant"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Assistant note={note} variant="panel" />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPanelOpen(true)}
          className="m-6 h-fit rounded-xl bg-accent-soft p-2 text-ink hover:opacity-90"
          aria-label="Open assistant"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
    </div>
  );
}

function ExportMenu({ note }: { note: Note }) {
  const [open, setOpen] = useState(false);
  const items: [string, () => void][] = [
    ["Export Markdown", () => downloadText(`${note.title}.md`, exportMarkdown(note), "text/markdown")],
    ["Export PDF", () => printPdf(note)],
    ["Export Word", () => downloadText(`${note.title}.doc`, exportDocxHtml(note), "application/msword")],
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-2 text-ink-dim hover:bg-card-hover hover:text-ink"
        aria-label="More"
      >
        <MoreVertical className="size-4.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-edge bg-card p-1 shadow-modal">
            {items.map(([label, fn]) => (
              <button
                key={label}
                onClick={() => {
                  fn();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-card-hover"
              >
                <Download className="size-3.5 text-ink-dim" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
