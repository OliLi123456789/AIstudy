/* Folder view — sub-grid of documents inside a folder, with "Study All" button. */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Layers, Loader2 } from "lucide-react";
import { useApp } from "../lib/app";
import { generateMultiDocFlashcards, generateMultiDocQuiz } from "../lib/generation/index";
import type { Folder, Note } from "../lib/types";

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
  const { repo, engine, bump } = useApp();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [studying, setStudying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!repo || !folderId) return;
    repo.listFolders().then((fs) => setFolder(fs.find((f) => f.id === folderId) ?? null));
    repo.notesByFolder(folderId).then(setNotes);
  }, [repo, folderId]);

  async function studyAll() {
    if (!repo || !engine || notes.length === 0) return;
    setStudying(true);
    setErr(null);
    try {
      // Generate flashcards and quiz from all docs in the folder
      const cards = await generateMultiDocFlashcards(engine, notes);
      if (cards.length > 0) await repo.putCards(cards);
      const quiz = await generateMultiDocQuiz(engine, notes);
      if (quiz.length > 0) await repo.putQuestions(quiz);
      bump();
      // Navigate to the first note's flashcards view
      navigate(`/notes/${notes[0].id}/flashcards`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Study generation failed");
    } finally {
      setStudying(false);
    }
  }

  if (!folder) {
    return (
      <div className="flex h-full items-center justify-center text-ink-faint">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
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
        {notes.length > 0 && (
          <button onClick={studyAll} disabled={studying || !engine} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50 shadow-soft">
            {studying ? <Loader2 className="size-4 animate-spin" /> : <Layers className="size-4" />}
            {studying ? "Generating…" : "Study All"}
          </button>
        )}
      </div>

      {err && <div className="mt-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">{err}</div>}

      {notes.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center text-ink-faint">
          <FileText className="size-12 mb-3 opacity-40" />
          <p className="font-display text-lg font-bold">No documents yet</p>
          <p className="text-sm mt-1">Add documents from the home page to this folder.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {notes.map((n) => (
            <button key={n.id} onClick={() => navigate(`/notes/${n.id}/editor`)} className="flex flex-col items-center gap-2 rounded-card border border-edge bg-card p-5 shadow-soft transition hover:bg-card-hover">
              <FileText className="size-12 text-ink-dim" />
              <span className="font-display text-sm font-bold text-center line-clamp-2">{n.title}</span>
              <span className="text-xs text-ink-faint">{relTime(n.lastOpenedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
