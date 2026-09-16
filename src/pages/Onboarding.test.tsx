// @vitest-environment jsdom

/* Landing page test — verifies the marketing hero renders, the free
 * no-account entry is always first, the sample study set link exists for
 * crawlers, and sign-in/sign-up is collapsed behind a toggle when Supabase
 * is configured. */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Onboarding from "./Onboarding";

afterEach(() => cleanup());

const supabaseMock = vi.hoisted(() => ({ configured: true }));
const featuresMock = vi.hoisted(() => ({ authEnabled: false }));

vi.mock("../lib/features", () => ({
  AUTH_ENABLED: featuresMock.authEnabled,
  CANVAS_ENABLED: false,
}));

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: () => supabaseMock.configured,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signUp: vi.fn(async () => ({ error: null })),
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

  it("shows the free entry first and hides auth behind a toggle when Supabase is configured", async () => {
    supabaseMock.configured = true;
    featuresMock.authEnabled = true;
    renderLanding();
    // Primary path needs no account.
    expect(await screen.findByText("Start studying — free, no account")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Email")).toBeNull();
    // Crawler-followable link into the seeded sample study set.
    expect(screen.getByRole("link", { name: /sample study set/i }).getAttribute("href")).toBe(
      "/folder/demo-folder",
    );
    // Auth forms appear only after opting in.
    fireEvent.click(screen.getByText(/Already have an account\?/));
    expect(screen.getByText("Create free account")).toBeTruthy();
    expect(screen.getByPlaceholderText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
  });

  it("shows only the free entry when Supabase is not configured", async () => {
    supabaseMock.configured = false;
    featuresMock.authEnabled = false;
    renderLanding();
    expect(await screen.findByText("Start studying — free, no account")).toBeTruthy();
    expect(screen.getByRole("link", { name: /sample study set/i })).toBeTruthy();
    expect(screen.queryByPlaceholderText("Email")).toBeNull();
    expect(screen.queryByText(/Already have an account\?/)).toBeNull();
  });

  it("hides all auth UI when accounts are disabled", async () => {
    supabaseMock.configured = true;
    featuresMock.authEnabled = false;
    renderLanding();
    expect(await screen.findByText("Start studying — free, no account")).toBeTruthy();
    expect(screen.getByRole("link", { name: /sample study set/i })).toBeTruthy();
    expect(screen.queryByText(/Already have an account\?/)).toBeNull();
    expect(screen.queryByPlaceholderText("Email")).toBeNull();
  });

  it("shows a check-your-email notice after signing up", async () => {
    supabaseMock.configured = true;
    featuresMock.authEnabled = true;
    renderLanding();
    fireEvent.click(await screen.findByText(/Already have an account\?/));
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "student@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByText("Create free account"));
    expect(
      await screen.findByText("Check your email to confirm your account, then sign in."),
    ).toBeTruthy();
  });
});
