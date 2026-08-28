/* Post-email-confirmation landing route. Supabase redirects here with
 * #access_token=... after the user clicks the confirm link. getSession()
 * recovers the session from the URL hash, then we send the user into the
 * app (the auth gate in AppProvider marks them onboarded). */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import { getSupabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = getSupabase();
      if (sb) {
        await sb.auth.getSession().catch(() => {});
      }
      if (alive) navigate("/", { replace: true });
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-6">
      <MailCheck className="size-8 text-accent" />
      <p className="font-display font-bold">Email confirmed — signing you in…</p>
      <Loader2 className="size-4 animate-spin text-ink-faint" />
    </div>
  );
}
