import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  GraduationCap,
  Home,
  LogOut,
  Palette,
  PenLine,
  Settings as SettingsIcon,
} from "lucide-react";
import { toggleTheme } from "../lib/theme";
import { useApp } from "../lib/app";
import { CANVAS_ENABLED } from "../lib/features";
import { getSupabase } from "../lib/supabase";
import { getEnginePrefs } from "../lib/prefs";

const navItems = [
  { to: "/", label: "My Studies", icon: Home },
  { to: "/planner", label: "Planner", icon: CalendarDays },
  { to: "/essay", label: "Essay Review", icon: ClipboardCheck },
  { to: "/canvas", label: "Canvas", icon: GraduationCap, canvasOnly: true },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { prefs, savePrefs } = useApp();
  const [signedIn, setSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setUserEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setUserEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function logOut() {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    // Reset onboarding so the app routes back to the landing page.
    savePrefs({ ...getEnginePrefs(), onboarded: false });
  }

  const canvasConnected = CANVAS_ENABLED && !!(prefs.canvasToken && prefs.canvasUrl);
  const visibleItems = navItems.filter((i) => !i.canvasOnly || canvasConnected);

  return (
    <div className="flex h-full bg-bg">
      <aside
        className={`flex shrink-0 flex-col border-r border-edge bg-panel transition-all ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-5">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <PenLine className="size-5 text-accent" />
              <span className="font-display text-lg font-semibold tracking-tight">
                AIstudy
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-lg p-1.5 text-ink-dim hover:bg-card-hover hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {visibleItems.map(({ to, label, icon: Icon }) => {
            const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <a
                key={to}
                href={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  isActive
                    ? "bg-card-hover text-ink"
                    : "text-ink-dim hover:bg-card-hover hover:text-ink"
                }`}
              >
                <Icon className="size-4.5 shrink-0" />
                {!collapsed && label}
              </a>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1 px-3 pb-4">
          <button
            onClick={() => toggleTheme()}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-dim hover:bg-card-hover hover:text-ink"
          >
            <Palette className="size-4.5 shrink-0" />
            {!collapsed && "Theme"}
          </button>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-xs font-bold text-accent">
              {(userEmail ?? "Y").charAt(0).toUpperCase()}
            </div>
            {!collapsed && <span className="truncate text-sm font-semibold">{userEmail ?? "You"}</span>}
          </div>
          {signedIn && (
            <button
              onClick={logOut}
              title="Log out"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-dim hover:bg-card-hover hover:text-ink"
            >
              <LogOut className="size-4.5 shrink-0" />
              {!collapsed && "Log out"}
            </button>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
