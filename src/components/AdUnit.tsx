import { useEffect, useRef } from "react";
import { adQueue, adsenseClient } from "../lib/ads";

/* Manual AdSense display unit for content pages.

   Renders NOTHING until a data-ad-slot is configured in ADSENSE_SLOTS —
   no empty placeholder frames for users or reviewers. */

export default function AdUnit({
  slot,
  label = "Advertisement",
  className = "",
}: {
  slot?: string;
  label?: string;
  className?: string;
}) {
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    const ins = insRef.current;
    if (!ins || !slot || ins.dataset.filled === "1") return;
    if (!adsenseClient()) return;
    ins.dataset.filled = "1";
    adQueue().push({});
  }, [slot]);

  if (!slot) return null;

  return (
    <div className={`flex w-full flex-col items-center ${className}`}>
      <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint/70">
        {label}
      </span>
      <div className="relative flex min-h-[110px] w-full items-center justify-center overflow-hidden rounded-xl bg-panel/50">
        <ins
          ref={insRef}
          className="adsbygoogle block w-full"
          data-ad-client={adsenseClient() ?? ""}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
          style={{ display: "block" }}
        />
      </div>
    </div>
  );
}
