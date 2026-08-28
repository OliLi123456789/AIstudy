/* Anonymous session handling. There are no accounts yet, so the browser
 * obtains a short-lived HMAC-signed token from the server (/api/session) and
 * presents it on every /api/ai/* call. The token lets the server rate-limit
 * and quota abuse without exposing the DeepSeek key to the client. */

import { getSupabase } from "../supabase";

let sessionPromise: Promise<string> | null = null;

export function getSessionToken(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const res = await fetch("/api/session", { method: "POST" });
      if (!res.ok) throw new Error("Could not start a session.");
      const data = await res.json();
      if (typeof data.token !== "string" || !data.token) {
        throw new Error("No session token returned.");
      }
      return data.token;
    })();
  }
  return sessionPromise;
}

/* Drop the cached token (e.g. after a 401) so the next call re-issues one. */
export function resetSessionToken(): void {
  sessionPromise = null;
}

/* The token every /api/ai call should present: the signed-in Supabase
 * user's access token when available (per-user quotas), otherwise the
 * anonymous session token. */
export async function getClientAuthToken(): Promise<string> {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  }
  return getSessionToken();
}

/* Drop cached auth so the next call re-resolves (Supabase session refresh
 * happens inside getClientAuthToken automatically). */
export function resetClientAuthToken(): void {
  resetSessionToken();
}
