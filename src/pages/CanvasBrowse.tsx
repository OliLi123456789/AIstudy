/* Canvas LMS browser — browse courses and import content as study notes. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  FileText,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { useApp } from "../lib/app";
import { createCanvasClient, type CanvasCourse, type CanvasAssignment, type CanvasFile } from "../lib/canvas";
import type { IngestInput } from "../lib/ingest";
import { createNoteFromSources } from "../lib/generation/pipeline";

type Tab = "courses" | "assignments" | "files";

export default function CanvasBrowse() {
  const navigate = useNavigate();
  const { repo, engine, prefs, bump } = useApp();
  const [tab, setTab] = useState<Tab>("courses");
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [assignments, setAssignments] = useState<CanvasAssignment[]>([]);
  const [files, setFiles] = useState<CanvasFile[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CanvasCourse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const token = prefs.canvasToken;
  const url = prefs.canvasUrl;

  useEffect(() => {
    if (!token || !url) return;
    const client = createCanvasClient(token, url);
    setLoading(true);
    setErr(null);
    client.listCourses()
      .then(setCourses)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load courses"))
      .finally(() => setLoading(false));
  }, [token, url]);

  async function selectCourse(course: CanvasCourse) {
    if (!token || !url) return;
    setSelectedCourse(course);
    setLoading(true);
    setErr(null);
    const client = createCanvasClient(token, url);
    try {
      if (tab === "assignments") {
        const items = await client.listAssignments(course.id);
        setAssignments(items);
      } else if (tab === "files") {
        const items = await client.listFiles(course.id);
        setFiles(items);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function importAsNote(source: { kind: "url"; url: string; title?: string } | { kind: "text"; text: string; title?: string }) {
    if (!repo || !engine) return;
    setGenerating(true);
    setErr(null);
    try {
      let inputs: IngestInput[];
      if (source.kind === "url") {
        inputs = [{ kind: "url", url: source.url }];
      } else {
        inputs = [{ kind: "text", text: source.text }];
        if (source.title) inputs[0]!.text = `# ${source.title}\n\n${source.text}`;
      }
      const id = await createNoteFromSources({
        repo,
        engine,
        inputs,
        language: prefs.language,
      });
      bump();
      navigate(`/notes/${id}/editor`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
      setGenerating(false);
    }
  }

  if (!token || !url) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6">
        <GraduationCap className="size-10 text-ink-faint" />
        <h2 className="mt-4 font-display text-xl font-bold">Canvas not configured</h2>
        <p className="mt-2 text-ink-faint text-center max-w-md">
          Add your Canvas URL and access token in Settings to browse your courses and import content.
        </p>
        <button
          onClick={() => navigate("/settings")}
          className="mt-4 rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-white hover:bg-accent-hover"
        >
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <div className="px-10 py-8">
      <div className="flex items-center gap-3">
        <GraduationCap className="size-6 text-accent" />
        <h1 className="text-4xl font-bold tracking-tight">Canvas</h1>
      </div>
      <p className="mt-1 text-lg text-ink-faint">Browse your courses and import content as study notes</p>

      {/* Tab bar */}
      <div className="mt-6 flex rounded-full border border-edge bg-panel p-1 w-fit">
        {(
          [
            ["courses", "Courses"],
            ["assignments", "Assignments"],
            ["files", "Files"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              if (selectedCourse) selectCourse(selectedCourse);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              tab === k ? "bg-card text-ink shadow-soft" : "text-ink-faint hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mt-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">
          {err}
        </div>
      )}

      {generating && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-edge bg-card px-4 py-3 text-sm font-semibold shadow-soft">
          <Loader2 className="size-4 animate-spin text-accent" />
          Generating study notes…
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Course list */}
        <div className="space-y-1">
          {loading && courses.length === 0 ? (
            <div className="flex items-center gap-2 text-ink-faint py-4">
              <Loader2 className="size-4 animate-spin" /> Loading courses…
            </div>
          ) : (
            courses.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCourse(c)}
                className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                  selectedCourse?.id === c.id
                    ? "bg-accent-softer text-accent"
                    : "hover:bg-card-hover text-ink"
                }`}
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </div>
                <span className="text-xs text-ink-faint">{c.course_code}</span>
              </button>
            ))
          )}
        </div>

        {/* Content panel */}
        <div className="space-y-2">
          {!selectedCourse ? (
            <p className="text-ink-faint py-8 text-center">Select a course to browse its content.</p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-ink-faint py-4">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : tab === "assignments" ? (
            assignments.length === 0 ? (
              <p className="text-ink-faint py-4">No assignments found.</p>
            ) : (
              assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between rounded-xl border border-edge bg-card p-4 shadow-soft"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{a.name}</p>
                    {a.due_at && (
                      <p className="text-xs text-ink-faint mt-0.5">
                        Due: {new Date(a.due_at).toLocaleDateString()}
                      </p>
                    )}
                    {a.description && (
                      <p className="text-xs text-ink-faint mt-1 line-clamp-2">
                        {a.description.replace(/<[^>]*>/g, "").slice(0, 200)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      importAsNote({
                        kind: "text",
                        text: a.description?.replace(/<[^>]*>/g, "") ?? "",
                        title: a.name,
                      })
                    }
                    disabled={generating}
                    className="ml-3 shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Import
                  </button>
                </div>
              ))
            )
          ) : tab === "files" ? (
            files.length === 0 ? (
              <p className="text-ink-faint py-4">No files found.</p>
            ) : (
              files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-edge bg-card p-4 shadow-soft"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="size-5 shrink-0 text-ink-faint" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{f.display_name}</p>
                      <p className="text-xs text-ink-faint">
                        {(f.size / 1024).toFixed(0)} KB · {f["content-type"]}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => importAsNote({ kind: "url", url: f.url, title: f.display_name })}
                    disabled={generating}
                    className="ml-3 shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Import
                  </button>
                </div>
              ))
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
