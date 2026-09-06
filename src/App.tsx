import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import NoteView from "./pages/NoteView";
import Onboarding from "./pages/Onboarding";
import AuthCallback from "./pages/AuthCallback";
import Admin from "./pages/Admin";
import CanvasBrowse from "./pages/CanvasBrowse";
import FolderView from "./pages/FolderView";
import Planner from "./pages/Planner";
import { useApp } from "./lib/app";
import { CANVAS_ENABLED } from "./lib/features";
import { initAdSense, isContentlessPath } from "./lib/ads";

export default function App() {
  const location = useLocation();
  const { ready, prefs } = useApp();

  // Load the AdSense script only on screens with real content — never on
  // the onboarding/auth wall, admin pages, or while the app is loading
  // (Google policy: no ad code on screens without publisher content).
  useEffect(() => {
    if (!ready || !prefs.onboarded || isContentlessPath(location.pathname)) return;
    initAdSense();
  }, [ready, prefs.onboarded, location.pathname]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-2.5 bg-bg text-ink-faint">
        <Loader2 className="size-5 animate-spin text-accent" />
        <span className="font-display">Loading AIstudy…</span>
      </div>
    );
  }

  // Only the root is gated behind the landing page; deep links (e.g. the
  // sample study set) stay reachable without an account.
  if (!prefs.onboarded && location.pathname === "/") {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="flex h-full bg-bg">
      <div className="min-w-0 flex-1">
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin" element={<Admin />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            {CANVAS_ENABLED && <Route path="/canvas" element={<CanvasBrowse />} />}
            <Route path="/planner" element={<Planner />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/folder/:folderId" element={<FolderView />} />
          <Route path="/notes/:id" element={<Navigate to="editor" replace />} />
          <Route path="/notes/:id/:view" element={<NoteView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
