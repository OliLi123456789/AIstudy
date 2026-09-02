import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppShell from "./components/AppShell";
import HilltopBanner from "./components/HilltopBanner";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import NoteView from "./pages/NoteView";
import Onboarding from "./pages/Onboarding";
import AuthCallback from "./pages/AuthCallback";
import Admin from "./pages/Admin";
import CanvasBrowse from "./pages/CanvasBrowse";
import EssayReview from "./pages/EssayReview";
import FolderView from "./pages/FolderView";
import Planner from "./pages/Planner";
import { useApp } from "./lib/app";
import { CANVAS_ENABLED } from "./lib/features";

export default function App() {
  const location = useLocation();
  const { ready, prefs } = useApp();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center gap-2.5 bg-bg text-ink-faint">
        <Loader2 className="size-5 animate-spin text-accent" />
        <span className="font-display">Loading AIstudy…</span>
      </div>
    );
  }

  if (!prefs.onboarded && location.pathname !== "/onboarding" && location.pathname !== "/auth/callback") {
    return <Navigate to="/onboarding" replace />;
  }

  // Right rail with the HilltopAds banner on every page except the auth
  // callback and internal admin routes.
  const hideRail =
    location.pathname === "/onboarding" ||
    location.pathname === "/auth/callback" ||
    location.pathname.startsWith("/admin");

  return (
    <div className="flex h-full bg-bg">
      <div className="min-w-0 flex-1">
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin" element={<Admin />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/essay" element={<EssayReview />} />
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
      {!hideRail && (
        <aside
          key={location.key}
          className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-edge bg-panel p-4 xl:flex"
        >
          <HilltopBanner />
        </aside>
      )}
    </div>
  );
}
