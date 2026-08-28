/* Account & sync card for Settings: Supabase email/password auth plus a
 * one-button sync of local study data to Postgres. Falls back gracefully
 * when Supabase is not configured. */

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Loader2, UserRound, RefreshCw } from "lucide-react";
import { useApp } from "../lib/app";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { syncWithSupabase, type SyncStats } from "../lib/sync";

function describeStats(s: SyncStats): string {
  return [
    s.notes > 0 ? `${s.notes} note${s.notes === 1 ? "" : "s"}` : null,
    s.folders > 0 ? `${s.folders} folder${s.folders === 1 ? "" : "s"}` : null,
    s.flashcards > 0 ? `${s.flashcards} flashcards` : null,
    s.questions > 0 ? `${s.questions} questions` : null,
    s.attempts > 0 ? `${s.attempts} attempts` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function AuthCard() {
  const { repo, bump, prefs, savePrefs } = useApp();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    sb.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .finally(() => setLoading(false));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit() {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setMsg("");
    try {
      const { error } =
        mode === "signup"
          ? await sb.auth.signUp({ email, password: pw })
          : await sb.auth.signInWithPassword({ email, password: pw });
      if (error) {
        setMsg(error.message);
      } else {
        setPw("");
        setMsg(mode === "signup" ? "Account created — check your email if confirmation is enabled." : "");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    setSyncMsg("");
    // Return to the landing page (accounts are required while signed out).
    savePrefs({ ...prefs, onboarded: false });
  }

  async function syncNow() {
    const sb = getSupabase();
    if (!sb || !repo) return;
    setBusy(true);
    setSyncMsg("Syncing…");
    try {
      const stats = await syncWithSupabase(repo, sb);
      setSyncMsg(`Synced: ${describeStats(stats) || "nothing to sync"}.`);
      bump();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <UserRound className="size-5 text-accent" />
          Account
        </h2>
        <p className="mt-1 text-sm text-ink-faint">
          Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env</code> to
          enable accounts and cloud sync. Your notes stay local until then.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <UserRound className="size-5 text-accent" />
        Account & Sync
      </h2>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-faint">
          <Loader2 className="size-4 animate-spin" /> Loading session…
        </div>
      ) : user ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            Signed in as <span className="font-semibold">{user.email}</span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={syncNow}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Sync now
            </button>
            <button
              onClick={signOut}
              className="rounded-xl border border-edge bg-panel px-4 py-2 text-sm font-semibold hover:bg-card-hover"
            >
              Sign out
            </button>
          </div>
          {syncMsg && <p className="text-xs text-ink-faint">{syncMsg}</p>}
          <p className="text-xs text-ink-faint">
            Syncs folders, notes, flashcards, quizzes and attempts to your
            Supabase account. RLS keeps every row private to you.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex rounded-full border border-edge bg-panel p-1 w-fit">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setMsg("");
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  mode === m ? "bg-accent text-white" : "text-ink-faint hover:text-ink"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-edge bg-panel px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password"
            className="w-full rounded-xl border border-edge bg-panel px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={submit}
            disabled={busy || !email.trim() || !pw}
            className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="mx-auto size-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {msg && <p className="text-xs font-semibold text-ink-dim">{msg}</p>}
        </div>
      )}
    </div>
  );
}
