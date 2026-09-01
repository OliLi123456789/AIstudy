import { useEffect, useRef } from "react";

/* HilltopAds MultiTag banner (300x250, desktop + mobile).
 *
 * The publisher snippet injects a loader script that renders the creative
 * in place. We recreate the snippet inside our own container so the ad is
 * positioned in the app's right rail instead of wherever the tag lands. */
const HILLTOP_SRC =
  "//relieved-understanding.com/bTXsV/s.d/GUlx0ZYtWWcL/_e/mP9/uyZSUylAkFPqTPc/z/N/zUUR1/MujIUGt/N_zAMl3iNDTPUZyQOFQy";
const SCRIPT_ID = "hilltopads-banner-script";

export default function HilltopBanner() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || document.getElementById(SCRIPT_ID)) return;

    const s = document.createElement("script") as HTMLScriptElement & {
      settings?: Record<string, unknown>;
    };
    s.id = SCRIPT_ID;
    s.settings = {};
    s.src = HILLTOP_SRC;
    s.async = true;
    s.referrerPolicy = "no-referrer-when-downgrade";
    container.appendChild(s);

    return () => {
      s.remove();
    };
  }, []);

  return <div ref={containerRef} className="min-h-[250px] w-full" />;
}
