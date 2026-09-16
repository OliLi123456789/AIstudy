/* Feature kill-switches for work-in-progress integrations.
   Flip a flag back to true to re-enable — the underlying code is not deleted. */

/** Canvas LMS integration (browse page, Settings card, planner deadlines). */
export const CANVAS_ENABLED = false;

/** Supabase accounts (landing sign-in/sign-up, Settings auth card, auth gate).
   Off while the app has no users; flip back to true when launching accounts.
   No account code is deleted — this only hides the UI and gate. */
export const AUTH_ENABLED = false;
