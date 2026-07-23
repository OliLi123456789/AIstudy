/* Owner portal — manage the AI API key. Protected by the admin password
   (set as ADMIN_PASSWORD env var on Vercel). */

import { useState } from "react";
import { KeyRound, Lock, Shield, Zap } from "lucide-react";
import { detectProvider } from "../lib/engine/keys";

export default function Admin() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);

  // Check current key provider on mount
  useState(() => {
    fetch("/api/admin?action=get-key")
      .then((r) => r.json())
      .then((d) => {
        if (d.key) setCurrentProvider(detectProvider(d.key));
      })
      .catch(() => {});
  });

  async function login() {
    setMsg("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", password }),
      });
      const data = await res.json();
      if (data.ok) {
        setAuthed(true);
        // Store password in memory for subsequent calls
        sessionStorage.setItem("admin_pw", password);
      } else {
        setMsg(data.error || "Invalid password");
      }
    } catch {
      setMsg("Network error — is the API server running?");
    }
  }

  async function saveKey() {
    setStatus("saving");
    setMsg("");
    try {
      const pw = sessionStorage.getItem("admin_pw") || password;
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${pw}`,
        },
        body: JSON.stringify({ action: "set-key", key: newKey }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("saved");
        setCurrentProvider(data.provider || detectProvider(newKey));
        setTimeout(() => setStatus("idle"), 2500);
      } else {
        setStatus("error");
        setMsg(data.error || "Failed to save key");
      }
    } catch {
      setStatus("error");
      setMsg("Network error");
    }
  }

  if (!authed) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-bg px-6">
        <Shield className="size-10 text-accent" />
        <h1 className="mt-4 font-display text-3xl font-bold">Owner Portal</h1>
        <p className="mt-2 text-ink-faint">Enter the admin password to manage the AI API key.</p>
        <div className="mt-6 w-full max-w-sm">
          <div className="flex items-center gap-2 rounded-xl border border-edge bg-card px-4 py-3 shadow-soft">
            <Lock className="size-4 text-ink-faint" />
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="Admin password"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          {msg && <p className="mt-3 text-sm font-semibold text-danger-ink text-center">{msg}</p>}
          <button
            onClick={login}
            disabled={!password}
            className="mt-4 w-full rounded-xl bg-accent py-3 font-display font-bold text-white hover:bg-accent-hover disabled:opacity-50 transition"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-bg px-6">
      <Shield className="size-10 text-accent" />
      <h1 className="mt-4 font-display text-3xl font-bold">Owner Portal</h1>
      <p className="mt-2 text-ink-faint">Manage the AI API key used by all users.</p>

      <div className="mt-8 w-full max-w-lg space-y-6">
        {/* Current status */}
        <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-accent" />
            <span className="font-display font-bold">Current Engine</span>
          </div>
          <p className="mt-2 text-sm text-ink-faint">
            {currentProvider
              ? `Active provider: ${currentProvider === "anthropic" ? "Anthropic" : "OpenAI"}`
              : "No API key configured. Add one below."}
          </p>
        </div>

        {/* Set key */}
        <div className="rounded-card border border-edge bg-card p-5 shadow-soft">
          <label className="flex items-center gap-2 font-display font-bold">
            <KeyRound className="size-5 text-accent" />
            Set API Key
          </label>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-2.5">
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk-... (OpenAI) or sk-ant-... (Anthropic)"
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
            {detectProvider(newKey) && (
              <span className="shrink-0 rounded-full bg-accent-softer px-2.5 py-1 text-xs font-bold text-accent">
                {detectProvider(newKey) === "anthropic" ? "Anthropic" : "OpenAI"}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveKey}
              disabled={!newKey.trim() || status === "saving"}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : "Save key"}
            </button>
          </div>
          {status === "error" && (
            <p className="mt-2 text-xs font-semibold text-danger-ink">{msg}</p>
          )}
          <p className="mt-3 text-xs text-ink-faint">
            The key is stored securely in Vercel KV and never exposed in client bundles.
            Changes take effect immediately for new sessions.
          </p>
        </div>
      </div>
    </div>
  );
}
