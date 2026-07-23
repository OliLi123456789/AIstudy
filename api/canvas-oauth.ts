/* Canvas OAuth2 flow — lets users sign in with Canvas instead of
 * copy-pasting a token. The site owner configures the OAuth client
 * credentials in the admin portal.
 *
 *   GET /api/canvas-oauth?action=authorize&canvasUrl=...
 *     → redirects to Canvas OAuth authorization page
 *
 *   GET /api/canvas-oauth?action=callback&code=...&state=...
 *     → exchanges code for token, renders a page that posts the
 *       token back to the opener window via postMessage
 *
 *   GET /api/canvas-oauth?action=exchange&session=...
 *     → returns the stored token for the given session id
 */

import { kv } from "@vercel/kv";

const KV_OAUTH_PREFIX = "aistudy:canvas_oauth:";

/* Get the owner-configured Canvas OAuth credentials */
async function getOAuthConfig(): Promise<{
  clientId: string;
  clientSecret: string;
  canvasUrl: string;
} | null> {
  try {
    const cfg = await kv.get<{ clientId: string; clientSecret: string; canvasUrl: string }>(
      "aistudy:canvas_oauth_config",
    );
    if (cfg?.clientId && cfg?.clientSecret && cfg?.canvasUrl) return cfg;
  } catch { /* KV not configured */ }
  // Fallback to env vars for local dev
  const id = process.env.CANVAS_CLIENT_ID;
  const secret = process.env.CANVAS_CLIENT_SECRET;
  const url = process.env.CANVAS_URL;
  if (id && secret && url) return { clientId: id, clientSecret: secret, canvasUrl: url };
  return null;
}

function htmlPage(body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIstudy — Canvas</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#faf7f5;color:#4a3f38;text-align:center;padding:2rem}</style></head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "authorize") {
    const config = await getOAuthConfig();
    if (!config) {
      return htmlPage("<h2>Canvas OAuth not configured</h2><p>The site owner hasn't set up Canvas OAuth yet. Use an access token instead, or ask the owner to configure it in the admin portal.</p>");
    }

    const requestedCanvasUrl = url.searchParams.get("canvasUrl") || config.canvasUrl;
    const baseUrl = requestedCanvasUrl.replace(/\/$/, "");

    // Generate a random state token to prevent CSRF
    const state = crypto.randomUUID();
    // Store the state → canvasUrl mapping so we use the right URL in the callback
    await kv.set(`${KV_OAUTH_PREFIX}state:${state}`, { canvasUrl: baseUrl }, { ex: 600 });

    const ourCallbackUrl = `${url.origin}/api/canvas-oauth?action=callback`;

    const authUrl = new URL(`${baseUrl}/login/oauth2/auth`);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", ourCallbackUrl);
    authUrl.searchParams.set("state", state);

    return Response.redirect(authUrl.toString(), 302);
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return htmlPage("<h2>Authorization failed</h2><p>Missing code or state parameter from Canvas.</p>");
    }

    // Retrieve the canvasUrl from state
    let canvasUrl = "";
    try {
      const stateData = await kv.get<{ canvasUrl: string }>(`${KV_OAUTH_PREFIX}state:${state}`);
      canvasUrl = stateData?.canvasUrl || "";
      await kv.del(`${KV_OAUTH_PREFIX}state:${state}`);
    } catch { /* ignore */ }

    const config = await getOAuthConfig();
    if (!config) {
      return htmlPage("<h2>Canvas OAuth not configured</h2><p>The site owner hasn't set up Canvas OAuth.</p>");
    }

    const tokenUrl = `${canvasUrl || config.canvasUrl.replace(/\/$/, "")}/login/oauth2/token`;

    try {
      const tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: `${url.origin}/api/canvas-oauth?action=callback`,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return htmlPage(`<h2>Canvas authentication failed</h2><p>Could not exchange the authorization code. ${errText.slice(0, 200)}</p>`);
      }

      const tokenData = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        user?: { id: number; name: string };
        expires_in?: number;
      };

      // Store the token temporarily (5 min) so the opener can retrieve it
      const sessionId = crypto.randomUUID();
      await kv.set(`${KV_OAUTH_PREFIX}session:${sessionId}`, {
        token: tokenData.access_token,
        user: tokenData.user,
        canvasUrl: canvasUrl || config.canvasUrl,
      }, { ex: 300 });

      // Render a page that posts the session ID to the opener window
      return htmlPage(`
        <div>
          <h2 style="color:#2d6a4f;">&#10003; Connected to Canvas</h2>
          <p>${tokenData.user ? `Signed in as <strong>${esc(tokenData.user.name)}</strong>` : "Authorization successful"}</p>
          <p style="color:#888;">This window will close automatically.</p>
        </div>
        <script>
          var sid = ${JSON.stringify(sessionId)};
          if (window.opener) {
            window.opener.postMessage({ type: "canvas-oauth", sessionId: sid }, window.location.origin);
            setTimeout(function(){ window.close(); }, 1000);
          } else {
            window.location.href = "/settings?canvas_session=" + encodeURIComponent(sid);
          }
        </script>
      `);
    } catch (err) {
      return htmlPage(`<h2>Connection error</h2><p>${esc(err instanceof Error ? err.message : "Unknown error")}</p>`);
    }
  }

  if (action === "exchange") {
    const sessionId = url.searchParams.get("session");
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "missing session" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    try {
      const data = await kv.get<{
        token: string;
        user?: { id: number; name: string };
        canvasUrl: string;
      }>(`${KV_OAUTH_PREFIX}session:${sessionId}`);
      if (!data) {
        return new Response(JSON.stringify({ error: "session expired" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      await kv.del(`${KV_OAUTH_PREFIX}session:${sessionId}`);
      return new Response(JSON.stringify({
        token: data.token,
        canvasUrl: data.canvasUrl,
        userName: data.user?.name,
      }), { headers: { "content-type": "application/json" } });
    } catch {
      return new Response(JSON.stringify({ error: "session lookup failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "unknown action" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
