/* Dashboard — "My Study Spaces" grid with folders and single docs side-by-side. */

import { useEffect, useState } from "react";
import { hardNav } from "../lib/hardnav";
import {
  CalendarClock,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  Link2,
  Loader2,
  MoreVertical,
  Upload,
} from "lucide-react";
import CreateNoteModal, { type NoteSource } from "../components/CreateNoteModal";
import { useApp } from "../lib/app";
import type { IngestInput } from "../lib/ingest";
import { createNoteFromSources } from "../lib/generation/pipeline";
import { uuid, now } from "../lib/ids";
import type { Folder, Job, Note, StudyBlock } from "../lib/types";
import { createCanvasClient, type CanvasUpcomingEvent } from "../lib/canvas";
import { CANVAS_ENABLED } from "../lib/features";
import { dateKey, minToTime } from "../lib/calendar";

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
  const { repo, engine, prefs, version, bump } = useApp();
  const [modal, setModal] = useState<NoteSource | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ type: "folder" | "note"; id: string } | null>(null);
  const [upcoming, setUpcoming] = useState<CanvasUpcomingEvent[]>([]);
  const [todayBlocks, setTodayBlocks] = useState<StudyBlock[]>([]);

  useEffect(() => {
    if (!repo) return;
    repo.orphanNotes().then(setNotes);
    repo.listFolders().then(setFolders);
    repo.studyBlocksOn(dateKey(new Date()))
      .then((bs) => setTodayBlocks(bs.sort((a, b) => a.startMin - b.startMin)));
  }, [repo, version]);

  useEffect(() => {
    if (!CANVAS_ENABLED) return;
    if (!prefs.canvasToken || !prefs.canvasUrl) return;
    createCanvasClient(prefs.canvasToken, prefs.canvasUrl)
      .listUpcomingEvents()
      .then((evs) =>
        setUpcoming(
          evs
            .filter((e) => {
              const d = new Date(e.assignment?.due_at || e.start_at || "");
              return !isNaN(d.getTime()) && d >= new Date();
            })
            .sort((a, b) => {
              const da = new Date(a.assignment?.due_at || a.start_at || 0).getTime();
              const db = new Date(b.assignment?.due_at || b.start_at || 0).getTime();
              return da - db;
            })
            .slice(0, 4),
        ),
      )
      .catch(() => {});
  }, [prefs.canvasToken, prefs.canvasUrl, version]);

  async function createBlank() {
    if (!repo) return;
    const note: Note = {
      id: uuid(), title: "Untitled Document", sourceKind: "blank",
      sourceText: "", blocks: [], createdAt: now(), updatedAt: now(), lastOpenedAt: now(),
    };
    await repo.putNote(note);
    bump();
    hardNav(`/notes/${note.id}/editor`);
  }

  async function handleGenerate(inputs: IngestInput[]) {
    if (!repo || !engine) { setModal(null); setErr("Engine not ready."); return; }
    setErr(null);
    try {
      const id = await createNoteFromSources({ repo, engine, inputs, language: prefs.language, onProgress: setJob });
      setModal(null); setJob(null); bump();
      hardNav(`/notes/${id}/editor`);
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

  return (
    <div className="px-10 py-8" onClick={() => setCtxMenu(null)}>
      <div>
        <h1 className="text-4xl font-bold tracking-tight">My Study Spaces</h1>
        <p className="mt-1 text-lg text-ink-faint">{folders.length + notes.length} {folders.length + notes.length === 1 ? "item" : "items"}</p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {!showNewFolder ? (
          <button onClick={() => setShowNewFolder(true)} className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-edge bg-panel/50 p-5 text-ink-faint hover:border-accent hover:text-accent transition shadow-soft">
            <FolderPlus className="size-8" />
            <span className="font-display text-sm font-bold">New Folder</span>
            <span className="text-xs">Organize your docs</span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-card border-2 border-accent bg-accent-softer p-5 shadow-soft">
            <FolderPlus className="size-8 text-accent" />
            <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              placeholder="Folder name" className="w-full rounded-lg border border-edge bg-card px-3 py-1.5 text-sm text-center outline-none" />
            <div className="flex gap-2">
              <button onClick={createFolder} disabled={!newFolderName.trim()} className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-white hover:bg-accent-hover disabled:opacity-50">Create</button>
              <button onClick={() => setShowNewFolder(false)} className="rounded-lg bg-panel px-3 py-1 text-xs font-semibold hover:bg-card-hover">Cancel</button>
            </div>
          </div>
        )}
        <button onClick={createBlank} className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-5 hover:bg-card-hover hover:border-accent/30 transition shadow-soft">
          <FilePlus2 className="size-8 text-accent" />
          <span className="font-display text-sm font-bold">Blank Document</span>
          <span className="text-xs text-ink-faint">Start from scratch</span>
        </button>
        <button onClick={() => setModal("document")} className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-5 hover:bg-card-hover hover:border-accent/30 transition shadow-soft">
          <Upload className="size-8 text-accent" />
          <span className="font-display text-sm font-bold">Upload Document</span>
          <span className="text-xs text-ink-faint">PDF, DOCX, PPT, TXT</span>
        </button>
        <button onClick={() => setModal("link")} className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-5 hover:bg-card-hover hover:border-accent/30 transition shadow-soft">
          <Link2 className="size-8 text-accent" />
          <span className="font-display text-sm font-bold">Website Link</span>
          <span className="text-xs text-ink-faint">Import from any URL</span>
        </button>
        {CANVAS_ENABLED && (prefs.canvasToken && prefs.canvasUrl) && (
          <button onClick={() => hardNav("/canvas")} className="flex flex-col items-center gap-3 rounded-card border border-edge bg-card p-5 hover:bg-card-hover hover:border-accent/30 transition shadow-soft">
            <GraduationCap className="size-8 text-accent" />
            <span className="font-display text-sm font-bold">Canvas Import</span>
            <span className="text-xs text-ink-faint">From your LMS</span>
          </button>
        )}
      </div>

      {err && <div className="mt-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">{err}</div>}
      {job && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3 text-sm font-semibold shadow-soft">
          <Loader2 className="size-4 animate-spin text-accent" /> {job.message} ({Math.round(job.progress * 100)}%)
        </div>
      )}

      {/* Planner widget */}
      {(upcoming.length > 0 || todayBlocks.length > 0) && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {upcoming.length > 0 && (
            <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-base font-bold">
                  <CalendarClock className="size-4 text-accent" /> Upcoming Deadlines
                </h2>
                <button onClick={() => hardNav("/planner")} className="text-xs font-semibold text-accent hover:underline">
                  Open planner →
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {upcoming.map((e) => {
                  const d = new Date(e.assignment?.due_at || e.start_at || "");
                  const urgent = d.getTime() - Date.now() < 3 * 86400000;
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg bg-panel px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{e.title}</p>
                        <p className="truncate text-xs text-ink-faint">{e.context_name}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${urgent ? "bg-red-500/15 text-red-400" : "bg-panel text-ink-dim"}`}>
                        {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {todayBlocks.length > 0 && (
            <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-base font-bold">
                  <CalendarClock className="size-4 text-accent" /> Today's Study Plan
                </h2>
                <button onClick={() => hardNav("/planner")} className="text-xs font-semibold text-accent hover:underline">
                  Edit schedule →
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {todayBlocks.map((b) => (
                  <div key={b.id} className={`flex items-center gap-3 rounded-lg bg-panel px-3 py-2 ${b.done ? "opacity-50" : ""}`}>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${b.done ? "text-green-400" : "text-accent"}`}>
                      {minToTime(b.startMin)}
                    </span>
                    <p className={`flex-1 truncate text-sm font-semibold ${b.done ? "line-through" : ""}`}>{b.title}</p>
                    <span className="text-xs text-ink-faint">{b.durationMin}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(folders.length === 0 && notes.length === 0) ? (
        <div className="mt-16 flex flex-col items-center justify-center text-ink-faint">
          <FolderOpen className="size-12 mb-3 opacity-40" />
          <p className="font-display text-lg font-bold">No study spaces yet</p>
          <p className="text-sm mt-1">Create a folder or add a document using the buttons above.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {folders.map((f) => {
            const count = notes.filter((n) => n.folderId === f.id).length;
            return (
              <div key={f.id} className="group relative">
                <button onClick={() => hardNav(`/folder/${f.id}`)} className="flex w-full flex-col items-center gap-2 rounded-card border border-edge bg-card p-5 shadow-soft transition hover:bg-card-hover hover:border-accent/30">
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
          {notes.map((n) => (
            <div key={n.id} className="group relative">
              <button onClick={() => hardNav(`/notes/${n.id}/editor`)} className="flex w-full flex-col items-center gap-2 rounded-card border border-edge bg-card p-5 shadow-soft transition hover:bg-card-hover">
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
