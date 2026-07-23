import { useEffect, useState } from "react";
import {
  Camera,
  Copy,
  Download,
  GraduationCap,
  Pencil,
  Settings as SettingsIcon,
  Zap,
} from "lucide-react";
import { useApp } from "../lib/app";
import { loadApiKey, detectProvider } from "../lib/engine/keys";
import { createCanvasClient } from "../lib/canvas";
import { exportMarkdown, downloadText } from "../lib/export";

export default function Settings() {
  const { prefs, savePrefs, repo } = useApp();
  const [exportMsg, setExportMsg] = useState("");
  const [canvasUrl, setCanvasUrl] = useState(prefs.canvasUrl ?? "");
  const [canvasToken, setCanvasToken] = useState(prefs.canvasToken ?? "");
  const [canvasStatus, setCanvasStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [canvasMsg, setCanvasMsg] = useState("");
  const [key, setKey] = useState("");

  useEffect(() => {
    loadApiKey().then(setKey);
  }, []);

  const provider = key ? detectProvider(key) : null;

  return (
    <div className="px-10 py-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="size-6 text-accent" />
        <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
      </div>
      <p className="mt-1 text-lg text-ink-faint">Manage your profile and preferences</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="overflow-hidden rounded-card border border-edge bg-card shadow-soft">
          <div className="h-24 bg-accent-soft" />
          <div className="-mt-10 flex flex-col items-center px-6 pb-6">
            <div className="relative">
              <div className="flex size-20 items-center justify-center rounded-full border-4 border-card bg-accent-softer font-display text-2xl font-bold text-accent">
                N
              </div>
              <button
                className="absolute -bottom-1 -left-1 rounded-full border border-edge bg-card p-1.5 text-ink-dim shadow-soft hover:text-ink"
                aria-label="Change avatar"
              >
                <Camera className="size-3.5" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="font-display text-xl font-bold">You</span>
              <Pencil className="size-3.5 text-ink-faint" />
            </div>
            <span className="text-sm text-ink-faint">
              Local account — nothing leaves this device
            </span>

            <div className="mt-5 w-full space-y-3">
              <Field label="Language" value={prefs.language} editable />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                  <Zap className="size-5 text-accent" />
                  AI Engine
                </h2>
                <p className="mt-1 text-sm text-ink-faint">
                  Powered by {provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "AI"} — no setup required. Just start creating.
                </p>
              </div>
              {provider && (
                <span className="shrink-0 rounded-full bg-accent-softer px-3 py-1.5 text-xs font-bold text-accent">
                  {provider === "anthropic" ? "Anthropic" : "OpenAI"}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <GraduationCap className="size-5 text-accent" />
              Canvas LMS
            </h2>
            <p className="mt-1 text-sm text-ink-faint">
              Connect your school's Canvas account to import courses and assignments.
              Get your token from Canvas → Account → Settings → Approved Integrations.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-semibold text-ink-dim">Canvas URL</label>
                <input
                  type="text"
                  value={canvasUrl}
                  onChange={(e) => setCanvasUrl(e.target.value)}
                  placeholder="https://canvas.institution.edu"
                  className="mt-1 w-full rounded-xl border border-edge bg-panel px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-ink-dim">Access Token</label>
                <input
                  type="password"
                  value={canvasToken}
                  onChange={(e) => setCanvasToken(e.target.value)}
                  placeholder="Canvas personal access token"
                  className="mt-1 w-full rounded-xl border border-edge bg-panel px-3 py-2 text-sm outline-none placeholder:text-ink-faint"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setCanvasStatus("testing");
                    setCanvasMsg("");
                    try {
                      const client = createCanvasClient(canvasToken.trim(), canvasUrl.trim());
                      const profile = await client.validate();
                      setCanvasStatus("ok");
                      setCanvasMsg(`Connected as ${profile.name}`);
                      savePrefs({ ...prefs, canvasUrl: canvasUrl.trim(), canvasToken: canvasToken.trim() });
                    } catch (e) {
                      setCanvasStatus("error");
                      setCanvasMsg(e instanceof Error ? e.message : "Connection failed");
                    }
                  }}
                  disabled={!canvasUrl.trim() || !canvasToken.trim() || canvasStatus === "testing"}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {canvasStatus === "testing" ? "Testing…" : canvasStatus === "ok" ? "✓ Connected" : "Test & save"}
                </button>
                {canvasMsg && (
                  <span className={`text-sm font-semibold ${canvasStatus === "error" ? "text-danger-ink" : "text-green-600"}`}>
                    {canvasMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Download className="size-5 text-accent" />
              Your data
            </h2>
            <p className="mt-1 text-sm text-ink-faint">
              AIstudy is free and open source (AGPL-3.0). Your notes are yours —
              export any single note as Markdown, PDF, or Word from its menu, or
              export everything at once here. Nothing is ever locked behind a paywall.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={async () => {
                  const notes = (await repo?.listNotes()) ?? [];
                  if (notes.length === 0) {
                    setExportMsg("You don't have any notes yet.");
                    return;
                  }
                  const all = notes.map((n) => exportMarkdown(n)).join("\n\n---\n\n");
                  downloadText("aistudy-notes.md", all, "text/markdown");
                  setExportMsg(`Exported ${notes.length} note${notes.length > 1 ? "s" : ""}.`);
                }}
                className="rounded-xl border border-edge bg-panel px-4 py-2 text-sm font-semibold shadow-soft hover:bg-card-hover"
              >
                Export all notes (Markdown)
              </button>
              {exportMsg && <span className="text-sm text-ink-faint">{exportMsg}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  editable,
  copyable,
}: {
  label: string;
  value: string;
  editable?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-edge bg-panel px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-faint">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
      {editable && <Pencil className="size-3.5 shrink-0 text-ink-faint" />}
      {copyable && (
        <button
          onClick={() => navigator.clipboard.writeText(value)}
          className="rounded-lg border border-edge bg-card p-2 text-ink-dim shadow-soft hover:text-ink"
          aria-label={`Copy ${label}`}
        >
          <Copy className="size-3.5" />
        </button>
      )}
    </div>
  );
}
