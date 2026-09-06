/* AdSense loader, gated to content screens only.

   Google policy forbids ad code on screens without publisher content —
   loading states, onboarding/auth walls, and internal admin pages. The
   loader is deliberately NOT in index.html. Content pages call
   initAdSense() once the app is ready, the user is onboarded, and the
   current route has real content. */

let injected = false;

export function initAdSense(): void {
  if (injected || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
  if (!client || client === "ca-pub-0000000000000000") {
    return;
  }
  injected = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  s.crossOrigin = "anonymous";
  document.head.appendChild(s);
}

/* Routes where advertising must never load. */
export function isContentlessPath(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/admin")
  );
}
