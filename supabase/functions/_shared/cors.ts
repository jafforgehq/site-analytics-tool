// CORS restricted to the configured app origin(s). ALLOWED_APP_ORIGIN may be a
// comma-separated list (production portal + local dev).

const ALLOWED = (Deno.env.get("ALLOWED_APP_ORIGIN") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function resolveOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  return ALLOWED.includes(origin) ? origin : null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = resolveOrigin(req);
  return {
    "Access-Control-Allow-Origin": origin ?? ALLOWED[0] ?? "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

/** Returns a preflight response for OPTIONS, or null to continue. */
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  return null;
}
