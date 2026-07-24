/* Dashboard — "My Study Spaces" grid with folders and single docs side-by-side.
   macOS Finder-style: icons in a responsive grid, create bar at top. */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  Link2,
  Loader2,
  MoreVertical,
  Search,
} from "lucide-react";
import CreateNoteModal, { type NoteSource } from "../components/CreateNoteModal";
import { useApp } from "../lib/app";
import type { IngestInput } from "../lib/ingest";
import { createNoteFromSources } from "../lib/generation/pipeline";
import { uuid, now } from "../lib/ids";
import type { Folder, Job, Note } from "../lib/types";

const creationCards: {
  source: NoteSource | "blank";
  title: string;
  icon: typeof FilePlus2;
}[] = [
  { source: "blank", title: "Blank doc", icon: FilePlus2 },
  { source: "document", title: "Upload", icon: FileText },
  { source: "link", title: "Link", icon: Link2 },
];

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

export default function Dashboard() {
  const navigate = useNavigate();
  const { repo, engine, prefs, version, bump } = useApp();
  const [modal, setModal] = useState<NoteSource | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [query, setQuery] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ type: "folder" | "note"; id: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!repo) return;
    repo.orphanNotes().then(setNotes);
    repo.listFolders().then(setFolders);
  }, [repo, version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function createBlank() {
    if (!repo) return;
    const note: Note = {
      id: uuid(), title: "Untitled Document", sourceKind: "blank",
      sourceText: "", blocks: [], createdAt: now(), updatedAt: now(), lastOpenedAt: now(),
    };
    await repo.putNote(note);
    bump();
    navigate(`/notes/${note.id}/editor`);
  }

  async function handleGenerate(inputs: IngestInput[]) {
    if (!repo || !engine) { setModal(null); setErr("Engine not ready."); return; }
    setErr(null);
    try {
      const id = await createNoteFromSources({ repo, engine, inputs, language: prefs.language, onProgress: setJob });
      setModal(null); setJob(null); bump();
      navigate(`/notes/${id}/editor`);
    } catch (e) {
      setJob(null); setModal(null);
      setErr(e instanceof Error ? e.message : "Generation failed.");
    }
  }

  async function createFolder() {
    if (!repo || !newFolderName.trim()) return;
    const f: Folder = { id: uuid(), name: newFolderName.trim(), createdAt: now() };
    await repo.putFolder(f);
    setNewFolderName(""); setShowNewFolder(false); bump();
  }

  async function deleteFolder(id: string) {
    if (!repo) return;
    const docs = await repo.notesByFolder(id);
    for (const d of docs) await repo.deleteNote(d.id);
    await repo.deleteFolder(id);
    setCtxMenu(null); bump();
  }

  async function deleteNote(id: string) {
    if (!repo) return;
    await repo.deleteNote(id);
    setCtxMenu(null); bump();
  }

  const filteredFolders = folders.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));
  const filteredNotes = notes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="px-10 py-8" onClick={() => setCtxMenu(null)}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">My Study Spaces</h1>
          <p className="mt-1 text-lg text-ink-faint">{folders.length + notes.length} {folders.length + notes.length === 1 ? "item" : "items"}</p>
        </div>
        <label className="flex w-72 items-center gap-2 rounded-xl border border-edge bg-card px-3 py-2 text-ink-faint shadow-soft">
          <Search className="size-4" />
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search (⌘K)" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint" />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowNewFolder(!showNewFolder)} className="flex items-center gap-2 rounded-xl border border-edge bg-card px-4 py-2 text-sm font-semibold shadow-soft hover:bg-card-hover">
          <FolderPlus className="size-4" /> New Folder
        </button>
        {showNewFolder && (
          <div className="flex items-center gap-2">
            <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              placeholder="Folder name" className="rounded-xl border border-edge bg-panel px-3 py-2 text-sm outline-none" />
            <button onClick={createFolder} disabled={!newFolderName.trim()} className="rounded-xl bg-accent px-3 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50">Create</button>
          </div>
        )}
        {creationCards.map(({ source, title, icon: Icon }) => (
          <button key={title} onClick={() => source === "blank" ? createBlank() : setModal(source)} className="flex items-center gap-2 rounded-xl border border-edge bg-card px-4 py-2 text-sm font-semibold shadow-soft hover:bg-card-hover">
            <Icon className="size-4" /> {title}
          </button>
        ))}
        <button onClick={() => navigate("/canvas")} className="flex items-center gap-2 rounded-xl border border-edge bg-card px-4 py-2 text-sm font-semibold shadow-soft hover:bg-card-hover">
          <GraduationCap className="size-4" /> Canvas
        </button>
      </div>

      {err && <div className="mt-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">{err}</div>}
      {job && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3 text-sm font-semibold shadow-soft">
          <Loader2 className="size-4 animate-spin text-accent" /> {job.message} ({Math.round(job.progress * 100)}%)
        </div>
      )}

      {(filteredFolders.length === 0 && filteredNotes.length === 0) ? (
        <div className="mt-16 flex flex-col items-center justify-center text-ink-faint">
          <FolderOpen className="size-12 mb-3 opacity-40" />
          <p className="font-display text-lg font-bold">No study spaces yet</p>
          <p className="text-sm mt-1">Create a folder or add a document to get started.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredFolders.map((f) => {
            const count = notes.filter((n) => n.folderId === f.id).length;
            return (
              <div key={f.id} className="group relative" onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ type: "folder", id: f.id }); }}>
                <button onClick={() => navigate(`/folder/${f.id}`)} className="flex w-full flex-col items-center gap-2 rounded-card border border-edge bg-card p-5 shadow-soft transition hover:bg-card-hover hover:border-accent/30">
                  <FolderOpen className="size-12 text-accent" />
                  <span className="font-display text-sm font-bold text-center line-clamp-2">{f.name}</span>
                  <span className="text-xs text-ink-faint">{count} {count === 1 ? "doc" : "docs"}</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setCtxMenu({ type: "folder", id: f.id }); }} className="absolute top-2 right-2 rounded-lg p-1 text-ink-faint opacity-0 hover:bg-panel hover:text-ink group-hover:opacity-100 transition">
                  <MoreVertical className="size-3.5" />
                </button>
              </div>
            );
          })}
          {filteredNotes.map((n) => (
            <div key={n.id} className="group relative" onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ type: "note", id: n.id }); }}>
              <button onClick={() => navigate(`/notes/${n.id}/editor`)} className="flex w-full flex-col items-center gap-2 rounded-card border border-edge bg-card p-5 shadow-soft transition hover:bg-card-hover">
                <FileText className="size-12 text-ink-dim" />
                <span className="font-display text-sm font-bold text-center line-clamp-2">{n.title}</span>
                <span className="text-xs text-ink-faint">{relTime(n.lastOpenedAt)}</span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); setCtxMenu({ type: "note", id: n.id }); }} className="absolute top-2 right-2 rounded-lg p-1 text-ink-faint opacity-0 hover:bg-panel hover:text-ink group-hover:opacity-100 transition">
                <MoreVertical className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div className="fixed z-50 rounded-xl border border-edge bg-card p-1.5 shadow-lg" style={{ top: 200, left: "50%", transform: "translateX(-50%)" }} onClick={(e) => e.stopPropagation()}>
          {ctxMenu.type === "folder" && (
            <button onClick={() => deleteFolder(ctxMenu.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-danger-ink hover:bg-danger-soft">Delete folder & contents</button>
          )}
          {ctxMenu.type === "note" && (
            <button onClick={() => deleteNote(ctxMenu.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-danger-ink hover:bg-danger-soft">Delete document</button>
          )}
          <button onClick={() => setCtxMenu(null)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink-faint hover:bg-panel mt-0.5">Cancel</button>
        </div>
      )}

      {modal && (
        <CreateNoteModal source={modal} busy={!!job} onGenerate={handleGenerate} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
