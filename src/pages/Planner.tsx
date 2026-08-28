/* Planner — simple weekly study-schedule manager.
   - Week grid of study blocks (user-scheduled, stored locally)
   - Canvas upcoming events shown as deadline markers
   - Export the week to an .ics calendar file */

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useApp } from "../lib/app";
import type { StudyBlock } from "../lib/types";
import { createCanvasClient, type CanvasUpcomingEvent } from "../lib/canvas";
import { CANVAS_ENABLED } from "../lib/features";
import {
  addDays,
  dateKey,
  dayLabel,
  downloadICS,
  isToday,
  minToTime,
  startOfWeek,
  timeToMin,
} from "../lib/calendar";

const HOUR_START = 6;   // first visible hour
const HOUR_END = 23;    // last visible hour
const HOUR_H = 48;      // px per hour

export default function Planner() {
  const { repo, prefs, bump } = useApp();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [canvasEvents, setCanvasEvents] = useState<CanvasUpcomingEvent[]>([]);
  const [canvasErr, setCanvasErr] = useState<string | null>(null);
  const [loadingCanvas, setLoadingCanvas] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState(dateKey(new Date()));
  const [addTime, setAddTime] = useState("14:00");
  const [addDur, setAddDur] = useState(60);
  const [addTitle, setAddTitle] = useState("");

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  /* Load study blocks for the visible week. */
  useEffect(() => {
    if (!repo) return;
    const keys = weekDays.map((d) => dateKey(d));
    (async () => {
      const all = await repo.allStudyBlocks();
      setBlocks(all.filter((b) => keys.includes(b.dateKey)));
    })();
  }, [repo, weekStart]);

  /* Load Canvas upcoming events (read-only, no AI). */
  useEffect(() => {
    if (!CANVAS_ENABLED) return;
    if (!prefs.canvasToken || !prefs.canvasUrl) return;
    setLoadingCanvas(true);
    setCanvasErr(null);
    createCanvasClient(prefs.canvasToken, prefs.canvasUrl)
      .listUpcomingEvents()
      .then((evs) => setCanvasEvents(evs.filter((e) => {
        const due = e.assignment?.due_at || e.start_at;
        return !!due && new Date(due) >= addDays(new Date(), -1);
      })))
      .catch((e) => setCanvasErr(e instanceof Error ? e.message : "Failed to load Canvas events"))
      .finally(() => setLoadingCanvas(false));
  }, [prefs.canvasToken, prefs.canvasUrl]);

  /* Which Canvas events fall on each day of the week. */
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CanvasUpcomingEvent[]>();
    for (const e of canvasEvents) {
      const due = new Date(e.assignment?.due_at || e.start_at || "");
      if (isNaN(due.getTime())) continue;
      const key = dateKey(due);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [canvasEvents]);

  /* Study blocks by day. */
  const blocksByDay = useMemo(() => {
    const map = new Map<string, StudyBlock[]>();
    for (const b of blocks) {
      const list = map.get(b.dateKey) ?? [];
      list.push(b);
      map.set(b.dateKey, list);
    }
    return map;
  }, [blocks]);

  function openAdd(dayKey: string, startMin: number) {
    setAddDate(dayKey);
    setAddTime(minToTime(startMin));
    setAddTitle("");
    setAddDur(60);
    setShowAdd(true);
  }

  async function saveBlock() {
    if (!repo || !addTitle.trim()) return;
    const block: StudyBlock = {
      id: crypto.randomUUID(),
      title: addTitle.trim(),
      dateKey: addDate,
      startMin: timeToMin(addTime),
      durationMin: Math.max(15, addDur),
      done: false,
      createdAt: Date.now(),
    };
    await repo.putStudyBlock(block);
    setBlocks((prev) => [...prev, block]);
    setShowAdd(false);
  }

  async function toggleDone(b: StudyBlock) {
    if (!repo) return;
    const updated = { ...b, done: !b.done };
    await repo.putStudyBlock(updated);
    setBlocks((prev) => prev.map((x) => (x.id === b.id ? updated : x)));
    bump();
  }

  async function deleteBlock(id: string) {
    if (!repo) return;
    await repo.deleteStudyBlock(id);
    setBlocks((prev) => prev.filter((x) => x.id !== id));
    bump();
  }

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge px-6 py-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-6 text-accent" />
          <h1 className="font-display text-2xl font-bold">Study Planner</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-lg p-2 text-ink-dim hover:bg-card-hover hover:text-ink"
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-dim hover:bg-card-hover hover:text-ink"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-lg p-2 text-ink-dim hover:bg-card-hover hover:text-ink"
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="ml-2 text-sm font-semibold text-ink">
            {dayLabel(weekStart)} – {dayLabel(addDays(weekStart, 6))}
          </span>
          <button
            onClick={() => downloadICS(blocks)}
            className="ml-4 flex items-center gap-1.5 rounded-xl border border-edge bg-card px-4 py-2 text-sm font-bold text-ink hover:bg-card-hover"
          >
            <Download className="size-4" />
            Export .ics
          </button>
        </div>
      </div>

      {canvasErr && (
        <div className="border-b border-danger-ink/30 bg-danger-soft px-6 py-2 text-sm font-semibold text-danger-ink">
          Canvas: {canvasErr}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="grid min-w-[860px]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          {/* Day headers */}
          <div />
          {weekDays.map((d) => {
            const key = dateKey(d);
            const evs = eventsByDay.get(key) ?? [];
            return (
              <div key={key} className="border-b border-l border-edge px-2 py-2 text-center">
                <p className={`text-xs font-semibold uppercase ${isToday(key) ? "text-accent" : "text-ink-faint"}`}>
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </p>
                <p className={`text-lg font-bold ${isToday(key) ? "text-accent" : "text-ink"}`}>{d.getDate()}</p>
                {/* Canvas deadline chips */}
                <div className="mt-1 flex flex-col gap-0.5">
                  {evs.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      title={e.title}
                      className="truncate rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400"
                    >
                      ⏰ {e.title}
                    </span>
                  ))}
                  {evs.length > 2 && (
                    <span className="text-[10px] text-ink-faint">+{evs.length - 2} more</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Time gutter */}
          <div className="relative">
            {hours.map((h) => (
              <div key={h} className="relative text-right" style={{ height: HOUR_H }}>
                <span className="absolute right-2 -top-2 text-[10px] font-mono text-ink-faint">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((d) => {
            const key = dateKey(d);
            const dayBlocks = blocksByDay.get(key) ?? [];
            return (
              <div key={key} className="relative border-l border-edge" style={{ height: hours.length * HOUR_H }}>
                {/* Hour lines */}
                {hours.map((h) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-edge/50" style={{ top: (h - HOUR_START) * HOUR_H }} />
                ))}

                {/* Study blocks */}
                {dayBlocks
                  .slice()
                  .sort((a, b) => a.startMin - b.startMin)
                  .map((b) => {
                    const top = ((b.startMin - HOUR_START * 60) / 60) * HOUR_H;
                    const height = Math.max(20, (b.durationMin / 60) * HOUR_H);
                    return (
                      <button
                        key={b.id}
                        onClick={() => toggleDone(b)}
                        title={`${b.title} — ${minToTime(b.startMin)} (${b.durationMin} min)${b.done ? " ✓" : ""}`}
                        className={`absolute left-0.5 right-0.5 z-10 flex flex-col overflow-hidden rounded-md border px-1.5 py-1 text-left transition ${
                          b.done
                            ? "border-green-500/40 bg-green-500/15 opacity-60"
                            : "border-indigo-400/40 bg-indigo-500/20 hover:bg-indigo-500/35"
                        }`}
                        style={{ top, height }}
                      >
                        <span className={`truncate text-[11px] font-bold ${b.done ? "text-green-300 line-through" : "text-indigo-100"}`}>
                          {b.title}
                        </span>
                        <span className="truncate text-[10px] text-white/60">
                          {minToTime(b.startMin)} · {b.durationMin}m
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); void deleteBlock(b.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void deleteBlock(b.id); } }}
                          className="absolute right-1 top-1 rounded p-0.5 text-white/40 hover:text-red-400"
                          aria-label="Delete block"
                        >
                          <Trash2 className="size-3" />
                        </span>
                      </button>
                    );
                  })}

                {/* Click-to-add zones */}
                {hours.slice(0, -1).map((h) => (
                  <button
                    key={h}
                    onClick={() => openAdd(key, h * 60)}
                    className="group absolute left-0 right-0 flex items-center justify-center border-t border-transparent opacity-0 hover:border-accent/40 hover:bg-accent/5 hover:opacity-100"
                    style={{ top: (h - HOUR_START) * HOUR_H, height: HOUR_H }}
                    aria-label={`Add study block at ${h}:00`}
                  >
                    <Plus className="size-4 text-accent" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {loadingCanvas && (
        <div className="flex items-center gap-2 border-t border-edge px-6 py-2 text-xs text-ink-faint">
          <Loader2 className="size-3 animate-spin" /> Loading Canvas events…
        </div>
      )}
      {CANVAS_ENABLED && canvasEvents.length === 0 && !loadingCanvas && prefs.canvasToken && (
        <div className="border-t border-edge px-6 py-2 text-xs text-ink-faint">
          No upcoming Canvas events. Connect Canvas in Settings to see deadlines here.
        </div>
      )}

      {/* Add block modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAdd(false)}>
          <div
            className="w-full max-w-sm rounded-card border border-edge bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-bold">Add Study Block</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-ink-faint">What are you studying?</label>
                <input
                  autoFocus
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && addTitle.trim()) void saveBlock(); }}
                  placeholder="e.g. Calculus — derivatives review"
                  className="mt-1 w-full rounded-xl border border-edge bg-panel px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-semibold text-ink-faint">Day</label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-edge bg-panel px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-faint">Start</label>
                  <input
                    type="time"
                    value={addTime}
                    onChange={(e) => setAddTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-edge bg-panel px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink-faint">Minutes</label>
                  <select
                    value={addDur}
                    onChange={(e) => setAddDur(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-edge bg-panel px-2 py-2 text-sm"
                  >
                    {[30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-dim hover:bg-card-hover">
                Cancel
              </button>
              <button
                onClick={() => void saveBlock()}
                disabled={!addTitle.trim()}
                className="rounded-xl bg-accent px-5 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Add Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Parse a due date from a Canvas event. */
export function canvasEventDue(e: CanvasUpcomingEvent): Date | null {
  const raw = e.assignment?.due_at || e.start_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
