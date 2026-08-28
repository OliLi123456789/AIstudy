/* Landing page — marketing hero + Supabase sign in / sign up. Shown as the
   entry point until the user is onboarded (or signs in). Also offers a
   "continue without an account" path that keeps the app local-first. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import {
  Brain,
  FileText,
  Gamepad2,
  Layers,
  ListChecks,
  Loader2,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useApp } from "../lib/app";
import { getEnginePrefs } from "../lib/prefs";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { syncWithSupabase } from "../lib/sync";

const FEATURES = [
  {
    icon: FileText,
    title: "AI study notes",
    text: "Drop in any PDF, DOCX, slide deck, or link — get clean, organized notes in seconds.",
  },
  {
    icon: Layers,
    title: "Smart flashcards",
    text: "Auto-generated cards with spaced-repetition scheduling that adapts to your memory.",
  },
  {
    icon: ListChecks,
    title: "Quizzes & practice tests",
    text: "Unlimited MCQ, true/false, and essay questions with explanations for every answer.",
  },
  {
    icon: Gamepad2,
    title: "Study games",
    text: "Hangman, Asteroids, PacCard and more — turn your flashcards into arcade games.",
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { savePrefs, repo } = useApp();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setChecking(false);
      return;
    }
    sb.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null))
      .finally(() => setChecking(false));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function finish(doSync: boolean) {
    savePrefs({ ...getEnginePrefs(), onboarded: true });
    if (doSync && repo) {
      const sb = getSupabase();
      if (sb) syncWithSupabase(repo, sb).catch(() => {});
    }
    navigate("/", { replace: true });
  }

  async function submit() {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setMsg("");
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) {
          setMsg(error.message);
        } else {
          // Always route new accounts through email confirmation messaging.
          setNotice("Check your email to confirm your account, then sign in.");
          setPassword("");
          setMode("signin");
        }
        return;
      }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg(error.message);
      } else if (data.session) {
        setNotice(null);
        await finish(true);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full overflow-y-auto bg-bg">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="size-7 text-accent" />
            <span className="font-display text-2xl font-bold tracking-tight">AIstudy</span>
          </div>
          <span className="rounded-full bg-accent-softer px-3 py-1.5 text-xs font-bold text-accent">
            100% free · unlimited
          </span>
        </header>

        {/* Hero */}
        <section className="mt-8 text-center">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            AI study tools.
            <br />
            <span className="text-accent">Completely free. Unlimited.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-ink-dim md:text-lg">
            Turn any lecture, PDF, or document into notes, flashcards, quizzes,
            and games — powered by AI. No paywall, no limits, no credit card.
          </p>
        </section>

        {/* Feature grid */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-card border border-edge bg-card p-4 shadow-soft">
              <Icon className="size-5 text-accent" />
              <h3 className="mt-2 font-display font-bold">{title}</h3>
              <p className="mt-1 text-sm text-ink-faint">{text}</p>
            </div>
          ))}
        </section>

        {/* Auth panel */}
        <section className="mx-auto mt-8 w-full max-w-md">
          {notice && (
            <div className="mb-4 rounded-xl border border-accent/20 bg-accent-softer px-4 py-3 text-center text-sm font-semibold text-accent">
              {notice}
            </div>
          )}
          <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
            {checking ? (
              <div className="flex items-center justify-center gap-2 py-6 text-ink-faint">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : user ? (
              <div className="text-center">
                <Brain className="mx-auto size-8 text-accent" />
                <h2 className="mt-3 font-display text-xl font-bold">Welcome back</h2>
                <p className="mt-1 text-sm text-ink-faint">
                  Signed in as <span className="font-semibold text-ink">{user.email}</span>
                </p>
                <button
                  onClick={() => finish(true)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-display font-bold text-white hover:bg-accent-hover transition"
                >
                  <Sparkles className="size-4" /> Open my studies
                </button>
                <button
                  onClick={async () => {
                    await getSupabase()?.auth.signOut();
                    savePrefs({ ...getEnginePrefs(), onboarded: false });
                  }}
                  className="mt-3 text-sm font-semibold text-ink-faint hover:text-ink"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-center font-display text-xl font-bold">
                  {mode === "signup" ? "Start studying — free" : "Welcome back"}
                </h2>
                <p className="mt-1 text-center text-sm text-ink-faint">
                  {mode === "signup"
                    ? "Create an account to sync your notes across devices."
                    : "Sign in to pick up where you left off."}
                </p>

                {isSupabaseConfigured() && (
                  <>
                    <div className="mt-5 flex rounded-full border border-edge bg-panel p-1">
                      {(["signup", "signin"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setMode(m);
                            setMsg("");
                          }}
                          className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${
                            mode === m ? "bg-accent text-white" : "text-ink-faint hover:text-ink"
                          }`}
                        >
                          {m === "signup" ? "Create account" : "Sign in"}
                        </button>
                      ))}
                    </div>
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      className="mt-3 w-full rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint"
                    />
                    <input
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      placeholder="Password"
                      className="mt-3 w-full rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint"
                    />
                    <button
                      onClick={submit}
                      disabled={busy || !email.trim() || password.length < 6}
                      className="mt-4 flex w-full items-center justify-center rounded-xl bg-accent py-3 font-display font-bold text-white hover:bg-accent-hover disabled:opacity-50 transition"
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : mode === "signup" ? (
                        "Create free account"
                      ) : (
                        "Sign in"
                      )}
                    </button>
                    {msg && <p className="mt-3 text-center text-sm font-semibold text-ink-dim">{msg}</p>}
                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-edge" />
                      <span className="text-xs text-ink-faint">or</span>
                      <div className="h-px flex-1 bg-edge" />
                    </div>
                  </>
                )}
                {!isSupabaseConfigured() && (
                  <button
                    onClick={() => finish(false)}
                    className="w-full rounded-xl border border-edge bg-panel py-3 text-sm font-bold text-ink-dim hover:bg-card-hover transition"
                  >
                    Continue without an account
                  </button>
                )}
                <p className="mt-3 text-center text-xs text-ink-faint">
                  {isSupabaseConfigured()
                    ? "A free account keeps your notes synced across devices."
                    : "Without an account, your notes stay on this device only."}
                </p>
              </>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-ink-faint">
            Free forever. Your study materials are private — nothing is sold or shared.
          </p>
        </section>
      </div>
    </div>
  );
}
