/* Calendar helpers + iCal export for the planner. All local-time based. */

import type { StudyBlock } from "./types";

/** Format a Date as a local "YYYY-MM-DD" key. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a "YYYY-MM-DD" key into a local Date at midnight. */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Monday of the week containing the given date. */
export function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7; // Mon=0 ... Sun=6
  copy.setDate(copy.getDate() - dow);
  return copy;
}

/** Add `days` to a date (new Date, does not mutate). */
export function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** "Mon, Oct 15" style label. */
export function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "14:30" from minutes since midnight. */
export function minToTime(startMin: number): string {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** minutes since midnight from "HH:MM". */
export function timeToMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Whether two date keys are the same day as today. */
export function isToday(key: string): boolean {
  return key === dateKey(new Date());
}

/* ---- iCal export -------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local date-time in iCal format: YYYYMMDDTHHMMSS. */
function icalDT(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Build an ICS calendar file from study blocks. */
export function buildICS(blocks: StudyBlock[]): string {
  const events = blocks
    .map((b) => {
      const start = parseKey(b.dateKey);
      start.setMinutes(start.getMinutes() + b.startMin);
      const end = new Date(start.getTime() + b.durationMin * 60000);
      return [
        "BEGIN:VEVENT",
        `UID:${b.id}@aistudy`,
        `DTSTAMP:${icalDT(new Date())}`,
        `DTSTART:${icalDT(start)}`,
        `DTEND:${icalDT(end)}`,
        `SUMMARY:${esc(b.title)}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AIstudy//Study Planner//EN",
    "CALSCALE:GREGORIAN",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Trigger a download of the .ics file. */
export function downloadICS(blocks: StudyBlock[], filename = "aistudy-schedule.ics") {
  const blob = new Blob([buildICS(blocks)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
