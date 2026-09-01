import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/* HilltopAds MultiTag banners (300x250, desktop + mobile), stacked in the
 * app's right rail.
 *
 * Each publisher snippet injects a loader script that renders the creative
 * in place. We recreate the snippets inside our own containers so the ads
 * stay positioned in the rail, and re-inject on every route change so they
 * refresh as the user moves between pages. */
const ZONES = [
  "//relieved-understanding.com/bTXsV/s.d/GUlx0ZYtWWcL/_e/mP9/uyZSUylAkFPqTPc/z/N/zUUR1/MujIUGt/N_zAMl3iNDTPUZyQOFQy",
  "//relieved-understanding.com/b.XQVjsjdZGrlG0-Y_WUca/HezmO9/uCZcUplJkLPkTBcizHNPzxU/1ANyDqEUtzNWzGML3/NeT/UF0/NrQB",
  "//relieved-understanding.com/bwXJVes/d.Gulr0RYmWJcp/teFmi9iuZZ/UllekOPrTucVzaN/zXU/1/N/TNc_t/NZzkMX3kNFTAUk2cMjQu",
];

function injectZone(container: HTMLDivElement, src: string) {
  const s = document.createElement("script") as HTMLScriptElement & {
    settings?: Record<string, unknown>;
  };
  s.settings = {};
  s.src = src;
  s.async = true;
  s.referrerPolicy = "no-referrer-when-downgrade";
  container.appendChild(s);
}

export default function HilltopBanner() {
  const rootRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Clear any previous creatives, then inject a fresh loader per zone.
    root.innerHTML = "";
    for (const src of ZONES) {
      const container = document.createElement("div");
      container.className = "min-h-[250px] w-full";
      root.appendChild(container);
      injectZone(container, src);
    }

    return () => {
      root.innerHTML = "";
    };
  }, [location.pathname]);

  return <div ref={rootRef} className="flex w-full flex-col gap-4" />;
}
