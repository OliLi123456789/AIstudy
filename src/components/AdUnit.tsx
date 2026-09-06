import { useEffect, useRef } from "react";
import { adQueue, adsenseClient } from "../lib/ads";

/* Manual AdSense display unit for content pages.

   Renders an <ins class="adsbygoogle"> element and queues a fill request.
   Until a data-ad-slot is configured (or Auto ads is enabled), the labeled
   placeholder box reserves the space so the layout is stable. */

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

  return (
    <div className={`flex w-full flex-col items-center ${className}`}>
      <span className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint/70">
        {label}
      </span>
      <div className="relative flex min-h-[110px] w-full items-center justify-center overflow-hidden rounded-xl bg-panel/50">
        {slot ? (
          <ins
            ref={insRef}
            className="adsbygoogle block w-full"
            data-ad-client={adsenseClient() ?? ""}
            data-ad-slot={slot}
            data-ad-format="auto"
            data-full-width-responsive="true"
            style={{ display: "block" }}
          />
        ) : (
          <span className="px-4 text-center text-xs text-ink-faint">
            Ad placement reserved — configure the slot ID or enable Auto ads.
          </span>
        )}
      </div>
    </div>
  );
}
