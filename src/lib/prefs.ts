import type { EnginePrefs } from "./types";

/* App preferences persist in localStorage. The API key is injected at build
   time via VITE_API_KEY — no user key entry needed. */

const KEY = "aistudy.prefs";

const defaults: EnginePrefs = {
  onboarded: false,
  language: "English",
};

export function getEnginePrefs(): EnginePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...(JSON.parse(raw) as Partial<EnginePrefs>) };
  } catch {
    return { ...defaults };
  }
}

export function saveEnginePrefs(prefs: EnginePrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}

export function updateEnginePrefs(patch: Partial<EnginePrefs>): EnginePrefs {
  const next = { ...getEnginePrefs(), ...patch };
  saveEnginePrefs(next);
  return next;
}
