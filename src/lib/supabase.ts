/* Supabase client for the app. Safe for the browser: uses the PUBLISHABLE
 * (anon) key only. Row Level Security enforces per-user access — the key
 * itself grants nothing. The service_role key never touches this file. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  return Boolean(
    url && key && url.startsWith("https://") && !url.includes("YOUR-PROJECT-REF"),
  );
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      { auth: { persistSession: true } },
    );
  }
  return client;
}
