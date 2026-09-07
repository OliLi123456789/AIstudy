/* AdSense loader, gated to content screens only.

   Google policy forbids ad code on screens without publisher content —
   loading states, onboarding/auth walls, and internal admin pages. The
   loader is deliberately NOT in index.html. Content pages call
   initAdSense() once the app is ready, the user is onboarded, and the
   current route has real content. */

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let injected = false;

export function adsenseClient(): string | undefined {
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
  return client && client !== "ca-pub-0000000000000000" ? client : undefined;
}

/* The adsbygoogle queue must exist before any <ins> element pushes into it;
   the loader script picks queued pushes up once it finishes loading. */
export function adQueue(): unknown[] {
  return (window.adsbygoogle = window.adsbygoogle || []);
}

export function initAdSense(): void {
  if (injected || typeof window === "undefined") {
    return;
  }
  const client = adsenseClient();
  if (!client) {
    return;
  }
  injected = true;
  adQueue();
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

/* Manual display-unit slots. Create "Display ads" units in the AdSense
   dashboard and paste their data-ad-slot IDs here. Until then AdUnit
   renders a labeled placeholder (or enable Auto ads for instant fill
   without slot IDs). */
export const ADSENSE_SLOTS: Record<"note" | "folder" | "dashboard", string> = {
  note: "",
  folder: "",
  dashboard: "",
};

/* Routes where advertising must never load: auth walls, admin, and
   utility/navigation screens (settings, planner). Ads belong next to
   publisher content — study notes, folders, the dashboard. */
export function isContentlessPath(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname === "/auth/callback" ||
    pathname === "/settings" ||
    pathname === "/planner" ||
    pathname.startsWith("/admin")
  );
}
