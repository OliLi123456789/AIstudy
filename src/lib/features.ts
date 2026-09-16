/* Feature kill-switches for work-in-progress integrations.
   Flip a flag back to true to re-enable — the underlying code is not deleted. */

/** Canvas LMS integration (browse page, Settings card, planner deadlines). */
export const CANVAS_ENABLED = false;

/** Landing-page sign-in/sign-up UI. Off while the product has no accounts
    yet — flip back to true (no other changes) to restore it. Supabase
    auth routes and account sync keep working either way. */
export const AUTH_UI_ENABLED = false;
