/* Canvas LMS proxy — forwards requests to the Canvas REST API with the
 * user's access token. Keeps the token server-side in transit.
 *
 *   GET  /api/canvas-proxy?path=/api/v1/courses&token=...
 *   GET  /api/canvas-proxy?path=/api/v1/courses/123/assignments&token=...
 *
 * The token is passed as a query param (or header) by the client. */

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const token = url.searchParams.get("token") || req.headers.get("x-canvas-token");

  if (!path) {
    return new Response(JSON.stringify({ error: "missing path parameter" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!token) {
    return new Response(JSON.stringify({ error: "missing canvas token" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Determine the Canvas base URL from the token or use a default.
  // Users can also pass ?base=https://canvas.institution.edu
  const base = url.searchParams.get("base");
  let canvasUrl: string;
  if (base) {
    canvasUrl = base.replace(/\/$/, "");
  } else {
    canvasUrl = "https://canvas.instructure.com";
  }

  const target = `${canvasUrl}${path}`;
  const targetUrl = new URL(target);
  // Forward any extra query params (like per_page, page, etc.)
  url.searchParams.forEach((v, k) => {
    if (k !== "path" && k !== "token" && k !== "base") {
      targetUrl.searchParams.set(k, v);
    }
  });

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Canvas request failed" }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}
