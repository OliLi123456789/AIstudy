/* Sync layer tests: local IndexedDB (memory) ↔ fake Supabase tables. */

import { describe, it, expect } from "vitest";
import { Repo } from "./db";
import { memoryStore } from "./db/memory";
import { syncWithSupabase } from "./sync";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Flashcard, Note } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
function fakeSupabase(seed: Record<string, any[]>) {
  const tables = { ...seed };
  const from = (table: string) => ({
    select: async () => ({ data: tables[table] ?? [], error: null }),
    upsert: async (rows: any[]) => {
      const t = (tables[table] ??= []);
      for (const r of rows) {
        const i = t.findIndex((x) => x.id === r.id);
        if (i >= 0) t[i] = r;
        else t.push(r);
      }
      return { error: null };
    },
  });
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "uid-1" } }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from,
  } as unknown as SupabaseClient;
}

const note: Note = {
  id: "n1",
  title: "Biology",
  sourceKind: "text",
  sourceText: "mitochondria",
  blocks: [{ id: "b1", type: "paragraph", text: "powerhouse" }],
  createdAt: 1000,
  updatedAt: 2000,
  lastOpenedAt: 3000,
};

const card: Flashcard = {
  id: "c1",
  noteId: "n1",
  front: "Powerhouse of the cell",
  back: "Mitochondria",
  topic: "Cells",
  due: 4000,
  stability: 1,
  difficulty: 2,
  reps: 1,
  lapses: 0,
  state: "new",
};

describe("syncWithSupabase", () => {
  it("pushes local rows to the right tables with user_id", async () => {
    const repo = new Repo(memoryStore());
    await repo.putNote(note);
    await repo.putCard(card);

    const sb = fakeSupabase({});
    const stats = await syncWithSupabase(repo, sb);

    expect(stats.notes).toBe(1);
    expect(stats.flashcards).toBe(1);
    const sbAny = sb as unknown as {
      from: (t: string) => { select: () => Promise<{ data: any[] }> };
    };
    const notes = (await sbAny.from("notes").select()).data;
    const cards = (await sbAny.from("flashcards").select()).data;
    expect(notes[0]).toMatchObject({ id: "n1", user_id: "uid-1", title: "Biology" });
    expect(cards[0]).toMatchObject({ id: "c1", user_id: "uid-1", note_id: "n1" });
  });

  it("pulls remote rows into the local store", async () => {
    const repo = new Repo(memoryStore());
    const sb = fakeSupabase({
      notes: [
        {
          id: "n9",
          user_id: "uid-1",
          title: "Remote note",
          source_kind: "text",
          source_text: "",
          source_meta: null,
          blocks: [],
          folder_id: null,
          created_at: 1,
          updated_at: 2,
          last_opened_at: 3,
        },
      ],
    });

    await syncWithSupabase(repo, sb);
    const got = await repo.getNote("n9");
    expect(got?.title).toBe("Remote note");
  });

  it("drops folder_id references that don't exist (FK safety)", async () => {
    const repo = new Repo(memoryStore());
    await repo.putNote({ ...note, id: "n2", folderId: "missing-folder" });

    const sb = fakeSupabase({});
    await syncWithSupabase(repo, sb);
    const sbAny = sb as unknown as {
      from: (t: string) => { select: () => Promise<{ data: any[] }> };
    };
    const rows = (await sbAny.from("notes").select()).data;
    expect(rows.find((r) => r.id === "n2").folder_id).toBeNull();
  });
});
