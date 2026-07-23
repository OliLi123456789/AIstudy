import { useNavigate } from "react-router-dom";
import { PenLine } from "lucide-react";
import { useApp } from "../lib/app";
import { getEnginePrefs } from "../lib/prefs";

export default function Onboarding() {
  const navigate = useNavigate();
  const { savePrefs } = useApp();

  function finish() {
    savePrefs({ ...getEnginePrefs(), onboarded: true });
    navigate("/", { replace: true });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-bg px-6">
      <div className="flex items-center gap-2">
        <PenLine className="size-7 text-accent" />
        <span className="font-display text-2xl font-bold tracking-tight">AIstudy</span>
      </div>
      <h1 className="mt-6 text-center font-display text-4xl font-bold">
        Welcome to AIstudy
      </h1>
      <p className="mt-2 max-w-lg text-center text-ink-dim">
        Turn any lecture, PDF, or document into study notes, flashcards, quizzes, and a personal AI tutor — all powered by AI.
      </p>
      <p className="mt-4 max-w-md text-center text-sm text-ink-faint">
        Your notes are stored locally in your browser. Nothing leaves your device except the AI requests needed to generate your study materials.
      </p>
      <button
        onClick={finish}
        className="mt-10 rounded-xl bg-accent px-8 py-3.5 font-display font-bold text-white hover:bg-accent-hover transition"
      >
        Get started
      </button>
    </div>
  );
}
