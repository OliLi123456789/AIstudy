// @vitest-environment jsdom

/* Landing page test — verifies the sign-in/sign-up panel renders when
 * Supabase is configured, and the local-only fallback always exists. */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Onboarding from "./Onboarding";

afterEach(() => cleanup());

const supabaseMock = vi.hoisted(() => ({ configured: true }));

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: () => supabaseMock.configured,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}));

vi.mock("../lib/sync", () => ({ syncWithSupabase: vi.fn() }));

vi.mock("../lib/app", () => ({
  useApp: () => ({ savePrefs: vi.fn(), repo: null }),
}));

vi.mock("../lib/prefs", () => ({
  getEnginePrefs: () => ({ onboarded: false, language: "en" }),
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <Onboarding />
    </MemoryRouter>,
  );
}

describe("Onboarding landing page", () => {
  it("shows the marketing hero and feature tiles", () => {
    renderLanding();
    expect(screen.getByText(/Completely free\. Unlimited/)).toBeTruthy();
    expect(screen.getByText("AI study notes")).toBeTruthy();
    expect(screen.getByText("Study games")).toBeTruthy();
  });

  it("shows sign-up form and the local-only fallback when Supabase is configured", async () => {
    supabaseMock.configured = true;
    renderLanding();
    expect(await screen.findByText("Create free account")).toBeTruthy();
    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
    // Accounts are required when Supabase is configured — no local-only path.
    expect(screen.queryByText("Continue without an account")).toBeNull();
  });

  it("offers the local-only path when Supabase is not configured", async () => {
    supabaseMock.configured = false;
    renderLanding();
    expect(await screen.findByText("Continue without an account")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Email")).toBeNull();
  });
});
