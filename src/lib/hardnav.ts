/* Full page navigation. Used instead of client-side router navigation so
 * third-party ad scripts — which render only once per page load — run fresh
 * on every tab/view change. */
export function hardNav(path: string, replace = false): void {
  if (replace) window.location.replace(path);
  else window.location.href = path;
}
