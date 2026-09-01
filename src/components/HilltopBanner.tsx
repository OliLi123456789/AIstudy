import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/* HilltopAds MultiTag banner (300x250, desktop + mobile).
 *
 * The publisher snippet injects a loader script that renders the creative
 * in place. We recreate the snippet inside our own container so the ad is
 * positioned in the app's right rail, and re-inject on every route change
 * so the ad refreshes as the user moves between pages. */
const HILLTOP_SRC =
  "//relieved-understanding.com/bTXsV/s.d/GUlx0ZYtWWcL/_e/mP9/uyZSUylAkFPqTPc/z/N/zUUR1/MujIUGt/N_zAMl3iNDTPUZyQOFQy";

export default function HilltopBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any previous creative, then inject a fresh loader script.
    container.innerHTML = "";
    const s = document.createElement("script") as HTMLScriptElement & {
      settings?: Record<string, unknown>;
    };
    s.settings = {};
    s.src = HILLTOP_SRC;
    s.async = true;
    s.referrerPolicy = "no-referrer-when-downgrade";
    container.appendChild(s);

    return () => {
      container.innerHTML = "";
    };
  }, [location.pathname]);

  return <div ref={containerRef} className="min-h-[250px] w-full" />;
}
