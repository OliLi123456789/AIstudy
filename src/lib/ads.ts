/* AdSense integration.

   The loader snippet lives in index.html (site verification reads the raw
   HTML). It makes pages ELIGIBLE for ads, but nothing displays unless a
   manual <ins> unit exists or Auto ads is enabled — so keep Auto ads OFF
   and rely on AdUnit placements, which only render on screens with real
   content. */

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
  // The snippet already exists in index.html — never inject a duplicate.
  if (document.querySelector('script[src*="adsbygoogle"]')) {
    injected = true;
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
