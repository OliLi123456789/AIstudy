/* One-button sync between the local IndexedDB store and Supabase Postgres.
 *
 * Strategy:
 *   1. Requires a signed-in Supabase user (RLS scopes every row to them).
 *   2. Pull remote rows into the local store first (server is the source
 *      of truth once accounts exist).
 *   3. Push every local row back with an upsert (idempotent).
 *
 * Only the core study data syncs: folders, notes, flashcards, quiz
 * questions, quiz attempts. Jobs/prefs/chat stay local for now. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repo } from "./db";
import type { Flashcard, Folder, Note, QuizAttempt, QuizQuestion } from "./types";

export interface SyncStats {
  folders: number;
  notes: number;
  flashcards: number;
  questions: number;
  attempts: number;
}

/* ---- app -> db row (snake_case) ---------------------------------------- */

function toFolderRow(f: Folder, uid: string) {
  return { id: f.id, user_id: uid, name: f.name, created_at: f.createdAt };
}

function toNoteRow(n: Note, uid: string, validFolderIds: Set<string>) {
  return {
    id: n.id,
    user_id: uid,
    folder_id: n.folderId && validFolderIds.has(n.folderId) ? n.folderId : null,
    title: n.title,
    source_kind: n.sourceKind,
    source_text: n.sourceText,
    source_meta: n.sourceMeta ?? null,
    blocks: n.blocks,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    last_opened_at: n.lastOpenedAt,
  };
}

function toCardRow(c: Flashcard, uid: string) {
  return {
    id: c.id,
    user_id: uid,
    note_id: c.noteId,
    front: c.front,
    back: c.back,
    topic: c.topic,
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    last_review: c.lastReview ?? null,
    state: c.state,
  };
}

function toQuestionRow(q: QuizQuestion, uid: string) {
  return {
    id: q.id,
    user_id: uid,
    note_id: q.noteId,
    type: q.type,
    topic: q.topic,
    difficulty: q.difficulty,
    question: q.question,
    options: q.options,
    correct_index: q.correctIndex,
    explanation: q.explanation,
  };
}

function toAttemptRow(a: QuizAttempt, uid: string) {
  return {
    id: a.id,
    user_id: uid,
    note_id: a.noteId,
    question_id: a.questionId,
    topic: a.topic,
    correct: a.correct,
    at: a.at,
  };
}

/* ---- db row -> app ----------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromFolderRow(r: any): Folder {
  return { id: r.id, name: r.name, createdAt: Number(r.created_at) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromNoteRow(r: any): Note {
  return {
    id: r.id,
    title: r.title,
    sourceKind: r.source_kind,
    sourceText: r.source_text ?? "",
    sourceMeta: r.source_meta ?? undefined,
    blocks: r.blocks ?? [],
    folderId: r.folder_id ?? undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    lastOpenedAt: Number(r.last_opened_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromCardRow(r: any): Flashcard {
  return {
    id: r.id,
    noteId: r.note_id,
    front: r.front,
    back: r.back,
    topic: r.topic ?? "",
    due: Number(r.due),
    stability: Number(r.stability ?? 0),
    difficulty: Number(r.difficulty ?? 0),
    reps: Number(r.reps ?? 0),
    lapses: Number(r.lapses ?? 0),
    lastReview: r.last_review == null ? undefined : Number(r.last_review),
    state: r.state ?? "new",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromQuestionRow(r: any): QuizQuestion {
  return {
    id: r.id,
    noteId: r.note_id,
    type: r.type,
    topic: r.topic ?? "",
    difficulty: r.difficulty ?? "intermediate",
    question: r.question,
    options: r.options ?? [],
    correctIndex: Number(r.correct_index ?? 0),
    explanation: r.explanation ?? "",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromAttemptRow(r: any): QuizAttempt {
  return {
    id: r.id,
    noteId: r.note_id,
    questionId: r.question_id,
    topic: r.topic ?? "",
    correct: Boolean(r.correct),
    at: Number(r.at),
  };
}

async function pullAll<T>(sb: SupabaseClient, table: string): Promise<T[]> {
  const { data, error } = await sb.from(table).select("*");
  if (error) throw new Error(`pull ${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function pushRows(sb: SupabaseClient, table: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await sb.from(table).upsert(rows);
  if (error) throw new Error(`push ${table}: ${error.message}`);
}

export async function syncWithSupabase(repo: Repo, sb: SupabaseClient): Promise<SyncStats> {
  const { data, error: authError } = await sb.auth.getUser();
  if (authError || !data.user) throw new Error("Not signed in.");
  const uid = data.user.id;

  // Pull remote (source of truth) and merge into local.
  const [folders, notes, cards, questions, attempts] = await Promise.all([
    pullAll(sb, "folders"),
    pullAll(sb, "notes"),
    pullAll(sb, "flashcards"),
    pullAll(sb, "quiz_questions"),
    pullAll(sb, "quiz_attempts"),
  ]);

  for (const r of folders) await repo.putFolder(fromFolderRow(r));
  for (const r of notes) await repo.putNote(fromNoteRow(r));
  for (const r of cards) await repo.putCard(fromCardRow(r));
  for (const r of questions) await repo.putQuestions([fromQuestionRow(r)]);
  for (const r of attempts) await repo.putAttempt(fromAttemptRow(r));

  // Push local rows back (idempotent upserts).
  const localFolders = await repo.listFolders();
  const validFolderIds = new Set(localFolders.map((f) => f.id));
  const localNotes = await repo.listNotes();
  const localCards = await repo.allCards();
  const localQuestions = await repo.allQuestions();
  const localAttempts = await repo.allAttempts();

  await pushRows(sb, "folders", localFolders.map((f) => toFolderRow(f, uid)));
  await pushRows(sb, "notes", localNotes.map((n) => toNoteRow(n, uid, validFolderIds)));
  await pushRows(sb, "flashcards", localCards.map((c) => toCardRow(c, uid)));
  await pushRows(sb, "quiz_questions", localQuestions.map((q) => toQuestionRow(q, uid)));
  await pushRows(sb, "quiz_attempts", localAttempts.map((a) => toAttemptRow(a, uid)));

  return {
    folders: localFolders.length,
    notes: localNotes.length,
    flashcards: localCards.length,
    questions: localQuestions.length,
    attempts: localAttempts.length,
  };
}
